import { MastraClient, isKnownAgentControllerEvent } from '@mastra/client-js'
import type { AgentControllerAvailableModel, AgentControllerEvent, KnownAgentControllerEvent, MastraDBMessage } from '@mastra/client-js'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useReducer } from 'react'
import { createFactoryConversation, listFactoryConversations } from './api'

export type { MastraDBMessage }
type DisplayState = Extract<KnownAgentControllerEvent, { type: 'display_state_changed' }>['displayState']
export type ActiveTool = DisplayState['activeTools'][string]
// The AgentController's own task-list snapshot (from @mastra/core's task_write/task_update/
// task_check/task_complete tools), already carried on every display_state_changed event: the
// canonical source the checklist reads, not something rebuilt from parsing tool-call args here.
type TaskSnapshot = DisplayState['tasks'][number]

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

const builderRunScope = (builderRunId: string): string => `builder:${builderRunId}`
const builderThreadMessagesKey = (projectId: string, threadId: string) => ['builder-thread-messages', projectId, threadId] as const

export type Conversation = Readonly<{ id: string; title?: string | null | undefined }>

const conversationsKey = (projectId: string) => ['project-conversations', projectId] as const
const sessionModelKey = (projectId: string) => ['builder-session-model', projectId] as const

/**
 * The Project's conversations. The Hub titles a conversation from its first request once a run has
 * saved it, so while `awaitingTitleOf` has a run working and no title yet, the list is read again.
 */
export const useProjectConversations = (projectId: string, awaitingTitleOf?: string | null) => useQuery({
  queryKey: conversationsKey(projectId),
  queryFn: (): Promise<readonly Conversation[]> => listFactoryConversations(projectId),
  enabled: Boolean(projectId),
  refetchInterval: (query) => awaitingTitleOf && !query.state.data?.find((entry) => entry.id === awaitingTitleOf)?.title?.trim() ? 1_000 : false,
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

export const reasoningLevels = ['low', 'medium', 'high', 'xhigh'] as const
export type ReasoningLevel = typeof reasoningLevels[number]
const asReasoningLevel = (value: unknown): ReasoningLevel | null =>
  reasoningLevels.find((level) => level === value) ?? null

// The model chosen before a Project exists has nowhere to live yet: the controller only persists a
// choice on a conversation's own thread. Once the home prompt creates that first conversation, this
// applies the choice to it, the same write useSessionModel's own mutations make.
export const applyThreadModel = async (conversationId: string, modelId: string, reasoning: ReasoningLevel | null): Promise<void> => {
  const session = factoryController.session(conversationId)
  await session.switchModel(modelId, { scope: 'thread' })
  if (reasoning) await session.setState({ thinkingLevel: reasoning })
}

export const useSessionModel = (projectId: string, conversationId: string | null) => {
  const queryClient = useQueryClient()
  // A session arrives with no model selected, and an empty id is how the controller says so. An
  // absent thinking level means the controller's configured default applies.
  const state = useQuery({
    queryKey: [...sessionModelKey(projectId), conversationId],
    queryFn: async () => {
      const current = await factoryController.session(conversationId ?? '').state()
      return { modelId: current.modelId, reasoning: asReasoningLevel(current.settings?.thinkingLevel) }
    },
    enabled: Boolean(conversationId),
  })
  // The Hub admits exactly this one key on the state route, and the controller persists it on the
  // conversation's thread, so the run opened from this conversation reasons at this level.
  const chooseReasoning = useMutation({
    mutationFn: (level: ReasoningLevel) => {
      if (!conversationId) throw new Error('BUILDER_CONVERSATION_NOT_READY')
      return factoryController.session(conversationId).setState({ thinkingLevel: level })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionModelKey(projectId) }),
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
  return { state, modelId: state.data?.modelId ?? '', reasoning: state.data?.reasoning ?? null, choose, chooseReasoning }
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
  // Tool calls parked on the person, keyed by call id: an approval or a question from the agent.
  waiting: Readonly<Record<string, PendingAnswer>>
  // The agent's own task list for this turn, from the AgentController's display state.
  tasks: readonly TaskSnapshot[]
  error: string | null
}>

export type PendingAnswer = Readonly<{ kind: 'APPROVAL' | 'QUESTION'; toolCallId: string; toolName: string; args: unknown; prompt: unknown }>

const idleTurn: LiveTurn = { runId: null, status: 'CONNECTING', messages: [], tools: {}, waiting: {}, tasks: [], error: null }

const without = (waiting: LiveTurn['waiting'], toolCallId: string): LiveTurn['waiting'] =>
  Object.fromEntries(Object.entries(waiting).filter(([id]) => id !== toolCallId))

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
      return { ...turn, tools: { ...turn.tools, ...event.displayState.activeTools }, tasks: event.displayState.tasks }
    case 'tool_approval_required':
      return { ...turn, waiting: { ...turn.waiting, [event.toolCallId]: { kind: 'APPROVAL', toolCallId: event.toolCallId, toolName: event.toolName, args: event.args, prompt: null } } }
    case 'tool_suspended':
      return { ...turn, waiting: { ...turn.waiting, [event.toolCallId]: { kind: 'QUESTION', toolCallId: event.toolCallId, toolName: event.toolName, args: event.args, prompt: event.suspendPayload } } }
    case 'tool_end':
    case 'tool_suspension_cancelled':
      return { ...turn, waiting: without(turn.waiting, event.toolCallId) }
    case 'error':
      return { ...turn, error: event.error.message }
    case 'agent_end':
      return { ...turn, status: 'ENDED', waiting: {} }
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

/**
 * Answers a call the run parked on the person. The answer goes to the run's own session, and the
 * Hub refuses anything but approve or decline there, so there is no "always allow" to send.
 */
// respondToToolSuspension accepts a single string (a free-text answer, or the one option chosen
// from a single-select AskUser question) or a string array (the options chosen from a multi-select
// question).
export const answerPendingCall = (conversationId: string, builderRunId: string, pending: PendingAnswer, answer: Readonly<{ approved: boolean }> | Readonly<{ text: string | string[] }>): Promise<void> => {
  const session = factoryController.session(conversationId, builderRunScope(builderRunId))
  return 'approved' in answer
    ? session.approveTool(pending.toolCallId, answer.approved)
    : session.respondToToolSuspension(pending.toolCallId, answer.text)
}
