import { MastraClient, isKnownAgentControllerEvent } from '@mastra/client-js'
import type { AgentControllerAvailableModel, AgentControllerEvent, KnownAgentControllerEvent, MastraDBMessage } from '@mastra/client-js'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useReducer } from 'react'
import { createFactoryConversation, listFactoryConversations } from './api'

export type { MastraDBMessage }
type DisplayState = Extract<KnownAgentControllerEvent, { type: 'display_state_changed' }>['displayState']
export type ActiveTool = DisplayState['activeTools'][string]

const csrf = (): string => decodeURIComponent(document.cookie.split('; ').find((item) => item.startsWith('__Host-conexus_csrf='))?.split('=').slice(1).join('=') ?? '')

const clientAt = (apiPrefix: string) => new MastraClient({
  baseUrl: window.location.origin,
  apiPrefix,
  credentials: 'same-origin',
  retries: 0,
  fetch: (input, init) => fetch(input, {
    ...init,
    headers: { ...Object.fromEntries(new Headers(init?.headers).entries()), ...((init?.method ?? 'GET').toUpperCase() === 'GET' ? {} : { 'x-conexus-csrf': csrf() }) },
  }),
})

// Every Project is developed through the Factory mount. Each conversation is its own session on
// the Factory's mount, keyed by the conversation id and holding one thread of that id, and the Hub
// creates and lists those conversations because each is a Factory session row.
const factoryController = clientAt('/api/mastra-factory').getAgentController('code')

export const builderRunScope = (builderRunId: string): string => `builder:${builderRunId}`
export const builderThreadMessagesKey = (projectId: string, threadId: string) => ['builder-thread-messages', projectId, threadId] as const

export type Conversation = Readonly<{ id: string; title?: string | null | undefined }>

const conversationsKey = (projectId: string) => ['project-conversations', projectId] as const
const sessionModelKey = (projectId: string) => ['builder-session-model', projectId] as const

export const useProjectConversations = (projectId: string) => useQuery({
  queryKey: conversationsKey(projectId),
  queryFn: (): Promise<readonly Conversation[]> => listFactoryConversations(projectId),
  enabled: Boolean(projectId),
})

export const useConversationActions = (projectId: string) => {
  const queryClient = useQueryClient()
  const refresh = () => queryClient.invalidateQueries({ queryKey: conversationsKey(projectId) })
  const create = useMutation({
    mutationFn: (): Promise<Conversation> => createFactoryConversation(projectId, crypto.randomUUID()),
    onSuccess: refresh,
  })
  return { create }
}

export type BuilderModel = Readonly<Pick<AgentControllerAvailableModel, 'id' | 'provider' | 'modelName' | 'hasApiKey'>>

/**
 * The models this person can reach, as the Factory answers for their own credentials and the
 * installation's shared ones. The controller's own list reads only the host's keys, the same for
 * everyone. The product stores neither the list nor the choice.
 */
export const useBuilderModels = () => useQuery({
  queryKey: ['builder-models'],
  queryFn: async (): Promise<readonly BuilderModel[]> => {
    const response = await fetch('/api/control/model-accounts/models', { credentials: 'same-origin' })
    if (!response.ok) throw new Error(`BUILDER_MODELS_UNAVAILABLE:${response.status}`)
    return (await response.json() as Readonly<{ models: readonly BuilderModel[] }>).models
  },
})

export const useSessionModel = (projectId: string, conversationId: string | null) => {
  const queryClient = useQueryClient()
  // A session arrives with no model selected, and an empty id is how the controller says so.
  const selected = useQuery({
    queryKey: [...sessionModelKey(projectId), conversationId],
    queryFn: async () => (await factoryController.session(conversationId ?? '').state()).modelId,
    enabled: Boolean(conversationId),
  })
  // Thread scope is the only one the controller persists, and it is the right one: the choice is
  // saved on the conversation, which is what a run opened from it will read.
  const choose = useMutation({
    mutationFn: (modelId: string) => {
      if (!conversationId) throw new Error('BUILDER_CONVERSATION_NOT_READY')
      return factoryController.session(conversationId).switchModel(modelId, { scope: 'thread' })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionModelKey(projectId) }),
  })
  return { selected, choose }
}

export const useBuilderThreadMessages = (projectId: string, threadId: string | undefined) => useQuery({
  queryKey: builderThreadMessagesKey(projectId, threadId ?? ''),
  queryFn: () => factoryController.session(threadId ?? '').listMessages(threadId ?? '', 200),
  enabled: Boolean(threadId),
})

export type LiveTurn = Readonly<{
  runId: string | null
  status: 'CONNECTING' | 'LIVE' | 'ENDED' | 'LOST'
  messages: readonly MastraDBMessage[]
  tools: Readonly<Record<string, ActiveTool>>
  error: string | null
}>

const idleTurn: LiveTurn = { runId: null, status: 'CONNECTING', messages: [], tools: {}, error: null }

type TurnAction = Readonly<{ runId: string }> & (
  | Readonly<{ kind: 'connected' }>
  | Readonly<{ kind: 'lost' }>
  | Readonly<{ kind: 'event'; event: AgentControllerEvent }>
)

const upsertMessage = (messages: readonly MastraDBMessage[], message: MastraDBMessage): readonly MastraDBMessage[] => {
  const index = messages.findIndex((item) => item.id === message.id)
  return index === -1 ? [...messages, message] : messages.map((item, position) => position === index ? message : item)
}

// A turn belongs to one run. The first action of another run starts from empty, so a settled run's
// messages stay on screen until the next run actually speaks.
const reduceTurn = (previous: LiveTurn, action: TurnAction): LiveTurn => {
  const turn = previous.runId === action.runId ? previous : { ...idleTurn, runId: action.runId }
  if (action.kind === 'connected') return { ...turn, status: 'LIVE' }
  if (action.kind === 'lost') return { ...turn, status: 'LOST' }
  const event = action.event
  if (!isKnownAgentControllerEvent(event)) return turn
  switch (event.type) {
    case 'message_start':
    case 'message_update':
    case 'message_end':
      return { ...turn, messages: upsertMessage(turn.messages, event.message) }
    case 'display_state_changed':
      return { ...turn, tools: { ...turn.tools, ...event.displayState.activeTools } }
    case 'error':
      return { ...turn, error: event.error.message }
    case 'agent_end':
      return { ...turn, status: 'ENDED' }
    default:
      return turn
  }
}

/** Follows one run's Mastra session for as long as the agent owns the turn. */
export const useBuilderLiveTurn = (
  projectId: string,
  run: Readonly<{ builderRunId: string; conversationId: string }> | undefined,
  agentActive: boolean,
): LiveTurn => {
  const [turn, dispatch] = useReducer(reduceTurn, idleTurn)
  const queryClient = useQueryClient()
  const builderRunId = run?.builderRunId
  const conversationId = run?.conversationId
  useEffect(() => {
    if (!builderRunId || !conversationId || !agentActive) return undefined
    const session = factoryController.session(conversationId, builderRunScope(builderRunId))
    let closed = false
    let unsubscribe = () => {}
    let retry: ReturnType<typeof setTimeout> | undefined
    const resync = (): void => { void queryClient.invalidateQueries({ queryKey: ['builder-thread-messages', projectId] }) }
    const connect = async (): Promise<void> => {
      try {
        const subscription = await session.subscribe({
          onEvent: (event) => {
            dispatch({ runId: builderRunId, kind: 'event', event })
            if (event.type === 'agent_end') resync()
          },
          onReconnect: resync,
          onError: () => dispatch({ runId: builderRunId, kind: 'lost' }),
          reconnect: { maxRetries: 8 },
        })
        if (closed) return subscription.unsubscribe()
        unsubscribe = subscription.unsubscribe
        dispatch({ runId: builderRunId, kind: 'connected' })
      } catch {
        if (!closed) retry = setTimeout(() => { void connect() }, 1_000)
      }
    }
    void connect()
    return () => {
      closed = true
      if (retry) clearTimeout(retry)
      unsubscribe()
    }
  }, [agentActive, builderRunId, conversationId, projectId, queryClient])
  return turn.runId === builderRunId ? turn : idleTurn
}
