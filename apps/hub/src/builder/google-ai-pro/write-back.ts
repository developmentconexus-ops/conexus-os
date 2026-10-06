import type { HeldAccount } from '../model-account/accounts.js'
import type { GoogleAiProKey } from './credential.js'
import type { PersistGoogleAiProRefresh } from './pool.js'

/**
 * Where a refreshed Google AI Pro record goes back to (spec 0002 AC-22). The proxy refreshes
 * Google's token inside its own copy and the router only sees the person's key as the bearer, so a
 * model call registers the held row the key was read from, and the router asks for the write-back
 * target of the key it serves. The write is by row id through the held handle's system port, so a
 * row shared with everyone is rewritten in place, never copied into the caller's own, and it
 * finishes after the run has ended.
 */
export function createRefreshWriteBack() {
  const rowOfKey = new Map<GoogleAiProKey, HeldAccount>()
  return Object.freeze({
    /** Called for each model call with the key its row holds; one key per row, the latest. */
    track: (key: GoogleAiProKey, held: HeldAccount): void => {
      for (const [known, tracked] of rowOfKey) if (tracked.modelAccountId === held.modelAccountId) rowOfKey.delete(known)
      rowOfKey.set(key, held)
    },
    persistFor: (key: GoogleAiProKey): PersistGoogleAiProRefresh | undefined => {
      const held = rowOfKey.get(key)
      if (!held) return undefined
      return async (refreshed) => {
        if (refreshed === key) return
        if (await held.persist(refreshed)) rowOfKey.delete(key)
      }
    },
  })
}
