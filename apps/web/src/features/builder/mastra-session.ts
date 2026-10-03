import { THINKING_LEVEL_VALUES, type ThinkingLevelSetting } from '@mastra/code-sdk/thinking'
import { MastraClient, MastraClientError } from '@mastra/client-js'
import type { AgentControllerAvailableModel, MastraDBMessage } from '@mastra/client-js'
import type { SubmitPlanResumeData } from '@mastra/core/tools'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useReducer, useRef } from 'react'
import { hubFetch } from '../../app/http'
import { parseRunState } from './api'
import { builderSessionKey, writeStreamedRun } from './builder-session'
import { type StreamState, useSessionStream, useStreamState } from './connection'
import { type MemoryGauge, type RuntimeState, emptyRuntime, runtimeReducer } from './runtime'
import { type PromptEntry, type TranscriptAction, type TranscriptState, emptyTranscript, transcriptReducer } from './transcript'

export type { MastraDBMessage }
export type { MemoryGauge, MemoryOperation } from './runtime'
export type { PromptEntry, TranscriptEntry } from './transcript'

const clientAt = (apiPrefix: string) => new MastraClient({
  baseUrl: window.location.origin,
  apiPrefix,
  credentials: 'same-origin',
  retries: 0,
  fetch: hubFetch,
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
 * The Project's conversations. A title reaches the list when the conversation's stream says the
 * thread was titled or a turn ended; the list is never polled.
 */
export const useProjectConversations = (projectId: string) => useQuery({
  queryKey: conversationsKey(projectId),
  queryFn: () => listConversations(projectId),
  enabled: Boolean(projectId),
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
export type BuilderModel = Readonly<Pick<AgentControllerAvailableModel, 'id' | 'provider' | 'modelName' | 'hasApiKey'> & { providerName: string; thinkingLevels: readonly ReasoningLevel[] }>

/**
 * The models this person can reach with their own model account or the installation's shared one.
 * The controller's own list reads only the host's keys, the same for everyone, so the Hub answers.
 */
export const useBuilderModels = (scope?: 'installation') => useQuery({
  queryKey: ['builder-models', scope ?? 'mine'],
  queryFn: async (): Promise<Readonly<{ models: readonly BuilderModel[]; defaultThinkingLevel: ReasoningLevel }>> => {
    const url = scope ? `/api/control/model-accounts/models?scope=${encodeURIComponent(scope)}` : '/api/control/model-accounts/models'
    const response = await hubFetch(url)
    if (!response.ok) throw new Error(`BUILDER_MODELS_UNAVAILABLE:${response.status}`)
    return await response.json() as Readonly<{ models: readonly BuilderModel[]; defaultThinkingLevel: ReasoningLevel }>
  },
})

/** Mastra Code's own thinking levels, lowest first; the Hub offers each model the ones it honors. */
export type ReasoningLevel = ThinkingLevelSetting
const asReasoningLevel = (value: unknown): ReasoningLevel | null =>
  THINKING_LEVEL_VALUES.find((level) => level === value) ?? null

/**
 * The level a model runs at for the conversation's level (the Hub's default until the person picks one): the
 * choice itself when the model honors it, else the closest level below it that the model honors
 * (Gemini runs `xhigh` as `high`). Null for a model with no reasoning level.
 */
export const levelForModel = (levels: readonly ReasoningLevel[], chosen: ReasoningLevel): ReasoningLevel | null => {
  const wanted = THINKING_LEVEL_VALUES.indexOf(chosen)
  return levels.filter((level) => THINKING_LEVEL_VALUES.indexOf(level) <= wanted).at(-1) ?? levels[0] ?? null
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

// A conversation's thread on screen: its transcript, which the message window and the run's stream
// both feed, and the run's memory. Both belong to the conversation and start over with another one.
type ConversationState = Readonly<{ transcript: TranscriptState; runtime: RuntimeState }>

const reduceConversation = (state: ConversationState, action: TranscriptAction): ConversationState => ({
  transcript: transcriptReducer(state.transcript, action),
  runtime: action.type === 'reset' ? emptyRuntime : action.type === 'event' ? runtimeReducer(state.runtime, action.event) : state.runtime,
})

const startConversation = (conversationId: string): ConversationState => ({ transcript: emptyTranscript(conversationId), runtime: emptyRuntime })

/** The stream of the session a conversation's runs go through, one per conversation on the page. */
const conversationStreamKey = (projectId: string, conversationId: string): string => `${projectId}/builder:${conversationId}`

/** Whether the stream of the conversation's runs is open, for the poll to keep its pace. */
export const useConversationStreamOpen = (projectId: string, conversationId: string): boolean =>
  useStreamState(conversationStreamKey(projectId, conversationId)) === 'connected'

/**
 * The conversation's thread: the message window read from its Mastra thread, merged with the events
 * of the session its runs go through. The stream is followed whenever the conversation is on screen;
 * before a run made that session the Hub refuses it, and each new `epoch` (a builder-session read)
 * tries again.
 */
export const useBuilderConversation = (projectId: string, conversationId: string, epoch: number) => {
  const [state, dispatch] = useReducer(reduceConversation, conversationId, startConversation)
  if (state.transcript.conversationId !== conversationId) dispatch({ type: 'reset', conversationId })
  const queryClient = useQueryClient()
  const streamKey = conversationStreamKey(projectId, conversationId)
  const history = useQuery({
    queryKey: builderThreadMessagesKey(projectId, conversationId),
    queryFn: () => projectSessions(projectId).listMessages(conversationId, 200),
    enabled: Boolean(conversationId),
  })
  useEffect(() => {
    if (history.data) dispatch({ type: 'mergeWindow', messages: history.data })
  }, [history.data])

  const rereadThread = (): void => { void queryClient.invalidateQueries({ queryKey: builderThreadMessagesKey(projectId, conversationId) }) }
  const rereadConversations = (): void => { void queryClient.invalidateQueries({ queryKey: conversationsKey(projectId) }) }
  const rereadSession = (): void => { void queryClient.invalidateQueries({ queryKey: builderSessionKey(projectId) }) }
  // The Conexus check's verdict reaches the thread inside the run, never through the stream: a run
  // going back to its agent after a check reads the thread again, and once more when the agent speaks,
  // by when its turn has stored the verdict.
  const repair = useRef<{ checking: boolean; awaitingSpeech: boolean }>({ checking: false, awaitingSpeech: false })
  useSessionStream({
    key: streamKey,
    open: () => runSession(projectId, conversationId),
    // A window merges what it does not hold after what is on screen, so the stream waits for the
    // thread's first read: the history has to be there before anything streamed lands after it.
    epoch: history.data ? epoch : 0,
    onEvent: (event) => {
      dispatch({ type: 'event', event })
      if (event.type === 'state_changed' && typeof event.state === 'object' && event.state !== null && 'conexusRun' in event.state) {
        const run = parseRunState(event.state.conexusRun)
        if (run) writeStreamedRun(queryClient, projectId, run)
        const backToAgent = repair.current.checking && run?.phase === 'AGENT'
        repair.current.checking = run?.phase === 'COMPILING'
        if (backToAgent) {
          repair.current.awaitingSpeech = true
          rereadThread()
        }
      }
      if (event.type === 'message_start' && repair.current.awaitingSpeech) {
        repair.current.awaitingSpeech = false
        rereadThread()
      }
      if (event.type === 'thread_title_updated') rereadConversations()
      if (event.type === 'agent_end') {
        rereadThread()
        // A first turn that parks is titled on the turn that resumes it, with no thread_title_updated; the Hub's memory
        // makes that turn wait for the title, so the list read at its end carries it.
        rereadConversations()
        // The run stored memory for the conversation; read it again once the run is truly over.
        if (event.reason !== 'suspended') void queryClient.invalidateQueries({ queryKey: sessionModelKey(projectId) })
      }
    },
    // The stream opens with the run the Hub last published into the session and replays nothing
    // else, so opening it reads the thread again, and reopening it reads the run too, as a deleted
    // session's stream carries none. While it is down the poll keeps the run.
    onStateChange: (next: StreamState, previous: StreamState) => {
      if (next !== 'connected') return
      rereadThread()
      if (previous === 'dropped') rereadSession()
    },
  })

  return {
    history,
    transcript: state.transcript.conversationId === conversationId ? state.transcript : emptyTranscript(conversationId),
    runtime: state.transcript.conversationId === conversationId ? state.runtime : emptyRuntime,
    dispatch,
  }
}

/** What became of an answer, as the Hub's answer route says it: only `RESUMED` took the run back to work. */
export type AnswerOutcome = 'RESUMED' | 'ALREADY_ANSWERED' | 'NOT_PARKED' | 'UNAVAILABLE'
const ANSWER_REFUSAL_BY_PROBLEM: Readonly<Partial<Record<string, AnswerOutcome>>> = {
  'urn:conexus:problem:tool-answer-already-given': 'ALREADY_ANSWERED',
  'urn:conexus:problem:parked-call-not-found': 'NOT_PARKED',
}

// submit_plan resumes with the tool's own decision: approved lets the run build, rejected sends the
// person's feedback back to the model.
type PlanResume = Readonly<Pick<SubmitPlanResumeData, 'action' | 'feedback'>>
export type PendingReply = Readonly<{ approved: boolean }> | Readonly<{ answers: (string | string[])[] }> | Readonly<{ plan: PlanResume }>

/**
 * Answers a call the run parked on the person. The answer goes to the session the Hub runs the
 * conversation in, and the Hub refuses anything but approve or decline there, so there is no
 * "always allow" to send.
 */
// A question card resumes the Hub's ask_user with one answer per question, in order: a string (free
// text, or the option chosen in a single-select question) or a string array (a multi-select one).
export const answerPendingCall = async (projectId: string, conversationId: string, pending: PromptEntry, answer: PendingReply): Promise<AnswerOutcome> => {
  const session = runSession(projectId, conversationId)
  try {
    if ('approved' in answer) await session.approveTool(pending.toolCallId, answer.approved)
    else if ('plan' in answer) await session.respondToToolSuspension(pending.toolCallId, answer.plan)
    // The route takes any JSON (resumeData is unknown there); only the client's type is narrower.
    else await session.respondToToolSuspension(pending.toolCallId, answer.answers as unknown as string[])
    return 'RESUMED'
  } catch (error) {
    const body = error instanceof MastraClientError && typeof error.body === 'object' && error.body !== null ? error.body : {}
    const type = 'type' in body && typeof body.type === 'string' ? body.type : ''
    return ANSWER_REFUSAL_BY_PROBLEM[type] ?? 'UNAVAILABLE'
  }
}
