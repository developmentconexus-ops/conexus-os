import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { PostgresPool } from '../platform/postgres.js'
import { createOidcAdapter } from './oidc.js'
import { registerIdentityAccessRoutes } from './routes.js'
import { createIdentityAccessStore } from './store.js'
import type { CurrentSession } from './store.js'

export type IdentityAccessModule = Readonly<{
  registerIdentityAccessRoutes(app: FastifyInstance): Promise<readonly ('IAM-01' | 'IAM-02' | 'IAM-03')[]>
  resolveCurrentSession(request: FastifyRequest, requireCsrf?: boolean): Promise<CurrentSession | null>
  close(): Promise<void>
}>

export const createIdentityAccessModule = async ({
  pool,
  workspaceReadPool,
  origin,
  issuer,
  clientId,
  clientSecret,
  bootstrapSubject,
  allowInsecureForTest = false,
}: Readonly<{
  pool: PostgresPool
  workspaceReadPool: PostgresPool | undefined
  origin: string
  issuer: string
  clientId: string
  clientSecret: string
  bootstrapSubject: string
  allowInsecureForTest?: boolean
}>): Promise<IdentityAccessModule> => {
  const store = createIdentityAccessStore({ pool, ...(workspaceReadPool ? { workspaceReadPool } : {}) })
  const oidc = await createOidcAdapter({
    issuer,
    clientId,
    clientSecret,
    redirectUri: new URL('/protocol/oidc/callback', origin).href,
    allowInsecureForTest,
  })
  const resolveCurrentSession = async (request: FastifyRequest, requireCsrf = false): Promise<CurrentSession | null> => {
    const sessionToken = request.cookies['__Host-conexus_session']
    if (!sessionToken) return null
    const csrfHeader = request.headers['x-conexus-csrf']
    const csrfToken = Array.isArray(csrfHeader) ? csrfHeader[0] : csrfHeader
    return store.validateSession({ sessionToken, ...(csrfToken ? { csrfToken } : {}), requireCsrf })
  }
  return Object.freeze({
    registerIdentityAccessRoutes: (app: FastifyInstance) => registerIdentityAccessRoutes(app, {
      store,
      workspaceReader: store,
      oidc,
      config: { origin, bootstrapIssuer: issuer, bootstrapSubject },
      resolveCurrentSession,
    }),
    resolveCurrentSession,
    close: () => store.close(),
  })
}
