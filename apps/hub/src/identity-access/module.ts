import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { S1OwnerId } from '../generated/s1-routes.js'
import type { PostgresPool } from '../platform/postgres.js'
import { createInstallationAdministration } from './installation-administration.js'
import type { InstallationAdministration } from './installation-administration.js'
import { registerInstallationRoutes } from './installation-routes.js'
import { createMembershipStore, registerMembershipRoutes } from './membership.js'
import { createOidcAdapter } from './oidc.js'
import { createPreviewAccess } from './preview-access.js'
import type { PreviewAccess, PreviewRouteBinding } from './preview-access.js'
import { registerIdentityAccessRoutes } from './routes.js'
import { createIdentityAccessStore } from './store.js'
import type { CurrentSession } from './store.js'

export type IdentityAccessModule = Readonly<{
  registerIdentityAccessRoutes(app: FastifyInstance): Promise<readonly S1OwnerId[]>
  resolveCurrentSession(request: FastifyRequest, requireCsrf?: boolean): Promise<CurrentSession | null>
  issuePreviewEntry(request: FastifyRequest, input: Readonly<{ accountId: string; route: PreviewRouteBinding }>): Promise<Readonly<{ entryGrant: string; expiresAt: number }>>
  previewAccess: PreviewAccess
  installationAdministration: InstallationAdministration
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
  const membership = createMembershipStore({ pool })
  const previewAccess = createPreviewAccess({
    readSession: ({ sessionDigest }) => store.readSession({ sessionDigest }),
  })
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
  const installationAdministration = createInstallationAdministration({ pool })
  return Object.freeze({
    registerIdentityAccessRoutes: async (app: FastifyInstance) => {
      const owners = [
        ...await registerIdentityAccessRoutes(app, {
          store,
          workspaceReader: store,
          oidc,
          config: { origin, bootstrapIssuer: issuer, bootstrapSubject },
          resolveCurrentSession,
        }),
        ...await registerMembershipRoutes(app, {
          store: membership,
          resolveCurrentSession,
          config: { origin },
        }),
      ]
      await registerInstallationRoutes(app, { origin, resolveCurrentSession, installationAdministration })
      return owners
    },
    resolveCurrentSession,
    issuePreviewEntry: async (request, input) => {
      const sessionToken = request.cookies['__Host-conexus_session']
      if (!sessionToken || input.route.accountId !== input.accountId) throw new Error('PREVIEW_ACCESS_UNAVAILABLE')
      return previewAccess.issueEntryGrant({ sessionToken, route: input.route })
    },
    previewAccess,
    installationAdministration,
    close: async () => {
      await Promise.all([previewAccess.close(), oidc.close(), store.close()])
    },
  })
}
