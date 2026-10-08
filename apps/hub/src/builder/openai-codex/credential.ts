import { refreshOpenAICodexToken } from '@mastra/code-sdk/auth/providers/openai-codex'
import { toCodexTokens, type CodexTokens } from '../model-account/providers.js'
import type { CredentialStore, OAuthCredentials, OAuthCredential } from '@mastra/code-sdk/auth/types'
import { createTokenHolds, type TokenHolds } from '../oauth-holds.js'
import { Failure } from '../../platform/failure.js'

export function createCodexHolds({ refresh = refreshOpenAICodexToken, now = Date.now }: Readonly<{
  refresh?: (refreshToken: string, accountId: string, email?: string) => Promise<OAuthCredentials>
  now?: () => number
}>): TokenHolds<CodexTokens> {
  return createTokenHolds({
    now,
    tokens: (credential) => {
      if (credential.provider !== 'openai-codex') throw new Failure('BUILDER_MODEL_NOT_SELECTED')
      return credential.value
    },
    credential: (value) => ({ provider: 'openai-codex', kind: 'oauth', value }),
    refresh: async (stored) => toCodexTokens(await refresh(stored.refresh, stored.accountId, stored.email ?? undefined)),
  })
}

/**
 * The credential source Mastra Code's Codex provider reads on every request (`CredentialStore`,
 * which its deployed web implements per tenant): here, one held row. The token never leaves the Hub.
 * `get` only tells the provider a subscription is signed in; each call's bearer and account id
 * come from `getOAuthCredential`, refreshed first when they have expired.
 */
export const heldCodexCredentials = (initial: CodexTokens, current: () => Promise<CodexTokens>): CredentialStore => Object.freeze({
  allowEnvironmentFallback: false,
  reload: () => undefined,
  get: (provider: string) => provider === 'openai-codex' ? nativeCodexRecord(initial) : undefined,
  getStoredApiKey: () => undefined,
  getApiKey: async () => (await current()).access,
  getOAuthCredential: async () => nativeCodexRecord(await current()),
})

function nativeCodexRecord({ email, ...tokens }: CodexTokens): OAuthCredential {
  return { type: 'oauth', ...tokens, ...email === null ? {} : { email } }
}
