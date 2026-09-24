import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { S1OwnerId } from '../generated/s1-routes.js'
import { applicationOrigin } from '../platform/config.js'
import type { ApplicationAddress } from '../platform/config.js'
import type { PostgresPool } from '../platform/postgres.js'
import type { SecretEnvelope } from '../platform/secrets.js'
import { createApplicationAccessStore, registerApplicationAccessRoutes } from './application-access.js'
import { createHostSessions } from './host-sessions.js'
import type { HostSessions, PreviewLaunch } from './host-sessions.js'
import { createInstallationAdministration } from './installation-administration.js'
import type { InstallationAdministration } from './installation-administration.js'
import { registerInstallationRoutes } from './installation-routes.js'
import { createMembershipStore, registerMembershipRoutes } from './membership.js'
import { createOidcAdapter } from './oidc.js'
import { registerIdentityAccessRoutes } from './routes.js'
import { createIdentityAccessStore } from './store.js'
import type { CurrentSession } from './store.js'
import type { ResolveCurrentSession, SessionRequest } from './current-session.js'

export type IdentityAccessModule = Readonly<{
  registerIdentityAccessRoutes(app: FastifyInstance): Promise<readonly S1OwnerId[]>
  resolveCurrentSession: ResolveCurrentSession
  /** Opens a Preview for the developer behind the request's Hub session and mints its entry handoff. */
  openPreview(request: FastifyRequest, launch: PreviewLaunch): Promise<Readonly<{ entryGrant: string; expiresAt: number }>>
  installationAdministration: InstallationAdministration
  /** The sessions of application and Preview hosts. */
  hostSessions: HostSessions
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
  application,
  allowInsecureForTest = false,
}: Readonly<{
  pool: PostgresPool
  workspaceReadPool: PostgresPool | undefined
  origin: string
  issuer: string
  clientId: string
  clientSecret: string
  bootstrapSubject: string
  /** Where applications are served, and the envelope that seals their sessions' Keycloak refresh tokens. */
  application: Readonly<{ address: ApplicationAddress; envelope: SecretEnvelope }> | undefined
  allowInsecureForTest?: boolean
}>): Promise<IdentityAccessModule> => {
  const store = createIdentityAccessStore({ pool, ...(workspaceReadPool ? { workspaceReadPool } : {}) })
  const membership = createMembershipStore({ pool })
  const applicationAccess = createApplicationAccessStore({ pool })
  const oidc = await createOidcAdapter({
    issuer,
    clientId,
    clientSecret,
    redirectUri: new URL('/protocol/oidc/callback', origin).href,
    allowInsecureForTest,
  })
  const originOf = application ? (slug: string): string => applicationOrigin(application.address, slug) : undefined
  const hostSessions = createHostSessions({ pool, refresh: oidc.refresh, envelope: application?.envelope })
  const resolveCurrentSession = async (request: SessionRequest, requireCsrf = false): Promise<CurrentSession | null> => {
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
          ...(originOf ? { applications: { sessions: hostSessions, origin: originOf } } : {}),
        }),
        ...await registerMembershipRoutes(app, {
          store: membership,
          resolveCurrentSession,
          config: { origin },
        }),
        ...await registerApplicationAccessRoutes(app, {
          store: applicationAccess,
          resolveCurrentSession,
          config: {
            origin,
            applicationAddress: (slug) => originOf?.(slug) ?? null,
          },
        }),
      ]
      await registerInstallationRoutes(app, { origin, resolveCurrentSession, installationAdministration })
      return owners
    },
    resolveCurrentSession,
    openPreview: async (request, launch) => {
      const hubSessionToken = request.cookies['__Host-conexus_session']
      const opened = hubSessionToken ? await hostSessions.openPreview({ hubSessionToken, launch }) : null
      if (!opened) throw new Error('PREVIEW_ACCESS_UNAVAILABLE')
      return opened
    },
    installationAdministration,
    hostSessions,
    close: async () => {
      await Promise.all([oidc.close(), store.close()])
    },
  })
}
