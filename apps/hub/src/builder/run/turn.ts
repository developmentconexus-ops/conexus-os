import type { AgentController } from '@mastra/core/agent-controller'
import { RequestContext } from '@mastra/core/request-context'
import type { Workspace } from '@mastra/core/workspace'
import { projectResourceId } from '../conversations.js'
import type { RunTools } from '../harness/index.js'
import { isUserAuthoredMessage } from '../runtime.js'
import { Failure } from '../../platform/failure.js'
import type { AgentTurn, BuilderRunPorts, RunContextBinder, RunSession, Step } from './ports.js'
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



/** The conversation's own session scope: never the browser's `conversation:<id>`, which has no workspace. */
export const conversationRunScope = (conversationId: string): string => `builder:${conversationId}`


/**
 * The conversation's session on the Builder controller for one run (spec 0002 amendment, B3): one
 * session per run on the conversation's thread, on that conversation's sandbox workspace, with every
 * tool allowed without asking (the workspace lists the tools the Builder has). It lives from the
 * run's first step to its end, the waits on the person included, and the run deletes it.
 */
export const createControllerRunSessions = ({ controller, runContexts, conversationWorkspaces, runTools, readDefaultModel, turnSilenceMs = TURN_SILENCE_MS, questionReleaseMs = QUESTION_RELEASE_MS }: Readonly<{
  controller: AgentController
  /** How long a working turn may go without an event before it settles as `BUILDER_AGENT_STALLED`. */
  turnSilenceMs?: number
  /** How long Mastra may take to store a question, or to let go of a thread whose question ended. */
  questionReleaseMs?: number
  /** The installation's default Builder model, which a conversation with no model of its own starts on. */
  readDefaultModel(): Promise<string | null>
  /** The live runs' context binders by session scope, which the browser mount applies to every request it serves a run. */
  runContexts: Map<string, RunContextBinder>
  /** The live runs' workspaces by conversation id, which the controller's workspace resolver hands a new session. */
  conversationWorkspaces: Map<string, Workspace>
  /** The live runs' checks and operation runs by run id, which the controller's `conexus_check` and `conexus_run_operation` read. */
  runTools: Map<string, RunTools>
}>): BuilderRunPorts['openSession'] => async ({ projectId, conversationId, builderRunId, workspace, bindContext, runCheck, runOperation, gate }) => {
  const resourceId = projectResourceId(projectId)
  const scope = conversationRunScope(conversationId)
  const requestContext = new RequestContext()
  bindContext(requestContext)
  conversationWorkspaces.set(conversationId, workspace)
  runTools.set(builderRunId, { check: runCheck, runOperation, gate })
  runContexts.set(scope, bindContext)
  // A later run of the conversation may hold the scope by the time this one lets go; it keeps what is its own.
  const forget = (): void => {
    runTools.delete(builderRunId)
    if (runContexts.get(scope) === bindContext) runContexts.delete(scope)
    if (conversationWorkspaces.get(conversationId) === workspace) conversationWorkspaces.delete(conversationId)
  }
  const deleteSession = async (only?: ControllerSession): Promise<void> => {
    const current = await controller.getSessionByResource(resourceId, scope)
    if (!current || (only && current !== only)) return
    await controller.deleteSession({ resourceId, scope })
    if (await controller.getSessionByResource(resourceId, scope)) throw new Failure('BUILDER_SESSION_DELETE_FAILED')
  }
  let session: ControllerSession
  try {
    session = await openOnWorkspace(controller, { resourceId, scope, conversationId, requestContext, workspace, readDefaultModel })
  } catch (error) {
    forget()
    await deleteSession().catch(() => undefined)
    throw error
  }
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
      forget()
      // A stuck run still holds the session, and the store that hung may not answer the delete either.
      if (stalled) await Promise.race([deleteSession(session).catch(() => undefined), new Promise((settle) => { setTimeout(settle, STALLED_SESSION_DELETE_MS).unref?.() })])
      else await deleteSession(session)
    },
  } satisfies RunSession)
}

/**
 * Opens the run's session on the conversation's thread. A session resolves its workspace once, when
 * it is made, so one left from an earlier run on a VM the conversation no longer has is made again.
 * A conversation with no model of its own starts on the installation's default, kept on the thread.
 */
const openOnWorkspace = async (controller: AgentController, { resourceId, scope, conversationId, requestContext, workspace, readDefaultModel }: Readonly<{
  resourceId: string; scope: string; conversationId: string; requestContext: RequestContext; workspace: Workspace; readDefaultModel(): Promise<string | null>
}>): Promise<ControllerSession> => {
  let session = await controller.createSession({ resourceId, scope, threadId: conversationId, requestContext })
  if (session.getWorkspace() !== workspace) {
    await controller.deleteSession({ resourceId, scope })
    session = await controller.createSession({ resourceId, scope, threadId: conversationId, requestContext })
  }
  if (session.getWorkspace() !== workspace) throw new Failure('BUILDER_SANDBOX_COMMAND_INTERFACE_REQUIRED')
  await session.thread.loadMetadata()
  if (!session.model.hasSelection()) {
    const modelId = await readDefaultModel()
    if (!modelId) throw new Failure('BUILDER_MODEL_NOT_SELECTED')
    await session.model.switch({ modelId })
  }
  await session.state.set({ yolo: true })
  return session
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
