import { createAnthropicThinkingMiddleware } from '@mastra/code-sdk/providers/claude-max'
import { resolveGoogleThinkingConfig } from '@mastra/code-sdk/providers/google-thinking'
import { getEffectiveThinkingLevel, THINKING_LEVEL_TO_REASONING_EFFORT } from '@mastra/code-sdk/providers/openai-codex'
import { getAvailableThinkingLevelsForModel, THINKING_LEVEL_VALUES, resolveDefaultThinkingLevel, type ThinkingLevelSetting } from '@mastra/code-sdk/thinking'
import { getProviderConfig, type GatewayLanguageModel, type MastraModelConfig } from '@mastra/core/llm'
import { wrapLanguageModel, type LanguageModelMiddleware } from 'ai'
import type { ModelAccountProvider, OfferedModel } from '@conexus/contract'
import { Failure } from '../platform/failure.js'
import { MODEL_PROVIDERS, type RouterPrefix } from './credential.js'

export const DEFAULT_THINKING_LEVEL = resolveDefaultThinkingLevel({ globalDefault: 'medium', modeDefaults: {} }, 'build').level

type Offer = readonly OfferedModel[]

function shapeOf(option: unknown): string { return JSON.stringify(option) ?? 'undefined' }

/**
 * The levels the composer offers for a model: Mastra Code's own for it
 * (`getAvailableThinkingLevelsForModel`), each kept only when the provider's Mastra Code mapping
 * (`optionAt`) sends a setting that differs from the level below's, so Gemini Flash, which runs
 * `xhigh` and `max` as `high`, offers neither, and `pro-agent`, which has no thinking, offers none.
 * `off` is offered when what Mastra sends for it differs from the lowest level that thinks.
 */
async function thinkingLevelsOf(modelName: string, optionAt: (level: ThinkingLevelSetting) => unknown): Promise<readonly ThinkingLevelSetting[]> {
  const available: readonly string[] = getAvailableThinkingLevelsForModel(modelName)
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
function chatModelsOf(provider: RouterPrefix): readonly string[] {
  const catalog = getProviderConfig(provider)
  const retired = new Set(catalog?.deprecatedModels ?? [])
  return (catalog?.models ?? []).filter((model) => !retired.has(model) && !NON_CHAT_MODEL.test(model))
}

/** What Mastra Code's Claude middleware writes into the request's Anthropic options for a level; nothing when it writes none. */
async function anthropicSetting(model: string, level: ThinkingLevelSetting): Promise<unknown> {
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


export async function offersFor(providers: readonly ModelAccountProvider[]): Promise<readonly OfferedModel[]> {
  return (await Promise.all(OFFER_ORDER.filter((provider) => providers.includes(provider)).map((provider) => OFFERS[provider]()))).flat()
}

export function wrapGatewayModel(model: GatewayLanguageModel, middleware: readonly (LanguageModelMiddleware | undefined)[]): MastraModelConfig {
  if (model.specificationVersion !== 'v3') throw new Failure('BUILDER_GATEWAY_MODEL_REFUSED')
  const applied = middleware.filter((each) => each !== undefined)
  return applied.length ? wrapLanguageModel({ model, middleware: applied }) : model
}
