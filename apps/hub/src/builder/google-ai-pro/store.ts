import type { ModelAccountStore } from '../model-account-store.js'
import { GOOGLE_AI_PRO_PROVIDER, type GoogleAiProKey, parseKey } from './credential.js'

/** The row a run records as the one that paid for it, and the key its model calls carry. */
type GoogleAiProAccount = Readonly<{ modelAccountId: string; key: GoogleAiProKey }>

export type GoogleAiProAccounts = Readonly<{
  /** Whether the installation has a shared account for this provider, with no caller in mind. */
  hasShared(): Promise<boolean>
  /** The caller's own account, else the one shared with everyone; null when neither exists. */
  read(accountId: string): Promise<GoogleAiProAccount | null>
  /** The caller's own connection state, for the Settings card. */
  connection(accountId: string): Promise<Readonly<{ mine: boolean; shared: boolean }>>
  /** Writes the caller's own row, sealed. An update keeps the row's existing sharing level. */
  write(accountId: string, key: GoogleAiProKey): Promise<void>
}>

/**
 * Google AI Pro's credential in `model.model_account` (kind `google_ai_pro`) (spec 0002, Data
 * model): the Conexus model account store, with the stored record parsed as an Antigravity key.
 */
export const createGoogleAiProAccounts = (store: ModelAccountStore): GoogleAiProAccounts => Object.freeze({
  hasShared: () => store.hasShared(GOOGLE_AI_PRO_PROVIDER),
  read: async (accountId) => {
    const held = await store.usable(accountId, GOOGLE_AI_PRO_PROVIDER)
    if (!held) return null
    const key = parseKey(held.secret)
    if (!key) throw new Error('GOOGLE_AI_PRO_STORED_RECORD_REFUSED')
    return Object.freeze({ modelAccountId: held.modelAccountId, key })
  },
  connection: (accountId) => store.connection(accountId, GOOGLE_AI_PRO_PROVIDER),
  write: (accountId, key) => store.write(accountId, GOOGLE_AI_PRO_PROVIDER, 'google_ai_pro', key),
})
