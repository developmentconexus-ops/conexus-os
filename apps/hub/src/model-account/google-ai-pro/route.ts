import type { GoogleAiProKey } from '../credential.js'
import { createGoogleThinkingMiddleware } from '@mastra/code-sdk/providers/google-thinking'
import { ModelsDevGateway } from '@mastra/core/llm'
import type { LanguageModelMiddleware } from 'ai'
import type { NativeCredentialAccess } from '../refresh.js'
import { wrapGatewayModel } from '../models.js'
import { Failure } from '../../platform/failure.js'

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
export async function googleAiProModel({ access, modelName, routerUrl, track }: Readonly<{
  access: NativeCredentialAccess
  modelName: string
  routerUrl: string | null
  track(key: GoogleAiProKey, access: NativeCredentialAccess): void
}>) {
  const credential = access.held.credential
  if (credential.provider !== 'google-ai-pro' || !routerUrl) throw new Failure('BUILDER_MODEL_NOT_SELECTED')
  const key = credential.value
  track(key, access)
  return wrapGatewayModel(
    await new GoogleAiProGateway(`${routerUrl}/v1beta`).resolveLanguageModel({ providerId: GOOGLE_PROVIDER, modelId: modelName, apiKey: key }),
    [createGoogleThinkingMiddleware(modelName, access.thinkingLevel ?? undefined), includeThoughts],
  )
}
