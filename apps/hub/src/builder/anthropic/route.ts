import { createAnthropicThinkingMiddleware, opencodeClaudeMaxProvider, promptCacheMiddleware } from '@mastra/code-sdk/providers/claude-max'
import type { ThinkingLevelSetting } from '@mastra/code-sdk/thinking'
import { ModelsDevGateway, type MastraModelConfig } from '@mastra/core/llm'
import type { HeldAccount } from '../model-account/accounts.js'
import { MODEL_PROVIDERS, type Credential, type ClaudeTokens } from '../model-account/providers.js'
import { wrapGatewayModel, type ModelRoute } from '../model-routing.js'
import type { TokenHolds } from '../oauth-holds.js'
import { heldClaudeCredentials } from './credential.js'

type AnthropicAccount = HeldAccount<Extract<Credential, { provider: 'anthropic' }>>
type ModelOf = (modelName: string, thinkingLevel?: ThinkingLevelSetting) => Promise<MastraModelConfig>

const ANTHROPIC_PREFIX = MODEL_PROVIDERS.anthropic.routerPrefix

/**
 * How each kind of Anthropic row reaches `anthropic/<model>`, at the call's thinking level as Mastra
 * Code sets it (`createAnthropicThinkingMiddleware`) and with its prompt cache breakpoints
 * (`promptCacheMiddleware`). A key goes through Mastra's models.dev gateway, the model router's own,
 * under those two middlewares as Mastra Code's own key provider wraps it. A subscription goes
 * through Mastra Code's Claude provider, which applies both itself and sends the subscription
 * bearer with the betas and the identity system message its endpoint requires.
 */
function modelOf(holds: TokenHolds<ClaudeTokens>, held: AnthropicAccount): ModelOf {
  const credential = held.credential
  switch (credential.kind) {
    case 'api_key': return async (modelName, thinkingLevel) => wrapGatewayModel(
      await new ModelsDevGateway().resolveLanguageModel({ providerId: ANTHROPIC_PREFIX, modelId: modelName, apiKey: credential.value }),
      [promptCacheMiddleware, createAnthropicThinkingMiddleware(modelName, thinkingLevel)],
    )
    case 'oauth': {
      const credentials = heldClaudeCredentials(holds.hold(held, credential.value))
      return async (modelName, thinkingLevel) => opencodeClaudeMaxProvider(modelName, { authStorage: credentials, ...thinkingLevel ? { thinkingLevel } : {} })
    }
  }
}

/** The `anthropic/*` route: the caller's Anthropic row pays, whichever kind it is. */
export const createAnthropicRoute = (holds: TokenHolds<ClaudeTokens>): ModelRoute<'anthropic'> => Object.freeze({
  accountProvider: 'anthropic',
  take: (held) => ({ modelProvider: ANTHROPIC_PREFIX, model: modelOf(holds, held) }),
})
