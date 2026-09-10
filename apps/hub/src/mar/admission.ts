import { randomUUID } from 'node:crypto'
import { PgBoss } from 'pg-boss'
import type { Db, SendOptions } from 'pg-boss'
import type { PoolClient, QueryResultRow } from 'pg'
import type { PostgresPool } from '../platform/postgres.js'

export const MAR_QUEUE_NAME = 'managed-sync/v1'

export const MAR_PG_BOSS_RUNTIME_CONFIG = Object.freeze({
  schema: 'mar',
  createSchema: false,
  migrate: false,
  schedule: false,
  supervise: false,
  useListenNotify: false,
  retryLimit: 0,
})

export type ManagedSyncOccurrence = Readonly<{
  projectId: string
  releaseId: string
  jobId: string
  logicalOccurrenceKey: string
  evidenceRefs: readonly string[]
  jobRunId?: string
}>

export type MarOwnerAdmission = Readonly<{
  jobRunId: string
  projectId: string
  releaseId: string
  jobId: string
  logicalOccurrenceKey: string
  state: 'ADMITTED'
  evidenceRefs: readonly string[]
}>

export type MarAdmissionResult = Readonly<{
  owner: MarOwnerAdmission
  queueJobId: string
}>

type OwnerRow = QueryResultRow & Readonly<{
  job_run_id: string
  project_id: string
  release_id: string
  job_id: string
  logical_occurrence_key: string
  state: 'ADMITTED'
  evidence_refs: string[]
}>

type QueuePayload = Readonly<{
  jobRunId: string
  projectId: string
  releaseId: string
  logicalOccurrenceKey: string
}>

export type MarQueueProjection = Readonly<{
  send(client: PoolClient, payload: QueuePayload): Promise<string | null>
}>

const text = (value: string, field: string): string => {
  if (typeof value !== 'string' || !/\S/.test(value)) throw new Error(`MAR_${field.toUpperCase()}_REFUSED`)
  return value
}

const occurrencePayload = (occurrence: ManagedSyncOccurrence, jobRunId: string): QueuePayload => ({
  jobRunId,
  projectId: text(occurrence.projectId, 'project_id'),
  releaseId: text(occurrence.releaseId, 'release_id'),
  logicalOccurrenceKey: text(occurrence.logicalOccurrenceKey, 'logical_occurrence_key'),
})

const ownerAdmission = async (client: PoolClient, occurrence: ManagedSyncOccurrence, jobRunId: string): Promise<MarOwnerAdmission> => {
  const result = await client.query<OwnerRow>(`
    SELECT * FROM mar.admit_job_run($1, $2, $3, $4, $5, $6)
  `, [
    jobRunId,
    text(occurrence.projectId, 'project_id'),
    text(occurrence.releaseId, 'release_id'),
    text(occurrence.jobId, 'job_id'),
    text(occurrence.logicalOccurrenceKey, 'logical_occurrence_key'),
    occurrence.evidenceRefs,
  ])
  const row = result.rows[0]
  if (!row) throw new Error('MAR_OWNER_ADMISSION_MISSING')
  if (row.state !== 'ADMITTED') throw new Error('MAR_OWNER_STATE_REFUSED')
  return {
    jobRunId: row.job_run_id,
    projectId: row.project_id,
    releaseId: row.release_id,
    jobId: row.job_id,
    logicalOccurrenceKey: row.logical_occurrence_key,
    state: row.state,
    evidenceRefs: row.evidence_refs,
  }
}

export const createMarPgBoss = (connectionString: string): PgBoss => new PgBoss({
  connectionString,
  schema: MAR_PG_BOSS_RUNTIME_CONFIG.schema,
  createSchema: MAR_PG_BOSS_RUNTIME_CONFIG.createSchema,
  migrate: MAR_PG_BOSS_RUNTIME_CONFIG.migrate,
  schedule: MAR_PG_BOSS_RUNTIME_CONFIG.schedule,
  supervise: MAR_PG_BOSS_RUNTIME_CONFIG.supervise,
  useListenNotify: MAR_PG_BOSS_RUNTIME_CONFIG.useListenNotify,
})

const transactionDatabase = (client: PoolClient): Db => ({
  executeSql: (textQuery: string, values?: unknown[]) => client.query(textQuery, values),
})

export const createMarQueueProjection = (boss: Readonly<{
  send(name: string, data?: object | null, options?: SendOptions): Promise<string | null>
}>): MarQueueProjection => ({
  send: (client, payload) => boss.send(MAR_QUEUE_NAME, payload, {
    db: transactionDatabase(client),
    retryLimit: MAR_PG_BOSS_RUNTIME_CONFIG.retryLimit,
  }),
})

export const admitManagedSyncOccurrence = async ({
  pool,
  queue,
  occurrence,
}: Readonly<{
  pool: PostgresPool
  queue: MarQueueProjection
  occurrence: ManagedSyncOccurrence
}>): Promise<MarAdmissionResult> => {
  const jobRunId = text(occurrence.jobRunId ?? randomUUID(), 'job_run_id')
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const owner = await ownerAdmission(client, occurrence, jobRunId)
    const queueJobId = await queue.send(client, occurrencePayload(occurrence, owner.jobRunId))
    if (queueJobId === null) throw new Error('MAR_QUEUE_PROJECTION_NOT_CREATED')
    await client.query('COMMIT')
    return { owner, queueJobId }
  } catch (error) {
    try { await client.query('ROLLBACK') } catch { /* preserve the original database error */ }
    throw error
  } finally {
    client.release()
  }
}
