import type { ModelAccountStore } from '../model-account-store.js'
import type { GoogleAiProKey } from './credential.js'
import type { PersistGoogleAiProRefresh } from './pool.js'

/**
 * Where a refreshed Google AI Pro record goes back to (spec 0002 AC-22). The proxy refreshes
 * Google's token inside its own copy and the router only sees the person's key as the bearer, so a
 * model call registers the `model.model_account` row the key was read from, and the router asks
 * for the write-back target of the key it serves. The write is by row id, so a row shared with
 * everyone is rewritten in place, never copied into the caller's own.
 */
export const createRefreshWriteBack = (store: Pick<ModelAccountStore, 'rewrite'>) => {
  const rowOfKey = new Map<GoogleAiProKey, string>()
  return Object.freeze({
    /** Called for each model call with the key its row holds; one key per row, the latest. */
    track: (key: GoogleAiProKey, modelAccountId: string): void => {
      for (const [known, id] of rowOfKey) if (id === modelAccountId) rowOfKey.delete(known)
      rowOfKey.set(key, modelAccountId)
    },
    persistFor: (key: GoogleAiProKey): PersistGoogleAiProRefresh | undefined => {
      const modelAccountId = rowOfKey.get(key)
      if (!modelAccountId) return undefined
      return async (refreshed) => {
        if (refreshed === key) return
        if (await store.rewrite(modelAccountId, refreshed)) rowOfKey.delete(key)
      }
    },
  })
}
