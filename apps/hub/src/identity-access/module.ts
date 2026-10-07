import type { FastifyInstance } from 'fastify'
import { applicationOrigin } from '../platform/config.js'
import type { ApplicationAddress } from '../platform/config.js'
import type { Database } from '../platform/db.js'
import type { Job } from '../platform/jobs.js'
import type { SecretEnvelope } from '../platform/secrets.js'
import { configuredIdentity } from './admission.js'
import { registerAdministratorRoutes } from './administrators.js'
import { createApplicationAccess, purgeProject } from './application-access.js'
import { iamReaperJob } from './expiry.js'
import { createOidcAdapter } from './oidc.js'
import { registerRosterRoutes } from './roster.js'
import { createSessions } from './sessions.js'
import type { WorkspaceReader } from './hub-session.js'
import { createSignIn } from './sign-in.js'

export const createIdentityAccessModule = async ({
  database, workspaceReader, origin, issuer, clientId, clientSecret, bootstrapSubject, envelope, application, allowInsecureForTest = false,
}: Readonly<{
  database: Database
  workspaceReader: WorkspaceReader
  origin: string
  issuer: string
  clientId: string
  clientSecret: string
  /** With the issuer, the one identity whose first sign in founds an empty installation. */
  bootstrapSubject: string
  /** Seals the Keycloak refresh token every Hub and application session keeps, with the installation's credential key. */
  envelope: SecretEnvelope
  /** Where applications are served. */
  application: Readonly<{ address: ApplicationAddress }> | undefined
  allowInsecureForTest?: boolean
}>) => {
  const oidc = await createOidcAdapter({ issuer, clientId, clientSecret, redirectUri: new URL('/protocol/oidc/callback', origin).href, allowInsecureForTest })
  const sessions = createSessions({ database, envelope, provider: oidc })
  const originOf = application ? (slug: string): string => applicationOrigin(application.address, slug) : null
  const applicationAccess = createApplicationAccess({ database, addressOf: (slug) => originOf?.(slug) ?? null })
  const signIn = createSignIn({ database, oidc, sessions, configured: configuredIdentity({ issuer, subject: bootstrapSubject }), origin, applicationOrigin: originOf })
  const jobs: readonly Job[] = [iamReaperJob(database)]
  return Object.freeze({
    registerRoutes: async (app: FastifyInstance) => {
      await signIn.registerRoutes(app)
      return [
        ...await sessions.registerRoutes(app, workspaceReader),
        ...await registerRosterRoutes(app, database),
        ...await applicationAccess.registerRoutes(app),
        ...await registerAdministratorRoutes(app, database),
      ]
    },
    hub: Object.freeze({ resolve: sessions.resolveHub }),
    applicationHost: Object.freeze({ withApplicationRequest: sessions.withApplicationRequest, redeem: sessions.redeemApplication, signOut: sessions.signOutApplication }),
    previewHost: Object.freeze({ withPreviewRequest: sessions.withPreviewRequest, redeem: sessions.redeemPreview }),
    /** The entry handoff of a Preview, under the launching person's own admission of the Project. */
    openPreview: sessions.openPreview,
    withApplicationPresence: applicationAccess.withApplicationPresence,
    purgeProject,
    jobs,
    close: () => oidc.close(),
  })
}
