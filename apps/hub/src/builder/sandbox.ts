import type { CommandResult, ExecuteCommandOptions } from '@mastra/core/workspace'
import { Workspace } from '@mastra/core/workspace'
import { SandboxFilesystem } from '@mastra/code-sdk/agents/sandbox-filesystem'
import { E2BSandbox } from '@mastra/e2b'

// The template's own home for the agent; the run's checkout of its Project's `main` lives inside it.
const SANDBOX_HOME = '/workspace'
export const SANDBOX_CHECKOUT = `${SANDBOX_HOME}/repo`
// The template's unprivileged user: every agent command and file write runs as it.
export const SANDBOX_AGENT_USER = 'conexus-agent'

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
    const heartbeat = setInterval(() => { this.#extend().catch(onLapse) }, Math.floor(this.#timeoutMs / 3))
    heartbeat.unref()
    return () => clearInterval(heartbeat)
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
}

/** One fresh sandbox per run (spec 0002, AC-14), never reused by another run. */
export const createRunSandbox = ({ apiKey, templateId, builderRunId, timeoutMs = 15 * 60_000 }: Readonly<{
  apiKey: string
  templateId: string
  builderRunId: string
  timeoutMs?: number
}>): ConexusRunSandbox => new ConexusRunSandbox({
  id: `conexus-run-${builderRunId}`,
  template: templateId,
  apiKey,
  timeout: timeoutMs,
  lifecycle: { onTimeout: 'kill' },
  // E2B otherwise serves every listening port at a public URL, loopback-bound ones included.
  network: { allowPublicTraffic: false },
  env: {},
  metadata: { 'conexus-builder-run': builderRunId },
  instructions: 'Remote Conexus Builder sandbox. No host fallback, remote credentials, or owner-state authority.',
})

/** The agent's workspace on a run's sandbox: its file tools and its commands share the checkout. */
export const createRunWorkspace = (sandbox: ConexusRunSandbox): Workspace => new Workspace({
  id: `conexus-run-workspace-${sandbox.id}`,
  name: 'Conexus Builder run',
  filesystem: new SandboxFilesystem({
    id: `conexus-run-fs-${sandbox.id}`,
    sandbox: { id: sandbox.id, executeCommand: (command, args, options) => sandbox.runCommand(command, args, options) },
    workdir: SANDBOX_CHECKOUT,
  }),
  sandbox,
})
