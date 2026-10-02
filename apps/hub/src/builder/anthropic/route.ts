import { createAnthropicThinkingMiddleware, opencodeClaudeMaxProvider, promptCacheMiddleware } from '@mastra/code-sdk/providers/claude-max'
import type { ThinkingLevelSetting } from '@mastra/code-sdk/thinking'
import { ModelsDevGateway, type MastraModelConfig } from '@mastra/core/llm'
import type { HeldModelAccount, ModelAccountKind } from '../model-account-store.js'
import { wrapGatewayModel, type ModelRoute } from '../model-routing.js'
import type { TokenHolds } from '../oauth-holds.js'
import { ANTHROPIC_PROVIDER, heldClaudeCredentials, parseClaudeTokens, type ClaudeTokens } from './credential.js'

type AnthropicKind = Extract<ModelAccountKind, 'api_key' | 'oauth'>
type ModelOf = (modelName: string, thinkingLevel?: ThinkingLevelSetting) => Promise<MastraModelConfig>

/**
 * How each kind of Anthropic row reaches `anthropic/<model>`, at the call's thinking level as Mastra
 * Code sets it (`createAnthropicThinkingMiddleware`) and with its prompt cache breakpoints
 * (`promptCacheMiddleware`). A key goes through Mastra's models.dev gateway, the model router's own,
 * under those two middlewares as Mastra Code's own key provider wraps it. A subscription goes
 * through Mastra Code's Claude provider, which applies both itself and sends the subscription
 * bearer with the betas and the identity system message its endpoint requires.
 */
const modelOfKind = (holds: TokenHolds<ClaudeTokens>): Readonly<Record<AnthropicKind, (account: HeldModelAccount) => ModelOf>> => ({
  api_key: (account) => async (modelName, thinkingLevel) => wrapGatewayModel(
    await new ModelsDevGateway().resolveLanguageModel({ providerId: ANTHROPIC_PROVIDER, modelId: modelName, apiKey: account.secret }),
    [promptCacheMiddleware, createAnthropicThinkingMiddleware(modelName, thinkingLevel)],
  ),
  oauth: (account) => {
    const credentials = heldClaudeCredentials(holds.hold(account.modelAccountId, parseClaudeTokens(account.secret)))
    return async (modelName, thinkingLevel) => opencodeClaudeMaxProvider(modelName, { authStorage: credentials, ...thinkingLevel ? { thinkingLevel } : {} })
  },
})

const isAnthropicKind = (kind: ModelAccountKind): kind is AnthropicKind => kind === 'api_key' || kind === 'oauth'

/** The `anthropic/*` route: the caller's Anthropic row pays, whichever kind it is. */
export const createAnthropicRoute = (holds: TokenHolds<ClaudeTokens>): ModelRoute => {
  const byKind = modelOfKind(holds)
  return Object.freeze({
    accountProvider: ANTHROPIC_PROVIDER,
    take: (account) => {
      if (!isAnthropicKind(account.kind)) throw new Error('ANTHROPIC_STORED_RECORD_REFUSED')
      return { modelProvider: ANTHROPIC_PROVIDER, model: byKind[account.kind](account) }
    },
  })
}
