import { refreshAnthropicToken } from '@mastra/code-sdk/auth/providers/anthropic'
import { z } from 'zod'
import type { CredentialStore } from '@mastra/code-sdk/auth/types'
import { createTokenHolds, type TokenHolds } from '../oauth-holds.js'
import { Failure } from '../../platform/failure.js'

/** A Claude subscription's tokens as Mastra Code stores them (`OAuthCredentials` minus its `type`). */
export type ClaudeTokens = Readonly<{ access: string; refresh: string; expires: number }>

export const serializeClaudeTokens = (tokens: ClaudeTokens): string =>
  JSON.stringify({ type: 'oauth', access: tokens.access, refresh: tokens.refresh, expires: tokens.expires })

const storedClaudeTokens = z.object({ type: z.literal('oauth'), access: z.string(), refresh: z.string(), expires: z.number() })

export const parseClaudeTokens = (secret: string): ClaudeTokens => {
  const parsed = storedClaudeTokens.safeParse(JSON.parse(secret))
  if (!parsed.success) throw new Failure('ANTHROPIC_STORED_RECORD_REFUSED')
  const { access, refresh, expires } = parsed.data
  return Object.freeze({ access, refresh, expires })
}

export const createClaudeHolds = ({ refresh = refreshAnthropicToken, now = Date.now }: Readonly<{
  refresh?: (refreshToken: string) => Promise<ClaudeTokens>
  now?: () => number
}>): TokenHolds<ClaudeTokens> => createTokenHolds({
  now, parse: parseClaudeTokens, serialize: serializeClaudeTokens, refresh: (stored) => refresh(stored.refresh),
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
