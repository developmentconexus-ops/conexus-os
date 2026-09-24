import type { FastifyInstance } from 'fastify'
import { sendProblem } from '../http/problem.js'
import { S1_GENERATED_ROUTES } from '../generated/s1-routes.js'
import type { Iam03Body, S1OwnerId } from '../generated/s1-routes.js'
import { parseApplicationSlug } from '../platform/application-slug.js'
import { opaqueToken, parseOpaqueToken } from '../platform/opaque-token.js'
import { isExactOrigin } from '../platform/origin.js'
import type { HostSessions } from './host-sessions.js'
import type { ResolveCurrentSession } from './current-session.js'
import { identityAccessErrorCode } from './errors.js'
import type { OidcAdapter } from './oidc.js'
import type { IdentityAccessStore, SignInReturn } from './store.js'

const SESSION_COOKIE = '__Host-conexus_session'
const BOOTSTRAP_COOKIE = '__Host-conexus_bootstrap'
const CSRF_COOKIE = '__Host-conexus_csrf'
const OIDC_STATE_COOKIE = '__Host-conexus_oidc_state'
const cookieOptions = { path: '/', secure: true, httpOnly: true, sameSite: 'lax' as const }
const visibleCookieOptions = { ...cookieOptions, httpOnly: false }
const clearCookieOptions = { path: '/', secure: true, sameSite: 'lax' as const }
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

export const registerIdentityAccessRoutes = async (
  app: FastifyInstance,
  { store, workspaceReader, oidc, config, resolveCurrentSession, hubSessions, applications }: IdentityAccessRouteDependencies,
): Promise<readonly S1OwnerId[]> => {
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
    } catch {
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
        if (!applications) return reply.code(503).send()
        const outcome = await applications.sessions.signIn({
          identity,
          existingAccountId: account?.accountId ?? null,
          projectId: signInReturn.projectId,
          bindingDigest: signInReturn.bindingDigest,
        })
        const origin = applications.origin(outcome.slug)
        const location = outcome.kind === 'HANDOFF'
          ? `${origin}/__conexus/sign-in/complete?handoff=${outcome.handoff}`
          : `${origin}/__conexus/no-access`
        return reply.header('referrer-policy', 'no-referrer').redirect(location, 303)
      }
      if (account) {
        await store.claimInvitations({ accountId: account.accountId, verifiedEmail: identity.verifiedEmail })
        // The Hub keeps this sign-in's Keycloak refresh token, sealed, to ask Keycloak again while the session lasts.
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
      if (identityAccessErrorCode(error) === 'IDENTITY_NOT_ELIGIBLE') return reply.code(403).send()
      return reply.code(503).send()
    }
  })

  app.route({
    ...S1_GENERATED_ROUTES['IAM-01'],
    handler: async (request, reply) => {
      const current = await resolveCurrentSession(request)
      if (!current) return sendProblem(reply, 401, 'authentication-required', 'Authentication required')
      const workspaces = await workspaceReader?.listAccessibleWorkspaces(current.account.accountId) ?? []
      return { account: current.account, workspaces, projects: [] }
    },
  })

  app.route({
    ...S1_GENERATED_ROUTES['IAM-02'],
    handler: async (request, reply) => {
      if (!isExactOrigin(request.headers.origin, config.origin)) return sendProblem(reply, 403, 'origin-denied', 'Origin denied')
      const requestCsrf = header(request.headers['x-conexus-csrf'])
      if (!requestCsrf || requestCsrf !== request.cookies[CSRF_COOKIE]) {
        return sendProblem(reply, 403, 'csrf-denied', 'Request authenticity denied')
      }
      const current = await resolveCurrentSession(request, true)
      if (!current) return sendProblem(reply, 401, 'authentication-required', 'Authentication required')
      const sessionToken = request.cookies[SESSION_COOKIE]
      if (!sessionToken) return sendProblem(reply, 401, 'authentication-required', 'Authentication required')
      await hubSessions.endHub(sessionToken)
      return reply
        .clearCookie(SESSION_COOKIE, clearCookieOptions)
        .clearCookie(CSRF_COOKIE, clearCookieOptions)
        .code(204).send()
    },
  })

  app.route<{ Body: Iam03Body }>({
    ...S1_GENERATED_ROUTES['IAM-03'],
    handler: async (request, reply) => {
      const requestCsrf = header(request.headers['x-conexus-csrf'])
      if (!isExactOrigin(request.headers.origin, config.origin) || !requestCsrf || requestCsrf !== request.cookies[CSRF_COOKIE]) {
        return sendProblem(reply, 403, 'request-authenticity-denied', 'Request authenticity denied')
      }
      const idempotencyKey = header(request.headers['idempotency-key'])
      if (!idempotencyKey) return sendProblem(reply, 400, 'idempotency-key-required', 'Idempotency key required')
      try {
        const bootstrapToken = request.cookies[BOOTSTRAP_COOKIE]
        if (!bootstrapToken) return sendProblem(reply, 401, 'bootstrap-required', 'Bootstrap context required')
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
      } catch (error) {
        const code = identityAccessErrorCode(error)
        if (code === 'IDEMPOTENCY_CONFLICT' || code === 'BOOTSTRAP_SEALED' || code === 'OUTCOME_UNKNOWN') {
          return sendProblem(reply, 409, code.toLowerCase(), 'Account provisioning conflict')
        }
        if (code === 'IDENTITY_NOT_ELIGIBLE') return sendProblem(reply, 403, 'identity-not-eligible', 'Identity not eligible')
        if (code === 'ACCOUNT_CONFLICT') return sendProblem(reply, 409, 'account-conflict', 'Account already exists')
        throw error
      }
    },
  })

  return ['IAM-01', 'IAM-02', 'IAM-03']
}
