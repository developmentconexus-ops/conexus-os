import { openaiCodexProvider } from '@mastra/code-sdk/providers/openai-codex'
import { OPENAI_PREFIX, remapOpenAIModelForCodexOAuth } from '@mastra/code-sdk/providers/model-ids'
import type { MastraModelConfig } from '@mastra/core/llm'
import { wrapLanguageModel, type LanguageModelMiddleware } from 'ai'
import { createModelStreamRecorder } from '../model-stream-recorder.js'
import type { ModelRoute } from '../model-routing.js'
import type { TokenHolds } from '../oauth-holds.js'
import { heldCodexCredentials, OPENAI_CODEX_PROVIDER, OPENAI_MODEL_PROVIDER, parseCodexTokens, type CodexTokens } from './credential.js'

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

/** Mastra's Codex provider is typed as a model config but builds an AI SDK model; a config would be a bug there. */
const languageModelOf = (model: MastraModelConfig): LanguageModelV3 => {
  if (typeof model !== 'object' || !('doStream' in model)) throw new Error('OPENAI_CODEX_MODEL_REFUSED')
  return model as LanguageModelV3
}

/**
 * An `openai/*` model on a ChatGPT subscription: Mastra Code's Codex provider over the person's own
 * held row, the Codex id remap Mastra Code applies, and with `streamRecordDir` each call's stream recorded.
 */
const openaiCodexModel = (modelName: string, tokens: CodexTokens, current: () => Promise<CodexTokens>, streamRecordDir?: string) =>
  wrapLanguageModel({
    model: languageModelOf(openaiCodexProvider(remapOpenAIModelForCodexOAuth(`${OPENAI_PREFIX}${modelName}`).substring(OPENAI_PREFIX.length), {
      authStorage: heldCodexCredentials(tokens, current),
    })),
    middleware: [builderCodexOptions, ...streamRecordDir ? [createModelStreamRecorder(streamRecordDir)] : []],
  })

/** The `openai/*` route: the caller's ChatGPT row pays. Called from the Hub; the token never leaves it. */
export const createOpenAICodexRoute = (holds: TokenHolds<CodexTokens>, streamRecordDir?: string): ModelRoute => Object.freeze({
  accountProvider: OPENAI_CODEX_PROVIDER,
  take: (account) => {
    const tokens = parseCodexTokens(account.secret)
    const current = holds.hold(account.modelAccountId, tokens)
    return { modelProvider: OPENAI_MODEL_PROVIDER, model: async (modelName) => openaiCodexModel(modelName, tokens, current, streamRecordDir) }
  },
})
