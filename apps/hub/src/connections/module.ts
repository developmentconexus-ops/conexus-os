import type { FastifyInstance } from 'fastify'
import { createEncryptedFileCredentialBackend } from '../platform/credential-backend.js'
import type { CredentialBackend } from '../platform/credential-backend.js'
import { createPostgresPool } from '../platform/postgres.js'
import { readSecretFile } from '../platform/secrets.js'
import { registerConnectionRoutes } from './routes.js'
import type { ConnectionOwnerId, ResolveConnectionSession } from './routes.js'
import { createConnectionStore } from './store.js'
import type { ConnectionStore } from './store.js'
import { createSankhyaProductionQualifier } from './qualification.js'

export type ConnectionModule = Readonly<{
  registerConnectionRoutes(app: FastifyInstance): Promise<readonly ConnectionOwnerId[]>
  close(): Promise<void>
}>

export const createConnectionModule = ({
  store,
  origin,
  resolveCurrentSession,
  close = async () => undefined,
}: Readonly<{
  store: ConnectionStore
  origin: string
  resolveCurrentSession: ResolveConnectionSession
  close?: () => Promise<void>
}>): ConnectionModule => Object.freeze({
  registerConnectionRoutes: (app) => registerConnectionRoutes(app, { store, origin, resolveCurrentSession }),
  close,
})

export const createConfiguredConnectionModule = ({
  database,
  connections,
  credentialBackend,
  fetchImpl,
  origin,
  resolveCurrentSession,
}: Readonly<{
  database: Readonly<{ host: string; port: number; database: string }>
  connections: Readonly<{
    passwordFile: string
    credentialRoot: string
    credentialKeyFile: string
    credentialKeyGeneration: string
  }>
  credentialBackend?: CredentialBackend
  /** Controlled local-HTTP seam; never sourced from runtime configuration. */
  fetchImpl?: typeof fetch
  origin: string
  resolveCurrentSession: ResolveConnectionSession
}>): ConnectionModule => {
  const pool = createPostgresPool({
    ...database,
    user: 'hub_r2_connections',
    password: readSecretFile(connections.passwordFile),
  })
  const backend = credentialBackend ?? createEncryptedFileCredentialBackend({
    root: connections.credentialRoot,
    keyFile: connections.credentialKeyFile,
    keyGeneration: connections.credentialKeyGeneration,
  })
  return createConnectionModule({
    store: createConnectionStore({
      pool,
      credentialBackend: backend,
      qualifier: createSankhyaProductionQualifier(fetchImpl),
    }),
    origin,
    resolveCurrentSession,
    close: () => pool.end(),
  })
}

export {
  isSankhyaConfiguration,
  resolveSankhyaOrigin,
} from './sankhya-om.js'
export type { SankhyaConfiguration } from './sankhya-om.js'
export {
  authenticateSankhya,
} from './transport.js'
export {
  createSankhyaProductionQualifier,
  qualifySankhyaProduction,
} from './qualification.js'
export {
  sankhyaProductionResponseAdmission,
  selectSankhyaProductionResponseAdmission,
} from './sankhya-response-admission.js'
export type { SankhyaResponseAdmission } from './sankhya-response-admission.js'
