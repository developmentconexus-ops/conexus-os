import type { ModelAccountStore } from './model-account-store.js'
import { Failure } from '../platform/failure.js'
import type { ModelAccountId } from '../../../../packages/contract/dist/index.js'

/** A subscription's tokens as far as holding them needs: when the access token stops working. */
type Expiring = Readonly<{ expires: number }>

export type TokenHolds<T extends Expiring> = Readonly<{
  /** The live tokens one model call uses, starting from the tokens that call read from the row. */
  hold(modelAccountId: ModelAccountId, tokens: T): () => Promise<T>
}>

/**
 * Refreshes happen in the Hub, one at a time per row. A subscription's refresh token is spent by
 * its use, so two runs holding one shared row must not both refresh it: the second finds the row
 * already refreshed and adopts it. A refreshed token is written back to the row before any call
 * uses it, so a run that ends, or a Hub that stops, never takes the only copy with it (AC-22).
 */
export const createTokenHolds = <T extends Expiring>({ store, parse, serialize, refresh, now = Date.now }: Readonly<{
  store: Pick<ModelAccountStore, 'readById' | 'rewrite'>
  parse(secret: string): T
  serialize(tokens: T): string
  refresh(stored: T): Promise<T>
  now?: () => number
}>): TokenHolds<T> => {
  const refreshing = new Map<string, Promise<T>>()

  const renew = async (modelAccountId: ModelAccountId): Promise<T> => {
    const row = await store.readById(modelAccountId)
    if (!row) throw new Failure('BUILDER_MODEL_NOT_SELECTED')
    const stored = parse(row.secret)
    if (now() < stored.expires) return stored
    const refreshed = await refresh(stored)
    if (!await store.rewrite(modelAccountId, serialize(refreshed))) throw new Failure('BUILDER_MODEL_NOT_SELECTED')
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
        return current
      }
    },
  })
}
