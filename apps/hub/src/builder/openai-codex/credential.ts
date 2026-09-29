import type { ModelAccountStore } from '../model-account-store.js'
import { createTokenHolds } from '../oauth-holds.js'
import type { CodexBearer } from './model.js'
import { refreshOpenAICodexToken, type CodexTokens } from './oauth.js'

/**
 * A ChatGPT subscription is Mastra's `openai-codex` auth provider: the credential Mastra Code and
 * the Factory read for every `openai/*` model id (`getAuthProviderId` in @mastra/code-sdk's
 * mastracode-gateway). It is the `provider` of its `model.model_account` row, kind `oauth`.
 */
export const OPENAI_CODEX_PROVIDER = 'openai-codex'
export const OPENAI_CODEX_NAME = 'ChatGPT'
/** The model router provider in the model ids a subscription serves (`openai/<model>`). */
export const OPENAI_MODEL_PROVIDER = 'openai'

/** The row's secret: the tokens in Mastra Code's stored credential shape. */
export const serializeCodexTokens = (tokens: CodexTokens): string => JSON.stringify({ type: 'oauth', ...tokens })

export const parseCodexTokens = (secret: string): CodexTokens => {
  const parsed = JSON.parse(secret) as Partial<CodexTokens> & { type?: unknown }
  if (parsed.type !== 'oauth' || typeof parsed.access !== 'string' || typeof parsed.refresh !== 'string' ||
    typeof parsed.expires !== 'number' || typeof parsed.accountId !== 'string') throw new Error('OPENAI_CODEX_STORED_RECORD_REFUSED')
  return Object.freeze({
    access: parsed.access, refresh: parsed.refresh, expires: parsed.expires, accountId: parsed.accountId,
    ...(typeof parsed.email === 'string' ? { email: parsed.email } : {}),
  })
}

export type CodexHolds = Readonly<{
  /** The bearer one model call uses, starting from the tokens that call read from the row. */
  hold(modelAccountId: string, tokens: CodexTokens): CodexBearer
}>

/** A ChatGPT row held by runs; refreshed and written back as `createTokenHolds` says. */
export const createCodexHolds = ({ store, refresh = refreshOpenAICodexToken, now = Date.now }: Readonly<{
  store: Pick<ModelAccountStore, 'readById' | 'rewrite'>
  refresh?: (refreshToken: string, accountId: string, email?: string) => Promise<CodexTokens>
  now?: () => number
}>): CodexHolds => {
  const holds = createTokenHolds({
    store, now, parse: parseCodexTokens, serialize: serializeCodexTokens,
    refresh: (stored) => refresh(stored.refresh, stored.accountId, stored.email),
  })
  return Object.freeze({
    hold: (modelAccountId, tokens) => {
      const current = holds.hold(modelAccountId, tokens)
      return async () => {
        const { access, accountId } = await current()
        return Object.freeze({ accessToken: access, accountId })
      }
    },
  })
}
