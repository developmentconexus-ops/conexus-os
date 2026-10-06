import { refreshOpenAICodexToken } from '@mastra/code-sdk/auth/providers/openai-codex'
import { z } from 'zod'
import type { CredentialStore, OAuthCredentials } from '@mastra/code-sdk/auth/types'
import { createTokenHolds, type TokenHolds } from '../oauth-holds.js'
import { Failure } from '../../platform/failure.js'

/** A ChatGPT subscription's tokens as Mastra Code stores them (`OAuthCredentials` minus its `type`). */
export type CodexTokens = Readonly<{ access: string; refresh: string; expires: number; accountId: string; email?: string }>

/** Mastra's sign-in and refresh answer with an open `OAuthCredentials`; the row keeps the fields a call needs. */
export const toCodexTokens = (credentials: OAuthCredentials): CodexTokens => {
  const { access, refresh, expires, accountId, email } = credentials
  if (typeof access !== 'string' || typeof refresh !== 'string' || typeof expires !== 'number' || typeof accountId !== 'string') throw new Failure('OPENAI_CODEX_STORED_RECORD_REFUSED')
  return Object.freeze({ access, refresh, expires, accountId, ...(typeof email === 'string' ? { email } : {}) })
}

/** The row's secret: the tokens in Mastra Code's stored credential shape. */
export const serializeCodexTokens = (tokens: CodexTokens): string => JSON.stringify({ type: 'oauth', ...tokens })

const storedCodexRecord = z.looseObject({ type: z.literal('oauth'), access: z.string(), refresh: z.string(), expires: z.number(), accountId: z.string() })

export const parseCodexTokens = (secret: string): CodexTokens => {
  const parsed = storedCodexRecord.safeParse(JSON.parse(secret))
  if (!parsed.success) throw new Failure('OPENAI_CODEX_STORED_RECORD_REFUSED')
  return toCodexTokens(parsed.data)
}

/** A ChatGPT row held by runs; refreshed and written back as `createTokenHolds` says. */
export const createCodexHolds = ({ refresh = refreshOpenAICodexToken, now = Date.now }: Readonly<{
  refresh?: (refreshToken: string, accountId: string, email?: string) => Promise<OAuthCredentials>
  now?: () => number
}>): TokenHolds<CodexTokens> => createTokenHolds({
  now, parse: parseCodexTokens, serialize: serializeCodexTokens,
  refresh: async (stored) => toCodexTokens(await refresh(stored.refresh, stored.accountId, stored.email)),
})

/**
 * The credential source Mastra Code's Codex provider reads on every request (`CredentialStore`,
 * which its deployed web implements per tenant): here, one held row. The token never leaves the Hub.
 * `get` only tells the provider a subscription is signed in; each call's bearer and account id
 * come from `getOAuthCredential`, refreshed first when they have expired.
 */
export const heldCodexCredentials = (initial: CodexTokens, current: () => Promise<CodexTokens>): CredentialStore => Object.freeze({
  allowEnvironmentFallback: false,
  reload: () => undefined,
  get: (provider: string) => provider === 'openai-codex' ? { type: 'oauth' as const, ...initial } : undefined,
  getStoredApiKey: () => undefined,
  getApiKey: async () => (await current()).access,
  getOAuthCredential: async () => ({ type: 'oauth' as const, ...await current() }),
})
