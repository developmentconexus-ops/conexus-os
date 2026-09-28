import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { Mastra } from '@mastra/core/mastra'
import { ConsoleLogger } from '@mastra/core/logger'
import { MastraCompositeStore } from '@mastra/core/storage'
import type { RetentionConfig, StorageDomains } from '@mastra/core/storage'
import type { CommandResult } from '@mastra/core/workspace'
import { E2BSandbox } from '@mastra/e2b'
import { MastraFactory } from '@mastra/factory'
import type { FactoryIntegration } from '@mastra/factory'
import type { FactorySecretEncryption } from '@mastra/factory/secret-encryption'
import type { VersionControl } from '@mastra/factory/capabilities/version-control'
import { GithubIntegration } from '@mastra/factory/integrations/github/integration'
import { createCustomProvidersPrimer, invalidateCustomProvidersSnapshots } from '@mastra/factory/routes/custom-provider-source'
import type { RouteAuth } from '@mastra/factory/routes/route'
import type { CustomProvidersStorage } from '@mastra/factory/storage/domains/custom-providers/base'
import type { FactorySandboxContext } from '@mastra/factory/sandbox/session-sandbox'
import type { Observability } from '@mastra/observability'
import { PgFactoryStorage, PostgresStore } from '@mastra/pg'
import { createPostgresPool } from '../platform/postgres.js'
import type { PostgresPool } from '../platform/postgres.js'
import { factorySecretEncryption } from '../platform/secrets.js'
import { GOOGLE_AI_PRO_MODELS, GOOGLE_AI_PRO_NAME, GOOGLE_AI_PRO_PROVIDER } from './google-ai-pro/credential.js'
import type { HubSessionAuthProvider } from './hub-session-auth.js'
import type { BuilderAgentController } from './runtime.js'

// Rows the Hub writes into Factory storage carry this as their author, and the organization's
// memory settings are this user's row. No person is behind it: the operator runs the one-shot
// commands from the Hub's own checkout.
export const FACTORY_OPERATOR_ID = 'conexus-operator'
const FACTORY_SCHEMA = 'factory'
export const FACTORY_WORKING_DIRECTORY = '/workspace'
export const FACTORY_INTEGRATION_ID = 'github'
// The run's checkout of its Project's `main`, which the agent works in.
export const SANDBOX_CHECKOUT = `${FACTORY_WORKING_DIRECTORY}/repo`
// The template's unprivileged user: every agent command and file write runs as it.
export const SANDBOX_AGENT_USER = 'conexus-agent'
// What every Factory caller gets as the repository credential. It opens nothing on GitHub, so a
// clone command line, a remote URL or GH_TOKEN holding it holds no secret.
/** @public Tests import this at runtime from the built module. */
export const SANDBOX_CREDENTIAL = 'conexus-no-credential'

type SandboxEnvironment = Record<string, string | undefined>
type E2BSandboxOptions = NonNullable<ConstructorParameters<typeof E2BSandbox>[0]>

const withoutGithubTokens = <T extends string | undefined>(environment: Record<string, T>): Record<string, T> =>
  Object.fromEntries(Object.entries(environment).filter(([name]) => name !== 'GH_TOKEN' && name !== 'GITHUB_TOKEN'))

// The template runs every command and file write as its unprivileged agent user. The Hub's own
// steps that the agent must not be able to change run as root through runAsRoot and writeRootFile,
// where nothing that user left running can reach them. retryOnDead stays native: the sandbox
// outlives runs, so a dead VM is recreated rather than failing the next command. GH_TOKEN is still
// filtered, for an organization PAT the Factory would hand out as it is.
export class ConexusFactoryE2BSandbox extends E2BSandbox {
  readonly #timeoutMs: number

  constructor(options: Omit<E2BSandboxOptions, 'workingDirectory'> & Readonly<{ timeout: number }>) {
    super({ ...options, env: withoutGithubTokens(options.env ?? {}), workingDirectory: FACTORY_WORKING_DIRECTORY })
    this.#timeoutMs = options.timeout
  }

  override setEnv(update: (environment: SandboxEnvironment) => SandboxEnvironment): void {
    super.setEnv((environment) => withoutGithubTokens(update(environment)))
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
  // E2B otherwise serves every listening port at a public URL, loopback-bound ones included.
  network: { allowPublicTraffic: false },
  env: {},
  metadata: { 'conexus-factory-session': context.sessionId },
  instructions: 'Remote Conexus Builder sandbox. No host fallback, remote credentials, or owner-state authority.',
})

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
  createPostgresPool({ ...database, user: 'hub_factory', password, options: `-c search_path=${FACTORY_SCHEMA}`, max: 20 })

// Spans hold prompts, tool I/O and source text (docs/reference/builder-c020-mastra-native.md §4.4;
// scratchpad/mastra-capabilities-study.md §4.2). Bounding their age is the only retention this PR
// adds. Builder evidence lives in mastra_messages/mastra_threads, so memory is never a retention key
// here, and Code SDK's own 90-day DEFAULT_RETENTION preset (which prunes memory) is never wired in.
const OBSERVABILITY_SPAN_RETENTION: RetentionConfig = { observability: { spans: { maxAge: '30d' } } }

// PgFactoryStorage creates its tables under unqualified names, so the pool's search_path decides
// where they land. It is pinned to factory on every connection rather than trusted to the role.
export const createFactoryStorage = (pool: PostgresPool): PgFactoryStorage =>
  new PgFactoryStorage({ store: new PostgresStore({ id: 'conexus-factory', pool, schemaName: FACTORY_SCHEMA, retention: OBSERVABILITY_SPAN_RETENTION }) })

// Code SDK forces the observability domain of the storage it hands Mastra to `false`
// (mastra-capabilities-study.md §4.1), so the exporter finds no store and silently drops every
// span. This reads the Factory's own store, before Code SDK disables it, and refuses to compose
// rather than boot with tracing silently broken again after a Mastra upgrade (study §7 trap 1).
/** @public Tests import this at runtime from the built module. */
export const requireObservabilityStore = async (
  storage: Pick<MastraCompositeStore, 'getStore'>,
): Promise<NonNullable<StorageDomains['observability']>> => {
  const observabilityStore = await storage.getStore('observability')
  if (!observabilityStore) throw new Error('FACTORY_OBSERVABILITY_STORE_UNAVAILABLE')
  return observabilityStore
}

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

const ENVELOPE_PREFIX = 'mastra:factory-secret:v1:'

// The Factory encrypts model credentials, custom-provider keys and integration secrets with this
// key. Rows written before it existed hold the plaintext encryptor's JSON text, which the Factory's
// decryptor returns as a string and its startup migration would re-encrypt as one; they are parsed
// here, so that migration encrypts the credential itself.
export const createFactorySecretKeyEncryption = (hexKey: string, previousHexKeys: readonly string[] = []): FactorySecretEncryption => {
  const encryption = factorySecretEncryption(hexKey, previousHexKeys)
  return {
    encrypt: (value) => encryption.encrypt(value),
    decrypt: async (value) => typeof value === 'string' && !value.startsWith(ENVELOPE_PREFIX)
      ? { value: JSON.parse(value), needsReencryption: true }
      : encryption.decrypt(value),
  }
}

/**
 * Fills the installation's custom-provider snapshot. The gateway reads it synchronously, and it
 * starts empty and hydrates in the background, so a model call right after boot would not know the
 * provider. The primer is the Factory's own awaited hydration of the organization's rows; it reads
 * nothing from the request.
 */
export const customProvidersPrimer = (storage: CustomProvidersStorage, orgId: string): () => Promise<void> => {
  const installation: RouteAuth = {
    enabled: () => true,
    ensureUser: async () => undefined,
    tenant: () => ({ orgId, userId: FACTORY_OPERATOR_ID }),
    isOrganizationAdmin: async () => false,
  }
  const primer = createCustomProvidersPrimer({ auth: installation, storage, authEnabled: true })
  return async () => { await primer(undefined as never, async () => undefined) }
}

// Google AI Pro is one installation-wide custom provider with no key of its own: each person's
// credential is the bearer the router receives. Without a router the row is removed, so the picker
// never offers a provider nobody can reach.
/** @public Tests import this at runtime from the built module. */
export const syncGoogleAiProProvider = async (storage: CustomProvidersStorage, orgId: string, routerUrl: string | undefined): Promise<void> => {
  await storage.ensureReady()
  if (routerUrl) {
    await storage.upsert({
      orgId,
      userId: FACTORY_OPERATOR_ID,
      input: { providerId: GOOGLE_AI_PRO_PROVIDER, name: GOOGLE_AI_PRO_NAME, url: `${routerUrl}/v1`, models: [...GOOGLE_AI_PRO_MODELS] },
    })
  } else {
    await storage.delete({ orgId, providerId: GOOGLE_AI_PRO_PROVIDER })
  }
  invalidateCustomProvidersSnapshots({ orgId })
  await customProvidersPrimer(storage, orgId)()
}

// Every Factory reader of a repository credential goes through getRepositoryAccess: the clone and
// checkout command lines, the checkout's remote URL, GH_TOKEN and its refresh. The Hub makes its own
// GitHub calls with its own App client, so the Factory gets the real clone URL with the credential
// that opens nothing, and mintInstallationToken keeps answering a real token. The Factory has no
// named hook for this (https://github.com/mastra-ai/mastra/issues/24690); a subclass overriding one
// member is the integration's documented extension point.
class ConexusGithubIntegration extends GithubIntegration {
  // Runs after the parent's constructor, so it reads the parent's own versionControl.
  override readonly versionControl: VersionControl = ConexusGithubIntegration.#withPlaceholder(this)

  static #withPlaceholder(integration: GithubIntegration): VersionControl {
    return {
      ...integration.versionControl,
      getRepositoryAccess: async ({ orgId, repositoryId }) => {
        const repository = await integration.sourceControlStorage.repositories.get({ orgId, id: repositoryId })
        if (!repository) throw new Error('Version-control repository not found.')
        return { cloneUrl: `https://github.com/${repository.slug}.git`, authorization: { scheme: 'bearer', token: SANDBOX_CREDENTIAL } }
      },
    }
  }
}

export const composeFactory = async ({ pool, orgId, auth, github, stateSecret, secretKey, previousSecretKeys = [], publicUrl, sandbox, observability, googleAiProUrl, integrations = [] }: Readonly<{
  pool: PostgresPool
  orgId: string
  // The Hub session, the only sign-in (docs/reference/single-owner-map.md).
  auth: HubSessionAuthProvider
  github: FactoryGithubApp
  stateSecret: string
  secretKey: string
  previousSecretKeys?: readonly string[]
  publicUrl: string
  sandbox: (context: FactorySandboxContext) => E2BSandbox
  observability?: Observability
  googleAiProUrl?: string
  integrations?: readonly FactoryIntegration[]
}>): Promise<FactoryComposition> => {
  const storage = createFactoryStorage(pool)
  const integration = new ConexusGithubIntegration(github)
  const factory = new MastraFactory({
    storage,
    auth,
    integrations: [integration, ...integrations],
    sandbox,
    stateSecret,
    secretEncryption: createFactorySecretKeyEncryption(secretKey, previousSecretKeys),
    includeDefaultBoards: false,
    publicUrl,
  })
  // The Hub has no boards and opens no pull requests. The workers prepare() returns sweep GitHub on
  // a timer with installation tokens for state the Hub never creates, so they are not started.
  const { workers: _workers, ...args } = await factory.prepare()
  // Code SDK wraps args.storage in its own composite and forces its observability domain to
  // `false` (mastra-capabilities-study.md §4.1), so every span the run produces is silently
  // dropped. Route the domain back to the Factory's own Postgres store, which is what actually
  // persists to factory.mastra_ai_spans.
  const observabilityStore = await requireObservabilityStore(storage.getMastraStorage())
  const mastra = new Mastra({
    ...args,
    storage: new MastraCompositeStore({ id: 'conexus-factory-mastra', default: args.storage as MastraCompositeStore, domains: { observability: observabilityStore } }),
    ...(observability ? { observability } : {}),
    // `logger: false` hid storage/exporter/scorer warnings, including the one the broken
    // composition above used to log ("Traces will not be persisted"). A regression is now visible.
    logger: new ConsoleLogger({ name: 'conexus-builder-factory', level: 'warn' }),
  })
  await factory.finalize()
  await syncGoogleAiProProvider(storage.getDomain<CustomProvidersStorage>('custom-providers'), orgId, googleAiProUrl)
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
