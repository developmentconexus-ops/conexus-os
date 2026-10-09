import { homedir } from 'node:os'
import { join } from 'node:path'
import { Failure } from './failure.js'

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
    user: 'hub_runtime'
    passwordFile: string
  }>
  builder: Readonly<{
    e2bApiKeyFile: string
    e2bTemplateId: string
    /** CONEXUS_GIT_ROOT: the Conexus Git on the Hub's own disk, one bare repository per Project. */
    gitRoot: string
    /** CONEXUS_BUILDER_QUESTION_WAIT_MS: how long a Builder question waits for the person before its run ends. */
    questionWaitMs: number
    /** CONEXUS_BUILDER_MODEL_RETRY_DELAY_MS: one fixed wait between a failed model call and its retry. Unset, the delay grows from 0.5 s to 30 s, as Mastra Code's does. */
    modelRetryDelayMs: number | undefined
    /** CONEXUS_BUILDER_SANDBOX_IDLE_MS: how long a conversation's VM stays on once the Builder stops, before E2B pauses it. */
    sandboxIdleMs: number
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

export const authority = ({ port, domain }: ApplicationAddress, slug: string): string => port === 443 ? `${slug}.${domain}` : `${slug}.${domain}:${port}`

/** The one origin of an application: its sign-in return, its address in the Hub and its API's only admitted Origin. */
export const applicationOrigin = (address: ApplicationAddress, slug: string): string => `https://${authority(address, slug)}`

// The CLIProxyAPI binary the Hub runs per person for Google AI Pro, pinned by its sha256.
export type GoogleAiProRuntimeConfig = Readonly<{ binary: string; sha256: string }>

// CONEXUS_SECRET_KEY_FILE holds 64 hex characters; CONEXUS_PREVIOUS_SECRET_KEY_FILES names
// the keys it replaced, until every value sealed under them has been rewritten.
type InstallationSecretKey = Readonly<{ file: string; previousFiles: readonly string[] }>

// The database role the Builder's Mastra storage connects as; slice 7 renames it with its schema.
export type FactoryRuntimeConfig = Readonly<{
  databasePasswordFile: string
}>

/** CONEXUS_PREVIOUS_SECRET_KEY_FILES: absolute paths separated by commas, or nothing. */
const previousSecretKeyFiles = (environment: NodeJS.ProcessEnv): readonly string[] => {
  const files = (environment.CONEXUS_PREVIOUS_SECRET_KEY_FILES ?? '').split(',').filter(Boolean)
  if (files.some((file) => !file.startsWith('/'))) throw configInvalid('CONEXUS_PREVIOUS_SECRET_KEY_FILES')
  return files
}

/** The one operator row for a setting the Hub cannot start without; the setting's name is in the details. */
const configInvalid = (name: string): Failure => new Failure('CONFIG_INVALID', { details: { name } })
const configMissing = (name: string): Failure => new Failure('CONFIG_MISSING', { details: { name } })

const required = (environment: NodeJS.ProcessEnv, name: string): string => {
  const value = environment[name]
  if (!value) throw configMissing(name)
  return value
}

const runtimeUser = (environment: NodeJS.ProcessEnv): 'hub_runtime' => {
  if (required(environment, 'CONEXUS_DB_USER') !== 'hub_runtime') throw configInvalid('CONEXUS_DB_USER')
  return 'hub_runtime'
}

const DEFAULT_QUESTION_WAIT_MS = 30 * 60_000
const DEFAULT_SANDBOX_IDLE_MS = 5 * 60_000

const durationMs = (environment: NodeJS.ProcessEnv, name: string, fallback: number): number => {
  const value = environment[name]
  if (value === undefined || value === '') return fallback
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw configInvalid(name)
  return parsed
}

const port = (value: string, name: string): number => {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) throw configInvalid(name)
  return parsed
}

const DEFAULT_GIT_ROOT = '/var/lib/conexus/git'

const gitRoot = (environment: NodeJS.ProcessEnv): string => {
  const value = environment.CONEXUS_GIT_ROOT ?? DEFAULT_GIT_ROOT
  if (!value.startsWith('/') || value.split('/').includes('..')) throw configInvalid('CONEXUS_GIT_ROOT')
  return value.replace(/\/+$/, '') || '/'
}

const builderRuntime = (environment: NodeJS.ProcessEnv): HubConfig['builder'] => {
  const values = {
    e2bApiKeyFile: environment.CONEXUS_BUILDER_E2B_API_KEY_FILE,
    e2bTemplateId: environment.CONEXUS_BUILDER_E2B_TEMPLATE_ID,
  }
  if (Object.values(values).every(Boolean)) return {
    e2bApiKeyFile: required(environment, 'CONEXUS_BUILDER_E2B_API_KEY_FILE'),
    e2bTemplateId: required(environment, 'CONEXUS_BUILDER_E2B_TEMPLATE_ID'),
    gitRoot: gitRoot(environment),
    questionWaitMs: durationMs(environment, 'CONEXUS_BUILDER_QUESTION_WAIT_MS', DEFAULT_QUESTION_WAIT_MS),
    modelRetryDelayMs: environment.CONEXUS_BUILDER_MODEL_RETRY_DELAY_MS ? durationMs(environment, 'CONEXUS_BUILDER_MODEL_RETRY_DELAY_MS', 0) : undefined,
    sandboxIdleMs: durationMs(environment, 'CONEXUS_BUILDER_SANDBOX_IDLE_MS', DEFAULT_SANDBOX_IDLE_MS),
  }
  if (Object.values(values).some(Boolean)) {
    for (const [name, value] of Object.entries({
      CONEXUS_BUILDER_E2B_API_KEY_FILE: values.e2bApiKeyFile,
      CONEXUS_BUILDER_E2B_TEMPLATE_ID: values.e2bTemplateId,
    })) if (!value) throw configMissing(name)
  }
  return undefined
}

const factoryRuntime = (environment: NodeJS.ProcessEnv): HubConfig['factory'] =>
  environment.CONEXUS_DB_FACTORY_PASSWORD_FILE ? { databasePasswordFile: required(environment, 'CONEXUS_DB_FACTORY_PASSWORD_FILE') } : undefined

const googleAiProRuntime = (environment: NodeJS.ProcessEnv): HubConfig['googleAiPro'] => {
  const binary = environment.CONEXUS_CLIPROXY_BIN
  const sha256 = environment.CONEXUS_CLIPROXY_SHA256
  if (!binary && !sha256) return undefined
  if (!binary) throw configMissing('CONEXUS_CLIPROXY_BIN')
  if (!sha256) throw configMissing('CONEXUS_CLIPROXY_SHA256')
  if (!binary.startsWith('/')) throw configInvalid('CONEXUS_CLIPROXY_BIN')
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw configInvalid('CONEXUS_CLIPROXY_SHA256')
  return { binary, sha256 }
}

const appRunnerRuntime = (environment: NodeJS.ProcessEnv): HubConfig['appRunner'] => {
  const socketPath = environment.CONEXUS_APP_RUNNER_SOCKET
  if (!socketPath) return undefined
  if (!socketPath.startsWith('/')) throw configInvalid('CONEXUS_APP_RUNNER_SOCKET')
  return { socketPath }
}

const connectorRuntime = (environment: NodeJS.ProcessEnv): HubConfig['connectors'] => {
  const gatewayOrigin = environment.CONEXUS_SANKHYA_GATEWAY_ORIGIN
  const socketDirectory = environment.CONEXUS_CONNECTOR_SOCKET_DIR
  if (socketDirectory !== undefined && !/^\/[^\0]*$/.test(socketDirectory)) throw configInvalid('CONEXUS_CONNECTOR_SOCKET_DIR')
  // The exact published origins live with the adapter (connectors/sankhya/gateway.ts), which refuses
  // any other value when the Hub composes it at startup; here only the shape is checked.
  if (gatewayOrigin !== undefined && !/^https:\/\/[a-z0-9.-]+$/.test(gatewayOrigin)) throw configInvalid('CONEXUS_SANKHYA_GATEWAY_ORIGIN')
  return { gatewayOrigin, socketDirectory }
}

const previewRuntime = (environment: NodeJS.ProcessEnv, hubOrigin: string, hubPort: number): HubConfig['preview'] => {
  const portValue = environment.CONEXUS_PREVIEW_PORT
  const certFile = environment.CONEXUS_PREVIEW_CERT_FILE
  const keyFile = environment.CONEXUS_PREVIEW_KEY_FILE
  if (!portValue && !certFile && !keyFile) return undefined
  if (!portValue) throw configMissing('CONEXUS_PREVIEW_PORT')
  if (!certFile) throw configMissing('CONEXUS_PREVIEW_CERT_FILE')
  if (!keyFile) throw configMissing('CONEXUS_PREVIEW_KEY_FILE')
  const previewPort = port(portValue, 'CONEXUS_PREVIEW_PORT')
  if (previewPort === hubPort) throw configInvalid('CONEXUS_PREVIEW_PORT')
  let origin: URL
  try { origin = new URL(hubOrigin) } catch { throw configInvalid('CONEXUS_ORIGIN_FOR_PREVIEW') }
  if (origin.protocol !== 'https:' || origin.hostname !== 'hub.conexus.localhost' ||
    origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash ||
    origin.port !== String(hubPort)) throw configInvalid('CONEXUS_ORIGIN_FOR_PREVIEW')
  return { port: previewPort, certFile, keyFile }
}

const applicationRuntime = (environment: NodeJS.ProcessEnv, hubPort: number, preview: HubConfig['preview']): HubConfig['application'] => {
  const portValue = environment.CONEXUS_APPLICATION_PORT
  const domain = environment.CONEXUS_APPLICATION_DOMAIN
  if (!portValue && !domain) return undefined
  if (!portValue) throw configMissing('CONEXUS_APPLICATION_PORT')
  if (!domain) throw configMissing('CONEXUS_APPLICATION_DOMAIN')
  if (!DOMAIN.test(domain)) throw configInvalid('CONEXUS_APPLICATION_DOMAIN')
  if (!preview) throw configInvalid('APPLICATION_PREVIEW_RUNTIME_REQUIRED')
  const applicationPort = port(portValue, 'CONEXUS_APPLICATION_PORT')
  if (applicationPort === hubPort || applicationPort === preview.port) throw configInvalid('CONEXUS_APPLICATION_PORT')
  return { port: applicationPort, domain }
}

export const readHubConfig = (environment: NodeJS.ProcessEnv = process.env): HubConfig => {
  const hubOrigin = required(environment, 'CONEXUS_ORIGIN')
  const hubPort = port(required(environment, 'CONEXUS_PORT'), 'CONEXUS_PORT')
  const preview = previewRuntime(environment, hubOrigin, hubPort)
  const config: HubConfig = {
    origin: hubOrigin,
    port: hubPort,
    preview,
    application: applicationRuntime(environment, hubPort, preview),
    bootstrapSubject: required(environment, 'CONEXUS_BOOTSTRAP_SUBJECT'),
    secretKey: { file: required(environment, 'CONEXUS_SECRET_KEY_FILE'), previousFiles: previousSecretKeyFiles(environment) },
    database: {
      host: required(environment, 'CONEXUS_DB_HOST'),
      port: port(required(environment, 'CONEXUS_DB_PORT'), 'CONEXUS_DB_PORT'),
      database: required(environment, 'CONEXUS_DB_NAME'),
      user: runtimeUser(environment),
      passwordFile: required(environment, 'CONEXUS_DB_PASSWORD_FILE'),
    },
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
  if (config.factory && !config.builder) throw configInvalid('FACTORY_BUILDER_RUNTIME_REQUIRED')
  if (config.googleAiPro && !config.factory) throw configInvalid('GOOGLE_AI_PRO_FACTORY_RUNTIME_REQUIRED')
  if (config.application && !config.builder) throw configInvalid('APPLICATION_BUILDER_RUNTIME_REQUIRED')
  // The Builder's threads, traces and memory live in the Mastra storage this role reaches.
  if (config.builder && !config.factory) throw configInvalid('BUILDER_FACTORY_RUNTIME_REQUIRED')
  // Every Connector call to a provider is recorded in the Builder's Mastra storage (C-029); without it
  // there is no native record, so no gateway either.
  if (config.connectors.gatewayOrigin && !config.factory) throw configInvalid('CONNECTOR_GATEWAY_FACTORY_RUNTIME_REQUIRED')
  return config
}

export function readCliproxyEnvironment(environment: NodeJS.ProcessEnv = process.env): Readonly<{ stateDir: string; path: string }> {
  return { stateDir: join(environment.XDG_STATE_HOME ?? join(homedir(), '.local', 'state'), 'conexus', 'cliproxy'), path: environment.PATH ?? '/usr/bin:/bin' }
}
