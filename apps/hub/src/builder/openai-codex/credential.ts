import type { ModelAccountStore } from '../model-account-store.js'
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

/**
 * Refreshes happen in the Hub, one at a time per row. A ChatGPT refresh token is spent by its use,
 * so two runs holding one shared row must not both refresh it: the second finds the row already
 * refreshed and adopts it. A refreshed token is written back to the row before any call uses it,
 * so a run that ends, or a Hub that stops, never takes the only copy with it (AC-22).
 */
export const createCodexHolds = ({ store, refresh = refreshOpenAICodexToken, now = Date.now }: Readonly<{
  store: Pick<ModelAccountStore, 'readById' | 'rewrite'>
  refresh?: (refreshToken: string, accountId: string, email?: string) => Promise<CodexTokens>
  now?: () => number
}>): CodexHolds => {
  const refreshing = new Map<string, Promise<CodexTokens>>()

  const renew = async (modelAccountId: string): Promise<CodexTokens> => {
    const row = await store.readById(modelAccountId)
    if (!row) throw new Error('BUILDER_MODEL_NOT_SELECTED')
    const stored = parseCodexTokens(row.secret)
    if (now() < stored.expires) return stored
    const refreshed = await refresh(stored.refresh, stored.accountId, stored.email)
    if (!await store.rewrite(modelAccountId, serializeCodexTokens(refreshed))) throw new Error('BUILDER_MODEL_NOT_SELECTED')
    return refreshed
  }

  return Object.freeze({
    hold: (modelAccountId, tokens) => {
      let current = tokens
      return async () => {
        if (now() >= current.expires) {
          let pending = refreshing.get(modelAccountId)
          if (!pending) {
            pending = renew(modelAccountId).finally(() => refreshing.delete(modelAccountId))
            refreshing.set(modelAccountId, pending)
          }
          current = await pending
        }
        return Object.freeze({ accessToken: current.access, accountId: current.accountId })
      }
    },
  })
}
