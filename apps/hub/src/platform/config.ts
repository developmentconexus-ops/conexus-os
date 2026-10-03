import { parseApplicationSlug } from './application-slug.js'

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
    modelAccountPasswordFile: string
    e2bApiKeyFile: string
    e2bTemplateId: string
    /** CONEXUS_GIT_ROOT: the Conexus Git on the Hub's own disk, one bare repository per Project. */
    gitRoot: string
    /**
     * CONEXUS_BUILDER_STREAM_RECORD_DIR: a diagnostic, off when unset. Every ChatGPT-account model
     * call's stream is recorded there as one JSONL file (`createModelStreamRecorder`).
     */
    modelStreamRecordDir: string | undefined
    /** CONEXUS_BUILDER_CONTEXT7_API_KEY_FILE: the installation's Context7 key, optional; the Builder reads Context7 anonymously when unset. */
    context7ApiKeyFile: string | undefined
  }> | undefined
  /**
   * The installation's AES-256 credential key and the keys a rotation retired (decrypt-only). It seals every
   * Hub and application session's Keycloak refresh token, and every model account's credential.
   */
  secretKey: InstallationSecretKey
  factory: FactoryRuntimeConfig | undefined
  googleAiPro: GoogleAiProRuntimeConfig | undefined
  // The application runner's socket; without it a Preview has no application API.
  appRunner: Readonly<{ socketPath: string }> | undefined
  // The Connector broker's pinned gateway destination and the directory of its per-invocation
  // handler sockets. Each absent leaves every connector call answering CONNECTOR_UNCONFIGURED.
  connectors: Readonly<{ gatewayOrigin: string | undefined; socketDirectory: string | undefined }>
  oidc: Readonly<{ issuer: string; clientId: string; clientSecretFile: string }>
}>

/** Where applications are served: `<slug>.<domain>` on one port. */
export type ApplicationAddress = Readonly<{ port: number; domain: string }>

const DOMAIN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/

// A browser leaves the default port out of both Host and Origin.
const authority = ({ port, domain }: ApplicationAddress, slug: string): string => port === 443 ? `${slug}.${domain}` : `${slug}.${domain}:${port}`

/** The one origin of an application: its sign-in return, its address in the Hub and its API's only admitted Origin. */
export const applicationOrigin = (address: ApplicationAddress, slug: string): string => `https://${authority(address, slug)}`

/** The Host header is the only application selector, and it must be exactly one application's authority. */
export const applicationSlugOfHost = (address: ApplicationAddress, host: string | undefined): string | null => {
  const suffix = authority(address, '')
  if (typeof host !== 'string' || !host.endsWith(suffix)) return null
  return parseApplicationSlug(host.slice(0, -suffix.length))
}

// The CLIProxyAPI binary the Hub runs per person for Google AI Pro, pinned by its sha256.
export type GoogleAiProRuntimeConfig = Readonly<{ binary: string; sha256: string }>

// CONEXUS_FACTORY_SECRET_KEY_FILE holds 64 hex characters; CONEXUS_FACTORY_PREVIOUS_SECRET_KEY_FILES names
// the keys it replaced, until every value sealed under them has been rewritten.
export type InstallationSecretKey = Readonly<{ file: string; previousFiles: readonly string[] }>

// The database role the Builder's Mastra storage connects as; slice 7 renames it with its schema.
export type FactoryRuntimeConfig = Readonly<{
  databasePasswordFile: string
}>

/** CONEXUS_FACTORY_PREVIOUS_SECRET_KEY_FILES: absolute paths separated by commas, or nothing. */
const previousSecretKeyFiles = (environment: NodeJS.ProcessEnv): readonly string[] => {
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

const projectRuntime = (environment: NodeJS.ProcessEnv): HubConfig['project'] => {
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

const DEFAULT_GIT_ROOT = '/var/lib/conexus/git'

const gitRoot = (environment: NodeJS.ProcessEnv): string => {
  const value = environment.CONEXUS_GIT_ROOT ?? DEFAULT_GIT_ROOT
  if (!value.startsWith('/') || value.split('/').includes('..')) throw new Error('INVALID_CONFIG_CONEXUS_GIT_ROOT')
  return value.replace(/\/+$/, '') || '/'
}

const modelStreamRecordDir = (environment: NodeJS.ProcessEnv): string | undefined => {
  const value = environment.CONEXUS_BUILDER_STREAM_RECORD_DIR
  if (!value) return undefined
  if (!value.startsWith('/')) throw new Error('INVALID_CONFIG_CONEXUS_BUILDER_STREAM_RECORD_DIR')
  return value
}

const builderRuntime = (environment: NodeJS.ProcessEnv): HubConfig['builder'] => {
  const values = {
    ingressPasswordFile: environment.CONEXUS_DB_BUILDER_INGRESS_PASSWORD_FILE,
    executorPasswordFile: environment.CONEXUS_DB_BUILDER_EXECUTOR_PASSWORD_FILE,
    modelAccountPasswordFile: environment.CONEXUS_DB_MODEL_ACCOUNT_PASSWORD_FILE,
    e2bApiKeyFile: environment.CONEXUS_BUILDER_E2B_API_KEY_FILE,
    e2bTemplateId: environment.CONEXUS_BUILDER_E2B_TEMPLATE_ID,
  }
  if (Object.values(values).every(Boolean)) return {
    ingressPasswordFile: required(environment, 'CONEXUS_DB_BUILDER_INGRESS_PASSWORD_FILE'),
    executorPasswordFile: required(environment, 'CONEXUS_DB_BUILDER_EXECUTOR_PASSWORD_FILE'),
    modelAccountPasswordFile: required(environment, 'CONEXUS_DB_MODEL_ACCOUNT_PASSWORD_FILE'),
    e2bApiKeyFile: required(environment, 'CONEXUS_BUILDER_E2B_API_KEY_FILE'),
    e2bTemplateId: required(environment, 'CONEXUS_BUILDER_E2B_TEMPLATE_ID'),
    gitRoot: gitRoot(environment),
    modelStreamRecordDir: modelStreamRecordDir(environment),
    context7ApiKeyFile: environment.CONEXUS_BUILDER_CONTEXT7_API_KEY_FILE || undefined,
  }
  if (Object.values(values).some(Boolean)) {
    for (const [name, value] of Object.entries({
      CONEXUS_DB_BUILDER_INGRESS_PASSWORD_FILE: values.ingressPasswordFile,
      CONEXUS_DB_BUILDER_EXECUTOR_PASSWORD_FILE: values.executorPasswordFile,
      CONEXUS_DB_MODEL_ACCOUNT_PASSWORD_FILE: values.modelAccountPasswordFile,
      CONEXUS_BUILDER_E2B_API_KEY_FILE: values.e2bApiKeyFile,
      CONEXUS_BUILDER_E2B_TEMPLATE_ID: values.e2bTemplateId,
    })) if (!value) throw new Error(`MISSING_CONFIG_${name}`)
  }
  return undefined
}

const factoryRuntime = (environment: NodeJS.ProcessEnv): HubConfig['factory'] =>
  environment.CONEXUS_DB_FACTORY_PASSWORD_FILE ? { databasePasswordFile: required(environment, 'CONEXUS_DB_FACTORY_PASSWORD_FILE') } : undefined

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

const connectorRuntime = (environment: NodeJS.ProcessEnv): HubConfig['connectors'] => {
  const gatewayOrigin = environment.CONEXUS_SANKHYA_GATEWAY_ORIGIN
  const socketDirectory = environment.CONEXUS_CONNECTOR_SOCKET_DIR
  if (socketDirectory !== undefined && !/^\/[^\0]*$/.test(socketDirectory)) throw new Error('INVALID_CONFIG_CONEXUS_CONNECTOR_SOCKET_DIR')
  // The exact published origins live with the adapter (connectors/sankhya/gateway.ts), which refuses
  // any other value when the Hub composes it at startup; here only the shape is checked.
  if (gatewayOrigin !== undefined && !/^https:\/\/[a-z0-9.-]+$/.test(gatewayOrigin)) throw new Error('INVALID_CONFIG_CONEXUS_SANKHYA_GATEWAY_ORIGIN')
  return { gatewayOrigin, socketDirectory }
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
  const hubOrigin = required(environment, 'CONEXUS_ORIGIN')
  const hubPort = port(environment.CONEXUS_PORT ?? '3000', 'CONEXUS_PORT')
  const preview = previewRuntime(environment, hubOrigin, hubPort)
  const config: HubConfig = {
    origin: hubOrigin,
    port: hubPort,
    preview,
    application: applicationRuntime(environment, hubPort, preview),
    bootstrapSubject: required(environment, 'CONEXUS_BOOTSTRAP_SUBJECT'),
    secretKey: { file: required(environment, 'CONEXUS_FACTORY_SECRET_KEY_FILE'), previousFiles: previousSecretKeyFiles(environment) },
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
    connectors: connectorRuntime(environment),
    oidc: {
      issuer: required(environment, 'CONEXUS_OIDC_ISSUER'),
      clientId: required(environment, 'CONEXUS_OIDC_CLIENT_ID'),
      clientSecretFile: required(environment, 'CONEXUS_OIDC_CLIENT_SECRET_FILE'),
    },
  }
  if (config.builder && !config.project) throw new Error('BUILDER_PROJECT_RUNTIME_REQUIRED')
  if (config.factory && !config.builder) throw new Error('FACTORY_BUILDER_RUNTIME_REQUIRED')
  if (config.googleAiPro && !config.factory) throw new Error('GOOGLE_AI_PRO_FACTORY_RUNTIME_REQUIRED')
  // The application host reads what it serves as the Builder executor; without it the listener never starts.
  if (config.application && !config.builder) throw new Error('APPLICATION_BUILDER_RUNTIME_REQUIRED')
  // The Builder's threads, traces and memory live in the Mastra storage this role reaches.
  if (config.builder && !config.factory) throw new Error('BUILDER_FACTORY_RUNTIME_REQUIRED')
  // Every Connector call to a provider is recorded in the Builder's Mastra storage (C-029); without it
  // there is no native record, so no gateway either.
  if (config.connectors.gatewayOrigin && !config.factory) throw new Error('CONNECTOR_GATEWAY_FACTORY_RUNTIME_REQUIRED')
  return config
}
