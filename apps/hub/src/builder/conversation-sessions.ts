import type { AgentController } from '@mastra/core/agent-controller'
import type { RequestContext } from '@mastra/core/request-context'
import { Failure, logFailure } from '../platform/failure.js'
import { logger } from '../platform/logger.js'
import { conversationRunScope } from './run/turn.js'

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
const deleteSessionLeavingParked = async (controller: Pick<AgentController, 'getSessionByResource' | 'deleteSession'>, resourceId: string, scope: string): Promise<void> => {
  const session = await controller.getSessionByResource(resourceId, scope)
  if (!session) return
  letGoOfParked(session)
  await controller.deleteSession({ resourceId, scope })
}

/**
 * How long a conversation's session may go unused before the Hub deletes it. Mastra keeps a live
 * session until `deleteSession`, and the browser opens one per conversation it looks at; the
 * conversation's next request opens it again from the thread.
 */
const CONVERSATION_SESSION_IDLE_MS = 10 * 60_000
const SWEEP_EVERY_MS = 60_000

const conversationSessionScope = (conversationId: string): string => `conversation:${conversationId}`

type Use = Readonly<{ resourceId: string; scope: string; at: number }>
type SessionPorts = Pick<AgentController, 'createSession' | 'deleteSession' | 'getSessionByResource'>

/**
 * The owner of the sessions on `conversation:<id>`, which the browser and the Hub open on their own
 * schedule and nothing ends: each use is noted, and a session unused for `idleMs` is deleted. A run's
 * own session (`builder:<id>`) is never swept here, since a run may wait on the person longer than
 * this; the run deletes it.
 */
export const createConversationSessions = ({ controller, idleMs = CONVERSATION_SESSION_IDLE_MS, sweepEveryMs = SWEEP_EVERY_MS, now = Date.now }: Readonly<{
  controller: SessionPorts
  idleMs?: number
  sweepEveryMs?: number
  now?: () => number
}>) => {
  const uses = new Map<string, Use>()
  const key = (resourceId: string, scope: string): string => `${resourceId}\n${scope}`
  const touch = (resourceId: string, scope: string): void => {
    uses.set(key(resourceId, scope), { resourceId, scope, at: now() })
  }
  const remove = async (resourceId: string, scope: string): Promise<void> => {
    uses.delete(key(resourceId, scope))
    // A conversation's session holds the call a parked run of it waits on, and deleting it must not answer it.
    await deleteSessionLeavingParked(controller, resourceId, scope).catch((error: unknown) => {
      logFailure(logger, new Failure('BUILDER_SESSION_DELETE_FAILED', { cause: error }), { 'builder.session_scope': scope })
    })
  }
  const sweep = async (): Promise<void> => {
    for (const use of [...uses.values()]) {
      if (now() - use.at >= idleMs && uses.get(key(use.resourceId, use.scope)) === use) await remove(use.resourceId, use.scope)
    }
  }
  const timer = setInterval(() => { void sweep() }, sweepEveryMs)
  timer.unref()
  return Object.freeze({
    /** Notes that a request reached the conversation's session, which Mastra's own route may be about to open. */
    touch: (resourceId: string, conversationId: string): void => touch(resourceId, conversationSessionScope(conversationId)),
    /** The conversation's session, opened on its thread, and noted as in use. */
    open: async (input: Readonly<{ resourceId: string; conversationId: string; requestContext: RequestContext }>) => {
      const scope = conversationSessionScope(input.conversationId)
      touch(input.resourceId, scope)
      return controller.createSession({ resourceId: input.resourceId, scope, threadId: input.conversationId, requestContext: input.requestContext })
    },
    sweep,
    /** A Project's conversations are gone: both of each one's sessions go with them. */
    drop: async (resourceId: string, conversationIds: readonly string[]): Promise<void> => {
      for (const conversationId of conversationIds) {
        await remove(resourceId, conversationSessionScope(conversationId))
        await remove(resourceId, conversationRunScope(conversationId))
      }
    },
    /** The Hub is closing: no conversation session outlives it. */
    close: async (): Promise<void> => {
      clearInterval(timer)
      for (const use of [...uses.values()]) await remove(use.resourceId, use.scope)
    },
  })
}

export type ConversationSessions = ReturnType<typeof createConversationSessions>
