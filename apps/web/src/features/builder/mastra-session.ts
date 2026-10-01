import { MastraClient } from '@mastra/client-js'
import type { AgentControllerAvailableModel, MastraDBMessage } from '@mastra/client-js'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useReducer } from 'react'
import { type LiveTurn, type MemoryGauge, type PendingAnswer, type PendingReply, idleTurn, reduceTurn } from './live-turn'

export type { MastraDBMessage }
export type { ActiveTool, LiveTurn, MemoryGauge, MemoryOperation, PendingAnswer, PendingReply } from './live-turn'

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

// The Builder's own controller, reached through Mastra's Agent Controller routes the Hub mounts
// under /api/builder. A Project's conversations are the threads of its resource; each is opened as
// its own session (scope conversation:<id>) bound to its thread, and its runs share one session the
// Hub keeps across them (scope builder:<conversationId>) on the same thread.
const builderController = clientAt('/api/builder').getAgentController('conexus-builder')
const projectResource = (projectId: string): string => `project:${projectId}`
const projectSessions = (projectId: string) => builderController.session(projectResource(projectId))
const conversationSession = (projectId: string, conversationId: string) =>
  builderController.session(projectResource(projectId), `conversation:${conversationId}`)
const runSession = (projectId: string, conversationId: string) =>
  builderController.session(projectResource(projectId), `builder:${conversationId}`)

const builderThreadMessagesKey = (projectId: string, threadId: string) => ['builder-thread-messages', projectId, threadId] as const

export type Conversation = Readonly<{ id: string; title?: string | null | undefined }>

const conversationsKey = (projectId: string) => ['project-conversations', projectId] as const
const sessionModelKey = (projectId: string) => ['builder-session-model', projectId] as const

/** The Project's conversations, newest first, as its threads. */
export const listConversations = async (projectId: string): Promise<readonly Conversation[]> =>
  (await projectSessions(projectId).listThreads()).map((thread) => ({ id: thread.id, title: thread.title ?? null }))

/**
 * Opens a conversation on the id the browser chose; opening it again answers the same thread, so a
 * retry after a lost response never makes a second one.
 */
export const openConversation = async (projectId: string, conversationId: string): Promise<Conversation> => {
  await conversationSession(projectId, conversationId).create({ threadId: conversationId })
  return { id: conversationId, title: null }
}

/**
 * The Project's conversations. The Hub titles a conversation from its first request once a run has
 * saved it, so while `awaitingTitleOf` has a run working and no title yet, the list is read again.
 */
export const useProjectConversations = (projectId: string, awaitingTitleOf?: string | null) => useQuery({
  queryKey: conversationsKey(projectId),
  queryFn: () => listConversations(projectId),
  enabled: Boolean(projectId),
  refetchInterval: (query) => awaitingTitleOf && !query.state.data?.find((entry) => entry.id === awaitingTitleOf)?.title?.trim() ? 1_000 : false,
})

export const useConversationActions = (projectId: string) => {
  const queryClient = useQueryClient()
  const refresh = () => queryClient.invalidateQueries({ queryKey: conversationsKey(projectId) })
  const create = useMutation({
    mutationFn: (): Promise<Conversation> => openConversation(projectId, crypto.randomUUID()),
    onSuccess: refresh,
  })
  return { create }
}

/** A model the person can pick, with the reasoning levels it honors, lowest first; none when it has no reasoning level to choose. */
export type BuilderModel = Readonly<Pick<AgentControllerAvailableModel, 'id' | 'provider' | 'modelName' | 'hasApiKey'> & { thinkingLevels: readonly ReasoningLevel[] }>

/**
 * The models this person can reach with their own model account or the installation's shared one.
 * The controller's own list reads only the host's keys, the same for everyone, so the Hub answers.
 */
export const useBuilderModels = (scope?: 'installation') => useQuery({
  queryKey: ['builder-models', scope ?? 'mine'],
  queryFn: async (): Promise<readonly BuilderModel[]> => {
    const url = scope ? `/api/control/model-accounts/models?scope=${encodeURIComponent(scope)}` : '/api/control/model-accounts/models'
    const response = await fetch(url, { credentials: 'same-origin' })
    if (!response.ok) throw new Error(`BUILDER_MODELS_UNAVAILABLE:${response.status}`)
    return (await response.json() as Readonly<{ models: readonly BuilderModel[] }>).models
  },
})

export const reasoningLevels = ['low', 'medium', 'high', 'xhigh'] as const
export type ReasoningLevel = typeof reasoningLevels[number]
const asReasoningLevel = (value: unknown): ReasoningLevel | null =>
  reasoningLevels.find((level) => level === value) ?? null

/**
 * The level a model runs at for the conversation's choice (medium until the person picks one): the
 * choice itself when the model honors it, else the closest level below it that the model honors
 * (Gemini runs `xhigh` as `high`). Null for a model with no reasoning level.
 */
export const levelForModel = (levels: readonly ReasoningLevel[], chosen: ReasoningLevel | null): ReasoningLevel | null => {
  const wanted = reasoningLevels.indexOf(chosen ?? 'medium')
  return levels.filter((level) => reasoningLevels.indexOf(level) <= wanted).at(-1) ?? levels[0] ?? null
}

// The choices made before a Project exists have nowhere to live yet: the controller only persists
// them on a conversation's own thread. Once the home prompt opens that first conversation, this
// applies them to it, the same writes useSessionModel's own mutations make.
export const applyThreadSettings = async (projectId: string, conversationId: string, settings: Readonly<{
  modelId: string | undefined; reasoning: ReasoningLevel | null
}>): Promise<void> => {
  const session = conversationSession(projectId, conversationId)
  if (settings.modelId) await session.switchModel(settings.modelId)
  if (settings.reasoning) await session.setState({ thinkingLevel: settings.reasoning })
}

export const useSessionModel = (projectId: string, conversationId: string | null) => {
  const queryClient = useQueryClient()
  // A session arrives with no model selected, and an empty id is how the controller says so. An
  // absent thinking level means the controller's configured default applies.
  const state = useQuery({
    queryKey: [...sessionModelKey(projectId), conversationId],
    queryFn: async () => {
      const current = await conversationSession(projectId, conversationId ?? '').state()
      // The Hub reloads the memory a run of this conversation stored before it answers.
      const memory: MemoryGauge | null = current.omProgress ? { progress: current.omProgress, bufferingMessages: false, bufferingObservations: false } : null
      return { modelId: current.modelId, reasoning: asReasoningLevel(current.settings?.thinkingLevel), memory }
    },
    enabled: Boolean(conversationId),
  })
  // The Hub admits exactly this one key on the state route, and the controller persists it on the
  // conversation's thread, so the run opened from this conversation reasons at this level.
  const chooseReasoning = useMutation({
    mutationFn: (level: ReasoningLevel) => {
      if (!conversationId) throw new Error('BUILDER_CONVERSATION_NOT_READY')
      return conversationSession(projectId, conversationId).setState({ thinkingLevel: level })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionModelKey(projectId) }),
  })
  // The model is the conversation's own, held in its Mastra session. The Hub refuses the change
  // while a turn is active and the composer disables the control then, so the next turn reads it.
  const choose = useMutation({
    mutationFn: (modelId: string) => {
      if (!conversationId) throw new Error('BUILDER_CONVERSATION_NOT_READY')
      return conversationSession(projectId, conversationId).switchModel(modelId)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionModelKey(projectId) }),
  })
  return { state, modelId: state.data?.modelId ?? '', reasoning: state.data?.reasoning ?? null, memory: state.data?.memory ?? null, choose, chooseReasoning }
}

export const useBuilderThreadMessages = (projectId: string, threadId: string | undefined) => useQuery({
  queryKey: builderThreadMessagesKey(projectId, threadId ?? ''),
  queryFn: () => projectSessions(projectId).listMessages(threadId ?? '', 200),
  enabled: Boolean(threadId),
})

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
    const session = runSession(projectId, conversationId)
    let closed = false
    let unsubscribe = () => {}
    let retry: ReturnType<typeof setTimeout> | undefined
    const resync = (): void => { void queryClient.invalidateQueries({ queryKey: ['builder-thread-messages', projectId] }) }
    const connect = async (): Promise<void> => {
      try {
        const subscription = await session.subscribe({
          onEvent: (event) => {
            dispatch({ runId: builderRunId, kind: 'event', event })
            if (event.type === 'agent_end') {
              resync()
              // The run stored memory for the conversation; read it again once the run is truly over.
              if (event.reason !== 'suspended') void queryClient.invalidateQueries({ queryKey: sessionModelKey(projectId) })
            }
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
 * Answers a call the run parked on the person. The answer goes to the session the Hub runs the
 * conversation in, and the Hub refuses anything but approve or decline there, so there is no
 * "always allow" to send.
 */
// A question card resumes the Hub's ask_user with one answer per question, in order: a string (free
// text, or the option chosen in a single-select question) or a string array (a multi-select one).
export const answerPendingCall = (projectId: string, conversationId: string, pending: PendingAnswer, answer: PendingReply): Promise<void> => {
  const session = runSession(projectId, conversationId)
  if ('approved' in answer) return session.approveTool(pending.toolCallId, answer.approved)
  if ('plan' in answer) return session.respondToToolSuspension(pending.toolCallId, answer.plan)
  // The route takes any JSON (resumeData is unknown there); only the client's type is narrower.
  return session.respondToToolSuspension(pending.toolCallId, answer.answers as unknown as string[])
}
