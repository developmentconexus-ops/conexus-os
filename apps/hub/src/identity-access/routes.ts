import { randomBytes } from 'node:crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { sendProblem } from '../http/problem.js'
import { S1_GENERATED_ROUTES } from '../generated/s1-routes.js'
import type { Iam03Body, S1OwnerId } from '../generated/s1-routes.js'
import { identityAccessErrorCode } from './errors.js'
import type { OidcAdapter } from './oidc.js'
import type { CurrentSession, IdentityAccessStore } from './store.js'

const SESSION_COOKIE = '__Host-conexus_session'
const BOOTSTRAP_COOKIE = '__Host-conexus_bootstrap'
const CSRF_COOKIE = '__Host-conexus_csrf'
const OIDC_STATE_COOKIE = '__Host-conexus_oidc_state'
const cookieOptions = { path: '/', secure: true, httpOnly: true, sameSite: 'lax' as const }
const visibleCookieOptions = { ...cookieOptions, httpOnly: false }
const clearCookieOptions = { path: '/', secure: true, sameSite: 'lax' as const }
const csrf = (): string => randomBytes(32).toString('base64url')
const exactOrigin = (request: FastifyRequest, configuredOrigin: string): boolean => request.headers.origin === configuredOrigin
const header = (value: string | string[] | undefined): string | undefined => Array.isArray(value) ? value[0] : value

export type ResolveCurrentSession = (request: FastifyRequest, requireCsrf?: boolean) => Promise<CurrentSession | null>
export type IdentityAccessRouteDependencies = Readonly<{
  store: IdentityAccessStore
  workspaceReader: Pick<IdentityAccessStore, 'listAccessibleWorkspaces'>
  oidc: OidcAdapter
  config: Readonly<{ origin: string; bootstrapIssuer: string; bootstrapSubject: string }>
  resolveCurrentSession: ResolveCurrentSession
}>

export const registerIdentityAccessRoutes = async (
  app: FastifyInstance,
  { store, workspaceReader, oidc, config, resolveCurrentSession }: IdentityAccessRouteDependencies,
): Promise<readonly S1OwnerId[]> => {
  app.get('/protocol/oidc/login', async (_request, reply) => {
    try {
      const transaction = await oidc.begin()
      await store.createOidcTransaction(transaction)
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
      if (account) {
        const established = await store.createSession({ accountId: account.accountId })
        return reply
          .setCookie(SESSION_COOKIE, established.sessionToken, cookieOptions)
          .setCookie(CSRF_COOKIE, established.csrfToken, visibleCookieOptions)
          .redirect('/', 303)
      }
      const bootstrapToken = await store.createBootstrapContext({
        ...identity,
        configuredIssuer: config.bootstrapIssuer,
        configuredSubject: config.bootstrapSubject,
      })
      const csrfToken = csrf()
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
      if (!exactOrigin(request, config.origin)) return sendProblem(reply, 403, 'origin-denied', 'Origin denied')
      const requestCsrf = header(request.headers['x-conexus-csrf'])
      if (!requestCsrf || requestCsrf !== request.cookies[CSRF_COOKIE]) {
        return sendProblem(reply, 403, 'csrf-denied', 'Request authenticity denied')
      }
      const current = await resolveCurrentSession(request, true)
      if (!current) return sendProblem(reply, 401, 'authentication-required', 'Authentication required')
      const sessionToken = request.cookies[SESSION_COOKIE]
      if (!sessionToken) return sendProblem(reply, 401, 'authentication-required', 'Authentication required')
      await store.endSession(sessionToken)
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
      if (!exactOrigin(request, config.origin) || !requestCsrf || requestCsrf !== request.cookies[CSRF_COOKIE]) {
        return sendProblem(reply, 403, 'request-authenticity-denied', 'Request authenticity denied')
      }
      const idempotencyKey = header(request.headers['idempotency-key'])
      if (!idempotencyKey) return sendProblem(reply, 400, 'idempotency-key-required', 'Idempotency key required')
      try {
        let result
        if ('externalSubject' in request.body) {
          const current = await resolveCurrentSession(request, true)
          if (!current) return sendProblem(reply, 401, 'authentication-required', 'Authentication required')
          if (current.issuer !== config.bootstrapIssuer || current.subject !== config.bootstrapSubject) {
            return sendProblem(reply, 403, 'platform-operator-required', 'Platform operator required')
          }
          result = await store.provisionByOperator({ operator: current, issuer: config.bootstrapIssuer, idempotencyKey, ...request.body })
        } else {
          const bootstrapToken = request.cookies[BOOTSTRAP_COOKIE]
          if (!bootstrapToken) return sendProblem(reply, 401, 'bootstrap-required', 'Bootstrap context required')
          result = await store.provisionBootstrap({ bootstrapToken, idempotencyKey, ...request.body })
          reply.clearCookie(BOOTSTRAP_COOKIE, clearCookieOptions).clearCookie(CSRF_COOKIE, clearCookieOptions)
        }
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
