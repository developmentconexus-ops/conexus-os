import type { ModelAccountStore } from '../model-account-store.js'
import { GOOGLE_AI_PRO_PROVIDER, type GoogleAiProKey } from './credential.js'

export type GoogleAiProAccounts = Readonly<{
  /** The caller's own connection state, for the Settings card. */
  connection(accountId: string): Promise<Readonly<{ mine: boolean; shared: boolean }>>
  /** Writes the caller's own row, sealed. An update keeps the row's existing sharing level. */
  write(accountId: string, key: GoogleAiProKey): Promise<void>
}>

/**
 * Google AI Pro's credential in `model.model_account` (kind `google_ai_pro`) (spec 0002, Data
 * model), for the Settings card and its sign-in. A run reads it like any other model account.
 */
export const createGoogleAiProAccounts = (store: ModelAccountStore): GoogleAiProAccounts => Object.freeze({
  connection: async (accountId) => {
    const { mine, shared } = await store.connection(accountId, GOOGLE_AI_PRO_PROVIDER)
    return Object.freeze({ mine: mine !== null, shared })
  },
  write: (accountId, key) => store.write(accountId, GOOGLE_AI_PRO_PROVIDER, 'google_ai_pro', key),
})
