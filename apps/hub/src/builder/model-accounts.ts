import { getProviderConfig } from '@mastra/core/llm'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { sendProblem } from '../http/problem.js'
import { ANTHROPIC_KEY_SHAPE, ANTHROPIC_MODELS, ANTHROPIC_PROVIDER, serializeClaudeTokens } from './anthropic/credential.js'
import { createClaudeLogin, type ClaudeAuthorization } from './anthropic/login.js'
import type { AccountId, ResolveCurrentSession } from '../identity-access/current-session.js'
import { GOOGLE_AI_PRO_MODELS, GOOGLE_AI_PRO_NAME, GOOGLE_AI_PRO_PROVIDER } from './google-ai-pro/credential.js'
import { createGoogleAiProLogin, GoogleAiProLoginError, type LoginProblem } from './google-ai-pro/login.js'
import type { CliproxyPool } from './google-ai-pro/pool.js'
import type { GoogleAiProAccounts } from './google-ai-pro/store.js'
import type { MemorySettings, MemorySettingsStore } from './memory.js'
import type { ModelAccountKind, ModelAccountStore } from './model-account-store.js'
import { OPENAI_CODEX_NAME, OPENAI_CODEX_PROVIDER, OPENAI_MODEL_PROVIDER, serializeCodexTokens } from './openai-codex/credential.js'
import { createCodexLogin, type CodexDevice } from './openai-codex/login.js'
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
type Offer = readonly Omit<OfferedModel, 'hasApiKey'>[]

/** The Google AI Pro models, by the id a thread's model selection stores and a run resolves. */
const GOOGLE_AI_PRO_OFFER: Offer = Object.freeze(GOOGLE_AI_PRO_MODELS.map((model) => Object.freeze({
  id: `${GOOGLE_AI_PRO_PROVIDER}/${model}`, provider: GOOGLE_AI_PRO_PROVIDER, modelName: `${GOOGLE_AI_PRO_NAME} ${model}`,
})))

// Mastra's model router catalog lists every OpenAI model, and Mastra Code offers all of them on a
// ChatGPT subscription. The catalog carries no capability field, so the ones that cannot chat are
// left out by name, as the Hub did for the Factory catalog, with the retired ones the catalog marks.
const NON_CHAT_MODEL = /(^|[-_.])(image|dall-?e|embed|embedding|tts|whisper|transcribe|realtime|rerank|moderation)([-_.]|$)/i
const openaiCatalog = getProviderConfig(OPENAI_MODEL_PROVIDER)
const retired = new Set(openaiCatalog?.deprecatedModels ?? [])
/** The ChatGPT subscription's models, by the `openai/<model>` id a thread stores and a run resolves. */
const OPENAI_CODEX_OFFER: Offer = Object.freeze((openaiCatalog?.models ?? [])
  .filter((model) => !retired.has(model) && !NON_CHAT_MODEL.test(model))
  .map((model) => Object.freeze({ id: `${OPENAI_MODEL_PROVIDER}/${model}`, provider: OPENAI_MODEL_PROVIDER, modelName: `${OPENAI_CODEX_NAME} ${model}` })))

const ANTHROPIC_OFFER: Offer = Object.freeze(ANTHROPIC_MODELS.map(({ model, name }) =>
  Object.freeze({ id: `${ANTHROPIC_PROVIDER}/${model}`, provider: ANTHROPIC_PROVIDER, modelName: name })))

/** The providers a person connects by pasting a key, and the shape each key must have. */
const API_KEY_SHAPES: Readonly<Record<string, RegExp>> = Object.freeze({ [ANTHROPIC_PROVIDER]: ANTHROPIC_KEY_SHAPE })

/** The accounts the Settings screen lists, by `model.model_account` provider. */
const LISTED_PROVIDERS = [OPENAI_CODEX_PROVIDER, ANTHROPIC_PROVIDER] as const

type Connection = Readonly<{ provider: string; mine: boolean; kind: ModelAccountKind | null; shared: boolean }>

// Below this an observation or a reflection would run on almost every turn; above it the window
// outgrows every model the Builder offers.
const MEMORY_THRESHOLD = { type: 'integer', minimum: 1_000, maximum: 1_000_000 } as const
const MEMORY_MODEL = { anyOf: [{ type: 'null' }, { type: 'string', minLength: 1, maxLength: 200 }] } as const

/**
 * Model accounts on the Builder's own tables (spec 0002): Google AI Pro, the ChatGPT subscription,
 * and Anthropic by key or by Claude subscription. Sharing and the defaults screen are the rest of
 * slice 5.
 */
export const registerModelAccountRoutes = async (app: FastifyInstance, { origin, resolveCurrentSession, isInstallationAdministrator, modelAccounts, memorySettings, openaiCodexDevice, claudeAuthorization, googleAiPro, googleAiProAccounts }: Readonly<{
  origin: string
  resolveCurrentSession: ResolveCurrentSession
  isInstallationAdministrator(account: AccountId): Promise<boolean>
  modelAccounts: ModelAccountStore
  // Which models observe and reflect for this person, and when; absent, the Builder has no memory settings screen.
  memorySettings?: MemorySettingsStore
  // OpenAI's device-code endpoints; only tests replace them.
  openaiCodexDevice?: CodexDevice
  // Anthropic's authorization endpoints; only tests replace them.
  claudeAuthorization?: ClaudeAuthorization
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
  const offeredModels = async (accountId: AccountId, scope?: 'installation'): Promise<readonly Omit<OfferedModel, 'hasApiKey'>[]> => {
    const usable = async (provider: string): Promise<boolean> => scope === 'installation'
      ? modelAccounts.hasShared(provider)
      : modelAccounts.connection(accountId, provider).then(({ mine, shared }) => mine !== null || shared)
    const offers: readonly (readonly [string, Offer])[] = [
      ...(googleAiProAccounts ? [[GOOGLE_AI_PRO_PROVIDER, GOOGLE_AI_PRO_OFFER] as const] : []),
      [OPENAI_CODEX_PROVIDER, OPENAI_CODEX_OFFER],
      [ANTHROPIC_PROVIDER, ANTHROPIC_OFFER],
    ]
    return (await Promise.all(offers.map(async ([provider, offer]) => await usable(provider) ? offer : []))).flat()
  }
  app.get<{ Querystring: { scope?: 'installation' } }>('/api/control/model-accounts/models', {
    schema: { querystring: { type: 'object', additionalProperties: false, properties: { scope: { type: 'string', enum: ['installation'] } } } },
  }, async (request, reply) => {
    const caller = await admit(request, reply)
    if (!caller) return reply
    return { models: (await offeredModels(caller.accountId, request.query.scope)).map((model) => ({ ...model, hasApiKey: true })) }
  })

  if (memorySettings) {
    app.get('/api/control/model-accounts/memory', async (request, reply) => {
      const caller = await admit(request, reply)
      if (!caller) return reply
      return { settings: await memorySettings.read(caller.accountId) }
    })
    // A model a role is set to must be one this person can call, as the picker offers it; null
    // keeps the conversation's own model.
    app.put<{ Body: MemorySettings }>('/api/control/model-accounts/memory', {
      schema: {
        body: {
          type: 'object', additionalProperties: false,
          required: ['observerModelId', 'reflectorModelId', 'observationThreshold', 'reflectionThreshold'],
          properties: { observerModelId: MEMORY_MODEL, reflectorModelId: MEMORY_MODEL, observationThreshold: MEMORY_THRESHOLD, reflectionThreshold: MEMORY_THRESHOLD },
        },
      },
    }, async (request, reply) => {
      const caller = await admit(request, reply)
      if (!caller) return reply
      const offered = new Set((await offeredModels(caller.accountId)).map((model) => model.id))
      const chosen = [request.body.observerModelId, request.body.reflectorModelId].filter((modelId) => modelId !== null)
      if (chosen.some((modelId) => !offered.has(modelId))) return sendProblem(reply, 400, 'memory-model-refused', 'This model is not one you can use')
      return { settings: await memorySettings.write(caller.accountId, request.body) }
    })
  }

  // The caller's accounts for the providers this Hub signs in to, never their secrets.
  app.get('/api/control/model-accounts', async (request, reply) => {
    const caller = await admit(request, reply)
    if (!caller) return reply
    const [administrator, accounts] = await Promise.all([
      isInstallationAdministrator(caller.accountId),
      Promise.all(LISTED_PROVIDERS.map(async (provider): Promise<Connection> => {
        const { mine, shared } = await modelAccounts.connection(caller.accountId, provider)
        return { provider, mine: mine !== null, kind: mine, shared }
      })),
    ])
    return { administrator, accounts }
  })

  // A key the person pastes becomes their own `api_key` row, sealed. The key is never sent back.
  app.put<{ Params: { provider: string }; Body: { key: string } }>('/api/control/model-accounts/:provider/api-key', {
    schema: { body: { type: 'object', additionalProperties: false, required: ['key'], properties: { key: { type: 'string', maxLength: 512 } } } },
  }, async (request, reply) => {
    const caller = await admit(request, reply)
    if (!caller) return reply
    const shape = Object.hasOwn(API_KEY_SHAPES, request.params.provider) ? API_KEY_SHAPES[request.params.provider] : undefined
    if (!shape) return sendProblem(reply, 404, 'model-account-provider-unknown', 'No API key accounts for this provider')
    const key = request.body.key.trim()
    if (!shape.test(key)) return sendProblem(reply, 400, 'model-account-key-refused', 'This is not an API key for this provider')
    await modelAccounts.write(caller.accountId, request.params.provider, 'api_key', key)
    return reply.code(204).send()
  })

  const claudeLogin = createClaudeLogin<Caller>({
    writeCredential: ({ accountId }, tokens) => modelAccounts.write(accountId, ANTHROPIC_PROVIDER, 'oauth', serializeClaudeTokens(tokens)),
    ...(claudeAuthorization ? { authorization: claudeAuthorization } : {}),
  })
  const claudeBase = `/api/control/model-accounts/${ANTHROPIC_PROVIDER}/oauth`
  app.post(`${claudeBase}/start`, async (request, reply) => {
    const caller = await admit(request, reply)
    if (!caller) return reply
    return claudeLogin.start(caller).then(
      ({ expiresAt, ...handoff }) => ({ ...handoff, expiresAt: new Date(expiresAt).toISOString() }),
      () => sendProblem(reply, 503, 'model-login-unavailable', 'Sign-in is unavailable'),
    )
  })
  app.post<{ Body: { loginId: string; code: string } }>(`${claudeBase}/complete`, {
    schema: {
      body: {
        type: 'object', additionalProperties: false, required: ['loginId', 'code'],
        properties: { loginId: { type: 'string', pattern: LOGIN_ID.source }, code: { type: 'string', minLength: 1, maxLength: 4096 } },
      },
    },
  }, async (request, reply) => {
    const caller = await admit(request, reply)
    if (!caller) return reply
    return { state: await claudeLogin.complete(caller, request.body.loginId, request.body.code) }
  })

  const codexLogin = createCodexLogin<Caller>({
    writeCredential: ({ accountId }, tokens) => modelAccounts.write(accountId, OPENAI_CODEX_PROVIDER, 'oauth', serializeCodexTokens(tokens)),
    ...(openaiCodexDevice ? { device: openaiCodexDevice } : {}),
  })
  const codexBase = `/api/control/model-accounts/${OPENAI_CODEX_PROVIDER}/oauth`
  app.post(`${codexBase}/start`, async (request, reply) => {
    const caller = await admit(request, reply)
    if (!caller) return reply
    return codexLogin.start(caller).then(
      ({ expiresAt, ...handoff }) => ({ ...handoff, expiresAt: new Date(expiresAt).toISOString() }),
      () => sendProblem(reply, 503, 'model-login-unavailable', 'Sign-in is unavailable'),
    )
  })
  app.get<{ Querystring: { loginId?: string } }>(`${codexBase}/poll`, {
    schema: { querystring: { type: 'object', additionalProperties: false, properties: { loginId: { type: 'string', maxLength: 64 } } } },
  }, async (request, reply) => {
    const caller = await admit(request, reply)
    if (!caller) return reply
    return { state: await codexLogin.poll(caller, request.query.loginId ?? '') }
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
