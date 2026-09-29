import { refreshAnthropicToken } from '@mastra/code-sdk/auth/providers/anthropic'
import type { CredentialStore } from '@mastra/code-sdk/auth/types'
import type { ModelAccountStore } from '../model-account-store.js'
import { createTokenHolds, type TokenHolds } from '../oauth-holds.js'

/**
 * Anthropic is one `model.model_account` provider with two kinds: `api_key`, a key from the
 * Anthropic Console, and `oauth`, a Claude Pro or Max subscription signed in the way Mastra Code
 * and the Factory sign in. One row per person per provider, so connecting one kind replaces the other.
 */
export const ANTHROPIC_PROVIDER = 'anthropic'

/** The models both kinds serve, by the `anthropic/<model>` id a thread stores and a run resolves; each id is in Mastra's model router catalog. */
export const ANTHROPIC_MODELS: readonly Readonly<{ model: string; name: string }>[] = Object.freeze([
  { model: 'claude-opus-5-5', name: 'Claude Opus 5.5' },
  { model: 'claude-sonnet-5', name: 'Claude Sonnet 5' },
  { model: 'claude-haiku-4-5', name: 'Claude Haiku 4.5' },
])

/** An Anthropic Console key as the Console issues it; anything else never reaches the row. */
export const ANTHROPIC_KEY_SHAPE = /^sk-ant-[A-Za-z0-9_-]{20,200}$/

/** A Claude subscription's tokens as Mastra Code stores them (`OAuthCredentials` minus its `type`). */
export type ClaudeTokens = Readonly<{ access: string; refresh: string; expires: number }>

export const serializeClaudeTokens = (tokens: ClaudeTokens): string =>
  JSON.stringify({ type: 'oauth', access: tokens.access, refresh: tokens.refresh, expires: tokens.expires })

export const parseClaudeTokens = (secret: string): ClaudeTokens => {
  const parsed = JSON.parse(secret) as Partial<ClaudeTokens> & { type?: unknown }
  if (parsed.type !== 'oauth' || typeof parsed.access !== 'string' || typeof parsed.refresh !== 'string' ||
    typeof parsed.expires !== 'number') throw new Error('ANTHROPIC_STORED_RECORD_REFUSED')
  return Object.freeze({ access: parsed.access, refresh: parsed.refresh, expires: parsed.expires })
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
