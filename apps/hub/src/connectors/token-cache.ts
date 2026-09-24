import { inspect } from 'node:util'
import { AdapterFailure } from './errors.js'
import type { ConnectionId } from './model.js'

const REDACTED = '[redacted]'

/** A value a stray log, JSON body or template string prints as `[redacted]`. */
export class Redacted<T> {
  readonly #value: T
  constructor(value: T) { this.#value = value }
  reveal(): T { return this.#value }
  toJSON(): string { return REDACTED }
  toString(): string { return REDACTED }
  [inspect.custom](): string { return REDACTED }
}

/** The provider's access token. Only the gateway file calls `bearer()`. */
export class AccessToken extends Redacted<string> {
  bearer(): string { return this.reveal() }
}

export type IssuedToken = Readonly<{ token: AccessToken; expiresInSeconds: number }>

type Live = Readonly<{ token: AccessToken; refreshAt: number }>
type Entry =
  | Readonly<{ state: 'issuing'; promise: Promise<Live> }>
  | Readonly<{ state: 'live'; live: Live }>

/** Resolves a live token when first asked for, so work that is refused before its first request never authenticates. */
export type TokenLease = () => Promise<AccessToken>

export type TokenCache = Readonly<{
  /**
   * Runs `work` with a lease on the Connection's live token; asking the lease issues one when none is
   * live (one `issue` for any number of concurrent misses). When `work` reports the token refused,
   * the entry is dropped only if it still holds the token that work last leased, and `work` reruns
   * once. A second refusal propagates.
   */
  withToken<T>(connectionId: ConnectionId, issue: () => Promise<IssuedToken>, work: (lease: TokenLease) => Promise<T>): Promise<T>
  forget(connectionId: ConnectionId): void
}>

export const isTokenRefused = (error: unknown): boolean => error instanceof AdapterFailure && error.reason === 'TOKEN_REFUSED'

/** Reuse until `expires_in − max(60 s, 10 %)`; a token shorter than the margin serves only the call that issued it. */
export const refreshAt = (issuedAt: number, expiresInSeconds: number): number => {
  const lifetime = expiresInSeconds * 1000
  return issuedAt + lifetime - Math.max(60_000, lifetime / 10)
}

export const createTokenCache = ({ now = () => Date.now() }: Readonly<{ now?: () => number }> = {}): TokenCache => {
  const entries = new Map<ConnectionId, Entry>()

  const acquire = (connectionId: ConnectionId, issue: () => Promise<IssuedToken>): Promise<Live> => {
    const entry = entries.get(connectionId)
    if (entry?.state === 'issuing') return entry.promise
    if (entry?.state === 'live' && entry.live.refreshAt > now()) return Promise.resolve(entry.live)
    const promise = issue().then(
      (issued) => {
        const live: Live = Object.freeze({ token: issued.token, refreshAt: refreshAt(now(), issued.expiresInSeconds) })
        // A forget() or a newer issue while this one ran wins; this token still serves its waiters.
        if (entries.get(connectionId) === issuing) entries.set(connectionId, { state: 'live', live })
        return live
      },
      (error: unknown) => {
        if (entries.get(connectionId) === issuing) entries.delete(connectionId)
        throw error
      },
    )
    const issuing: Entry = Object.freeze({ state: 'issuing', promise })
    entries.set(connectionId, issuing)
    return promise
  }

  const dropIfHolding = (connectionId: ConnectionId, token: AccessToken): void => {
    const entry = entries.get(connectionId)
    if (entry?.state === 'live' && entry.live.token === token) entries.delete(connectionId)
  }

  return Object.freeze({
    async withToken<T>(connectionId: ConnectionId, issue: () => Promise<IssuedToken>, work: (lease: TokenLease) => Promise<T>): Promise<T> {
      const run = async (): Promise<T> => {
        let leased: AccessToken | null = null
        const lease: TokenLease = async () => {
          leased = (await acquire(connectionId, issue)).token
          return leased
        }
        try {
          return await work(lease)
        } catch (error) {
          if (isTokenRefused(error) && leased) dropIfHolding(connectionId, leased)
          throw error
        }
      }
      try {
        return await run()
      } catch (error) {
        if (!isTokenRefused(error)) throw error
      }
      return run()
    },
    forget(connectionId: ConnectionId) { entries.delete(connectionId) },
  })
}
