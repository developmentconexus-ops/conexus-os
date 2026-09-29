import type { MastraModelConfig } from '@mastra/core/llm'
import { opencodeClaudeMaxProvider } from '@mastra/code-sdk/providers/claude-max'
import type { HeldModelAccount, ModelAccountKind } from '../model-account-store.js'
import type { ModelRoute } from '../model-routing.js'
import type { TokenHolds } from '../oauth-holds.js'
import { ANTHROPIC_PROVIDER, heldClaudeCredentials, parseClaudeTokens, type ClaudeTokens } from './credential.js'

type AnthropicKind = Extract<ModelAccountKind, 'api_key' | 'oauth'>
type ModelOf = (modelName: string) => Promise<MastraModelConfig>

/**
 * How each kind of Anthropic row reaches `anthropic/<model>`. A key goes through Mastra's model
 * router. A subscription goes through Mastra Code's Claude provider, which sends the subscription
 * bearer with the betas and the identity system message its endpoint requires.
 */
const modelOfKind = (holds: TokenHolds<ClaudeTokens>): Readonly<Record<AnthropicKind, (account: HeldModelAccount) => ModelOf>> => ({
  api_key: (account) => async (modelName) => ({ id: `${ANTHROPIC_PROVIDER}/${modelName}`, apiKey: account.secret }),
  oauth: (account) => {
    const credentials = heldClaudeCredentials(holds.hold(account.modelAccountId, parseClaudeTokens(account.secret)))
    return async (modelName) => opencodeClaudeMaxProvider(modelName, { authStorage: credentials })
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
