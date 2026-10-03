import type { MastraCompositeStore, RetentionConfig } from '@mastra/core/storage'
import { PostgresStore } from '@mastra/pg'
import type { PostgresPool } from '../platform/postgres.js'

const RETENTION_PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000

// Spans hold prompts, tool I/O and source text. Bounding their age is the only retention: Builder
// evidence lives in the threads' messages, so memory is never a retention key here.
const OBSERVABILITY_SPAN_RETENTION: RetentionConfig = { observability: { spans: { maxAge: '30d' } } }

/**
 * The Builder's Mastra storage: threads, messages and traces in Postgres, so conversations survive a
 * restart. It lives in the `factory` schema through the `hub_factory` role until slice 7 moves it
 * to schema `mastra`.
 */
export const createBuilderStorage = (pool: PostgresPool): PostgresStore =>
  new PostgresStore({ id: 'conexus-builder', pool, schemaName: 'factory', retention: OBSERVABILITY_SPAN_RETENTION })

// Mastra never runs prune() itself (reference-storage-retention.md). The store declares the
// `maxAge` policy above; this is the schedule that actually deletes rows older than it. Each tick
// waits for the store's own init, which creates the tables a fresh installation does not have yet.
// `close()` stops the timer, aborts the prune in flight between batches, and settles after it, so the pool it uses can end after it.
type RetentionSchedule = Readonly<{ tick(): Promise<void>; close(): Promise<void> }>

export const scheduleRetentionPrune = (
  storage: Pick<MastraCompositeStore, 'init' | 'prune'>,
  log: (line: string) => void,
  intervalMs = RETENTION_PRUNE_INTERVAL_MS,
): RetentionSchedule => {
  const inFlight = new Set<Promise<void>>()
  const stop = new AbortController()
  const run = async (): Promise<void> => {
    await storage.init()
    for (const result of await storage.prune({ signal: stop.signal })) {
      log(`BUILDER_RETENTION_PRUNED:${result.domain}.${result.table}:${result.deleted}`)
      if (!result.done) log(`BUILDER_RETENTION_PRUNE_INCOMPLETE:${result.domain}.${result.table}`)
    }
  }
  const tick = (): Promise<void> => {
    const pass = run()
    inFlight.add(pass)
    const settled = (): void => { inFlight.delete(pass) }
    pass.then(settled, settled)
    return pass
  }
  const tickLogged = (): void => { tick().catch((error) => log(`BUILDER_RETENTION_PRUNE_FAILED:${error instanceof Error ? error.message : String(error)}`)) }
  tickLogged()
  const timer = setInterval(tickLogged, intervalMs)
  timer.unref()
  return Object.freeze({
    tick,
    close: async () => {
      clearInterval(timer)
      stop.abort()
      await Promise.allSettled([...inFlight])
    },
  })
}
