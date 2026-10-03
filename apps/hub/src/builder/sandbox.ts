import type { CommandResult, ExecuteCommandOptions } from '@mastra/core/workspace'
import { Workspace, WORKSPACE_TOOLS } from '@mastra/core/workspace'
import { SandboxFilesystem } from '@mastra/code-sdk/agents/sandbox-filesystem'
import { E2BSandbox } from '@mastra/e2b'
import { FileNotFoundError, Sandbox } from 'e2b'

// The template's own home for the agent; the conversation's checkout lives inside it.
const SANDBOX_HOME = '/workspace'
export const SANDBOX_CHECKOUT = `${SANDBOX_HOME}/repo`
// The template's unprivileged user: every agent command and file write runs as it.
export const SANDBOX_AGENT_USER = 'conexus-agent'
const CONVERSATION_METADATA_KEY = 'conexus-builder-conversation'
const MAX_CONSECUTIVE_KEEPALIVE_FAILURES = 3

type E2BSandboxOptions = NonNullable<ConstructorParameters<typeof E2BSandbox>[0]>

// The template runs every command and file write as its unprivileged agent user. The Hub's own
// steps that the agent must not be able to change run as root through runAsRoot and writeRootFile,
// where nothing that user left running can reach them. The agent's commands start in the checkout.
export class ConexusRunSandbox extends E2BSandbox {
  readonly #timeoutMs: number

  constructor(options: Omit<E2BSandboxOptions, 'workingDirectory'> & Readonly<{ timeout: number }>) {
    super({ ...options, workingDirectory: SANDBOX_CHECKOUT })
    this.#timeoutMs = options.timeout
  }

  /**
   * A turn's end: Mastra's stop, which pauses the VM with its files and its memory and stops the
   * bill. The next `start()` finds the paused VM and resumes it. `stop()` alone would leave the
   * instance marked running, and that `start()` would then do nothing.
   */
  pause(): Promise<void> {
    return this._stop()
  }

  /** A broken VM: Mastra's destroy, which kills it at E2B. */
  kill(): Promise<void> {
    return this._destroy()
  }

  /** `executeCommand`, which the base class declares optional and E2B always has. */
  runCommand(command: string, args?: string[], options?: ExecuteCommandOptions): Promise<CommandResult> {
    if (!this.executeCommand) throw new Error('BUILDER_SANDBOX_COMMAND_INTERFACE_REQUIRED')
    return this.executeCommand(command, args, options)
  }

  async #extend(): Promise<void> {
    await this.e2b.setTimeout(this.#timeoutMs)
  }

  // E2B counts the sandbox timeout from creation and command activity never moves it, so a run
  // holds the sandbox open by calling this (docs/reference/mastra-boundary.md, U7).
  async holdOpen(onLapse: (error: unknown) => void): Promise<() => void> {
    await this.#extend()
    let failures = 0
    let extending = false
    let active = true
    const interval = setInterval(() => {
      if (!active || extending) return
      extending = true
      this.#extend().then(() => {
        failures = 0
      }, (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        const sandboxGone = /\b(?:paused\s+)?sandbox(?:\s+\S+)?\s+(?:was\s+)?not found\b/i.test(message) ||
          message.includes('Sandbox is probably not running') || message.includes('sandbox has been killed')
        if (!sandboxGone && ++failures < MAX_CONSECUTIVE_KEEPALIVE_FAILURES) return
        active = false
        clearInterval(interval)
        onLapse(error)
      }).finally(() => { extending = false })
    }, Math.floor(this.#timeoutMs / 3))
    interval.unref()
    return () => {
      active = false
      clearInterval(interval)
    }
  }

  async runAsRoot(script: string, env: Record<string, string>): Promise<CommandResult> {
    const startedAt = Date.now()
    try {
      const ran = await this.e2b.commands.run(script, { user: 'root', cwd: '/', envs: env, timeoutMs: 120_000 })
      return { success: ran.exitCode === 0, exitCode: ran.exitCode, stdout: ran.stdout, stderr: ran.stderr, executionTimeMs: Date.now() - startedAt }
    } catch (error) {
      // The SDK throws for a nonzero exit; the caller reads the exit code.
      const failed = error as { exitCode?: unknown; stdout?: unknown; stderr?: unknown }
      return {
        success: false,
        exitCode: typeof failed.exitCode === 'number' ? failed.exitCode : 1,
        stdout: typeof failed.stdout === 'string' ? failed.stdout : '',
        stderr: typeof failed.stderr === 'string' ? failed.stderr : '',
        executionTimeMs: Date.now() - startedAt,
      }
    }
  }

  // Root owns the file and its folder, so the agent's user can read it and never replace it.
  async writeRootFile(path: string, bytes: Uint8Array): Promise<void> {
    const folder = path.slice(0, path.lastIndexOf('/')) || '/'
    const made = await this.runAsRoot(`mkdir -p -m 755 '${folder}'`, {})
    if (made.exitCode !== 0) throw new Error('BUILDER_SANDBOX_FILE_REFUSED')
    await this.e2b.files.write(path, new Blob([new Uint8Array(bytes)]), { user: 'root' })
  }

  // With the agent user's own permissions, so a link it planted reaches only what it could read.
  async readAgentFile(path: string): Promise<Uint8Array> {
    return this.e2b.files.read(path, { format: 'bytes', user: SANDBOX_AGENT_USER })
  }

  // Null only when the file is not there; any other failure still throws.
  async readAgentFileIfPresent(path: string): Promise<Uint8Array | null> {
    try { return await this.readAgentFile(path) } catch (error) { if (error instanceof FileNotFoundError) return null; throw error }
  }

  async readAgentFileStream(path: string): Promise<ReadableStream<Uint8Array>> {
    return this.e2b.files.read(path, { format: 'stream', user: SANDBOX_AGENT_USER })
  }
}

/**
 * A conversation's own sandbox (spec 0002 amendment, B3): `start()` resumes the VM it had, by the
 * provider id the Hub recorded and else by the logical id, and creates one only when E2B has none.
 * A Hub that stops keeping it alive mid-turn leaves it to pause at its timeout, never to die.
 */
export const createConversationSandbox = ({ apiKey, templateId, conversationId, providerSandboxId, timeoutMs = 15 * 60_000 }: Readonly<{
  apiKey: string
  templateId: string
  conversationId: string
  providerSandboxId: string | null
  timeoutMs?: number
}>): ConexusRunSandbox => new ConexusRunSandbox({
  id: `conexus-conv-${conversationId}`,
  ...(providerSandboxId ? { sandboxId: providerSandboxId } : {}),
  template: templateId,
  apiKey,
  timeout: timeoutMs,
  lifecycle: { onTimeout: 'pause' },
  // E2B otherwise serves every listening port at a public URL, loopback-bound ones included.
  network: { allowPublicTraffic: false },
  env: {},
  metadata: { [CONVERSATION_METADATA_KEY]: conversationId },
  instructions: 'Remote Conexus Builder sandbox. No host fallback, remote credentials, or owner-state authority.',
})

/** A paused conversation machine at E2B, and when it stopped being alive. */
export type PausedConversationMachine = Readonly<{ providerSandboxId: string; conversationId: string; idleSince: Date }>

/**
 * Every paused machine E2B holds for a conversation, found by the metadata `createConversationSandbox`
 * sets and not by the Hub's rows, so a machine whose row is gone is listed too. E2B filters by state;
 * a metadata filter needs the value, so the key is matched here. A paused machine's `endAt` is the
 * moment it stopped being alive: every turn pushes it out, so it is the end of the last use.
 */
export const listPausedConversationMachines = async (apiKey: string): Promise<readonly PausedConversationMachine[]> => {
  const found: PausedConversationMachine[] = []
  const pages = Sandbox.list({ apiKey, query: { state: ['paused'] } })
  while (pages.hasNext) {
    for (const info of await pages.nextItems()) {
      const conversationId = info.metadata[CONVERSATION_METADATA_KEY]
      if (conversationId) found.push({ providerSandboxId: info.sandboxId, conversationId, idleSince: info.endAt })
    }
  }
  return found
}

/** Every workspace tool that can change the checkout, the shell included. */
export const CHECKOUT_WRITER_TOOLS: ReadonlySet<string> = new Set([
  WORKSPACE_TOOLS.FILESYSTEM.WRITE_FILE, WORKSPACE_TOOLS.FILESYSTEM.EDIT_FILE, WORKSPACE_TOOLS.FILESYSTEM.DELETE,
  WORKSPACE_TOOLS.FILESYSTEM.MKDIR, WORKSPACE_TOOLS.SANDBOX.EXECUTE_COMMAND,
])

/** The workspace tools the Builder has: the checkout's writers and its readers. Every other tool Mastra ships stays off. */
const BUILDER_WORKSPACE_TOOLS: readonly string[] = [
  ...CHECKOUT_WRITER_TOOLS,
  WORKSPACE_TOOLS.FILESYSTEM.READ_FILE, WORKSPACE_TOOLS.FILESYSTEM.LIST_FILES, WORKSPACE_TOOLS.FILESYSTEM.GREP, WORKSPACE_TOOLS.FILESYSTEM.FILE_STAT,
  WORKSPACE_TOOLS.SANDBOX.GET_PROCESS_OUTPUT, WORKSPACE_TOOLS.SANDBOX.KILL_PROCESS,
]

/** The workspace `tools` option: nothing is on unless the Builder has it. */
const BUILDER_WORKSPACE_TOOLS_CONFIG = Object.freeze({
  enabled: false, ...Object.fromEntries(BUILDER_WORKSPACE_TOOLS.map((name) => [name, { enabled: true }])),
})

/** The agent's workspace on a conversation's sandbox: its file tools and its commands share the checkout. */
export const createRunWorkspace = (sandbox: ConexusRunSandbox): Workspace => new Workspace({
  id: `conexus-run-workspace-${sandbox.id}`,
  name: 'Conexus Builder run',
  filesystem: new SandboxFilesystem({
    id: `conexus-run-fs-${sandbox.id}`,
    sandbox: { id: sandbox.id, executeCommand: (command, args, options) => sandbox.runCommand(command, args, options) },
    workdir: SANDBOX_CHECKOUT,
  }),
  sandbox,
  tools: BUILDER_WORKSPACE_TOOLS_CONFIG,
})
