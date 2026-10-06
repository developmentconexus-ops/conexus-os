import { createAnthropicThinkingMiddleware } from '@mastra/code-sdk/providers/claude-max'
import { resolveGoogleThinkingConfig } from '@mastra/code-sdk/providers/google-thinking'
import { getEffectiveThinkingLevel, THINKING_LEVEL_TO_REASONING_EFFORT } from '@mastra/code-sdk/providers/openai-codex'
import { getAvailableThinkingLevelsForModel, THINKING_LEVEL_VALUES, type ThinkingLevelSetting } from '@mastra/code-sdk/thinking'
import { getProviderConfig } from '@mastra/core/llm'
import type { FastifyInstance } from 'fastify'
import {
  MDL01, MDL02, MDL03, MDL04, MDL05, MDL06, MDL07, MDL08, MDL09, MDL10, MDL11,
  ModelLoginId, type AccountId, type ModelAccountProvider, type OfferedModel,
} from '../../../../packages/contract/dist/index.js'
import { Failure } from '../platform/failure.js'
import { serializeClaudeTokens } from './anthropic/credential.js'
import { createClaudeLogin, type ClaudeAuthorization } from './anthropic/login.js'
import { createGoogleAiProLogin } from './google-ai-pro/login.js'
import type { CliproxyPool } from './google-ai-pro/pool.js'
import type { ModelAccounts } from './model-account/accounts.js'
import { MODEL_PROVIDERS, type RouterPrefix } from './model-account/providers.js'
import { serializeCodexTokens } from './openai-codex/credential.js'
import { createCodexLogin, type CodexDevice } from './openai-codex/login.js'
import { routes } from '../http/access.js'

type Caller = Readonly<{ accountId: AccountId }>
type Offer = readonly OfferedModel[]

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

// Mastra's model router catalog lists every model of a provider, and Mastra Code offers all of them
// on a subscription. The catalog carries no capability field, so the ones that cannot chat are
// left out by name, as the Hub did for the Factory catalog, with the retired ones the catalog marks.
const NON_CHAT_MODEL = /(^|[-_.])(image|dall-?e|embed|embedding|tts|whisper|transcribe|realtime|rerank|moderation)([-_.]|$)/i
const chatModelsOf = (provider: RouterPrefix): readonly string[] => {
  const catalog = getProviderConfig(provider)
  const retired = new Set(catalog?.deprecatedModels ?? [])
  return (catalog?.models ?? []).filter((model) => !retired.has(model) && !NON_CHAT_MODEL.test(model))
}

/** What Mastra Code's Claude middleware writes into the request's Anthropic options for a level; nothing when it writes none. */
const anthropicSetting = async (model: string, level: ThinkingLevelSetting): Promise<unknown> => {
  const middleware = createAnthropicThinkingMiddleware(model, level)
  if (!middleware?.transformParams) return undefined
  const unused = (): never => { throw new Failure('MODEL_ACCOUNT_PROBE_NOT_CALLABLE') }
  const call: Parameters<NonNullable<typeof middleware.transformParams>>[0] = {
    type: 'stream',
    params: { prompt: [], providerOptions: {} },
    model: { specificationVersion: 'v3', provider: MODEL_PROVIDERS.anthropic.routerPrefix, modelId: model, supportedUrls: {}, doGenerate: unused, doStream: unused },
  }
  return (await middleware.transformParams(call)).providerOptions?.anthropic
}


function offerOf(provider: ModelAccountProvider, models: readonly string[], optionAt: (model: string, level: ThinkingLevelSetting) => unknown): Promise<Offer> {
  const { name, routerPrefix } = MODEL_PROVIDERS[provider]
  return Promise.all(models.map(async (model) => ({
    id: `${routerPrefix}/${model}`, provider: routerPrefix, providerName: name, modelName: model,
    thinkingLevels: [...await thinkingLevelsOf(`${routerPrefix}/${model}`, (level) => optionAt(model, level))],
  })))
}

const OFFERS = {
  'google-ai-pro': () => offerOf('google-ai-pro', MODEL_PROVIDERS['google-ai-pro'].models, resolveGoogleThinkingConfig),
  'openai-codex': () => offerOf('openai-codex', chatModelsOf(MODEL_PROVIDERS['openai-codex'].routerPrefix), (model, level) => THINKING_LEVEL_TO_REASONING_EFFORT[getEffectiveThinkingLevel(model, level)]),
  anthropic: () => offerOf('anthropic', chatModelsOf(MODEL_PROVIDERS.anthropic.routerPrefix), anthropicSetting),
} satisfies Record<ModelAccountProvider, () => Promise<Offer>>

const OFFER_ORDER = ['google-ai-pro', 'openai-codex', 'anthropic'] as const satisfies readonly ModelAccountProvider[]

const LISTED_PROVIDERS = ['openai-codex', 'anthropic'] as const satisfies readonly ModelAccountProvider[]

/**
 * Model accounts on the Builder's own tables (spec 0002): Google AI Pro, the ChatGPT subscription,
 * and Anthropic by key or by Claude subscription. Sharing and the defaults screen are the rest of
 * slice 5.
 */
export const registerModelAccountRoutes = async (app: FastifyInstance, { modelAccounts, defaultThinkingLevel, openaiCodexDevice, claudeAuthorization, googleAiPro }: Readonly<{
  modelAccounts: Pick<ModelAccounts, 'standing' | 'write' | 'connect'>
  defaultThinkingLevel: ThinkingLevelSetting
  // OpenAI's device-code endpoints; only tests replace them.
  openaiCodexDevice?: CodexDevice
  // Anthropic's authorization endpoints; only tests replace them.
  claudeAuthorization?: ClaudeAuthorization
  // Present when the Hub runs CLIProxyAPI; then a person signs in to Google AI Pro from Settings.
  googleAiPro?: Pick<CliproxyPool, 'startLogin'>
}>): Promise<readonly ['MDL-01', 'MDL-02', 'MDL-03', 'MDL-04', 'MDL-05', 'MDL-06', 'MDL-07', 'MDL-08', 'MDL-09', 'MDL-10', 'MDL-11']> => {
  const route = routes(app)
  const claudeLogin = createClaudeLogin<Caller>({
    connect: ({ accountId }, tokens) => modelAccounts.connect({ accountId, credential: { provider: 'anthropic', kind: 'oauth' }, secret: serializeClaudeTokens(tokens) }),
    ...(claudeAuthorization ? { authorization: claudeAuthorization } : {}),
  })
  const codexLogin = createCodexLogin<Caller>({
    connect: ({ accountId }, tokens) => modelAccounts.connect({ accountId, credential: { provider: 'openai-codex', kind: 'oauth' }, secret: serializeCodexTokens(tokens) }),
    ...(openaiCodexDevice ? { device: openaiCodexDevice } : {}),
  })
  const googleLogin = googleAiPro && createGoogleAiProLogin<Caller>({
    pool: googleAiPro,
    connect: ({ accountId }, key) => modelAccounts.connect({ accountId, credential: { provider: 'google-ai-pro', kind: 'google_ai_pro' }, secret: key }),
  })
  const google = (): NonNullable<typeof googleLogin> => {
    if (!googleLogin) throw new Failure('MODEL_LOGIN_UNAVAILABLE')
    return googleLogin
  }
  const unavailable = (error: unknown): never => { throw new Failure('MODEL_LOGIN_UNAVAILABLE', { cause: error }) }

  route.operation(MDL01, async ({ query }, session) => {
    const standing = await modelAccounts.standing(session.account.accountId)
    const usable = (provider: ModelAccountProvider): boolean =>
      standing[provider].shared || (query.scope !== 'installation' && standing[provider].own.state === 'connected')
    const offering = OFFER_ORDER.filter((provider) => usable(provider) && (provider !== 'google-ai-pro' || googleLogin))
    return { models: (await Promise.all(offering.map((provider) => OFFERS[provider]()))).flat(), defaultThinkingLevel }
  })

  // The caller's accounts for the providers this Hub signs in to, never their secrets.
  route.operation(MDL02, async (_input, session) => {
    const standing = await modelAccounts.standing(session.account.accountId)
    return { accounts: LISTED_PROVIDERS.map((provider) => ({ provider, providerName: MODEL_PROVIDERS[provider].name, ...standing[provider] })) }
  })

  // A key the person pastes becomes their own `api_key` row, sealed. The key is never sent back.
  route.operation(MDL03, async ({ params, body }, session) => {
    if (!MODEL_PROVIDERS[params.provider].keyShape.test(body.key)) throw new Failure('MODEL_ACCOUNT_KEY_REFUSED')
    await modelAccounts.write({ accountId: session.account.accountId, credential: { provider: params.provider, kind: 'api_key' }, secret: body.key })
    return undefined
  })

  route.operation(MDL04, async (_input, session) => claudeLogin.start(session.account).then(
    ({ expiresAt, ...handoff }) => ({ ...handoff, expiresAt: new Date(expiresAt).toISOString() }), unavailable))
  route.operation(MDL05, async ({ body }, session) => ({ state: await claudeLogin.complete(session.account, body.loginId, body.code) }))

  route.operation(MDL06, async (_input, session) => codexLogin.start(session.account).then(
    ({ expiresAt, ...handoff }) => ({ ...handoff, expiresAt: new Date(expiresAt).toISOString() }), unavailable))
  route.operation(MDL07, async ({ query }, session) => {
    const loginId = ModelLoginId.safeParse(query.loginId)
    return { state: loginId.success ? await codexLogin.poll(session.account, loginId.data) : 'expired' as const }
  })

  route.operation(MDL08, async (_input, session) => {
    google()
    const { own, shared } = (await modelAccounts.standing(session.account.accountId))['google-ai-pro']
    return { own, shared }
  })
  route.operation(MDL09, async (_input, session) => google().start(session.account))
  route.operation(MDL10, async ({ body }, session) => ({ state: await google().complete(session.account, body.loginId, body.callbackUrl) }))
  route.operation(MDL11, async ({ params }, session) => ({ state: await google().status(session.account, params.loginId) }))

  return ['MDL-01', 'MDL-02', 'MDL-03', 'MDL-04', 'MDL-05', 'MDL-06', 'MDL-07', 'MDL-08', 'MDL-09', 'MDL-10', 'MDL-11']
}
