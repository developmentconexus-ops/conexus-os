import type { AgentController } from '@mastra/core/agent-controller'
import { RequestContext } from '@mastra/core/request-context'
import type { LiveConversations } from '../conversation.js'
import { isUserAuthoredMessage } from '../runtime.js'
import { Failure } from '../../platform/failure.js'
import type { AgentTurn, BuilderRunPorts, RunSession, Step } from './ports.js'
import { endQuestions, untilQuestionStored } from './question.js'
import { driveStep } from './send.js'

type ControllerSession = Awaited<ReturnType<AgentController['createSession']>>

/**
 * How long a turn may go without one event from its session while the agent is working. A storage
 * read that never settles (Mastra's `getWorkflowRunById` was seen to) emits no error and no end, and
 * neither `session.abort()` nor Mastra's `untilIdle` timer, which watches background tasks, settles
 * it. It is twice one model step's budget, so a slow step or a long tool call never reaches it. A
 * turn that asks the person something ends there, so no wait on an answer is ever timed.
 */
const TURN_SILENCE_MS = 10 * 60_000
const STALLED_SESSION_DELETE_MS = 5_000
// How long Mastra may take to let go of a thread whose question ended.
const QUESTION_RELEASE_MS = 10_000

type Conversations = Pick<LiveConversations, 'open' | 'deleteSession' | 'touch'>

/**
 * The run's steps on its conversation's one session, the one the browser follows, on the
 * conversation's sandbox workspace, with every tool allowed without asking. Each step carries the
 * run's own request context. The session outlives the run; a run whose turn stalled deletes it, so
 * the conversation's next request opens it again.
 */
export const createControllerRunSessions = ({ controller, conversations, readDefaultModel, turnSilenceMs = TURN_SILENCE_MS, questionReleaseMs = QUESTION_RELEASE_MS }: Readonly<{
  controller: Pick<AgentController, 'getMastra'>
  conversations: Conversations
  /** How long a working turn may go without an event before it settles as `BUILDER_AGENT_STALLED`. */
  turnSilenceMs?: number
  /** How long Mastra may take to store a question, or to let go of a thread whose question ended. */
  questionReleaseMs?: number
  /** The installation's default Builder model, which a conversation with no model of its own starts on. */
  readDefaultModel(): Promise<string | null>
}>): BuilderRunPorts['openSession'] => async ({ projectId, conversationId, bindContext }) => {
  const requestContext = new RequestContext()
  bindContext(requestContext)
  const session = await conversations.open({ projectId, conversationId })
  await session.thread.loadMetadata()
  if (!session.model.hasSelection()) {
    const modelId = await readDefaultModel()
    if (!modelId) throw new Failure('BUILDER_MODEL_NOT_SELECTED')
    await session.model.switch({ modelId })
  }
  await session.state.set({ yolo: true })
  const bound = { ms: questionReleaseMs }
  let stalled = false
  return Object.freeze({
    takeStep: async (step, signal) => {
      try {
        return await takeStep(session, step, requestContext, signal, turnSilenceMs, () => endQuestions(controller, session, bound))
      } catch (error) {
        if (error instanceof Failure && error.id === 'BUILDER_AGENT_STALLED') stalled = true
        throw error
      }
    },
    pending: (toolCallId) => session.suspensions.has({ toolCallId }),
    untilQuestionStored: () => untilQuestionStored(session, bound),
    // A stalled store would hold the release past its bound; the conversation's next send ends the question.
    endQuestions: async () => { if (!stalled) await endQuestions(controller, session, bound) },
    release: async () => {
      conversations.touch(conversationId)
      // A stuck turn still holds the session, and the store that hung may not answer the delete either.
      if (stalled) await Promise.race([conversations.deleteSession({ projectId, conversationId }), new Promise((settle) => { setTimeout(settle, STALLED_SESSION_DELETE_MS).unref?.() })])
    },
  } satisfies RunSession)
}

/** One agent step on the session, settled by its end, a silence longer than the limit, or the run's stop. */
const takeStep = async (session: ControllerSession, step: Step, requestContext: RequestContext, signal: AbortSignal, turnSilenceMs: number, endOpenQuestions: () => Promise<void>): Promise<AgentTurn> => {
  let userMessageId: string | undefined
  let limit: ReturnType<typeof setTimeout> | undefined
  let expire: (error: Error) => void = () => undefined
  const expired = new Promise<never>((_, reject) => { expire = reject })
  expired.catch(() => undefined)
  // Silent too long is a stall: the session is aborted and the turn settles.
  const within = <T>(work: Promise<T>): Promise<T> => Promise.race([work, expired])
  const working = (): void => {
    clearTimeout(limit)
    limit = setTimeout(() => {
      session.abort()
      expire(new Failure('BUILDER_AGENT_STALLED'))
    }, turnSilenceMs)
    limit.unref?.()
  }
  const detach = session.subscribe((event) => {
    if (event.type === 'message_start' && isUserAuthoredMessage(event.message)) userMessageId = event.message.id
    working()
  })
  const abort = (): void => { session.abort() }
  if (signal.aborted) abort()
  else signal.addEventListener('abort', abort, { once: true })
  try {
    working()
    const reason: string = await within(driveStep(session, step, requestContext, endOpenQuestions)) ?? 'unknown'
    userMessageId ??= [...await within(session.thread.listActiveMessages())].reverse().find(isUserAuthoredMessage)?.id
    return { reason, userMessageId }
  } finally {
    clearTimeout(limit)
    detach()
    signal.removeEventListener('abort', abort)
  }
}
