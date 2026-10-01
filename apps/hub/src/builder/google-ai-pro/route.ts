import { createGoogleThinkingMiddleware } from '@mastra/code-sdk/providers/google-thinking'
import { ModelsDevGateway } from '@mastra/core/llm'
import type { LanguageModelMiddleware } from 'ai'
import { wrapGatewayModel, type ModelRoute } from '../model-routing.js'
import { GOOGLE_AI_PRO_PROVIDER, parseKey, type GoogleAiProKey } from './credential.js'

/** The provider Mastra's models.dev gateway builds Gemini's own API client for. */
const GOOGLE_PROVIDER = 'google'

/**
 * Asks Gemini to return its thinking text, which `@ai-sdk/google` reads from
 * `providerOptions.google.thinkingConfig.includeThoughts`. Mastra Code's middleware sets only the
 * level, so this runs after it and adds the flag to the config it left; a call with no thinking
 * config (thinking off, or a model without it) stays as it was.
 */
const includeThoughts: LanguageModelMiddleware = {
  specificationVersion: 'v3',
  transformParams: async ({ params }) => {
    const google = params.providerOptions?.google
    if (!google || typeof google.thinkingConfig !== 'object' || google.thinkingConfig === null) return params
    return { ...params, providerOptions: { ...params.providerOptions, google: { ...google, thinkingConfig: { ...google.thinkingConfig, includeThoughts: true } } } }
  },
}

/**
 * Mastra's models.dev gateway with its Google base URL pinned to the Hub's Google AI Pro router, so
 * the provider's `GOOGLE_BASE_URL` override can never send a person's call elsewhere.
 */
class GoogleAiProGateway extends ModelsDevGateway {
  readonly #url: string
  constructor(url: string) {
    super()
    this.#url = url
  }
  override buildUrl(): string {
    return this.#url
  }
}

/**
 * The `google-ai-pro/*` route: Mastra's own Google provider on Gemini's API (`/v1beta`), through the
 * Hub's router to the person's CLIProxy, with the person's credential as the key the router swaps
 * for that proxy's. The call's thinking level goes as Mastra Code sets it for each Gemini family
 * (`createGoogleThinkingMiddleware`), with the thinking text asked for in the request. The router exists only when the Hub runs CLIProxyAPI.
 */
export const createGoogleAiProRoute = ({ routerUrl, track }: Readonly<{
  routerUrl(): Promise<string | undefined>
  /** Ties the key to its row, so a refresh the proxy makes is written back (write-back.ts). */
  track(key: GoogleAiProKey, modelAccountId: string): void
}>): ModelRoute => Object.freeze({
  accountProvider: GOOGLE_AI_PRO_PROVIDER,
  take: (account) => {
    const key = parseKey(account.secret)
    if (!key) throw new Error('GOOGLE_AI_PRO_STORED_RECORD_REFUSED')
    track(key, account.modelAccountId)
    return {
      modelProvider: GOOGLE_AI_PRO_PROVIDER,
      model: async (modelName, thinkingLevel) => {
        const url = await routerUrl()
        if (!url) throw new Error('BUILDER_MODEL_NOT_SELECTED')
        return wrapGatewayModel(
          await new GoogleAiProGateway(`${url}/v1beta`).resolveLanguageModel({ providerId: GOOGLE_PROVIDER, modelId: modelName, apiKey: key }),
          [createGoogleThinkingMiddleware(modelName, thinkingLevel), includeThoughts],
        )
      },
    }
  },
})
