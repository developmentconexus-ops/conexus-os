import { refreshAnthropicToken } from '@mastra/code-sdk/auth/providers/anthropic'
import type { ClaudeTokens } from '../model-account/providers.js'
import type { CredentialStore } from '@mastra/code-sdk/auth/types'
import { createTokenHolds, type TokenHolds } from '../oauth-holds.js'
import { Failure } from '../../platform/failure.js'

export function createClaudeHolds({ refresh = refreshAnthropicToken, now = Date.now }: Readonly<{
  refresh?: (refreshToken: string) => Promise<ClaudeTokens>
  now?: () => number
}>): TokenHolds<ClaudeTokens> {
  return createTokenHolds({
    now,
    tokens: (credential) => {
      if (credential.provider !== 'anthropic' || credential.kind !== 'oauth') throw new Failure('BUILDER_MODEL_NOT_SELECTED')
      return credential.value
    },
    credential: (value) => ({ provider: 'anthropic', kind: 'oauth', value }),
    refresh: (stored) => refresh(stored.refresh),
  })
}

/**
 * The credential source Mastra Code's Claude provider reads on every request (`CredentialStore`,
 * which its deployed web implements per tenant): here, one held row. The token never leaves the Hub.
 */
export const heldClaudeCredentials = (current: () => Promise<ClaudeTokens>): CredentialStore => Object.freeze({
  allowEnvironmentFallback: false,
  reload: () => undefined,
  get: () => undefined,
  getStoredApiKey: () => undefined,
  getApiKey: async () => (await current()).access,
})
