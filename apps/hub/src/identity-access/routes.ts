import type { FastifyInstance } from 'fastify'
import { Failure, logFailure } from '../platform/failure.js'
import { logLine } from '../platform/logger.js'
import { IAM_GENERATED_ROUTES } from '../generated/iam-routes.js'
import type { Iam03Body, IamOwnerId } from '../generated/iam-routes.js'
import { parseApplicationSlug } from '../platform/application-slug.js'
import { parseOpaqueToken } from '../platform/opaque-token.js'
import { routes } from '../http/access.js'
import { clearCookie, readCookie, setCookie } from '../http/cookies.js'
import type { HostSessions } from './host-sessions.js'
import type { OidcAdapter } from './oidc.js'
import type { IdentityAccessStore, SignInReturn } from './store.js'

const PROVIDER_LOGOUT_TIMEOUT_MS = 3_000
const header = (value: string | string[] | undefined): string | undefined => Array.isArray(value) ? value[0] : value

export type IdentityAccessRouteDependencies = Readonly<{
  store: IdentityAccessStore
  workspaceReader: Pick<IdentityAccessStore, 'listAccessibleWorkspaces'>
  oidc: OidcAdapter
  config: Readonly<{ origin: string; bootstrapIssuer: string; bootstrapSubject: string }>
  /** Opens a Hub session at sign-in and ends it at sign-out. */
  hubSessions: Pick<HostSessions, 'openHub' | 'endHub'>
  /** Present when the installation serves applications: sign-ins that begin at an application host. */
  applications?: Readonly<{ sessions: Pick<HostSessions, 'applicationBySlug' | 'signIn'>; origin: (slug: string) => string }>
}>

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: debt: owning wave
export const registerIdentityAccessRoutes = async (
  app: FastifyInstance,
  { store, workspaceReader, oidc, config, hubSessions, applications }: IdentityAccessRouteDependencies,
): Promise<readonly IamOwnerId[]> => {
  const route = routes(app)
  // An application host starts a sign-in with its slug and the digest of a binding only that browser
  // holds. Both or neither: the Hub's own sign-in takes no parameter.
  route['sign-in']<{ Querystring: Record<string, unknown> }>({ url: '/protocol/oidc/login', handler: async (request, reply) => {
    const { application, binding } = request.query
    let signInReturn: SignInReturn = { kind: 'HUB' }
    if (application !== undefined || binding !== undefined) {
      const slug = parseApplicationSlug(application)
      const bindingText = parseOpaqueToken(binding)
      const bindingDigest = bindingText ? Buffer.from(bindingText, 'base64url') : null
      // Only the canonical encoding of a 32-byte digest, so one binding has exactly one spelling.
      if (!slug || !bindingDigest || bindingDigest.toString('base64url') !== bindingText || !applications) return reply.code(400).send()
      const projectId = await applications.sessions.applicationBySlug(slug)
      if (!projectId) return reply.code(404).send()
      signInReturn = { kind: 'APPLICATION', projectId, bindingDigest }
    }
    try {
      const transaction = await oidc.begin()
      await store.createOidcTransaction({ ...transaction, signInReturn })
      return setCookie(reply, 'oidcState', transaction.state).redirect(transaction.location, 302)
    } catch (error) {
      logFailure(request.log, new Failure('OIDC_BEGIN_FAILED', { cause: error }))
      return reply.code(503).send()
    }
  } })

  route['sign-in']<{ Querystring: { state?: string } }>({ url: '/protocol/oidc/callback', handler: async (request, reply) => {
    const state = request.query.state
    if (!state || state !== readCookie(request, 'oidcState')) return reply.code(400).send()
    const transaction = await store.consumeOidcTransaction({ state })
    if (!transaction) return reply.code(400).send()
    try {
      const identity = await oidc.complete({
        currentUrl: new URL(request.raw.url ?? '', config.origin).href,
        pkceVerifier: transaction.pkceVerifier,
        expectedState: state,
        expectedNonce: transaction.nonce,
      })
      const account = await store.resolveIdentity(identity)
      clearCookie(reply, 'oidcState')
      const signInReturn = transaction.signInReturn
      if (signInReturn.kind === 'APPLICATION') {
        if (!applications) {
          logFailure(request.log, new Failure('OIDC_APPLICATION_SIGN_IN_UNAVAILABLE', { details: { projectId: signInReturn.projectId } }))
          return reply.code(503).send()
        }
        const outcome = await applications.sessions.signIn({
          identity,
          existingAccountId: account?.accountId ?? null,
          projectId: signInReturn.projectId,
          bindingDigest: signInReturn.bindingDigest,
        })
        const origin = applications.origin(outcome.slug)
        const location = outcome.kind === 'HANDOFF'
          ? `${origin}/__conexus/sign-in/complete?handoff=${outcome.handoff}`
          : `${origin}/__conexus/no-access?reason=${outcome.reason}`
        return reply.header('referrer-policy', 'no-referrer').redirect(location, 303)
      }
      if (account) {
        await store.claimInvitations({ accountId: account.accountId, verifiedEmail: identity.verifiedEmail })
        // The Hub keeps this sign-in's Keycloak refresh token, sealed, to ask Keycloak again while the session lasts.
        if (!identity.refreshToken) {
          logFailure(request.log, new Failure('OIDC_REFRESH_TOKEN_MISSING'))
          return reply.code(503).send()
        }
        const established = await hubSessions.openHub({ accountId: account.accountId, refreshToken: identity.refreshToken })
        return setCookie(reply, 'hubSession', established.sessionToken).redirect('/', 303)
      }
      const bootstrapToken = await store.createProvisioningContext({
        ...identity,
        configuredIssuer: config.bootstrapIssuer,
        configuredSubject: config.bootstrapSubject,
      })
      return setCookie(reply, 'bootstrap', bootstrapToken).redirect('/setup', 303)
    } catch (error) {
      if (error instanceof Failure && error.id === 'IDENTITY_NOT_ELIGIBLE') return reply.code(403).send()
      logFailure(request.log, new Failure('OIDC_CALLBACK_FAILED', { cause: error }))
      return reply.code(503).send()
    }
  } })

  route.session({
    ...IAM_GENERATED_ROUTES['IAM-01'],
    handler: async (_request, _reply, current) => {
      const workspaces = await workspaceReader?.listAccessibleWorkspaces(current.account.accountId) ?? []
      return { account: current.account, workspaces, projects: [] }
    },
  })

  route['sign-out']({
    ...IAM_GENERATED_ROUTES['IAM-02'],
    handler: async (_request, reply, { digest }) => {
      const ended = await hubSessions.endHub(digest)
      if (!ended) throw new Failure('AUTHENTICATION_REQUIRED')
      const providerLogout = ended.refreshToken
        ? await oidc.endProviderSession({ refreshToken: ended.refreshToken, signal: AbortSignal.timeout(PROVIDER_LOGOUT_TIMEOUT_MS) })
        : 'UNCONFIRMED'
      if (providerLogout !== 'ENDED') {
        logLine('HUB_SIGN_OUT_PROVIDER_LOGOUT_UNCONFIRMED', {}, 'warn')
      }
      return clearCookie(reply, 'hubSession').code(204).send()
    },
  })

  route.bootstrap<{ Body: Iam03Body }>({
    ...IAM_GENERATED_ROUTES['IAM-03'],
    handler: async (request, reply, { token: bootstrapToken }) => {
      const idempotencyKey = header(request.headers['idempotency-key'])
      if (!idempotencyKey) throw new Failure('IDEMPOTENCY_KEY_REQUIRED')
      const result = await store.provisionBootstrap({
        bootstrapToken,
        idempotencyKey,
        configuredIssuer: config.bootstrapIssuer,
        configuredSubject: config.bootstrapSubject,
        ...request.body,
      })
      clearCookie(reply, 'bootstrap')
      const { replayed: _replayed, ...body } = result
      return reply.code(201).send(body)
    },
  })

  return ['IAM-01', 'IAM-02', 'IAM-03']
}
