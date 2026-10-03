import { refreshAnthropicToken } from '@mastra/code-sdk/auth/providers/anthropic'
import { z } from 'zod'
import type { CredentialStore } from '@mastra/code-sdk/auth/types'
import type { ModelAccountStore } from '../model-account-store.js'
import { createTokenHolds, type TokenHolds } from '../oauth-holds.js'

/**
 * Anthropic is one `model.model_account` provider with two kinds: `api_key`, a key from the
 * Anthropic Console, and `oauth`, a Claude Pro or Max subscription signed in the way Mastra Code
 * and the Factory sign in. One row per person per provider, so connecting one kind replaces the other.
 */
export const ANTHROPIC_PROVIDER = 'anthropic'

/** An Anthropic Console key as the Console issues it; anything else never reaches the row. */
export const ANTHROPIC_KEY_SHAPE = /^sk-ant-[A-Za-z0-9_-]{20,200}$/

/** A Claude subscription's tokens as Mastra Code stores them (`OAuthCredentials` minus its `type`). */
export type ClaudeTokens = Readonly<{ access: string; refresh: string; expires: number }>

export const serializeClaudeTokens = (tokens: ClaudeTokens): string =>
  JSON.stringify({ type: 'oauth', access: tokens.access, refresh: tokens.refresh, expires: tokens.expires })

const storedClaudeTokens = z.object({ type: z.literal('oauth'), access: z.string(), refresh: z.string(), expires: z.number() })

export const parseClaudeTokens = (secret: string): ClaudeTokens => {
  const parsed = storedClaudeTokens.safeParse(JSON.parse(secret))
  if (!parsed.success) throw new Error('ANTHROPIC_STORED_RECORD_REFUSED')
  const { access, refresh, expires } = parsed.data
  return Object.freeze({ access, refresh, expires })
}

export const createClaudeHolds = ({ store, refresh = refreshAnthropicToken, now = Date.now }: Readonly<{
  store: Pick<ModelAccountStore, 'readById' | 'rewrite'>
  refresh?: (refreshToken: string) => Promise<ClaudeTokens>
  now?: () => number
}>): TokenHolds<ClaudeTokens> => createTokenHolds({
  store, now, parse: parseClaudeTokens, serialize: serializeClaudeTokens, refresh: (stored) => refresh(stored.refresh),
})

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
