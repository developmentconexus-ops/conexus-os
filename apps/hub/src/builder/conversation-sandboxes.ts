import type { ExecuteCommandOptions, SandboxFileInput } from '@mastra/core/workspace'
import { Sandbox } from 'e2b'
import { checkApplicationInSandbox } from './application-artifact-runtime.js'
import type { CheckBundle } from './check-delivery.js'
import { createConversationSandbox, createRunWorkspace } from './sandbox.js'
import type { RunSandbox } from './run/ports.js'
import { Failure, logFailure } from '../platform/failure.js'
import { logger } from '../platform/logger.js'

// A deleted Project's kill waits on E2B at most this long per VM, so an unreachable provider never holds the deletion.
const PROVIDER_KILL_TIMEOUT_MS = 15_000

/**
 * The production sandboxes: one E2B VM per conversation, with the agent's workspace on its checkout.
 * An instance starts no VM until its first command, which resumes the VM the conversation had, by
 * the provider id the Hub recorded, or creates one. A paused VM resumes on the same instance. A
 * killed one ends the instance, and the conversation makes a new one.
 */
export const e2bConversationSandboxes = ({
  apiKey,
  templateId,
  idleMs,
  check,
  create = createConversationSandbox,
  killProvider = (providerSandboxId) => Sandbox.kill(providerSandboxId, { apiKey, requestTimeoutMs: PROVIDER_KILL_TIMEOUT_MS }),
}: Readonly<{
  apiKey: string
  templateId: string
  idleMs: number
  /** The check every `runCheck` asks the VM to run, by its hash. */
  check: CheckBundle
  create?: typeof createConversationSandbox
  killProvider?: (providerSandboxId: string) => Promise<boolean>
}>): Readonly<{
  /** `retire` runs the kill with the conversation letting go of the instance first, so nothing opens on it while it dies. */
  open(input: Readonly<{ conversationId: string; providerSandboxId: string | null; retire(kill: () => Promise<void>): Promise<void> }>): RunSandbox
  /**
   * Kills the VMs by the provider ids the Hub recorded, running, paused or held by an earlier Hub
   * process. A VM E2B no longer has counts as killed; a kill that fails is logged and never throws.
   * Answers the ids that are gone.
   */
  killRecorded(providerSandboxIds: readonly string[]): Promise<readonly string[]>
}> => Object.freeze({
  open: ({ conversationId, providerSandboxId, retire }) => {
    const sandbox = create({ apiKey, templateId, conversationId, providerSandboxId, idleMs })
    return Object.freeze({
      get sandboxId() { return sandbox.sandboxId },
      workspace: createRunWorkspace(sandbox),
      start: async () => { await sandbox.start() },
      executeCommand: (command: string, args: string[] = [], options: ExecuteCommandOptions = {}) => sandbox.runCommand(command, args, options),
      writeFiles: (files: SandboxFileInput[]) => sandbox.writeFiles(files),
      runAsRoot: (script: string, env: Record<string, string>) => sandbox.runAsRoot(script, env),
      writeRootFile: (path: string, bytes: Uint8Array) => sandbox.writeRootFile(path, bytes),
      readAgentFile: (path: string) => sandbox.readAgentFile(path),
      readAgentFileIfPresent: (path: string) => sandbox.readAgentFileIfPresent(path),
      readAgentFileStream: (path: string) => sandbox.readAgentFileStream(path),
      runCheck: ({ caller, root, out, collect, thumbnail }) => checkApplicationInSandbox(sandbox.e2b, { check, caller, root, out, collect, ...(thumbnail ? { thumbnail } : {}) }),
      holdOpen: (onLapse: (error: unknown) => void) => sandbox.holdOpen(onLapse),
      idle: () => sandbox.idle(),
      kill: () => retire(() => sandbox.kill()),
    } satisfies RunSandbox)
  },
  killRecorded: async (providerSandboxIds) => {
    const gone = await Promise.all(providerSandboxIds.map((providerSandboxId) => killProvider(providerSandboxId).then(() => true, (error: unknown) => {
      logFailure(logger, new Failure('BUILDER_SANDBOX_KILL_FAILED', { cause: error }), { 'builder.provider_sandbox_id': providerSandboxId })
      return false
    })))
    return providerSandboxIds.filter((_, index) => gone[index])
  },
})

export type ConversationSandboxes = ReturnType<typeof e2bConversationSandboxes>
