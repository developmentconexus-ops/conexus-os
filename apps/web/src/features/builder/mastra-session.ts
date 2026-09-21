import { MastraClient, isKnownAgentControllerEvent } from '@mastra/client-js'
import type { AgentControllerAvailableModel, AgentControllerEvent, AgentControllerThreadInfo, KnownAgentControllerEvent, MastraDBMessage } from '@mastra/client-js'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useReducer } from 'react'

export type { MastraDBMessage }
type DisplayState = Extract<KnownAgentControllerEvent, { type: 'display_state_changed' }>['displayState']
export type ActiveTool = DisplayState['activeTools'][string]

const BUILDER_CONTROLLER_ID = 'conexus-builder-controller'

const csrf = (): string => decodeURIComponent(document.cookie.split('; ').find((item) => item.startsWith('__Host-conexus_csrf='))?.split('=').slice(1).join('=') ?? '')

const client = new MastraClient({
  baseUrl: window.location.origin,
  apiPrefix: '/api/mastra',
  credentials: 'same-origin',
  retries: 0,
  fetch: (input, init) => fetch(input, {
    ...init,
    headers: { ...Object.fromEntries(new Headers(init?.headers).entries()), ...((init?.method ?? 'GET').toUpperCase() === 'GET' ? {} : { 'x-conexus-csrf': csrf() }) },
  }),
})

const controller = client.getAgentController(BUILDER_CONTROLLER_ID)

export const builderRunScope = (builderRunId: string): string => `builder:${builderRunId}`
export const builderThreadMessagesKey = (projectId: string, threadId: string) => ['builder-thread-messages', projectId, threadId] as const

export type Conversation = AgentControllerThreadInfo

// A Project's conversations are its Mastra session's own threads: the product keeps no conversation
// store beside them. The unscoped session is the one the browser holds while it reads and organises
// them; a run gets its own scoped session because that is where its sandbox lives.
const conversationsKey = (projectId: string) => ['project-conversations', projectId] as const
const sessionModelKey = (projectId: string) => ['builder-session-model', projectId] as const

export const useProjectConversations = (projectId: string) => useQuery({
  queryKey: conversationsKey(projectId),
  queryFn: () => controller.session(projectId).listThreads(50),
})

export const useConversationActions = (projectId: string) => {
  const queryClient = useQueryClient()
  const refresh = () => queryClient.invalidateQueries({ queryKey: conversationsKey(projectId) })
  const create = useMutation({
    mutationFn: (title: string) => controller.session(projectId).createThread(title),
    onSuccess: refresh,
  })
  const rename = useMutation({
    mutationFn: ({ conversationId, title }: Readonly<{ conversationId: string; title: string }>) =>
      controller.session(projectId).renameThread(conversationId, title),
    onSuccess: refresh,
  })
  // The controller persists a conversation's model on the conversation itself, and a run binds the
  // conversation it was sent from. So the session has to stand on the conversation the operator is
  // looking at, or the model they see is not the one their next message would run with.
  const select = useMutation({
    mutationFn: async ({ conversationId, carryModelId }: Readonly<{ conversationId: string; carryModelId: string }>) => {
      const session = controller.session(projectId)
      await session.switchThread(conversationId)
      // The controller persists a model per conversation, and switching keeps the previous
      // selection in memory without writing it, so a conversation the operator has not chosen for
      // would look ready and then refuse the run. Writing their current choice onto the
      // conversation they just opened is that choice applied, not a default invented for them.
      if (carryModelId) await session.switchModel(carryModelId, { scope: 'thread' })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionModelKey(projectId) }),
  })
  return { create, rename, select }
}

export type BuilderModel = AgentControllerAvailableModel

const modelsKey = ['builder-models'] as const

/** The controller owns model auth and selection, so the product reads both from it and stores neither. */
export const useBuilderModels = () => useQuery({ queryKey: modelsKey, queryFn: () => controller.listModels() })

export const useSessionModel = (projectId: string) => {
  const queryClient = useQueryClient()
  // A session arrives with no model selected, and an empty id is how the controller says so.
  const selected = useQuery({
    queryKey: sessionModelKey(projectId),
    queryFn: async () => (await controller.session(projectId).state()).modelId,
  })
  // Thread scope is the only one the controller persists, and it is the right one: the choice is
  // saved on the conversation, which is what a run opened from it will read.
  const choose = useMutation({
    mutationFn: (modelId: string) => controller.session(projectId).switchModel(modelId, { scope: 'thread' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionModelKey(projectId) }),
  })
  return { selected, choose }
}

export const useBuilderThreadMessages = (projectId: string, threadId: string | undefined) => useQuery({
  queryKey: builderThreadMessagesKey(projectId, threadId ?? ''),
  queryFn: () => controller.session(projectId).listMessages(threadId ?? '', 200),
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
export const useBuilderLiveTurn = (projectId: string, builderRunId: string | undefined, agentActive: boolean): LiveTurn => {
  const [turn, dispatch] = useReducer(reduceTurn, idleTurn)
  const queryClient = useQueryClient()
  useEffect(() => {
    if (!builderRunId || !agentActive) return undefined
    const session = controller.session(projectId, builderRunScope(builderRunId))
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
  }, [agentActive, builderRunId, projectId, queryClient])
  return turn.runId === builderRunId ? turn : idleTurn
}
