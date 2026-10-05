import type { MastraCompositeStore, RetentionConfig } from '@mastra/core/storage'
import { PostgresStore } from '@mastra/pg'
import type { EventLog } from '../platform/logger.js'
import type { FactoryPool } from '../platform/db.js'

// Spans hold prompts, tool I/O and source text. Bounding their age is the only retention: Builder
// evidence lives in the threads' messages, so memory is never a retention key here.
const OBSERVABILITY_SPAN_RETENTION: RetentionConfig = { observability: { spans: { maxAge: '30d' } } }

/**
 * The Builder's Mastra storage: threads, messages and traces in Postgres, so conversations survive a
 * restart. It lives in the `factory` schema through the `hub_factory` role until slice 7 moves it
 * to schema `mastra`.
 */
export const createBuilderStorage = (pool: FactoryPool): PostgresStore =>
  new PostgresStore({ id: 'conexus-builder', pool, schemaName: 'factory', retention: OBSERVABILITY_SPAN_RETENTION })

/**
 * One pass of the `span-prune` job. Mastra never runs prune() itself (reference-storage-retention.md);
 * the store declares the `maxAge` policy above and this deletes the rows older than it. It waits for
 * the store's own init, which creates the tables a fresh installation does not have yet, and aborts
 * between batches.
 */
export const pruneSpans = async (storage: Pick<MastraCompositeStore, 'init' | 'prune'>, log: EventLog, signal: AbortSignal): Promise<void> => {
  await storage.init()
  for (const result of await storage.prune({ signal })) {
    log('BUILDER_RETENTION_PRUNED', { table: `${result.domain}.${result.table}`, deleted: result.deleted })
    if (!result.done) log('BUILDER_RETENTION_PRUNE_INCOMPLETE', { table: `${result.domain}.${result.table}` })
  }
}
