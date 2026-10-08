import type { NativeCredentialAccess } from '../refresh.js'
import type { GoogleAiProKey } from '../credential.js'
import type { PersistGoogleAiProRefresh } from './pool.js'

// CLIProxyAPI rotates tokens in its auth file. Retain the immutable row and spent envelope so
// capture can use the owner's CAS system write after the run ends.
export function createRefreshWriteBack() {
  const rowOfKey = new Map<GoogleAiProKey, NativeCredentialAccess>()
  return Object.freeze({
    track: (key: GoogleAiProKey, held: NativeCredentialAccess): void => {
      for (const [known, tracked] of rowOfKey) if (tracked.held.row.modelAccountId === held.held.row.modelAccountId) rowOfKey.delete(known)
      rowOfKey.set(key, held)
    },
    persistFor: (key: GoogleAiProKey): PersistGoogleAiProRefresh | undefined => {
      const held = rowOfKey.get(key)
      if (!held) return undefined
      return async (refreshed) => {
        if (refreshed === key) return
        const saved = await held.persist({ provider: 'google-ai-pro', kind: 'google_ai_pro', value: refreshed })
        if (saved.state === 'stored') rowOfKey.delete(key)
      }
    },
  })
}
