import type { FastifyInstance } from 'fastify'
import type { IamOwnerId } from '../generated/iam-routes.js'
import { applicationOrigin } from '../platform/config.js'
import type { ApplicationAddress } from '../platform/config.js'
import type { Job } from '../platform/jobs.js'
import type { PostgresPool } from '../platform/db.js'
import type { SecretEnvelope } from '../platform/secrets.js'
import { createApplicationAccessStore, registerApplicationAccessRoutes } from './application-access.js'
import type { ApplicationAccessStore } from './application-access.js'
import { createHostSessions } from './host-sessions.js'
import type { HostSessions, PreviewLaunch } from './host-sessions.js'
import { createInstallationAdministration } from './installation-administration.js'
import type { InstallationAdministration } from './installation-administration.js'
import { registerInstallationRoutes } from './installation-routes.js'
import { createMembershipStore, registerMembershipRoutes } from './membership.js'
import { createOidcAdapter } from './oidc.js'
import { iamReaperJob } from './reaper.js'
import { registerIdentityAccessRoutes } from './routes.js'
import { createIdentityAccessStore, type WorkspaceReader } from './store.js'
import type { CurrentSession, HubSessionDigest } from './current-session.js'
import { Failure } from '../platform/failure.js'

export type IdentityAccessModule = Readonly<{
  registerIdentityAccessRoutes(app: FastifyInstance): Promise<readonly IamOwnerId[]>
  /** The live Hub session a session cookie's digest names; slides its idle limit. */
  resolveHubSession(digest: HubSessionDigest): Promise<CurrentSession | null>
  /** Opens a Preview for the developer behind a live Hub session and mints its entry handoff. */
  openPreview(hubSessionDigest: HubSessionDigest, launch: PreviewLaunch): Promise<Readonly<{ entryGrant: string; expiresAt: number }>>
  installationAdministration: InstallationAdministration
  /** The sessions of application and Preview hosts. */
  hostSessions: HostSessions
  /** Acts on whether the Project has an application, whose Preview data must then never be erased; none can be created meanwhile. */
  withApplicationPresence: ApplicationAccessStore['withApplicationPresence']
  /** The periodic work this module owns, run by the Hub's executor. */
  jobs: readonly Job[]
  close(): Promise<void>
}>

export const createIdentityAccessModule = async ({
  pool,
  workspaceReader,
  origin,
  issuer,
  clientId,
  clientSecret,
  bootstrapSubject,
  envelope,
  application,
  allowInsecureForTest = false,
}: Readonly<{
  pool: PostgresPool
  workspaceReader: WorkspaceReader
  origin: string
  issuer: string
  clientId: string
  clientSecret: string
  bootstrapSubject: string
  /** Seals the Keycloak refresh token every Hub and application session keeps, with the installation's credential key. */
  envelope: SecretEnvelope
  /** Where applications are served. */
  application: Readonly<{ address: ApplicationAddress }> | undefined
  allowInsecureForTest?: boolean
}>): Promise<IdentityAccessModule> => {
  const store = createIdentityAccessStore({ pool, workspaceReader })
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
  const hostSessions = createHostSessions({ pool, refresh: oidc.refresh, envelope })
  const installationAdministration = createInstallationAdministration({ pool })
  return Object.freeze({
    registerIdentityAccessRoutes: async (app: FastifyInstance) => {
      const owners = [
        ...await registerIdentityAccessRoutes(app, {
          store,
          workspaceReader: store,
          oidc,
          config: { origin, bootstrapIssuer: issuer, bootstrapSubject },
          hubSessions: hostSessions,
          ...(originOf ? { applications: { sessions: hostSessions, origin: originOf } } : {}),
        }),
        ...await registerMembershipRoutes(app, { store: membership }),
        ...await registerApplicationAccessRoutes(app, {
          store: applicationAccess,
          config: {
            applicationAddress: (slug) => originOf?.(slug) ?? null,
          },
        }),
      ]
      await registerInstallationRoutes(app, { installationAdministration })
      return owners
    },
    resolveHubSession: (digest) => hostSessions.resolveHub(digest),
    openPreview: async (hubSessionDigest, launch) => {
      const opened = await hostSessions.openPreview({ hubSessionDigest, launch })
      if (!opened) throw new Failure('INTERNAL_UNEXPECTED', { details: { invariant: 'PREVIEW_ACCESS_UNAVAILABLE' } })
      return opened
    },
    installationAdministration,
    hostSessions,
    withApplicationPresence: (projectId, work) => applicationAccess.withApplicationPresence(projectId, work),
    jobs: [iamReaperJob(pool)],
    close: async () => {
      await oidc.close()
    },
  })
}
