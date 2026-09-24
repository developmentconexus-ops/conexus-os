export type ProjectRuntimeConfig = Readonly<{
  commandPasswordFile: string
  readPasswordFile: string
}>

export type HubConfig = Readonly<{
  origin: string
  port: number
  preview: Readonly<{ port: number; certFile: string; keyFile: string }> | undefined
  // Each Project's application is served at applicationOrigin(application, slug), with the Preview's
  // certificate. Its own listener keeps it apart from the Preview's frame and CORS policy.
  application: ApplicationAddress | undefined
  bootstrapSubject: string
  database: Readonly<{
    host: string
    port: number
    database: string
    user: string
    passwordFile: string
    workspace: Readonly<{
      commandPasswordFile: string
      readPasswordFile: string
    }> | undefined
  }>
  project: ProjectRuntimeConfig | undefined
  builder: Readonly<{
    ingressPasswordFile: string
    executorPasswordFile: string
    e2bApiKeyFile: string
    e2bTemplateId: string
  }> | undefined
  factory: FactoryRuntimeConfig | undefined
  googleAiPro: GoogleAiProRuntimeConfig | undefined
  // The application runner's socket; without it a Preview has no application API.
  appRunner: Readonly<{ socketPath: string }> | undefined
  oidc: Readonly<{ issuer: string; clientId: string; clientSecretFile: string; allowInsecureForTest: boolean }>
}>

/** Where applications are served: `<slug>.<domain>` on one port. */
export type ApplicationAddress = Readonly<{ port: number; domain: string }>

const SLUG = /^[a-z]([a-z0-9-]{0,38}[a-z0-9])?$/
const DOMAIN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/

// A browser leaves the default port out of both Host and Origin.
const authority = ({ port, domain }: ApplicationAddress, slug: string): string => port === 443 ? `${slug}.${domain}` : `${slug}.${domain}:${port}`

/** The one origin of an application: its sign-in return, its address in the Hub and its API's only admitted Origin. */
export const applicationOrigin = (address: ApplicationAddress, slug: string): string => `https://${authority(address, slug)}`

/** The Host header is the only application selector, and it must be exactly one application's authority. */
export const applicationSlugOfHost = (address: ApplicationAddress, host: string | undefined): string | null => {
  const suffix = authority(address, '')
  if (typeof host !== 'string' || !host.endsWith(suffix)) return null
  const slug = host.slice(0, -suffix.length)
  return SLUG.test(slug) && !slug.includes('--') ? slug : null
}

// The CLIProxyAPI binary the Hub runs per person for Google AI Pro, pinned by its sha256.
export type GoogleAiProRuntimeConfig = Readonly<{ binary: string; sha256: string }>

export type FactoryRuntimeConfig = Readonly<{
  orgId: string
  githubAppId: string
  githubClientId: string
  githubAppSlug: string
  githubPrivateKeyFile: string
  githubClientSecretFile: string
  stateSecretFile: string
  // 64 hex characters: the AES-256 key the Factory encrypts stored credentials with.
  secretKeyFile: string
  // The keys it replaced, decrypt-only, until every value sealed under them has been rewritten.
  previousSecretKeyFiles: readonly string[]
  databasePasswordFile: string
}>

/** CONEXUS_FACTORY_PREVIOUS_SECRET_KEY_FILES: absolute paths separated by commas, or nothing. */
export const previousSecretKeyFiles = (environment: NodeJS.ProcessEnv): readonly string[] => {
  const files = (environment.CONEXUS_FACTORY_PREVIOUS_SECRET_KEY_FILES ?? '').split(',').filter(Boolean)
  if (files.some((file) => !file.startsWith('/'))) throw new Error('INVALID_CONFIG_CONEXUS_FACTORY_PREVIOUS_SECRET_KEY_FILES')
  return files
}

const required = (environment: NodeJS.ProcessEnv, name: string): string => {
  const value = environment[name]
  if (!value) throw new Error(`MISSING_CONFIG_${name}`)
  return value
}

const port = (value: string, name: string): number => {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) throw new Error(`INVALID_CONFIG_${name}`)
  return parsed
}

const workspaceDatabase = (environment: NodeJS.ProcessEnv): HubConfig['database']['workspace'] => {
  const commandPasswordFile = environment.CONEXUS_DB_WORKSPACE_COMMAND_PASSWORD_FILE
  const readPasswordFile = environment.CONEXUS_DB_WORKSPACE_READ_PASSWORD_FILE
  if (commandPasswordFile && readPasswordFile) return { commandPasswordFile, readPasswordFile }
  if (commandPasswordFile || readPasswordFile || environment.NODE_ENV !== 'test') {
    if (!commandPasswordFile) throw new Error('MISSING_CONFIG_CONEXUS_DB_WORKSPACE_COMMAND_PASSWORD_FILE')
    throw new Error('MISSING_CONFIG_CONEXUS_DB_WORKSPACE_READ_PASSWORD_FILE')
  }
  return undefined
}

// Project Inception, Baseline, Brain, Project Brain context, connection
// bindings and the Sankhya gateway left the product. A deployment still
// carrying their database credentials is configured for a capability the Hub
// no longer serves, so it is refused rather than silently ignored.
const RETIRED_PLANNING_VARIABLES = [
  'CONEXUS_DB_S4_BASELINE_READ_PASSWORD_FILE',
  'CONEXUS_DB_S4_BASELINE_COMMAND_PASSWORD_FILE',
  'CONEXUS_DB_S6_INCEPTION_COMMAND_PASSWORD_FILE',
] as const

const RETIRED_BRAIN_CONNECTIONS_VARIABLES = [
  'CONEXUS_DB_R2_BRAIN_READ_PASSWORD_FILE',
  'CONEXUS_DB_R2_PROJECT_BINDING_PASSWORD_FILE',
  'CONEXUS_DB_R2_BRAIN_ATTESTER_PASSWORD_FILE',
  'CONEXUS_DB_R2_KEY_CONFORMANCE_SUBJECT_PASSWORD_FILE',
  'CONEXUS_R2_KEY_CONFORMANCE_REGISTRATION_CATALOG_FILE',
] as const

// The deployment model admission catalog decided which models the Builder offered and which
// providers a key could be filed under. Both are now the account's own connected credentials
// against Mastra's provider registry, so an operator still carrying these files believes they are
// choosing models for their deployment and are not. Refused rather than ignored.
const RETIRED_MODEL_CATALOG_VARIABLES = [
  'CONEXUS_PROJECT_MODEL_CATALOG_FILE',
  'CONEXUS_BUILDER_MODEL_ADMISSION_ID',
] as const

// Model authentication, credentials and selection moved to Mastra (C-022), and the Hub's own
// model-connection store and its database role went with them. A deployment still carrying these
// is configured for a store the Hub no longer has, so it is refused rather than ignored.
const RETIRED_MODEL_CONNECTION_VARIABLES = [
  'CONEXUS_DB_MODEL_CONNECTION_PASSWORD_FILE',
  'CONEXUS_DB_R2_CONNECTIONS_PASSWORD_FILE',
  'CONEXUS_CONNECTION_CREDENTIAL_ROOT',
  'CONEXUS_CONNECTION_CREDENTIAL_KEY_FILE',
  'CONEXUS_CONNECTION_CREDENTIAL_KEY_GENERATION',
] as const

// The database roles are named for what they may do, not for the program phase that introduced
// them. An operator whose environment still carries the old variable names would otherwise get a
// 28P01 from the cluster, several layers away from the file that needs editing, so each retired
// name is refused here and the error says which one replaced it.
const RENAMED_ROLE_VARIABLES = {
  CONEXUS_DB_WS01_COMMAND_PASSWORD_FILE: 'CONEXUS_DB_WORKSPACE_COMMAND_PASSWORD_FILE',
  CONEXUS_DB_S2_READ_PASSWORD_FILE: 'CONEXUS_DB_WORKSPACE_READ_PASSWORD_FILE',
  CONEXUS_DB_S3_READ_PASSWORD_FILE: 'CONEXUS_DB_PROJECT_READ_PASSWORD_FILE',
  CONEXUS_DB_PRJ03_COMMAND_PASSWORD_FILE: 'CONEXUS_DB_PROJECT_COMMAND_PASSWORD_FILE',
  CONEXUS_DB_RB_INGRESS_PASSWORD_FILE: 'CONEXUS_DB_BUILDER_INGRESS_PASSWORD_FILE',
  CONEXUS_DB_RB_EXECUTOR_PASSWORD_FILE: 'CONEXUS_DB_BUILDER_EXECUTOR_PASSWORD_FILE',
} as const

const projectRuntime = (environment: NodeJS.ProcessEnv): HubConfig['project'] => {
  for (const name of RETIRED_PLANNING_VARIABLES) {
    if (environment[name]) throw new Error(`RETIRED_CONFIG_${name}`)
  }
  const ordinaryValues = {
    commandPasswordFile: environment.CONEXUS_DB_PROJECT_COMMAND_PASSWORD_FILE,
    readPasswordFile: environment.CONEXUS_DB_PROJECT_READ_PASSWORD_FILE,
  }
  const hasOrdinaryValues = Object.values(ordinaryValues).some(Boolean)
  const ordinaryComplete = Object.values(ordinaryValues).every(Boolean)

  if (hasOrdinaryValues && !ordinaryComplete) {
    for (const [name, value] of Object.entries({
      CONEXUS_DB_PROJECT_COMMAND_PASSWORD_FILE: ordinaryValues.commandPasswordFile,
      CONEXUS_DB_PROJECT_READ_PASSWORD_FILE: ordinaryValues.readPasswordFile,
    })) if (!value) throw new Error(`MISSING_CONFIG_${name}`)
  }
  if (!ordinaryComplete) return undefined
  const ordinary: ProjectRuntimeConfig = {
    commandPasswordFile: required(environment, 'CONEXUS_DB_PROJECT_COMMAND_PASSWORD_FILE'),
    readPasswordFile: required(environment, 'CONEXUS_DB_PROJECT_READ_PASSWORD_FILE'),
  }
  return ordinary
}

const builderRuntime = (environment: NodeJS.ProcessEnv): HubConfig['builder'] => {
  const values = {
    ingressPasswordFile: environment.CONEXUS_DB_BUILDER_INGRESS_PASSWORD_FILE,
    executorPasswordFile: environment.CONEXUS_DB_BUILDER_EXECUTOR_PASSWORD_FILE,
    e2bApiKeyFile: environment.CONEXUS_BUILDER_E2B_API_KEY_FILE,
    e2bTemplateId: environment.CONEXUS_BUILDER_E2B_TEMPLATE_ID,
  }
  if (Object.values(values).every(Boolean)) return {
    ingressPasswordFile: required(environment, 'CONEXUS_DB_BUILDER_INGRESS_PASSWORD_FILE'),
    executorPasswordFile: required(environment, 'CONEXUS_DB_BUILDER_EXECUTOR_PASSWORD_FILE'),
    e2bApiKeyFile: required(environment, 'CONEXUS_BUILDER_E2B_API_KEY_FILE'),
    e2bTemplateId: required(environment, 'CONEXUS_BUILDER_E2B_TEMPLATE_ID'),
  }
  if (Object.values(values).some(Boolean)) {
    for (const [name, value] of Object.entries({
      CONEXUS_DB_BUILDER_INGRESS_PASSWORD_FILE: values.ingressPasswordFile,
      CONEXUS_DB_BUILDER_EXECUTOR_PASSWORD_FILE: values.executorPasswordFile,
      CONEXUS_BUILDER_E2B_API_KEY_FILE: values.e2bApiKeyFile,
      CONEXUS_BUILDER_E2B_TEMPLATE_ID: values.e2bTemplateId,
    })) if (!value) throw new Error(`MISSING_CONFIG_${name}`)
  }
  return undefined
}

const FACTORY_VARIABLES = {
  orgId: 'CONEXUS_FACTORY_ORG_ID',
  githubAppId: 'CONEXUS_FACTORY_GITHUB_APP_ID',
  githubClientId: 'CONEXUS_FACTORY_GITHUB_CLIENT_ID',
  githubAppSlug: 'CONEXUS_FACTORY_GITHUB_APP_SLUG',
  githubPrivateKeyFile: 'CONEXUS_FACTORY_GITHUB_PRIVATE_KEY_FILE',
  githubClientSecretFile: 'CONEXUS_FACTORY_GITHUB_CLIENT_SECRET_FILE',
  stateSecretFile: 'CONEXUS_FACTORY_STATE_SECRET_FILE',
  secretKeyFile: 'CONEXUS_FACTORY_SECRET_KEY_FILE',
  databasePasswordFile: 'CONEXUS_DB_FACTORY_PASSWORD_FILE',
} as const satisfies Record<Exclude<keyof FactoryRuntimeConfig, 'previousSecretKeyFiles'>, string>

// The Mastra Factory adds Mastra Platform integrations on its own whenever it sees Platform
// credentials in the process, so a Hub composing it must not carry any.
const factoryRuntime = (environment: NodeJS.ProcessEnv): HubConfig['factory'] => {
  const present = Object.values(FACTORY_VARIABLES).filter((name) => environment[name])
  if (present.length === 0) return undefined
  for (const name of Object.values(FACTORY_VARIABLES)) if (!environment[name]) throw new Error(`MISSING_CONFIG_${name}`)
  for (const name of Object.keys(environment)) {
    if (name.startsWith('MASTRA_PLATFORM_') && environment[name]) throw new Error(`FACTORY_REFUSES_CONFIG_${name}`)
  }
  const variables = Object.fromEntries(Object.entries(FACTORY_VARIABLES).map(([key, name]) => [key, required(environment, name)])) as Record<keyof typeof FACTORY_VARIABLES, string>
  return { ...variables, previousSecretKeyFiles: previousSecretKeyFiles(environment) }
}

const googleAiProRuntime = (environment: NodeJS.ProcessEnv): HubConfig['googleAiPro'] => {
  const binary = environment.CONEXUS_CLIPROXY_BIN
  const sha256 = environment.CONEXUS_CLIPROXY_SHA256
  if (!binary && !sha256) return undefined
  if (!binary) throw new Error('MISSING_CONFIG_CONEXUS_CLIPROXY_BIN')
  if (!sha256) throw new Error('MISSING_CONFIG_CONEXUS_CLIPROXY_SHA256')
  if (!binary.startsWith('/')) throw new Error('INVALID_CONFIG_CONEXUS_CLIPROXY_BIN')
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error('INVALID_CONFIG_CONEXUS_CLIPROXY_SHA256')
  return { binary, sha256 }
}

const appRunnerRuntime = (environment: NodeJS.ProcessEnv): HubConfig['appRunner'] => {
  const socketPath = environment.CONEXUS_APP_RUNNER_SOCKET
  if (!socketPath) return undefined
  if (!socketPath.startsWith('/')) throw new Error('INVALID_CONFIG_CONEXUS_APP_RUNNER_SOCKET')
  return { socketPath }
}

const previewRuntime = (environment: NodeJS.ProcessEnv, hubOrigin: string, hubPort: number): HubConfig['preview'] => {
  const portValue = environment.CONEXUS_PREVIEW_PORT
  const certFile = environment.CONEXUS_PREVIEW_CERT_FILE
  const keyFile = environment.CONEXUS_PREVIEW_KEY_FILE
  if (!portValue && !certFile && !keyFile) return undefined
  if (!portValue) throw new Error('MISSING_CONFIG_CONEXUS_PREVIEW_PORT')
  if (!certFile) throw new Error('MISSING_CONFIG_CONEXUS_PREVIEW_CERT_FILE')
  if (!keyFile) throw new Error('MISSING_CONFIG_CONEXUS_PREVIEW_KEY_FILE')
  const previewPort = port(portValue, 'CONEXUS_PREVIEW_PORT')
  if (previewPort === hubPort) throw new Error('INVALID_CONFIG_CONEXUS_PREVIEW_PORT')
  let origin: URL
  try { origin = new URL(hubOrigin) } catch { throw new Error('INVALID_CONFIG_CONEXUS_ORIGIN_FOR_PREVIEW') }
  if (origin.protocol !== 'https:' || origin.hostname !== 'hub.conexus.localhost' ||
    origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash ||
    origin.port !== String(hubPort)) throw new Error('INVALID_CONFIG_CONEXUS_ORIGIN_FOR_PREVIEW')
  return { port: previewPort, certFile, keyFile }
}

const applicationRuntime = (environment: NodeJS.ProcessEnv, hubPort: number, preview: HubConfig['preview']): HubConfig['application'] => {
  const portValue = environment.CONEXUS_APPLICATION_PORT
  const domain = environment.CONEXUS_APPLICATION_DOMAIN
  if (!portValue && !domain) return undefined
  if (!portValue) throw new Error('MISSING_CONFIG_CONEXUS_APPLICATION_PORT')
  if (!domain) throw new Error('MISSING_CONFIG_CONEXUS_APPLICATION_DOMAIN')
  if (!DOMAIN.test(domain)) throw new Error('INVALID_CONFIG_CONEXUS_APPLICATION_DOMAIN')
  if (!preview) throw new Error('APPLICATION_PREVIEW_RUNTIME_REQUIRED')
  const applicationPort = port(portValue, 'CONEXUS_APPLICATION_PORT')
  if (applicationPort === hubPort || applicationPort === preview.port) throw new Error('INVALID_CONFIG_CONEXUS_APPLICATION_PORT')
  return { port: applicationPort, domain }
}

export const readHubConfig = (environment: NodeJS.ProcessEnv = process.env): HubConfig => {
  for (const name of [
    ...RETIRED_BRAIN_CONNECTIONS_VARIABLES,
    ...RETIRED_MODEL_CATALOG_VARIABLES,
    ...RETIRED_MODEL_CONNECTION_VARIABLES,
  ]) {
    if (environment[name]) throw new Error(`RETIRED_CONFIG_${name}`)
  }
  for (const [name, replacement] of Object.entries(RENAMED_ROLE_VARIABLES)) {
    if (environment[name]) throw new Error(`RETIRED_CONFIG_${name}_USE_${replacement}`)
  }
  const hubOrigin = required(environment, 'CONEXUS_ORIGIN')
  const hubPort = port(environment.CONEXUS_PORT ?? '3000', 'CONEXUS_PORT')
  const preview = previewRuntime(environment, hubOrigin, hubPort)
  const config: HubConfig = {
    origin: hubOrigin,
    port: hubPort,
    preview,
    application: applicationRuntime(environment, hubPort, preview),
    bootstrapSubject: required(environment, 'CONEXUS_BOOTSTRAP_SUBJECT'),
    database: {
      host: required(environment, 'CONEXUS_DB_HOST'),
      port: port(required(environment, 'CONEXUS_DB_PORT'), 'CONEXUS_DB_PORT'),
      database: required(environment, 'CONEXUS_DB_NAME'),
      user: required(environment, 'CONEXUS_DB_USER'),
      passwordFile: required(environment, 'CONEXUS_DB_PASSWORD_FILE'),
      workspace: workspaceDatabase(environment),
    },
    project: projectRuntime(environment),
    builder: builderRuntime(environment),
    factory: factoryRuntime(environment),
    googleAiPro: googleAiProRuntime(environment),
    appRunner: appRunnerRuntime(environment),
    oidc: {
      issuer: required(environment, 'CONEXUS_OIDC_ISSUER'),
      clientId: required(environment, 'CONEXUS_OIDC_CLIENT_ID'),
      clientSecretFile: required(environment, 'CONEXUS_OIDC_CLIENT_SECRET_FILE'),
      allowInsecureForTest: environment.NODE_ENV === 'test' && environment.CONEXUS_TEST_ALLOW_INSECURE_OIDC === 'true',
    },
  }
  if (config.builder && !config.project) throw new Error('BUILDER_PROJECT_RUNTIME_REQUIRED')
  if (config.factory && !config.builder) throw new Error('FACTORY_BUILDER_RUNTIME_REQUIRED')
  if (config.googleAiPro && !config.factory) throw new Error('GOOGLE_AI_PRO_FACTORY_RUNTIME_REQUIRED')
  // The application host reads what it serves as the Builder executor; without it the listener never starts.
  if (config.application && !config.builder) throw new Error('APPLICATION_BUILDER_RUNTIME_REQUIRED')
  // A Builder runs every Project through the Factory; there is no second agent runtime to fall back to.
  if (config.builder && !config.factory) throw new Error('BUILDER_FACTORY_RUNTIME_REQUIRED')
  return config
}
