import { IdempotencyKey } from '@conexus/contract'
import { useRef } from 'react'

/** One key per attempt: the same request retried keeps its key, and a settled one starts the next attempt fresh. */
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
  }
}
