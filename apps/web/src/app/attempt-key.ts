import { IdempotencyKey } from '@conexus/contract'
import { useRef } from 'react'
import { HubFailure } from './failure'

/**
 * One key per attempt. The fingerprint is the whole request, path params included, so the same request retried keeps its key and any other one gets its own.
 * `settled` starts the next attempt fresh; `failed` does the same for a refusal the Hub answered with a 4xx, which took no effect. Any other failure may have taken effect, so the identical retry keeps the key and lands on it.
 */
export function useAttemptKey() {
  const attempt = useRef<{ fingerprint: string; key: IdempotencyKey } | undefined>(undefined)
  return {
    keyFor(fingerprint: string): IdempotencyKey {
      if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, key: IdempotencyKey.parse(crypto.randomUUID()) }
      return attempt.current.key
    },
    settled() {
      attempt.current = undefined
    },
    failed(error: unknown) {
      if (error instanceof HubFailure && error.status !== null && error.status >= 400 && error.status < 500 && error.code !== 'OUTCOME_UNKNOWN') attempt.current = undefined
    },
  }
}
