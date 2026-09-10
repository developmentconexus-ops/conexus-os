import type { PoolClient, QueryResultRow } from 'pg'
import { canonicalBytes, sha256 } from '../../../../packages/canonical-json/src/index.mjs'
import type { PostgresPool } from '../platform/postgres.js'

export const BUDGET_ANALYZER_SYNC_ID = 'budget-analyzer-sync/v1'

export type BudgetObservationKind = 'FULL_SNAPSHOT' | 'INCREMENTAL_DELTA'
export type BudgetFreshness = 'CURRENT' | 'STALE' | 'UNKNOWN'
export type BudgetCoverage = 'COMPLETE' | 'PARTIAL' | 'UNKNOWN'
export type BudgetMergeState = 'IDLE' | 'INGESTING' | 'UNKNOWN'
export type PendingEvidenceState = 'CONFIRMED' | 'AMBIGUOUS' | 'UNVERIFIED'
export type BudgetObservationGapKind = 'MISSING' | 'AMBIGUOUS'

export type PendingBudgetRow = Readonly<{
  budgetRef: string
  canonicalBusinessDate: string
  lastChangeAt: string | null
  budgetValue: string
  currencyCode: string
  sellerId: string
  sellerName: string
  customerId: string
  customerName: string
  sourceCompanyId: string
  pendingEvidenceState: PendingEvidenceState
}>

export type BudgetObservation = Readonly<{
  observationId: string
  observationKind: BudgetObservationKind
  complete: boolean
  cursor: Readonly<Record<string, unknown>>
  freshness: BudgetFreshness
  coverage: BudgetCoverage
  sourceBindingRevision: string
  semanticRevision: string
  rows: readonly PendingBudgetRow[]
  removedBudgetRefs?: readonly string[]
}>

export type BudgetApplyResult = Readonly<{
  status: 'STAGED' | 'COMMITTED' | 'REPLAYED' | 'REJECTED_DRIFT'
  checkpointRevision: string
  committedGeneration: string
  freshness: BudgetFreshness
  coverage: BudgetCoverage
  mergeState: BudgetMergeState
}>

export type BudgetObservationGap = Readonly<{
  observationId: string
  gapKind: BudgetObservationGapKind
}>

export type BudgetObservationGapResult = Readonly<{
  status: 'GAP_RECORDED' | 'REPLAYED'
  checkpointRevision: string
  committedGeneration: string
  freshness: BudgetFreshness
  coverage: BudgetCoverage
  mergeState: BudgetMergeState
}>

export type BudgetSyncState = Readonly<{
  syncId: string
  checkpointRevision: string
  committedGeneration: string
  committedCursor: Readonly<Record<string, unknown>>
  workingGeneration: string | null
  workingCursor: Readonly<Record<string, unknown>> | null
  observationKind: BudgetObservationKind | null
  freshness: BudgetFreshness
  coverage: BudgetCoverage
  mergeState: BudgetMergeState
  sourceBindingRevision: string | null
  semanticRevision: string | null
  lastObservationId: string | null
  lastObservationDigest: string | null
  lastCompletedAt: string | null
  lastGapKind: BudgetObservationGapKind | null
  updatedAt: string
}>

export type CurrentBudgetSnapshot = Readonly<{
  state: BudgetSyncState
  items: readonly PendingBudgetRow[]
}>

type ApplyRow = QueryResultRow & Readonly<{
  status: BudgetApplyResult['status']
  checkpoint_revision: string | number
  committed_generation: string | number
  freshness: BudgetFreshness
  coverage: BudgetCoverage
  merge_state: BudgetMergeState
}>

type GapRow = QueryResultRow & Readonly<{
  status: BudgetObservationGapResult['status']
  checkpoint_revision: string | number
  committed_generation: string | number
  freshness: BudgetFreshness
  coverage: BudgetCoverage
  merge_state: BudgetMergeState
}>

type StateRow = QueryResultRow & Readonly<{
  sync_id: string
  checkpoint_revision: string | number
  committed_generation: string | number
  committed_cursor: Readonly<Record<string, unknown>>
  working_generation: string | number | null
  working_cursor: Readonly<Record<string, unknown>> | null
  observation_kind: BudgetObservationKind | null
  freshness: BudgetFreshness
  coverage: BudgetCoverage
  merge_state: BudgetMergeState
  source_binding_revision: string | null
  semantic_revision: string | null
  last_observation_id: string | null
  last_observation_digest: string | null
  last_completed_at: Date | string | null
  last_gap_kind: BudgetObservationGapKind | null
  updated_at: Date | string
}>

type ItemRow = QueryResultRow & Readonly<{
  budget_ref: string
  canonical_business_date: string
  last_change_at: Date | string | null
  budget_value: string | number
  currency_code: string
  seller_id: string
  seller_name: string
  customer_id: string
  customer_name: string
  source_company_id: string
  pending_evidence_state: PendingEvidenceState
}>

const text = (value: string, field: string): string => {
  if (typeof value !== 'string' || !/\S/.test(value)) throw new Error(`PROJECT_BUDGET_${field.toUpperCase()}_REFUSED`)
  return value
}

const canonicalDigest = (value: unknown): string => {
  try {
    return sha256(canonicalBytes(value))
  } catch {
    throw new Error('PROJECT_SYNC_CANONICALIZATION_REFUSED')
  }
}

const databaseRow = (row: PendingBudgetRow) => ({
  budget_ref: text(row.budgetRef, 'budget_ref'),
  canonical_business_date: text(row.canonicalBusinessDate, 'canonical_business_date'),
  last_change_at: row.lastChangeAt,
  budget_value: text(row.budgetValue, 'budget_value'),
  currency_code: text(row.currencyCode, 'currency_code'),
  seller_id: text(row.sellerId, 'seller_id'),
  seller_name: text(row.sellerName, 'seller_name'),
  customer_id: text(row.customerId, 'customer_id'),
  customer_name: text(row.customerName, 'customer_name'),
  source_company_id: text(row.sourceCompanyId, 'source_company_id'),
  pending_evidence_state: row.pendingEvidenceState,
})

const normalizedObservation = (observation: BudgetObservation) => {
  const rows = observation.rows.map(databaseRow).sort((left, right) => left.budget_ref.localeCompare(right.budget_ref))
  if (new Set(rows.map(row => row.budget_ref)).size !== rows.length) {
    throw new Error('PROJECT_SYNC_DUPLICATE_BUDGET_REF_REFUSED')
  }
  return {
    observationId: text(observation.observationId, 'observation_id'),
    observationKind: observation.observationKind,
    complete: observation.complete,
    cursor: observation.cursor,
    freshness: observation.freshness,
    coverage: observation.coverage,
    sourceBindingRevision: text(observation.sourceBindingRevision, 'source_binding_revision'),
    semanticRevision: text(observation.semanticRevision, 'semantic_revision'),
    rows,
    removedBudgetRefs: [...(observation.removedBudgetRefs ?? [])].sort(),
  }
}

export const observationDigest = (observation: BudgetObservation): string => canonicalDigest(normalizedObservation(observation))

export const observationGapDigest = (gap: BudgetObservationGap): string => {
  const observationId = text(gap.observationId, 'observation_id')
  return canonicalDigest({ observationId, gapKind: gap.gapKind })
}

const mapApplyResult = (row: ApplyRow): BudgetApplyResult => ({
  status: row.status,
  checkpointRevision: String(row.checkpoint_revision),
  committedGeneration: String(row.committed_generation),
  freshness: row.freshness,
  coverage: row.coverage,
  mergeState: row.merge_state,
})

const mapGapResult = (row: GapRow): BudgetObservationGapResult => ({
  status: row.status,
  checkpointRevision: String(row.checkpoint_revision),
  committedGeneration: String(row.committed_generation),
  freshness: row.freshness,
  coverage: row.coverage,
  mergeState: row.merge_state,
})

const iso = (value: Date | string | null): string | null => value === null ? null : value instanceof Date ? value.toISOString() : value

const mapState = (row: StateRow): BudgetSyncState => ({
  syncId: row.sync_id,
  checkpointRevision: String(row.checkpoint_revision),
  committedGeneration: String(row.committed_generation),
  committedCursor: row.committed_cursor,
  workingGeneration: row.working_generation === null ? null : String(row.working_generation),
  workingCursor: row.working_cursor,
  observationKind: row.observation_kind,
  freshness: row.freshness,
  coverage: row.coverage,
  mergeState: row.merge_state,
  sourceBindingRevision: row.source_binding_revision,
  semanticRevision: row.semantic_revision,
  lastObservationId: row.last_observation_id,
  lastObservationDigest: row.last_observation_digest,
  lastCompletedAt: iso(row.last_completed_at),
  lastGapKind: row.last_gap_kind,
  updatedAt: iso(row.updated_at) ?? '',
})

const mapItem = (row: ItemRow): PendingBudgetRow => ({
  budgetRef: row.budget_ref,
  canonicalBusinessDate: row.canonical_business_date,
  lastChangeAt: iso(row.last_change_at),
  budgetValue: String(row.budget_value),
  currencyCode: row.currency_code,
  sellerId: row.seller_id,
  sellerName: row.seller_name,
  customerId: row.customer_id,
  customerName: row.customer_name,
  sourceCompanyId: row.source_company_id,
  pendingEvidenceState: row.pending_evidence_state,
})

const rollback = async (client: PoolClient): Promise<void> => {
  try { await client.query('ROLLBACK') } catch { /* preserve the original database error */ }
}

export const applyBudgetObservation = async ({
  pool,
  observation,
  expectedCheckpointRevision,
}: Readonly<{
  pool: PostgresPool
  observation: BudgetObservation
  expectedCheckpointRevision: string | number
}>): Promise<BudgetApplyResult> => {
  const normalized = normalizedObservation(observation)
  const digest = observationDigest(observation)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await client.query<ApplyRow>(`
      SELECT * FROM budget_analyzer.apply_budget_observation(
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
      )
    `, [
      BUDGET_ANALYZER_SYNC_ID,
      expectedCheckpointRevision,
      normalized.observationId,
      digest,
      normalized.observationKind,
      normalized.complete,
      normalized.cursor,
      normalized.freshness,
      normalized.coverage,
      normalized.sourceBindingRevision,
      normalized.semanticRevision,
      JSON.stringify(normalized.rows),
      normalized.removedBudgetRefs,
    ])
    const row = result.rows[0]
    if (!row) throw new Error('PROJECT_SYNC_RESULT_MISSING')
    await client.query('COMMIT')
    return mapApplyResult(row)
  } catch (error) {
    await rollback(client)
    throw error
  } finally {
    client.release()
  }
}

export const recordBudgetObservationGap = async ({
  pool,
  gap,
  expectedCheckpointRevision,
}: Readonly<{
  pool: PostgresPool
  gap: BudgetObservationGap
  expectedCheckpointRevision: string | number
}>): Promise<BudgetObservationGapResult> => {
  const observationId = text(gap.observationId, 'observation_id')
  const gapDigest = observationGapDigest(gap)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await client.query<GapRow>(`
      SELECT * FROM budget_analyzer.record_observation_gap($1, $2, $3, $4, $5)
    `, [BUDGET_ANALYZER_SYNC_ID, expectedCheckpointRevision, observationId, gapDigest, gap.gapKind])
    const row = result.rows[0]
    if (!row) throw new Error('PROJECT_SYNC_GAP_RESULT_MISSING')
    await client.query('COMMIT')
    return mapGapResult(row)
  } catch (error) {
    await rollback(client)
    throw error
  } finally {
    client.release()
  }
}

export const readCurrentBudgetSnapshot = async ({ pool }: Readonly<{ pool: PostgresPool }>): Promise<CurrentBudgetSnapshot> => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    const stateResult = await client.query<StateRow>(`
      SELECT * FROM budget_analyzer.current_sync_state
    `)
    const stateRow = stateResult.rows[0]
    if (!stateRow) throw new Error('PROJECT_SYNC_STATE_MISSING')
    const items = await client.query<ItemRow>(`
      SELECT budget_ref, canonical_business_date::text AS canonical_business_date, last_change_at, budget_value,
        currency_code, seller_id, seller_name, customer_id, customer_name,
        source_company_id, pending_evidence_state
      FROM budget_analyzer.current_pending_budget
      ORDER BY budget_ref
    `)
    await client.query('COMMIT')
    return { state: mapState(stateRow), items: items.rows.map(mapItem) }
  } catch (error) {
    await rollback(client)
    throw error
  } finally {
    client.release()
  }
}
