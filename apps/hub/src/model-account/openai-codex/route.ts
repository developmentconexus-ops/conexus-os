import { openaiCodexProvider } from '@mastra/code-sdk/providers/openai-codex'
import { OPENAI_PREFIX, remapOpenAIModelForCodexOAuth } from '@mastra/code-sdk/providers/model-ids'
import type { ThinkingLevelSetting } from '@mastra/code-sdk/thinking'
import type { MastraModelConfig } from '@mastra/core/llm'
import { wrapLanguageModel, type LanguageModelMiddleware } from 'ai'
import type { CodexTokens } from '../credential.js'
import type { CredentialStore, OAuthCredential } from '@mastra/code-sdk/auth/types'
import { currentCredential, type NativeCredentialAccess } from '../refresh.js'
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

function isRecord(value: unknown): value is object { return typeof value === 'object' && value !== null }

function isLanguageModel(model: object): model is LanguageModelV3 { return 'specificationVersion' in model && model.specificationVersion === 'v3'
  && 'provider' in model && typeof model.provider === 'string'
  && 'modelId' in model && typeof model.modelId === 'string'
  && 'supportedUrls' in model && isRecord(model.supportedUrls)
  && 'doGenerate' in model && typeof model.doGenerate === 'function'
  && 'doStream' in model && typeof model.doStream === 'function' }

/**
 * Mastra's Codex provider is typed as a model config but builds an AI SDK model; a config would be a bug there.
 */
function languageModelOf(model: MastraModelConfig): LanguageModelV3 {
  if (typeof model !== 'object' || !isLanguageModel(model)) throw new Failure('OPENAI_CODEX_MODEL_REFUSED')
  return model
}

/**
 * An `openai/*` model on a ChatGPT subscription: Mastra Code's Codex provider over the person's own
 * held row, at the call's thinking level as its `reasoningEffort` (Mastra Code's own mapping, which
 * reads no level as medium), the Codex id remap Mastra Code applies.
 */
function openaiCodexModel(modelName: string, thinkingLevel: ThinkingLevelSetting | undefined, tokens: CodexTokens, current: () => Promise<CodexTokens>) { return wrapLanguageModel({
    model: languageModelOf(openaiCodexProvider(remapOpenAIModelForCodexOAuth(`${OPENAI_PREFIX}${modelName}`).substring(OPENAI_PREFIX.length), {
      authStorage: heldCodexCredentials(tokens, current),
      ...thinkingLevel ? { thinkingLevel } : {},
    })),
    middleware: [builderCodexOptions],
  }) }

async function currentCodex(access: NativeCredentialAccess): Promise<CodexTokens> {
  const credential = await currentCredential(access)
  if (credential.provider !== 'openai-codex') throw new Failure('BUILDER_MODEL_NOT_SELECTED')
  return credential.value
}

function nativeCodexRecord({ email, ...tokens }: CodexTokens): OAuthCredential {
  return { type: 'oauth', ...tokens, ...email === null ? {} : { email } }
}

function heldCodexCredentials(initial: CodexTokens, current: () => Promise<CodexTokens>): CredentialStore {
  return Object.freeze({
    allowEnvironmentFallback: false,
    reload: () => undefined,
    get: (provider: string) => provider === 'openai-codex' ? nativeCodexRecord(initial) : undefined,
    getStoredApiKey: () => undefined,
    getApiKey: async () => (await current()).access,
    getOAuthCredential: async () => nativeCodexRecord(await current()),
  })
}

export function codexModel({ access, tokens, modelName }: Readonly<{ access: NativeCredentialAccess; tokens: CodexTokens; modelName: string }>): MastraModelConfig {
  return openaiCodexModel(modelName, access.thinkingLevel ?? undefined, tokens, () => currentCodex(access))
}
