import type { Credential } from './model-account/providers.js'
import type { HeldAccount } from './model-account/accounts.js'
import { Failure } from '../platform/failure.js'

/** A subscription's tokens as far as holding them needs: when the access token stops working. */
type Expiring = Extract<Credential, { kind: 'oauth' }>['value']

export type TokenHolds<T extends Expiring> = Readonly<{
  /** The live tokens one model call uses, starting from the tokens that call read from the row. */
  hold(held: HeldAccount, tokens: T): () => Promise<T>
}>

/**
 * Refreshes happen in the Hub, one at a time per row. A subscription's refresh token is spent by
 * its use, so two runs holding one shared row must not both refresh it: the refresh reads the row
 * again inside the single flight, and a run that finds it already refreshed adopts it. A refreshed
 * token is written back to the row before any call uses it, so a run that ends, or a Hub that
 * stops, never takes the only copy with it (AC-22).
 */
export function createTokenHolds<T extends Expiring>({ tokens, credential, refresh, now = Date.now }: Readonly<{
  tokens(credential: Credential): T
  credential(tokens: T): Credential
  refresh(stored: T): Promise<T>
  now?: () => number
}>): TokenHolds<T> {
  const refreshing = new Map<string, Promise<T>>()

  async function renew(held: HeldAccount): Promise<T> {
    const row = await held.read()
    if (!row) throw new Failure('BUILDER_MODEL_NOT_SELECTED')
    const stored = tokens(row.credential)
    if (now() < stored.expires) return stored
    const refreshed = await refresh(stored)
    if (!await held.persist(credential(refreshed))) throw new Failure('BUILDER_MODEL_NOT_SELECTED')
    return refreshed
  }

  return Object.freeze({
    hold: (held, initial) => {
      let current = initial
      return async () => {
        if (now() < current.expires) return current
        const row = await held.read()
        if (!row) throw new Failure('BUILDER_MODEL_NOT_SELECTED')
        const stored = tokens(row.credential)
        if (now() < stored.expires) {
          current = stored
          return current
        }
        let pending = refreshing.get(held.modelAccountId)
        if (!pending) {
          pending = renew(held).finally(() => refreshing.delete(held.modelAccountId))
          refreshing.set(held.modelAccountId, pending)
        }
        current = await pending
        return current
      }
    },
  })
}
