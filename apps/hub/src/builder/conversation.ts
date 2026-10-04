import type { AgentController } from '@mastra/core/agent-controller'
import { RequestContext } from '@mastra/core/request-context'
import type { Workspace } from '@mastra/core/workspace'
import { Failure, logFailure } from '../platform/failure.js'
import { logger } from '../platform/logger.js'
import type { ConversationSandboxes } from './conversation-sandboxes.js'
import { projectResourceId } from './conversations.js'
import type { RunSandbox } from './run/ports.js'

type ControllerSession = Awaited<ReturnType<AgentController['createSession']>>
type SessionPorts = Pick<AgentController, 'createSession' | 'deleteSession' | 'getSessionByResource'>

/**
 * How long a conversation may go unused before the Hub lets go of its session and its sandbox
 * instance. Mastra keeps a live session until `deleteSession`; the conversation's next request opens
 * it again from the thread, and the next command resumes its VM.
 */
const CONVERSATION_IDLE_MS = 10 * 60_000
const SWEEP_EVERY_MS = 60_000

/** The one session scope of a conversation, which the browser and its runs share. */
export const conversationScope = (conversationId: string): string => `conversation:${conversationId}`

// Mastra puts the session's scope on every request context it builds for that session.
const scopeOf = (requestContext: RequestContext): string | undefined => {
  const controller: unknown = requestContext.get('controller')
  return typeof controller === 'object' && controller !== null && 'scope' in controller && typeof controller.scope === 'string' ? controller.scope : undefined
}

export type ConversationRef = Readonly<{ projectId: string; conversationId: string }>

type Live = { readonly ref: ConversationRef; readonly sandbox: RunSandbox; at: number }

/**
 * The owner of each conversation's one Mastra session and one sandbox instance. The sandbox comes
 * first, so the session Mastra makes on the scope finds its workspace; it starts no VM until its
 * first command. Mastra resolves the workspace on every agent call, so the resolver only looks up.
 * A conversation idle for `idleMs` is let go unless its run is open, its session is running, or a
 * question waits on it.
 */
export const createLiveConversations = ({ controller, sandboxes, readSandboxId, runOpen, idleMs = CONVERSATION_IDLE_MS, sweepEveryMs = SWEEP_EVERY_MS, now = Date.now }: Readonly<{
  controller: SessionPorts
  sandboxes: Pick<ConversationSandboxes, 'open'>
  /** The provider id of the VM the conversation last had, so its instance resumes that VM. */
  readSandboxId(ref: ConversationRef): Promise<string | null>
  /** Whether the conversation has a run in this Hub. */
  runOpen(conversationId: string): boolean
  idleMs?: number
  sweepEveryMs?: number
  now?: () => number
}>) => {
  const conversations = new Map<string, Promise<Live>>()
  const sessionOf = (ref: ConversationRef) => controller.getSessionByResource(projectResourceId(ref.projectId), conversationScope(ref.conversationId))
  const deleteSession = async (ref: ConversationRef): Promise<void> => {
    await controller.deleteSession({ resourceId: projectResourceId(ref.projectId), scope: conversationScope(ref.conversationId) }).catch((error: unknown) => {
      logFailure(logger, new Failure('BUILDER_SESSION_DELETE_FAILED', { cause: error }), { 'builder.conversation_id': ref.conversationId })
    })
  }
  const forget = async (ref: ConversationRef): Promise<void> => {
    conversations.delete(conversationScope(ref.conversationId))
    await deleteSession(ref)
  }
  const live = (ref: ConversationRef): Promise<Live> => {
    const scope = conversationScope(ref.conversationId)
    const known = conversations.get(scope)
    if (known) return known
    const made = (async (): Promise<Live> => ({
      ref, at: now(),
      sandbox: sandboxes.open({ conversationId: ref.conversationId, providerSandboxId: await readSandboxId(ref), onKill: () => forget(ref) }),
    }))()
    conversations.set(scope, made)
    made.catch(() => { if (conversations.get(scope) === made) conversations.delete(scope) })
    return made
  }
  const idle = async (entry: Live): Promise<boolean> => {
    if (now() - entry.at < idleMs || runOpen(entry.ref.conversationId)) return false
    const session = await sessionOf(entry.ref)
    return !session || (!session.run.isRunning() && !session.suspensions.hasPending())
  }
  const sweep = async (): Promise<void> => {
    for (const [scope, entry] of [...conversations]) {
      const settled = await entry.catch(() => undefined)
      if (settled && conversations.get(scope) === entry && await idle(settled)) await forget(settled.ref)
    }
  }
  const timer = setInterval(() => { void sweep() }, sweepEveryMs)
  timer.unref()
  return Object.freeze({
    /** The controller's workspace resolver: the workspace of the conversation the session's scope names; it never builds one. */
    workspace: async ({ requestContext }: Readonly<{ requestContext: RequestContext }>): Promise<Workspace | undefined> => {
      const scope = scopeOf(requestContext)
      return scope === undefined ? undefined : (await conversations.get(scope)?.catch(() => undefined))?.sandbox.workspace
    },
    /** The conversation's sandbox instance, made on first use. */
    sandbox: async (ref: ConversationRef): Promise<RunSandbox> => (await live(ref)).sandbox,
    /** The conversation's session, opened on its thread and on its sandbox's workspace, and noted as in use. */
    open: async (ref: ConversationRef): Promise<ControllerSession> => {
      const entry = await live(ref)
      entry.at = now()
      const session = await controller.createSession({ resourceId: projectResourceId(ref.projectId), scope: conversationScope(ref.conversationId), threadId: ref.conversationId, requestContext: new RequestContext() })
      if (session.getWorkspace() !== entry.sandbox.workspace) throw new Failure('BUILDER_SANDBOX_COMMAND_INTERFACE_REQUIRED')
      return session
    },
    /** Notes that the conversation was used now, so the idle window starts again. */
    touch: (conversationId: string): void => {
      void conversations.get(conversationScope(conversationId))?.then((entry) => { entry.at = now() }, () => undefined)
    },
    /** A turn that stalled holds the session; it goes, and the next request opens it again on the same sandbox. */
    deleteSession,
    sweep,
    /** A Project's conversations are gone: their sessions go, and the VMs their instances hold are killed. */
    drop: async (projectId: string, conversationIds: readonly string[]): Promise<void> => {
      for (const conversationId of conversationIds) {
        const entry = await conversations.get(conversationScope(conversationId))?.catch(() => undefined)
        if (!entry) {
          await deleteSession({ projectId, conversationId })
          continue
        }
        await entry.sandbox.kill().catch((error: unknown) => {
          logFailure(logger, new Failure('BUILDER_SANDBOX_KILL_FAILED', { cause: error }), { 'builder.conversation_id': conversationId })
        })
      }
    },
    /** The Hub is closing: no conversation session outlives it. */
    close: async (): Promise<void> => {
      clearInterval(timer)
      for (const entry of [...conversations.values()]) {
        const settled = await entry.catch(() => undefined)
        if (settled) await forget(settled.ref)
      }
    },
  })
}

export type LiveConversations = ReturnType<typeof createLiveConversations>
