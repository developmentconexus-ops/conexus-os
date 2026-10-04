import type { ExecuteCommandOptions, SandboxFileInput } from '@mastra/core/workspace'
import { Sandbox } from 'e2b'
import { checkApplicationInSandbox } from './application-artifact-runtime.js'
import { createConversationSandbox, createRunWorkspace, SANDBOX_AGENT_USER } from './sandbox.js'
import type { BuilderRunPorts, RunSandbox } from './run/ports.js'
import { Failure, logFailure } from '../platform/failure.js'
import { logger } from '../platform/logger.js'

/**
 * The production sandboxes: one E2B VM per conversation, with the agent's workspace on its checkout.
 * While a conversation has a run, or a pause still pending, that run's instance is the one every
 * run of it gets, so the next `start()` waits for the pause. Once the VM is paused the Hub drops
 * the instance, with the workspace and the process handles it holds (Mastra's Factory does the
 * same when it retires a session), unless the run parked: its live session holds the workspace, so
 * the answer resumes the same instance. The paused VM stays at E2B, and the next run builds an instance
 * that resumes it by the provider id the Hub recorded. A workspace is never destroyed on a pause,
 * since Mastra's destroy kills the VM it stands on. A killed VM is forgotten too, and the next run
 * gets a new one.
 */
// A deleted Project's kill waits on E2B at most this long per VM, so an unreachable provider never holds the deletion.
const PROVIDER_KILL_TIMEOUT_MS = 15_000

export const e2bConversationSandboxes = ({
  apiKey,
  templateId,
  create = createConversationSandbox,
  killProvider = (providerSandboxId) => Sandbox.kill(providerSandboxId, { apiKey, requestTimeoutMs: PROVIDER_KILL_TIMEOUT_MS }),
}: Readonly<{
  apiKey: string
  templateId: string
  create?: typeof createConversationSandbox
  killProvider?: (providerSandboxId: string) => Promise<boolean>
}>): Readonly<{
  open: BuilderRunPorts['openSandbox']
  /** The conversations are gone for good: their instances are dropped, and the VMs they hold are killed. */
  destroy(conversationIds: readonly string[]): Promise<void>
  /**
   * Kills the VMs by the provider ids the Hub recorded, running, paused or held by an earlier Hub
   * process. A VM E2B no longer has counts as killed; a kill that fails is logged and never throws.
   * Answers the ids that are gone.
   */
  killRecorded(providerSandboxIds: readonly string[]): Promise<readonly string[]>
}> => {
  // `opened` counts the runs that took the instance, so a pause that finishes after a later run took it drops nothing.
  const kept = new Map<string, { readonly sandbox: RunSandbox; opened: number }>()
  const open: BuilderRunPorts['openSandbox'] = ({ conversationId, providerSandboxId }) => {
    const held = kept.get(conversationId)
    if (held) {
      held.opened += 1
      return held.sandbox
    }
    const sandbox = create({ apiKey, templateId, conversationId, providerSandboxId })
    const workspace = createRunWorkspace(sandbox)
    const entry: { sandbox: RunSandbox; opened: number } = {
      opened: 1,
      sandbox: Object.freeze({
        get sandboxId() { return sandbox.sandboxId },
        workspace,
        start: async () => { await sandbox.start() },
        executeCommand: (command: string, args: string[] = [], options: ExecuteCommandOptions = {}) => sandbox.runCommand(command, args, options),
        writeFiles: (files: SandboxFileInput[]) => sandbox.writeFiles(files),
        runAsRoot: (script: string, env: Record<string, string>) => sandbox.runAsRoot(script, env),
        writeRootFile: (path: string, bytes: Uint8Array) => sandbox.writeRootFile(path, bytes),
        readAgentFile: (path: string) => sandbox.readAgentFile(path),
        readAgentFileIfPresent: (path: string) => sandbox.readAgentFileIfPresent(path),
        readAgentFileStream: (path: string) => sandbox.readAgentFileStream(path),
        runCheck: ({ root, out, collect, thumbnail, user }) => checkApplicationInSandbox(sandbox.e2b, { root, out, collect, ...(thumbnail ? { thumbnail } : {}), user: user === 'root' ? 'root' : SANDBOX_AGENT_USER }),
        holdOpen: (onLapse: (error: unknown) => void) => sandbox.holdOpen(onLapse),
        pause: async (parked = false) => {
          const opened = entry.opened
          try {
            await sandbox.pause()
          } finally {
            if (!parked && kept.get(conversationId) === entry && entry.opened === opened) kept.delete(conversationId)
          }
        },
        release: () => {
          if (kept.get(conversationId) === entry) kept.delete(conversationId)
        },
        kill: async () => {
          if (kept.get(conversationId) === entry) kept.delete(conversationId)
          await sandbox.kill()
        },
      }),
    }
    kept.set(conversationId, entry)
    return entry.sandbox
  }
  return Object.freeze({
    open,
    destroy: async (conversationIds) => {
      for (const conversationId of conversationIds) {
        await kept.get(conversationId)?.sandbox.kill().catch((error: unknown) => {
          logFailure(logger, new Failure('BUILDER_SANDBOX_KILL_FAILED', { cause: error }), { 'builder.conversation_id': conversationId })
        })
      }
    },
    killRecorded: async (providerSandboxIds) => {
      const gone = await Promise.all(providerSandboxIds.map((providerSandboxId) => killProvider(providerSandboxId).then(() => true, (error: unknown) => {
        logFailure(logger, new Failure('BUILDER_SANDBOX_KILL_FAILED', { cause: error }), { 'builder.provider_sandbox_id': providerSandboxId })
        return false
      })))
      return providerSandboxIds.filter((_, index) => gone[index])
    },
  })
}

/** What the Hub needs of its conversations' sandboxes: E2B's in production, a test composition's own otherwise. */
export type ConversationSandboxes = ReturnType<typeof e2bConversationSandboxes>
