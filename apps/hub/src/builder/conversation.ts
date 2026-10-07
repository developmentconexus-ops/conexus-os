import type { AgentController } from '@mastra/core/agent-controller'
import { RequestContext } from '@mastra/core/request-context'
import type { Workspace } from '@mastra/core/workspace'
import { Failure, logFailure } from '../platform/failure.js'
import { logger } from '../platform/logger.js'
import type { ConversationSandboxes } from './conversation-sandboxes.js'
import { projectResourceId } from './conversations.js'
import type { ControllerSession, RunSandbox } from './run/ports.js'
import type { AccountId, ConversationId, ProjectId } from '@conexus/contract'

type SessionPorts = Pick<AgentController, 'createSession' | 'deleteSession' | 'getSessionByResource'>

/**
 * How long a conversation may go unused before the Hub lets go of its session and its sandbox
 * instance. Mastra keeps a live session until `deleteSession`; the conversation's next request opens
 * it again from the thread, and the next command resumes its VM.
 */
const CONVERSATION_IDLE_MS = 10 * 60_000

/** The one session scope of a conversation, which the browser and its runs share. */
export const conversationScope = (conversationId: ConversationId): string => `conversation:${conversationId}`

// Mastra puts the session's scope on every request context it builds for that session.
const scopeOf = (requestContext: RequestContext): string | undefined => {
  const controller: unknown = requestContext.get('controller')
  return typeof controller === 'object' && controller !== null && 'scope' in controller && typeof controller.scope === 'string' ? controller.scope : undefined
}

export type ConversationRef = Readonly<{ projectId: ProjectId; conversationId: ConversationId }>
export type AdmittedConversationRef = ConversationRef & Readonly<{ accountId: AccountId }>

type Live = Readonly<{ ref: ConversationRef; sandbox: RunSandbox }>

/**
 * The owner of each conversation's one Mastra session and one sandbox instance. The sandbox comes
 * first, so the session Mastra makes on the scope finds its workspace; it starts no VM until its
 * first command. Mastra resolves the workspace on every agent call, so the resolver only looks up.
 * A conversation idle for `idleMs` is let go unless its run is open, its session is running, or a
 * question waits on it.
 */
export const createLiveConversations = ({ controller, sandboxes, readSandboxId, runOpen, idleMs = CONVERSATION_IDLE_MS, now = Date.now }: Readonly<{
  controller: SessionPorts
  sandboxes: Pick<ConversationSandboxes, 'open'>
  /** The provider id of the VM the conversation last had, so its instance resumes that VM. */
  readSandboxId(ref: AdmittedConversationRef): Promise<string | null>
  /** Whether the conversation has a run in this Hub. */
  runOpen(conversationId: ConversationId): boolean
  idleMs?: number
  now?: () => number
}>) => {
  const conversations = new Map<string, Promise<Live>>()
  const used = new Map<string, number>()
  const retiring = new Map<string, Promise<void>>()
  const sessionOf = (ref: ConversationRef) => controller.getSessionByResource(projectResourceId(ref.projectId), conversationScope(ref.conversationId))
  const deleteSessionRequired = async (ref: ConversationRef): Promise<void> => {
    try { await controller.deleteSession({ resourceId: projectResourceId(ref.projectId), scope: conversationScope(ref.conversationId) }) }
    catch (error) { throw new Failure('BUILDER_SESSION_DELETE_FAILED', { cause: error }) }
  }
  // Synchronous up to the returned promise: from this call on, no open finds the entry, and each waits for the end.
  const retire = (ref: ConversationRef, work: () => Promise<void> = async () => undefined): Promise<void> => {
    const scope = conversationScope(ref.conversationId)
    conversations.delete(scope)
    used.delete(scope)
    const ended = (async () => {
      try { await work() } finally { await deleteSessionRequired(ref) }
    })()
    const settled = ended.catch(() => undefined).then(() => { if (retiring.get(scope) === settled) retiring.delete(scope) })
    retiring.set(scope, settled)
    return ended
  }
  const use = (scope: string): void => { used.set(scope, now()) }
  const live = async ({ accountId, ...ref }: AdmittedConversationRef): Promise<Live> => {
    const scope = conversationScope(ref.conversationId)
    for (let ending = retiring.get(scope); ending; ending = retiring.get(scope)) await ending
    const known = conversations.get(scope)
    if (known) return known
    const made = (async (): Promise<Live> => ({
      ref,
      sandbox: sandboxes.open({ conversationId: ref.conversationId, providerSandboxId: await readSandboxId({ ...ref, accountId }), retire: (kill) => retire(ref, kill) }),
    }))()
    conversations.set(scope, made)
    if (!used.has(scope)) use(scope)
    made.catch(() => { if (conversations.get(scope) === made) conversations.delete(scope) })
    return made
  }
  const idleSince = (scope: string): boolean => now() - (used.get(scope) ?? 0) >= idleMs
  const sweep = async (signal: AbortSignal): Promise<void> => {
    for (const [scope, entry] of [...conversations]) {
      if (signal.aborted) return
      const settled = await entry.catch(() => undefined)
      if (!settled || !idleSince(scope) || runOpen(settled.ref.conversationId)) continue
      const session = await sessionOf(settled.ref)
      // Checked again after the await: an open or a run that started meanwhile keeps the conversation.
      const still = conversations.get(scope) === entry && idleSince(scope) && !runOpen(settled.ref.conversationId)
      if (still && (!session || (!session.run.isRunning() && !session.suspensions.hasPending()))) await retire(settled.ref).catch((error: unknown) => { logFailure(logger, error instanceof Failure ? error : new Failure('BUILDER_SESSION_DELETE_FAILED', { cause: error }), { 'builder.conversation_id': settled.ref.conversationId }) })
    }
  }
  return Object.freeze({
    /** The controller's workspace resolver: the workspace of the conversation the session's scope names; it never builds one. */
    workspace: async ({ requestContext }: Readonly<{ requestContext: RequestContext }>): Promise<Workspace | undefined> => {
      const scope = scopeOf(requestContext)
      return scope === undefined ? undefined : (await conversations.get(scope)?.catch(() => undefined))?.sandbox.workspace
    },
    /** The conversation's sandbox instance, made on first use. */
    sandbox: async (ref: AdmittedConversationRef): Promise<RunSandbox> => {
      use(conversationScope(ref.conversationId))
      return (await live(ref)).sandbox
    },
    /** The conversation's session, opened on its thread and on its sandbox's workspace, and noted as in use. */
    open: async (ref: AdmittedConversationRef): Promise<ControllerSession> => {
      use(conversationScope(ref.conversationId))
      const entry = await live(ref)
      const session = await controller.createSession({ resourceId: projectResourceId(ref.projectId), scope: conversationScope(ref.conversationId), threadId: ref.conversationId, requestContext: new RequestContext() })
      if (session.getWorkspace() !== entry.sandbox.workspace) throw new Failure('BUILDER_SANDBOX_COMMAND_INTERFACE_REQUIRED')
      return session
    },
    /** Notes that the conversation was used now, so the idle window starts again. */
    touch: (conversationId: ConversationId): void => {
      if (conversations.has(conversationScope(conversationId))) use(conversationScope(conversationId))
    },
    /** A turn that stalled holds the session; it goes, and the next request opens it again on the same sandbox. */
    deleteSession: async (ref: ConversationRef): Promise<void> => {
      try { await deleteSessionRequired(ref) }
      catch (error) { logFailure(logger, error instanceof Failure ? error : new Failure('BUILDER_SESSION_DELETE_FAILED', { cause: error }), { 'builder.conversation_id': ref.conversationId }) }
    },
    /** One pass of the `idle-conversations` job: lets go of the conversations idle past the window. */
    sweep,
    /** Required teardown before persisted threads disappear. */
    drop: async (projectId: ProjectId, conversationIds: readonly ConversationId[]): Promise<void> => {
      for (const conversationId of conversationIds) {
        const entry = await conversations.get(conversationScope(conversationId))?.catch(() => undefined)
        if (!entry) {
          await deleteSessionRequired({ projectId, conversationId })
          continue
        }
        await retire(entry.ref)
      }
    },
    /** The Hub is closing: no conversation session outlives it. */
    close: async (): Promise<void> => {
      for (const entry of [...conversations.values()]) {
        const settled = await entry.catch(() => undefined)
        if (settled) await retire(settled.ref).catch((error: unknown) => { logFailure(logger, error instanceof Failure ? error : new Failure('BUILDER_SESSION_DELETE_FAILED', { cause: error }), { 'builder.conversation_id': settled.ref.conversationId }) })
      }
    },
  })
}

export type LiveConversations = ReturnType<typeof createLiveConversations>
