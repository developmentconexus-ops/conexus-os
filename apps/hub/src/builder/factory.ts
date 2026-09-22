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

// Rows the Hub writes into Factory storage carry this as their author, and the organization's
// memory settings are this user's row. No person is behind it: the operator runs the one-shot
// commands from the Hub's own checkout.
export const FACTORY_OPERATOR_ID = 'conexus-operator'
export const FACTORY_SCHEMA = 'factory'
export const FACTORY_WORKING_DIRECTORY = '/workspace'
export const FACTORY_INTEGRATION_ID = 'github'

type SandboxEnvironment = Record<string, string | undefined>
type E2BSandboxOptions = NonNullable<ConstructorParameters<typeof E2BSandbox>[0]>

const withoutGithubTokens = <T extends string | undefined>(environment: Record<string, T>): Record<string, T> =>
  Object.fromEntries(Object.entries(environment).filter(([name]) => name !== 'GH_TOKEN' && name !== 'GITHUB_TOKEN'))

// The Factory hands the sandbox an installation token as GH_TOKEN when a session starts and again
// on every github_refresh_token. That token reaches every repository of the installation, and the
// agent runs arbitrary commands in this sandbox. The agent never holds a GitHub token, so every
// write to the environment overlay is filtered here. retryOnDead stays native: the sandbox outlives
// runs, so a dead VM is recreated rather than failing the next command.
//
// The template runs every command and file write as its unprivileged agent user. The Hub's own
// token-bearing git runs as root through runAsRoot, where nothing that user left running can read
// the process environment.
export class ConexusFactoryE2BSandbox extends E2BSandbox {
  constructor(options: E2BSandboxOptions = {}) {
    super({ ...options, env: withoutGithubTokens(options.env ?? {}) })
  }

  override setEnv(update: (environment: SandboxEnvironment) => SandboxEnvironment): void {
    super.setEnv((environment) => withoutGithubTokens(update(environment)))
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
// at `gh auth git-credential`. The checkout belongs to the agent's user, so after the start the Hub
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
