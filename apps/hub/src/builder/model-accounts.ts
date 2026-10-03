import { createAnthropicThinkingMiddleware } from '@mastra/code-sdk/providers/claude-max'
import { resolveGoogleThinkingConfig } from '@mastra/code-sdk/providers/google-thinking'
import { getEffectiveThinkingLevel, THINKING_LEVEL_TO_REASONING_EFFORT } from '@mastra/code-sdk/providers/openai-codex'
import { getAvailableThinkingLevelsForModel, THINKING_LEVEL_VALUES, type ThinkingLevelSetting } from '@mastra/code-sdk/thinking'
import type { AvailableModel } from '@mastra/core/agent-controller'
import { getProviderConfig } from '@mastra/core/llm'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { DEFAULT_THINKING_LEVEL } from './harness/request-context.js'
import { Failure } from '../platform/failure.js'
import { ANTHROPIC_KEY_SHAPE, ANTHROPIC_PROVIDER, serializeClaudeTokens } from './anthropic/credential.js'
import { createClaudeLogin, type ClaudeAuthorization } from './anthropic/login.js'
import type { AccountId, ResolveCurrentSession } from '../identity-access/current-session.js'
import { GOOGLE_AI_PRO_MODELS, GOOGLE_AI_PRO_PROVIDER } from './google-ai-pro/credential.js'
import { createGoogleAiProLogin } from './google-ai-pro/login.js'
import type { CliproxyPool } from './google-ai-pro/pool.js'
import type { GoogleAiProAccounts } from './google-ai-pro/store.js'
import type { ModelAccountKind, ModelAccountStore } from './model-account-store.js'
import { OPENAI_CODEX_PROVIDER, OPENAI_MODEL_PROVIDER, serializeCodexTokens } from './openai-codex/credential.js'
import { createCodexLogin, type CodexDevice } from './openai-codex/login.js'
import { isExactOrigin } from '../platform/origin.js'

const CSRF_COOKIE = '__Host-conexus_csrf'
const header = (value: string | string[] | undefined): string | undefined => Array.isArray(value) ? value[0] : value
const LOGIN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

type Caller = Readonly<{ accountId: AccountId }>
/** `thinkingLevels`: the levels the composer offers for the model, lowest first; none when it has no thinking. */
type OfferedModel = Readonly<Pick<AvailableModel, 'id' | 'provider' | 'modelName' | 'hasApiKey'> & { providerName: string; thinkingLevels: readonly ThinkingLevelSetting[] }>
type Offer = readonly Omit<OfferedModel, 'hasApiKey'>[]

/**
 * The name a person reads for a provider: Mastra's catalog name, except for the providers the Hub
 * signs in to by subscription, whose catalog name says nothing of how the person pays.
 */
const PROVIDER_NAME_OVERRIDES: Readonly<Record<string, string>> = Object.freeze({
  [ANTHROPIC_PROVIDER]: 'Anthropic (Claude)',
  [OPENAI_CODEX_PROVIDER]: 'OpenAI (ChatGPT)',
  [OPENAI_MODEL_PROVIDER]: 'OpenAI (ChatGPT)',
  [GOOGLE_AI_PRO_PROVIDER]: 'Google AI Pro',
})
const providerNameOf = (provider: string): string => PROVIDER_NAME_OVERRIDES[provider] ?? getProviderConfig(provider)?.name ?? provider

const shapeOf = (option: unknown): string => JSON.stringify(option) ?? 'undefined'

/**
 * The levels the composer offers for a model: Mastra Code's own for it
 * (`getAvailableThinkingLevelsForModel`), each kept only when the provider's Mastra Code mapping
 * (`optionAt`) sends a setting that differs from the level below's, so Gemini Flash, which runs
 * `xhigh` and `max` as `high`, offers neither, and `pro-agent`, which has no thinking, offers none.
 * `off` is offered when what Mastra sends for it differs from the lowest level that thinks.
 */
const thinkingLevelsOf = async (modelId: string, optionAt: (level: ThinkingLevelSetting) => unknown): Promise<readonly ThinkingLevelSetting[]> => {
  const available: readonly string[] = getAvailableThinkingLevelsForModel(modelId)
  const levels: ThinkingLevelSetting[] = []
  let below: string | undefined
  for (const level of THINKING_LEVEL_VALUES.filter((each) => each !== 'off' && available.includes(each))) {
    const option = await optionAt(level)
    if (option === undefined) continue
    const shape = shapeOf(option)
    if (shape !== below) levels.push(level)
    below = shape
  }
  const [lowest] = levels
  if (lowest && available.includes('off') && shapeOf(await optionAt('off')) !== shapeOf(await optionAt(lowest))) levels.unshift('off')
  return Object.freeze(levels)
}

// Every offer's `modelName` is the bare model id, as Mastra's AvailableModel documents it; the web's humanizeModelName is the one place that makes it readable.
/** The Google AI Pro models, by the id a thread's model selection stores and a run resolves. */
const googleAiProOffer = (): Promise<Offer> => Promise.all(GOOGLE_AI_PRO_MODELS.map(async (model) => Object.freeze({
  id: `${GOOGLE_AI_PRO_PROVIDER}/${model}`, provider: GOOGLE_AI_PRO_PROVIDER, providerName: providerNameOf(GOOGLE_AI_PRO_PROVIDER), modelName: model,
  thinkingLevels: await thinkingLevelsOf(`${GOOGLE_AI_PRO_PROVIDER}/${model}`, (level) => resolveGoogleThinkingConfig(model, level)),
})))

// Mastra's model router catalog lists every model of a provider, and Mastra Code offers all of them
// on a subscription. The catalog carries no capability field, so the ones that cannot chat are
// left out by name, as the Hub did for the Factory catalog, with the retired ones the catalog marks.
const NON_CHAT_MODEL = /(^|[-_.])(image|dall-?e|embed|embedding|tts|whisper|transcribe|realtime|rerank|moderation)([-_.]|$)/i
const chatModelsOf = (provider: string): readonly string[] => {
  const catalog = getProviderConfig(provider)
  const retired = new Set(catalog?.deprecatedModels ?? [])
  return (catalog?.models ?? []).filter((model) => !retired.has(model) && !NON_CHAT_MODEL.test(model))
}

/** The ChatGPT subscription's models, by the `openai/<model>` id a thread stores and a run resolves. */
const openaiCodexOffer = (): Promise<Offer> => Promise.all(chatModelsOf(OPENAI_MODEL_PROVIDER).map(async (model) => Object.freeze({
  id: `${OPENAI_MODEL_PROVIDER}/${model}`, provider: OPENAI_MODEL_PROVIDER, providerName: providerNameOf(OPENAI_MODEL_PROVIDER), modelName: model,
  thinkingLevels: await thinkingLevelsOf(`${OPENAI_MODEL_PROVIDER}/${model}`, (level) => THINKING_LEVEL_TO_REASONING_EFFORT[getEffectiveThinkingLevel(model, level)]),
})))

/** What Mastra Code's Claude middleware writes into the request's Anthropic options for a level; nothing when it writes none. */
const anthropicSetting = async (model: string, level: ThinkingLevelSetting): Promise<unknown> => {
  const middleware = createAnthropicThinkingMiddleware(model, level)
  if (!middleware?.transformParams) return undefined
  const unused = (): never => { throw new Failure('MODEL_ACCOUNT_PROBE_NOT_CALLABLE') }
  const call: Parameters<NonNullable<typeof middleware.transformParams>>[0] = {
    type: 'stream',
    params: { prompt: [], providerOptions: {} },
    model: { specificationVersion: 'v3', provider: ANTHROPIC_PROVIDER, modelId: model, supportedUrls: {}, doGenerate: unused, doStream: unused },
  }
  return (await middleware.transformParams(call)).providerOptions?.anthropic
}

/** Both kinds of Anthropic account serve every chat model of Mastra's catalog, by the `anthropic/<model>` id a thread stores and a run resolves. */
const anthropicOffer = (): Promise<Offer> => Promise.all(chatModelsOf(ANTHROPIC_PROVIDER).map(async (model) => Object.freeze({
  id: `${ANTHROPIC_PROVIDER}/${model}`, provider: ANTHROPIC_PROVIDER, providerName: providerNameOf(ANTHROPIC_PROVIDER), modelName: model,
  thinkingLevels: await thinkingLevelsOf(`${ANTHROPIC_PROVIDER}/${model}`, (level) => anthropicSetting(model, level)),
})))

/** The providers a person connects by pasting a key, and the shape each key must have. */
const API_KEY_SHAPES: Readonly<Record<string, RegExp>> = Object.freeze({ [ANTHROPIC_PROVIDER]: ANTHROPIC_KEY_SHAPE })

/** The accounts the Settings screen lists, by `model.model_account` provider. */
const LISTED_PROVIDERS = [OPENAI_CODEX_PROVIDER, ANTHROPIC_PROVIDER] as const

type Connection = Readonly<{ provider: string; providerName: string; mine: boolean; kind: ModelAccountKind | null; shared: boolean }>

/**
 * Model accounts on the Builder's own tables (spec 0002): Google AI Pro, the ChatGPT subscription,
 * and Anthropic by key or by Claude subscription. Sharing and the defaults screen are the rest of
 * slice 5.
 */
// biome-ignore lint/complexity/noExcessiveLinesPerFunction: debt: owning wave
export const registerModelAccountRoutes = async (app: FastifyInstance, { origin, resolveCurrentSession, isInstallationAdministrator, modelAccounts, openaiCodexDevice, claudeAuthorization, googleAiPro, googleAiProAccounts }: Readonly<{
  origin: string
  resolveCurrentSession: ResolveCurrentSession
  isInstallationAdministrator(account: AccountId): Promise<boolean>
  modelAccounts: ModelAccountStore
  // OpenAI's device-code endpoints; only tests replace them.
  openaiCodexDevice?: CodexDevice
  // Anthropic's authorization endpoints; only tests replace them.
  claudeAuthorization?: ClaudeAuthorization
  // Present when the Hub runs CLIProxyAPI; then a person signs in to Google AI Pro from Settings.
  googleAiPro?: Pick<CliproxyPool, 'startLogin'>
  // The Google AI Pro credential's home, `model.model_account`: present exactly when googleAiPro is.
  googleAiProAccounts?: GoogleAiProAccounts
}>): Promise<void> => {
  const admit = async (request: FastifyRequest): Promise<Caller> => {
    if (request.method !== 'GET') {
      const csrf = header(request.headers['x-conexus-csrf'])
      if (!isExactOrigin(request.headers.origin, origin) || !csrf || csrf !== request.cookies[CSRF_COOKIE]) throw new Failure('REQUEST_AUTHENTICITY_DENIED')
    }
    const session = await resolveCurrentSession(request, request.method !== 'GET')
    if (!session) throw new Failure('AUTHENTICATION_REQUIRED')
    return { accountId: session.account.accountId }
  }
  // Offered only to a caller who can use it, own or shared, since a model whose first turn fails is
  // worse than one not offered. With scope=installation, whether the installation shares one.
  const offeredModels = async (accountId: AccountId, scope?: 'installation'): Promise<readonly Omit<OfferedModel, 'hasApiKey'>[]> => {
    const usable = async (provider: string): Promise<boolean> => scope === 'installation'
      ? modelAccounts.hasShared(provider)
      : modelAccounts.connection(accountId, provider).then(({ mine, shared }) => mine !== null || shared)
    const offers: readonly (readonly [string, () => Promise<Offer>])[] = [
      ...(googleAiProAccounts ? [[GOOGLE_AI_PRO_PROVIDER, googleAiProOffer] as const] : []),
      [OPENAI_CODEX_PROVIDER, openaiCodexOffer],
      [ANTHROPIC_PROVIDER, anthropicOffer],
    ]
    return (await Promise.all(offers.map(async ([provider, offer]) => await usable(provider) ? await offer() : []))).flat()
  }
  app.get<{ Querystring: { scope?: 'installation' } }>('/api/control/model-accounts/models', {
    schema: { querystring: { type: 'object', additionalProperties: false, properties: { scope: { type: 'string', enum: ['installation'] } } } },
  }, async (request) => {
    const caller = await admit(request)
    return { models: (await offeredModels(caller.accountId, request.query.scope)).map((model) => ({ ...model, hasApiKey: true })), defaultThinkingLevel: DEFAULT_THINKING_LEVEL }
  })

  // The caller's accounts for the providers this Hub signs in to, never their secrets.
  app.get('/api/control/model-accounts', async (request) => {
    const caller = await admit(request)
    const [administrator, accounts] = await Promise.all([
      isInstallationAdministrator(caller.accountId),
      Promise.all(LISTED_PROVIDERS.map(async (provider): Promise<Connection> => {
        const { mine, shared } = await modelAccounts.connection(caller.accountId, provider)
        return { provider, providerName: providerNameOf(provider), mine: mine !== null, kind: mine, shared }
      })),
    ])
    return { administrator, accounts }
  })

  // A key the person pastes becomes their own `api_key` row, sealed. The key is never sent back.
  app.put<{ Params: { provider: string }; Body: { key: string } }>('/api/control/model-accounts/:provider/api-key', {
    schema: { body: { type: 'object', additionalProperties: false, required: ['key'], properties: { key: { type: 'string', maxLength: 512 } } } },
  }, async (request, reply) => {
    const caller = await admit(request)
    const shape = Object.hasOwn(API_KEY_SHAPES, request.params.provider) ? API_KEY_SHAPES[request.params.provider] : undefined
    if (!shape) throw new Failure('MODEL_ACCOUNT_PROVIDER_UNKNOWN')
    const key = request.body.key.trim()
    if (!shape.test(key)) throw new Failure('MODEL_ACCOUNT_KEY_REFUSED')
    await modelAccounts.write(caller.accountId, request.params.provider, 'api_key', key)
    return reply.code(204).send()
  })

  const claudeLogin = createClaudeLogin<Caller>({
    writeCredential: ({ accountId }, tokens) => modelAccounts.write(accountId, ANTHROPIC_PROVIDER, 'oauth', serializeClaudeTokens(tokens)),
    ...(claudeAuthorization ? { authorization: claudeAuthorization } : {}),
  })
  const claudeBase = `/api/control/model-accounts/${ANTHROPIC_PROVIDER}/oauth`
  app.post(`${claudeBase}/start`, async (request) => {
    const caller = await admit(request)
    return claudeLogin.start(caller).then(
      ({ expiresAt, ...handoff }) => ({ ...handoff, expiresAt: new Date(expiresAt).toISOString() }),
      (error: unknown) => { throw new Failure('MODEL_LOGIN_UNAVAILABLE', { cause: error }) },
    )
  })
  app.post<{ Body: { loginId: string; code: string } }>(`${claudeBase}/complete`, {
    schema: {
      body: {
        type: 'object', additionalProperties: false, required: ['loginId', 'code'],
        properties: { loginId: { type: 'string', pattern: LOGIN_ID.source }, code: { type: 'string', minLength: 1, maxLength: 4096 } },
      },
    },
  }, async (request) => {
    const caller = await admit(request)
    return { state: await claudeLogin.complete(caller, request.body.loginId, request.body.code) }
  })

  const codexLogin = createCodexLogin<Caller>({
    writeCredential: ({ accountId }, tokens) => modelAccounts.write(accountId, OPENAI_CODEX_PROVIDER, 'oauth', serializeCodexTokens(tokens)),
    ...(openaiCodexDevice ? { device: openaiCodexDevice } : {}),
  })
  const codexBase = `/api/control/model-accounts/${OPENAI_CODEX_PROVIDER}/oauth`
  app.post(`${codexBase}/start`, async (request) => {
    const caller = await admit(request)
    return codexLogin.start(caller).then(
      ({ expiresAt, ...handoff }) => ({ ...handoff, expiresAt: new Date(expiresAt).toISOString() }),
      (error: unknown) => { throw new Failure('MODEL_LOGIN_UNAVAILABLE', { cause: error }) },
    )
  })
  app.get<{ Querystring: { loginId?: string } }>(`${codexBase}/poll`, {
    schema: { querystring: { type: 'object', additionalProperties: false, properties: { loginId: { type: 'string', maxLength: 64 } } } },
  }, async (request) => {
    const caller = await admit(request)
    return { state: await codexLogin.poll(caller, request.query.loginId ?? '') }
  })

  if (googleAiPro && googleAiProAccounts) {
    const login = createGoogleAiProLogin<Caller>({
      pool: googleAiPro,
      // The person's own row in model.model_account, sealed. The sign-in settles on a later
      // poll, which carries no write's CSRF, so the Hub writes here.
      writeCredential: ({ accountId }, key) => googleAiProAccounts.write(accountId, key),
    })
    // The Settings card reads the person's own connection and whether one is shared.
    app.get(`/api/control/model-accounts/${GOOGLE_AI_PRO_PROVIDER}/connection`, async (request) => {
      const caller = await admit(request)
      const [{ mine, shared }, administrator] = await Promise.all([
        googleAiProAccounts.connection(caller.accountId),
        isInstallationAdministrator(caller.accountId),
      ])
      return { mine, shared, administrator }
    })
    const base = `/api/control/model-accounts/${GOOGLE_AI_PRO_PROVIDER}/login`
    app.post(`${base}/start`, async (request) => {
      const caller = await admit(request)
      return login.start(caller)
    })
    app.post<{ Body: { loginId: string; callbackUrl: string } }>(`${base}/complete`, {
      schema: {
        body: {
          type: 'object', additionalProperties: false, required: ['loginId', 'callbackUrl'],
          properties: { loginId: { type: 'string', pattern: LOGIN_ID.source }, callbackUrl: { type: 'string', maxLength: 4096 } },
        },
      },
    }, async (request) => {
      const caller = await admit(request)
      return { state: await login.complete(caller, request.body.loginId, request.body.callbackUrl) }
    })
    app.get<{ Params: { loginId: string } }>(`${base}/:loginId`, async (request) => {
      const caller = await admit(request)
      if (!LOGIN_ID.test(request.params.loginId)) return { state: 'expired' }
      return { state: await login.status(caller, request.params.loginId) }
    })
  }
}
