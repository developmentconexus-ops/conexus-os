import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { sendProblem } from '../http/problem.js'
import type { AccountId, ResolveCurrentSession } from '../identity-access/current-session.js'
import { GOOGLE_AI_PRO_MODELS, GOOGLE_AI_PRO_NAME, GOOGLE_AI_PRO_PROVIDER } from './google-ai-pro/credential.js'
import { createGoogleAiProLogin, GoogleAiProLoginError, type LoginProblem } from './google-ai-pro/login.js'
import type { CliproxyPool } from './google-ai-pro/pool.js'
import type { GoogleAiProAccounts } from './google-ai-pro/store.js'
import { isExactOrigin } from '../platform/origin.js'

const CSRF_COOKIE = '__Host-conexus_csrf'
const header = (value: string | string[] | undefined): string | undefined => Array.isArray(value) ? value[0] : value
const LOGIN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const LOGIN_PROBLEMS: Readonly<Record<LoginProblem, readonly [number, string]>> = {
  'model-login-busy': [409, 'Another sign-in is in progress'],
  'model-login-unavailable': [503, 'Sign-in is unavailable'],
  'model-login-callback-refused': [400, 'Sign-in address refused'],
}

type Caller = Readonly<{ accountId: AccountId }>
type OfferedModel = Readonly<{ id: string; provider: string; modelName: string; hasApiKey: boolean }>

/** The Google AI Pro models, by the id a thread's model selection stores and a run resolves. */
const GOOGLE_AI_PRO_OFFER: readonly Omit<OfferedModel, 'hasApiKey'>[] = Object.freeze(GOOGLE_AI_PRO_MODELS.map((model) => Object.freeze({
  id: `${GOOGLE_AI_PRO_PROVIDER}/${model}`, provider: GOOGLE_AI_PRO_PROVIDER, modelName: `${GOOGLE_AI_PRO_NAME} ${model}`,
})))

/**
 * Model accounts on the Builder's own tables (spec 0002). Slice 1 carries the Google AI Pro account
 * a run uses; API keys, subscription sign-in, sharing and the defaults screen arrive in slice 5.
 */
export const registerModelAccountRoutes = async (app: FastifyInstance, { origin, resolveCurrentSession, isInstallationAdministrator, googleAiPro, googleAiProAccounts }: Readonly<{
  origin: string
  resolveCurrentSession: ResolveCurrentSession
  isInstallationAdministrator(account: AccountId): Promise<boolean>
  // Present when the Hub runs CLIProxyAPI; then a person signs in to Google AI Pro from Settings.
  googleAiPro?: Pick<CliproxyPool, 'startLogin'>
  // The Google AI Pro credential's home, `model.model_account`: present exactly when googleAiPro is.
  googleAiProAccounts?: GoogleAiProAccounts
}>): Promise<void> => {
  const admit = async (request: FastifyRequest, reply: FastifyReply): Promise<Caller | null> => {
    if (request.method !== 'GET') {
      const csrf = header(request.headers['x-conexus-csrf'])
      if (!isExactOrigin(request.headers.origin, origin) || !csrf || csrf !== request.cookies[CSRF_COOKIE]) {
        await sendProblem(reply, 403, 'request-authenticity-denied', 'Request authenticity denied')
        return null
      }
    }
    const session = await resolveCurrentSession(request, request.method !== 'GET')
    if (!session) {
      await sendProblem(reply, 401, 'authentication-required', 'Authentication required')
      return null
    }
    return { accountId: session.account.accountId }
  }
  // Offered only to a caller who can use it, own or shared, since a model whose first turn fails is
  // worse than one not offered. With scope=installation, whether the installation shares one.
  app.get<{ Querystring: { scope?: string } }>('/api/control/model-accounts/models', {
    schema: { querystring: { type: 'object', additionalProperties: false, properties: { scope: { type: 'string', enum: ['installation'] } } } },
  }, async (request, reply) => {
    const caller = await admit(request, reply)
    if (!caller) return reply
    if (!googleAiProAccounts) return { models: [] }
    const usable = request.query.scope === 'installation'
      ? await googleAiProAccounts.hasShared()
      : await googleAiProAccounts.connection(caller.accountId).then(({ mine, shared }) => mine || shared)
    return { models: usable ? GOOGLE_AI_PRO_OFFER.map((model) => ({ ...model, hasApiKey: true })) : [] }
  })

  if (googleAiPro && googleAiProAccounts) {
    const login = createGoogleAiProLogin<Caller>({
      pool: googleAiPro,
      // The person's own row in model.model_account, sealed. The sign-in settles on a later
      // poll, which carries no write's CSRF, so the Hub writes here.
      writeCredential: ({ accountId }, key) => googleAiProAccounts.write(accountId, key),
    })
    const loginProblem = (reply: FastifyReply, error: unknown) => {
      if (!(error instanceof GoogleAiProLoginError)) throw error
      const [status, title] = LOGIN_PROBLEMS[error.problem]
      const extra = error.expiresAt ? { expiresAt: new Date(error.expiresAt).toISOString() } : undefined
      return sendProblem(reply, status, error.problem, title, undefined, extra)
    }
    // The Settings card reads the person's own connection and whether one is shared.
    app.get(`/api/control/model-accounts/${GOOGLE_AI_PRO_PROVIDER}/connection`, async (request, reply) => {
      const caller = await admit(request, reply)
      if (!caller) return reply
      const [{ mine, shared }, administrator] = await Promise.all([
        googleAiProAccounts.connection(caller.accountId),
        isInstallationAdministrator(caller.accountId),
      ])
      return { mine, shared, administrator }
    })
    const base = `/api/control/model-accounts/${GOOGLE_AI_PRO_PROVIDER}/login`
    app.post(`${base}/start`, async (request, reply) => {
      const caller = await admit(request, reply)
      if (!caller) return reply
      return login.start(caller).catch((error: unknown) => loginProblem(reply, error))
    })
    app.post<{ Body: { loginId: string; callbackUrl: string } }>(`${base}/complete`, {
      schema: {
        body: {
          type: 'object', additionalProperties: false, required: ['loginId', 'callbackUrl'],
          properties: { loginId: { type: 'string', pattern: LOGIN_ID.source }, callbackUrl: { type: 'string', maxLength: 4096 } },
        },
      },
    }, async (request, reply) => {
      const caller = await admit(request, reply)
      if (!caller) return reply
      return login.complete(caller, request.body.loginId, request.body.callbackUrl)
        .then((state) => ({ state }), (error: unknown) => loginProblem(reply, error))
    })
    app.get<{ Params: { loginId: string } }>(`${base}/:loginId`, async (request, reply) => {
      const caller = await admit(request, reply)
      if (!caller) return reply
      if (!LOGIN_ID.test(request.params.loginId)) return { state: 'expired' }
      return { state: await login.status(caller, request.params.loginId) }
    })
  }
}
