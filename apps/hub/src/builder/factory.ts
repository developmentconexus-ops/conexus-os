import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { Mastra } from '@mastra/core/mastra'
import type { CommandResult, ExecuteCommandOptions } from '@mastra/core/workspace'
import { E2BSandbox } from '@mastra/e2b'
import { MastraFactory } from '@mastra/factory'
import { GithubIntegration } from '@mastra/factory/integrations/github/integration'
import type { FactorySandboxContext } from '@mastra/factory/sandbox/session-sandbox'
import type { Observability } from '@mastra/observability'
import { PgFactoryStorage, PostgresStore } from '@mastra/pg'
import { createPostgresPool } from '../platform/postgres.js'
import type { PostgresPool } from '../platform/postgres.js'
import type { BuilderAgentController } from './runtime.js'

export const FACTORY_SCHEMA = 'factory'
export const FACTORY_WORKING_DIRECTORY = '/workspace'
export const FACTORY_INTEGRATION_ID = 'github'

type SandboxEnvironment = Record<string, string | undefined>
type E2BSandboxOptions = NonNullable<ConstructorParameters<typeof E2BSandbox>[0]>

const withoutGithubTokens = <T extends string | undefined>(environment: Record<string, T>): Record<string, T> =>
  Object.fromEntries(Object.entries(environment).filter(([name]) => name !== 'GH_TOKEN' && name !== 'GITHUB_TOKEN'))

/** The processes alive in one VM before anything but its boot ran, as `<pid>:<start time>`. */
export type ProcessBaseline = Readonly<{ sandboxId: string; processes: ReadonlySet<string> }>

// Field 22 of /proc/<pid>/stat is the start time in clock ticks since boot. It is read after the
// last ')' because a comm may contain spaces. Paired with the pid it survives pid reuse. A process
// with no readable exe is a kernel thread or a zombie, and neither is listed or killed.
const STARTED = 'started() { sed -E \'s/^.*\\) //\' "$1/stat" 2>/dev/null | cut -d" " -f20; }'
export const PROCESS_BASELINE_SCRIPT = [
  STARTED,
  'cd /proc || exit 1',
  'for pid in [0-9]*; do readlink "$pid/exe" >/dev/null 2>&1 || continue; s=$(started "$pid"); [ -z "$s" ] || echo "$pid:$s"; done',
].join('\n')

// Kills every process that is not in the baseline, not a kernel thread, and not in its own
// ancestry, then looks again, because a process can fork while its parent is being killed. Five
// passes that each still find something to kill mean the reap did not converge.
export const reapScript = (baseline: ReadonlySet<string>): string => [
  STARTED,
  `base=" ${[...baseline].join(' ')} "`,
  'keep=" 1 $$ "; p=$$',
  'while [ "$p" -gt 1 ] 2>/dev/null; do p=$(sed -E \'s/^.*\\) [A-Za-z] ([0-9]+) .*/\\1/\' "/proc/$p/stat" 2>/dev/null); keep="$keep$p "; done',
  'cd /proc || exit 1',
  'pass=0',
  'while [ "$pass" -lt 5 ]; do',
  '  killed=0',
  '  for pid in [0-9]*; do case "$keep" in *" $pid "*) continue;; esac; readlink "$pid/exe" >/dev/null 2>&1 || continue; s=$(started "$pid"); [ -n "$s" ] || continue; case "$base" in *" $pid:$s "*) continue;; esac; kill -9 "$pid" 2>/dev/null && killed=1; done',
  '  [ "$killed" = 0 ] && exit 0',
  '  pass=$((pass + 1))',
  'done',
  'exit 4',
].join('\n')

const BASELINE_ENTRY = /^\d+:\d+$/

type E2BHandle = E2BSandbox['e2b']
const runAsRoot = (handle: E2BHandle, script: string) => handle.commands.run(script, { user: 'root', cwd: '/', envs: {}, timeoutMs: 30_000 })

// The Factory hands the sandbox an installation token as GH_TOKEN when a session starts and again
// on every github_refresh_token. That token reaches every repository of the installation, and the
// agent runs arbitrary commands in this sandbox. The agent never holds a GitHub token, so every
// write to the environment overlay is filtered here. retryOnDead stays native: the sandbox outlives
// runs, so a dead VM is recreated rather than failing the next command.
//
// The Hub mints Git tokens into commands that run in this VM, and anything the agent left running
// could read them from /proc. The template runs the agent as root, so there is no agent uid to kill
// by. Instead the Hub lists the VM's processes the moment it creates the VM, before the Factory's
// start hook or any agent command, and keeps that list in its own memory where the agent cannot
// edit it. The reap before each token-bearing command kills everything else.
export class ConexusFactoryE2BSandbox extends E2BSandbox {
  #baseline: ProcessBaseline | undefined

  constructor(options: E2BSandboxOptions = {}) {
    super({ ...options, env: withoutGithubTokens(options.env ?? {}) })
  }

  override setEnv(update: (environment: SandboxEnvironment) => SandboxEnvironment): void {
    super.setEnv((environment) => withoutGithubTokens(update(environment)))
  }

  // A VM this process did not create has no baseline, and listing its processes now would admit
  // whatever an earlier agent turn left running in it (a Hub restart does not stop the VM). So a
  // VM found by id is killed and a fresh one created. Nothing is lost: every run fetches and pins
  // its base from GitHub, discarding the checkout's previous state.
  protected override async find(): Promise<E2BHandle | undefined> {
    if (this._sandbox) return this._sandbox
    const found = await super.find()
    if (found) await found.kill()
    return undefined
  }

  protected override async create(): Promise<void> {
    this.#baseline = undefined
    await super.create()
    const handle = this.e2b
    const listed = await runAsRoot(handle, PROCESS_BASELINE_SCRIPT)
    const processes = new Set(listed.stdout.split('\n').map((line) => line.trim()).filter((line) => BASELINE_ENTRY.test(line)))
    if (listed.exitCode !== 0 || processes.size === 0) throw new Error('BUILDER_SANDBOX_BASELINE_FAILED')
    this.#baseline = Object.freeze({ sandboxId: handle.sandboxId, processes })
  }

  get processBaseline(): ProcessBaseline | undefined {
    return this.#baseline
  }

  /** Exit 0 once only baseline processes remain; nonzero, without killing anything, when this VM has no baseline. */
  async reapAgentProcesses(): Promise<CommandResult> {
    const startedAt = Date.now()
    const baseline = this.#baseline
    const refused = (exitCode: number): CommandResult => ({ success: false, exitCode, stdout: '', stderr: '', executionTimeMs: Date.now() - startedAt })
    if (!baseline || !this._sandbox || baseline.sandboxId !== this._sandbox.sandboxId) return refused(3)
    try {
      const ran = await runAsRoot(this._sandbox, reapScript(baseline.processes))
      return { success: ran.exitCode === 0, exitCode: ran.exitCode, stdout: ran.stdout, stderr: ran.stderr, executionTimeMs: Date.now() - startedAt }
    } catch (error) {
      // The SDK throws for a nonzero exit; the caller only needs to know the reap did not finish.
      const exitCode = (error as { exitCode?: unknown }).exitCode
      return refused(typeof exitCode === 'number' ? exitCode : 1)
    }
  }
}

export const createFactorySandbox = ({ apiKey, templateId, timeoutMs = 15 * 60_000 }: Readonly<{
  apiKey: string
  templateId: string
  timeoutMs?: number
}>) => (context: FactorySandboxContext): ConexusFactoryE2BSandbox => new ConexusFactoryE2BSandbox({
  // context.sessionId is the Factory session row id, one sandbox per conversation.
  id: `conexus-factory-${context.sessionId}`,
  template: templateId,
  apiKey,
  timeout: timeoutMs,
  lifecycle: { onTimeout: 'kill' },
  env: {},
  workingDirectory: FACTORY_WORKING_DIRECTORY,
  metadata: { 'conexus-factory-session': context.sessionId },
  instructions: 'Remote Conexus Builder sandbox. No host fallback, remote credentials, or owner-state authority.',
})

type CommandSandbox = Readonly<{
  executeCommand?(command: string, args?: string[], options?: ExecuteCommandOptions): Promise<CommandResult>
}>

const REPOSITORY_SLUG = /^[\w.-]+\/[\w.-]+$/

// The Factory's start hook clones with an installation token in the remote URL and scrubs it after,
// but the scrub that follows a branch checkout ignores its own exit code, and it leaves git pointed
// at `gh auth git-credential`. The agent runs next in this checkout, so after every start the Hub
// resets the remote, drops the helper, and refuses the sandbox if a token is still anywhere in .git.
export const scrubCheckoutCredentials = async (sandbox: CommandSandbox, workdir: string, repositorySlug: string): Promise<void> => {
  if (!REPOSITORY_SLUG.test(repositorySlug) || !/^\/[\w./-]+$/.test(workdir)) throw new Error('FACTORY_CHECKOUT_REFUSED')
  if (!sandbox.executeCommand) throw new Error('FACTORY_CHECKOUT_REFUSED')
  const result = await sandbox.executeCommand('sh', ['-c', [
    `git -C '${workdir}' remote set-url origin 'https://github.com/${repositorySlug}.git'`,
    `{ git -C '${workdir}' config --unset-all credential.helper || true; }`,
    `! grep -rqsF 'x-access-token' '${workdir}/.git' --exclude-dir=objects`,
  ].join(' && ')])
  if (result.exitCode !== 0) throw new Error('FACTORY_CHECKOUT_CREDENTIAL_REFUSED')
}

// prepare() loads Mastra Code with the Hub's own cwd and HOME: MCP servers, hooks and plugins from
// .mastracode, and <cwd>/.env into process.env. The Hub cannot switch that off, so it refuses to
// boot where either could be picked up.
export const assertFactoryHost = ({ cwd, home }: Readonly<{ cwd: string; home: string | undefined }>): void => {
  for (const directory of home ? [cwd, home] : [cwd]) {
    for (const name of ['.mastracode', '.env']) {
      if (existsSync(join(directory, name))) throw new Error(`FACTORY_HOST_REFUSED:${join(directory, name)}`)
    }
  }
}

export const createFactoryPool = (database: Readonly<{ host: string; port: number; database: string }>, password: string): PostgresPool =>
  createPostgresPool({ ...database, user: 'hub_factory', password, options: `-c search_path=${FACTORY_SCHEMA}` })

// PgFactoryStorage creates its tables under unqualified names, so the pool's search_path decides
// where they land. It is pinned to factory on every connection rather than trusted to the role.
export const createFactoryStorage = (pool: PostgresPool): PgFactoryStorage =>
  new PgFactoryStorage({ store: new PostgresStore({ id: 'conexus-factory', pool, schemaName: FACTORY_SCHEMA }) })

export type FactoryGithubApp = Readonly<{
  appId: string
  privateKey: string
  clientId: string
  clientSecret: string
  slug: string
}>

export type FactoryComposition = Readonly<{
  mastra: Mastra
  controllerId: string
  controller: BuilderAgentController
  github: GithubIntegration
  storage: PgFactoryStorage
  close(): Promise<void>
}>

export const composeFactory = async ({ pool, github, stateSecret, publicUrl, sandbox, observability }: Readonly<{
  pool: PostgresPool
  github: FactoryGithubApp
  stateSecret: string
  publicUrl: string
  sandbox: (context: FactorySandboxContext) => E2BSandbox
  observability?: Observability
}>): Promise<FactoryComposition> => {
  const storage = createFactoryStorage(pool)
  const integration = new GithubIntegration(github)
  const factory = new MastraFactory({
    storage,
    auth: null,
    integrations: [integration],
    sandbox,
    stateSecret,
    includeDefaultBoards: false,
    publicUrl,
  })
  // The Hub has no boards and opens no pull requests. The workers prepare() returns sweep GitHub on
  // a timer with installation tokens for state the Hub never creates, so they are not started.
  const { workers: _workers, ...args } = await factory.prepare()
  const mastra = new Mastra({ ...args, ...(observability ? { observability } : {}), logger: false })
  await factory.finalize()
  const controllers = Object.entries(args.agentControllers ?? {})
  if (controllers.length !== 1) throw new Error('FACTORY_CONTROLLER_UNAVAILABLE')
  const [[controllerId, controller]] = controllers as [[string, BuilderAgentController]]
  return Object.freeze({
    mastra,
    controllerId,
    controller,
    github: integration,
    storage,
    close: async () => {
      try {
        await factory.shutdown()
        await controller.destroy()
      } finally {
        await pool.end().catch(() => undefined)
      }
    },
  })
}
