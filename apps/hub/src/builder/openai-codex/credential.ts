import { refreshOpenAICodexToken } from '@mastra/code-sdk/auth/providers/openai-codex'
import type { CredentialStore, OAuthCredentials } from '@mastra/code-sdk/auth/types'
import type { ModelAccountStore } from '../model-account-store.js'
import { createTokenHolds, type TokenHolds } from '../oauth-holds.js'

/**
 * A ChatGPT subscription is Mastra's `openai-codex` auth provider: the credential Mastra Code and
 * the Factory read for every `openai/*` model id (`getAuthProviderId` in @mastra/code-sdk's
 * mastracode-gateway). It is the `provider` of its `model.model_account` row, kind `oauth`.
 */
export const OPENAI_CODEX_PROVIDER = 'openai-codex'
/** The model router provider in the model ids a subscription serves (`openai/<model>`). */
export const OPENAI_MODEL_PROVIDER = 'openai'

/** A ChatGPT subscription's tokens as Mastra Code stores them (`OAuthCredentials` minus its `type`). */
export type CodexTokens = Readonly<{ access: string; refresh: string; expires: number; accountId: string; email?: string }>

/** Mastra's sign-in and refresh answer with an open `OAuthCredentials`; the row keeps the fields a call needs. */
export const toCodexTokens = (credentials: OAuthCredentials): CodexTokens => {
  const { access, refresh, expires, accountId, email } = credentials
  if (typeof access !== 'string' || typeof refresh !== 'string' || typeof expires !== 'number' || typeof accountId !== 'string') throw new Error('OPENAI_CODEX_STORED_RECORD_REFUSED')
  return Object.freeze({ access, refresh, expires, accountId, ...(typeof email === 'string' ? { email } : {}) })
}

/** The row's secret: the tokens in Mastra Code's stored credential shape. */
export const serializeCodexTokens = (tokens: CodexTokens): string => JSON.stringify({ type: 'oauth', ...tokens })

export const parseCodexTokens = (secret: string): CodexTokens => {
  const parsed = JSON.parse(secret) as Partial<CodexTokens> & { type?: unknown }
  if (parsed.type !== 'oauth') throw new Error('OPENAI_CODEX_STORED_RECORD_REFUSED')
  return toCodexTokens(parsed as OAuthCredentials)
}

/** A ChatGPT row held by runs; refreshed and written back as `createTokenHolds` says. */
export const createCodexHolds = ({ store, refresh = refreshOpenAICodexToken, now = Date.now }: Readonly<{
  store: Pick<ModelAccountStore, 'readById' | 'rewrite'>
  refresh?: (refreshToken: string, accountId: string, email?: string) => Promise<OAuthCredentials>
  now?: () => number
}>): TokenHolds<CodexTokens> => createTokenHolds({
  store, now, parse: parseCodexTokens, serialize: serializeCodexTokens,
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
  get: (provider: string) => provider === OPENAI_CODEX_PROVIDER ? { type: 'oauth' as const, ...initial } : undefined,
  getStoredApiKey: () => undefined,
  getApiKey: async () => (await current()).access,
  getOAuthCredential: async () => ({ type: 'oauth' as const, ...await current() }),
})
