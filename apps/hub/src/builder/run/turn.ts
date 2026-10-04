import type { AgentController } from '@mastra/core/agent-controller'
import { RequestContext } from '@mastra/core/request-context'
import type { Workspace } from '@mastra/core/workspace'
import { projectResourceId } from '../conversations.js'
import type { RunTools } from '../harness/index.js'
import { isUserAuthoredMessage, messageText, readParkedCalls, sendBuilderSessionMessage } from '../runtime.js'
import type { BuilderStep } from '../runtime.js'
import { Failure } from '../../platform/failure.js'
import type { AgentTurn, BuilderRunPorts, ParkedAnswer, RunContextBinder } from './ports.js'




type RecordedMessage = Readonly<{ id: string; role?: string; content?: unknown }>

/** Mastra's completion-check feedback: written as an assistant message, but it is the gate speaking, not the Builder. */
const isCompletionCheck = (message: RecordedMessage): boolean => {
  // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
  const metadata = (message.content as { metadata?: { completionResult?: unknown } } | undefined)?.metadata
  return metadata?.completionResult !== undefined
}

/**
 * How long a turn may go without one event from its session while the agent is working. A storage
 * read that never settles (Mastra's `getWorkflowRunById` was seen to) emits no error and no end, and
 * neither `session.abort()` nor Mastra's `untilIdle` timer, which watches background tasks, settles
 * it. It is twice one model step's budget, so a slow step or a long tool call never reaches it. A
 * turn that asks the person something ends there, so no wait on an answer is ever timed.
 */
const TURN_SILENCE_MS = 10 * 60_000
const STALLED_SESSION_DELETE_MS = 5_000

type ControllerSession = Awaited<ReturnType<AgentController['createSession']>>

/**
 * Lets a session go of the calls it is parked on, so deleting it answers none of them. Mastra's
 * `deleteSession` aborts the session, and the abort settles its parked calls as denied and marks the
 * thread's run aborted, so no answer could resume it. Any session on the thread holds the call, not
 * only the run's own: while the suspended run is warm in this process, a session opened on its
 * thread is told of the call within moments. Here the session's list of parked calls is cleared, an
 * abort is marked as already made, and the stream is detached without an abort; the call and its
 * snapshot stay in storage, and an answer resumes them on a new session.
 */
const letGoOfParked = (session: ControllerSession): void => {
  // The registry, not the display state, is what Mastra's abort settles: a session opened again for
  // the answer may show no pending suspension while it still holds the call.
  if (session.suspensions.clear().length === 0) return
  session.displayState.clearPendingSuspensions()
  session.run.requestAbort({ deferSignal: true })
  session.stream.detach()
}

/** Deletes the session of a scope without settling a call it holds: only a discard settles one. */
export const deleteSessionLeavingParked = async (controller: Pick<AgentController, 'getSessionByResource' | 'deleteSession'>, resourceId: string, scope: string): Promise<void> => {
  const session = await controller.getSessionByResource(resourceId, scope)
  if (!session) return
  letGoOfParked(session)
  await controller.deleteSession({ resourceId, scope })
}

/** The conversation's own session scope: never the browser's `conversation:<id>`, which has no workspace. */
export const conversationRunScope = (conversationId: string): string => `builder:${conversationId}`

/**
 * The conversation's session on the Builder controller for one run (spec 0002 amendment, B3): one
 * session per run on the conversation's thread, on that conversation's sandbox workspace, with every
 * tool allowed without asking (the workspace lists the tools the Builder has), and a turn that
 * lasts until the agent is done, including while it waits for the person to answer a question
 * (AC-16). The context, the check and the operation run are the turn's own. Mastra keeps a live
 * session until it is deleted, so the run deletes its own, and a parked run keeps it for the answer;
 * the thread, which holds the conversation, is in storage.
 */
// biome-ignore lint/complexity/noExcessiveLinesPerFunction: debt: owning wave
export const createControllerRunSessions = ({ controller, runContexts, conversationWorkspaces, runTools, readDefaultModel, turnSilenceMs = TURN_SILENCE_MS }: Readonly<{
  controller: AgentController
  /** How long a working turn may go without an event before it settles as `BUILDER_AGENT_STALLED`. */
  turnSilenceMs?: number
  /** The installation's default Builder model, which a conversation with no model of its own starts on. */
  readDefaultModel(): Promise<string | null>
  /** The live turns' context binders by session scope, which the browser mount applies to every request it serves a turn. */
  runContexts: Map<string, RunContextBinder>
  /** The live turns' workspaces by conversation id, which the controller's workspace resolver hands a new session. */
  conversationWorkspaces: Map<string, Workspace>
  /** The live runs' checks and operation runs by run id, which the controller's `conexus_check` and `conexus_run_operation` read. */
  runTools: Map<string, RunTools>
}>): BuilderRunPorts['openSession'] => {
  /** The run that owns each scope now. Two runs on one conversation can share one session object, so only the owner may end it. */
  const owners = new Map<string, string>()
  // biome-ignore lint/complexity/noExcessiveLinesPerFunction: debt: owning wave
  return async ({ projectId, conversationId, builderRunId, workspace, bindContext, runCheck, runOperation, gate }) => {
  const resourceId = projectResourceId(projectId)
  const scope = conversationRunScope(conversationId)
  const requestContext = new RequestContext()
  bindContext(requestContext)
  conversationWorkspaces.set(conversationId, workspace)
  runTools.set(builderRunId, { check: runCheck, runOperation, gate })
  runContexts.set(scope, bindContext)
  owners.set(scope, builderRunId)
  let session: ControllerSession | undefined
  // Lets go of what this run holds and says whether it still owned the scope. A run that a later
  // run took the scope from leaves the session and the scope's entries to that run.
  const forget = (keepOwnership = false): boolean => {
    runTools.delete(builderRunId)
    if (owners.get(scope) !== builderRunId) return false
    if (!keepOwnership) owners.delete(scope)
    if (runContexts.get(scope) === bindContext) runContexts.delete(scope)
    if (conversationWorkspaces.get(conversationId) === workspace) conversationWorkspaces.delete(conversationId)
    return true
  }
  const deleteSession = async (): Promise<void> => {
    if (!session || (await controller.getSessionByResource(resourceId, scope)) !== session) return
    await deleteSessionLeavingParked(controller, resourceId, scope)
    if (await controller.getSessionByResource(resourceId, scope)) throw new Failure('BUILDER_SESSION_DELETE_FAILED')
  }
  // The agent's turn ends, but the run keeps the session for its remaining phases and still owns it.
  const end = async (): Promise<void> => {
    forget(true)
  }
  try {
    // A parked run's answer gets the session the run parked in, still live on the same workspace.
    session = await controller.createSession({ resourceId, scope, threadId: conversationId, requestContext })
    // A session resolves its workspace once, when it is made; one made on a VM the conversation no
    // longer has is made again on this one, and the call it is parked on resumes from storage.
    if (session.getWorkspace() !== workspace) {
      if (owners.get(scope) === builderRunId) await deleteSession()
      session = await controller.createSession({ resourceId, scope, threadId: conversationId, requestContext })
    }
    if (session.getWorkspace() !== workspace) throw new Failure('BUILDER_SANDBOX_COMMAND_INTERFACE_REQUIRED')
    // The model the person set on the conversation since the session was made. A conversation with
    // none starts on the installation's default, kept on the thread from its first turn on.
    await session.thread.loadMetadata()
    if (!session.model.hasSelection()) {
      const modelId = await readDefaultModel()
      if (!modelId) throw new Failure('BUILDER_MODEL_NOT_SELECTED')
      await session.model.switch({ modelId })
    }
    await session.state.set({ yolo: true })
  } catch (error) {
    if (forget()) await deleteSession().catch(() => undefined)
    throw error
  }
  const takeTurn = async (step: BuilderStep, signal?: AbortSignal): Promise<AgentTurn> => {
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
    if (signal?.aborted) abort()
    else signal?.addEventListener('abort', abort, { once: true })
    try {
      working()
      const reason: string = await within(sendBuilderSessionMessage(session, step, requestContext)) ?? 'unknown'
      // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
      const messages = await within(session.thread.listActiveMessages()) as readonly RecordedMessage[]
      userMessageId ??= [...messages].reverse().find(isUserAuthoredMessage)?.id
      const summary = messages.slice(messages.findIndex((message) => message.id === userMessageId) + 1)
        // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
        .filter((message) => message.role === 'assistant' && !isCompletionCheck(message)).map((message) => messageText(message as Parameters<typeof messageText>[0])).filter(Boolean).join('\n')
      return { reason, userMessageId, summary }
    } catch (error) {
      // The stuck run still holds the session, so the next turn must not find it: the session is
      // deleted, waiting only briefly, since the store that hung may not answer the delete either.
      if (error instanceof Failure && error.id === 'BUILDER_AGENT_STALLED') {
        if (forget()) await Promise.race([deleteSession().catch(() => undefined), new Promise((settle) => { setTimeout(settle, STALLED_SESSION_DELETE_MS).unref?.() })])
      }
      throw error
    } finally {
      clearTimeout(limit)
      detach()
      signal?.removeEventListener('abort', abort)
    }
  }
  return Object.freeze({
    sendTurn: (content: string, signal?: AbortSignal) => takeTurn({ content }, signal),
    resumeTurn: (resume: ParkedAnswer, signal?: AbortSignal) => takeTurn({ resume }, signal),
    end,
    release: async () => {
      if (forget()) await deleteSession()
    },
  })
  }
}

/**
 * Settles every call a run left open on its thread: the session is the parked run's own while it is
 * live, else one opened on its thread, and Mastra marks each call as denied, as a stop on a run waiting in a session always
 * did. With no call open it only reads the thread, so every ending of a run can call it and a second
 * call changes nothing.
 */
export const createParkedDiscard = ({ controller }: Readonly<{ controller: AgentController }>): BuilderRunPorts['discardParked'] => async ({ projectId, conversationId }) => {
  const resourceId = projectResourceId(projectId)
  const scope = conversationRunScope(conversationId)
  const session = await controller.createSession({ resourceId, scope, threadId: conversationId, requestContext: new RequestContext() })
  try {
    await session.runEngine.settleSuspendedToolCallsAsDenied((await readParkedCalls(session)).map((call) => ({ ...call, threadId: conversationId, resourceId })))
  } finally {
    await deleteSessionLeavingParked(controller, resourceId, scope)
  }
}
