import type { FastifyInstance } from 'fastify'
import { Failure, logFailure } from '../platform/failure.js'
import { logLine } from '../platform/logger.js'
import { IAM_GENERATED_ROUTES } from '../generated/iam-routes.js'
import type { Iam03Body, IamOwnerId } from '../generated/iam-routes.js'
import { parseApplicationSlug } from '../platform/application-slug.js'
import { opaqueToken, parseOpaqueToken } from '../platform/opaque-token.js'
import { isExactOrigin } from '../platform/origin.js'
import type { HostSessions } from './host-sessions.js'
import type { ResolveCurrentSession } from './current-session.js'
import type { OidcAdapter } from './oidc.js'
import type { IdentityAccessStore, SignInReturn } from './store.js'

const SESSION_COOKIE = '__Host-conexus_session'
const BOOTSTRAP_COOKIE = '__Host-conexus_bootstrap'
const CSRF_COOKIE = '__Host-conexus_csrf'
const OIDC_STATE_COOKIE = '__Host-conexus_oidc_state'
const cookieOptions = { path: '/', secure: true, httpOnly: true, sameSite: 'lax' as const }
const visibleCookieOptions = { ...cookieOptions, httpOnly: false }
const clearCookieOptions = { path: '/', secure: true, sameSite: 'lax' as const }
const PROVIDER_LOGOUT_TIMEOUT_MS = 3_000
const header = (value: string | string[] | undefined): string | undefined => Array.isArray(value) ? value[0] : value

export type IdentityAccessRouteDependencies = Readonly<{
  store: IdentityAccessStore
  workspaceReader: Pick<IdentityAccessStore, 'listAccessibleWorkspaces'>
  oidc: OidcAdapter
  config: Readonly<{ origin: string; bootstrapIssuer: string; bootstrapSubject: string }>
  resolveCurrentSession: ResolveCurrentSession
  /** Opens a Hub session at sign-in and ends it at sign-out. */
  hubSessions: Pick<HostSessions, 'openHub' | 'endHub'>
  /** Present when the installation serves applications: sign-ins that begin at an application host. */
  applications?: Readonly<{ sessions: Pick<HostSessions, 'applicationBySlug' | 'signIn'>; origin: (slug: string) => string }>
}>

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: debt: owning wave
export const registerIdentityAccessRoutes = async (
  app: FastifyInstance,
  { store, workspaceReader, oidc, config, resolveCurrentSession, hubSessions, applications }: IdentityAccessRouteDependencies,
): Promise<readonly IamOwnerId[]> => {
  // An application host starts a sign-in with its slug and the digest of a binding only that browser
  // holds. Both or neither: the Hub's own sign-in takes no parameter.
  app.get<{ Querystring: Record<string, unknown> }>('/protocol/oidc/login', async (request, reply) => {
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
      return reply.setCookie(OIDC_STATE_COOKIE, transaction.state, cookieOptions).redirect(transaction.location, 302)
    } catch (error) {
      logFailure(request.log, new Failure('OIDC_BEGIN_FAILED', { cause: error }))
      return reply.code(503).send()
    }
  })

  app.get<{ Querystring: { state?: string } }>('/protocol/oidc/callback', async (request, reply) => {
    const state = request.query.state
    if (!state || state !== request.cookies[OIDC_STATE_COOKIE]) return reply.code(400).send()
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
      reply.clearCookie(OIDC_STATE_COOKIE, clearCookieOptions)
      const signInReturn = transaction.signInReturn
      if (signInReturn.kind === 'APPLICATION') {
        // This branch never sets the Hub session or its CSRF cookie: the person leaves with a
        // one-use handoff for the application's own host, or with no access at all.
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
        return reply
          .setCookie(SESSION_COOKIE, established.sessionToken, cookieOptions)
          .setCookie(CSRF_COOKIE, established.csrfToken, visibleCookieOptions)
          .redirect('/', 303)
      }
      const bootstrapToken = await store.createProvisioningContext({
        ...identity,
        configuredIssuer: config.bootstrapIssuer,
        configuredSubject: config.bootstrapSubject,
      })
      const csrfToken = opaqueToken()
      return reply
        .setCookie(BOOTSTRAP_COOKIE, bootstrapToken, cookieOptions)
        .setCookie(CSRF_COOKIE, csrfToken, visibleCookieOptions)
        .redirect('/setup', 303)
    } catch (error) {
      if (error instanceof Failure && error.id === 'IDENTITY_NOT_ELIGIBLE') return reply.code(403).send()
      logFailure(request.log, new Failure('OIDC_CALLBACK_FAILED', { cause: error }))
      return reply.code(503).send()
    }
  })

  app.route({
    ...IAM_GENERATED_ROUTES['IAM-01'],
    handler: async (request) => {
      const current = await resolveCurrentSession(request)
      if (!current) throw new Failure('AUTHENTICATION_REQUIRED')
      const workspaces = await workspaceReader?.listAccessibleWorkspaces(current.account.accountId) ?? []
      return { account: current.account, workspaces, projects: [] }
    },
  })

  app.route({
    ...IAM_GENERATED_ROUTES['IAM-02'],
    handler: async (request, reply) => {
      if (!isExactOrigin(request.headers.origin, config.origin)) throw new Failure('REQUEST_AUTHENTICITY_DENIED')
      const requestCsrf = header(request.headers['x-conexus-csrf'])
      if (!requestCsrf || requestCsrf !== request.cookies[CSRF_COOKIE]) {
        throw new Failure('REQUEST_AUTHENTICITY_DENIED')
      }
      // The session and its own CSRF token are enough to end the Conexus session, and it ends before Keycloak
      // is asked anything. Only then is Keycloak asked, for a bounded time, to end the SSO session behind it,
      // so the next sign-in asks for a password. Keycloak's silence never undoes or delays the local end
      // past that bound, and is never reported as a Keycloak sign-out.
      const sessionToken = request.cookies[SESSION_COOKIE]
      const ended = sessionToken ? await hubSessions.endHub({ sessionToken, csrfToken: requestCsrf }) : null
      if (!ended) throw new Failure('AUTHENTICATION_REQUIRED')
      const providerLogout = ended.refreshToken
        ? await oidc.endProviderSession({ refreshToken: ended.refreshToken, signal: AbortSignal.timeout(PROVIDER_LOGOUT_TIMEOUT_MS) })
        : 'UNCONFIRMED'
      if (providerLogout !== 'ENDED') {
        logLine('HUB_SIGN_OUT_PROVIDER_LOGOUT_UNCONFIRMED', {}, 'warn')
      }
      return reply
        .clearCookie(SESSION_COOKIE, clearCookieOptions)
        .clearCookie(CSRF_COOKIE, clearCookieOptions)
        .code(204).send()
    },
  })

  app.route<{ Body: Iam03Body }>({
    ...IAM_GENERATED_ROUTES['IAM-03'],
    handler: async (request, reply) => {
      const requestCsrf = header(request.headers['x-conexus-csrf'])
      if (!isExactOrigin(request.headers.origin, config.origin) || !requestCsrf || requestCsrf !== request.cookies[CSRF_COOKIE]) {
        throw new Failure('REQUEST_AUTHENTICITY_DENIED')
      }
      const idempotencyKey = header(request.headers['idempotency-key'])
      if (!idempotencyKey) throw new Failure('IDEMPOTENCY_KEY_REQUIRED')
      const bootstrapToken = request.cookies[BOOTSTRAP_COOKIE]
      if (!bootstrapToken) throw new Failure('BOOTSTRAP_REQUIRED')
      const result = await store.provisionBootstrap({
        bootstrapToken,
        idempotencyKey,
        configuredIssuer: config.bootstrapIssuer,
        configuredSubject: config.bootstrapSubject,
        ...request.body,
      })
      reply.clearCookie(BOOTSTRAP_COOKIE, clearCookieOptions).clearCookie(CSRF_COOKIE, clearCookieOptions)
      const { replayed: _replayed, ...body } = result
      return reply.code(201).send(body)
    },
  })

  return ['IAM-01', 'IAM-02', 'IAM-03']
}
