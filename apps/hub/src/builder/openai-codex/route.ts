import { openaiCodexProvider } from '@mastra/code-sdk/providers/openai-codex'
import { OPENAI_PREFIX, remapOpenAIModelForCodexOAuth } from '@mastra/code-sdk/providers/model-ids'
import type { ThinkingLevelSetting } from '@mastra/code-sdk/thinking'
import type { MastraModelConfig } from '@mastra/core/llm'
import { wrapLanguageModel, type LanguageModelMiddleware } from 'ai'
import type { ModelRoute } from '../model-routing.js'
import type { TokenHolds } from '../oauth-holds.js'
import { heldCodexCredentials, OPENAI_CODEX_PROVIDER, OPENAI_MODEL_PROVIDER, parseCodexTokens, type CodexTokens } from './credential.js'
import { Failure } from '../../platform/failure.js'

/**
 * What the Builder asks of the Codex call on top of Mastra Code's provider. The Builder caps every
 * call's output (`BUILDER_MAX_OUTPUT_TOKENS`), but the Codex endpoint is reported not to accept
 * `max_output_tokens` on a ChatGPT account, so it never leaves the Hub (Mastra's provider would send
 * it); the call's time budget bounds the step instead. `reasoningSummary: 'auto'` makes the model
 * return the reasoning text the Builder shows. This runs before Mastra's own options, which keep it.
 */
const builderCodexOptions: LanguageModelMiddleware = {
  specificationVersion: 'v3',
  transformParams: async ({ params }) => {
    delete params.maxOutputTokens
    params.providerOptions = { ...params.providerOptions, openai: { ...params.providerOptions?.openai ?? {}, reasoningSummary: 'auto' } }
    return params
  },
}

type LanguageModelV3 = Parameters<typeof wrapLanguageModel>[0]['model']

const isRecord = (value: unknown): value is object => typeof value === 'object' && value !== null

const isLanguageModel = (model: object): model is LanguageModelV3 =>
  'specificationVersion' in model && model.specificationVersion === 'v3'
  && 'provider' in model && typeof model.provider === 'string'
  && 'modelId' in model && typeof model.modelId === 'string'
  && 'supportedUrls' in model && isRecord(model.supportedUrls)
  && 'doGenerate' in model && typeof model.doGenerate === 'function'
  && 'doStream' in model && typeof model.doStream === 'function'

/**
 * Mastra's Codex provider is typed as a model config but builds an AI SDK model; a config would be a bug there.
 * @public Tests call it through the built Hub.
 */
export const languageModelOf = (model: MastraModelConfig): LanguageModelV3 => {
  if (typeof model !== 'object' || !isLanguageModel(model)) throw new Failure('OPENAI_CODEX_MODEL_REFUSED')
  return model
}

/**
 * An `openai/*` model on a ChatGPT subscription: Mastra Code's Codex provider over the person's own
 * held row, at the call's thinking level as its `reasoningEffort` (Mastra Code's own mapping, which
 * reads no level as medium), the Codex id remap Mastra Code applies.
 */
const openaiCodexModel = (modelName: string, thinkingLevel: ThinkingLevelSetting | undefined, tokens: CodexTokens, current: () => Promise<CodexTokens>) =>
  wrapLanguageModel({
    model: languageModelOf(openaiCodexProvider(remapOpenAIModelForCodexOAuth(`${OPENAI_PREFIX}${modelName}`).substring(OPENAI_PREFIX.length), {
      authStorage: heldCodexCredentials(tokens, current),
      ...thinkingLevel ? { thinkingLevel } : {},
    })),
    middleware: [builderCodexOptions],
  })

/** The `openai/*` route: the caller's ChatGPT row pays. Called from the Hub; the token never leaves it. */
export const createOpenAICodexRoute = (holds: TokenHolds<CodexTokens>): ModelRoute => Object.freeze({
  accountProvider: OPENAI_CODEX_PROVIDER,
  take: (account) => {
    const tokens = parseCodexTokens(account.secret)
    const current = holds.hold(account.modelAccountId, tokens)
    return { modelProvider: OPENAI_MODEL_PROVIDER, model: async (modelName, thinkingLevel) => openaiCodexModel(modelName, thinkingLevel, tokens, current) }
  },
})
