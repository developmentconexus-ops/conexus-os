import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import pg from 'pg'

import { runProjectMigrations } from '../../../scripts/run-project-migrations.mjs'
import { verifyR3CandidateFreeze } from '../../../scripts/check-r3-candidate-freeze.mjs'
import {
  applyBudgetObservation,
  observationGapDigest,
  readCurrentBudgetSnapshot,
  recordBudgetObservationGap,
} from '../../../apps/hub/src/project/read-model.ts'

const connectionString = process.env.CONEXUS_R3_DATABASE_URL
const sourceRevision = process.env.CONEXUS_PROJECT_SOURCE_REVISION
  ?? 'r3-p2-p3-implementation-candidate/2026-09-09'

const requireScratchDatabase = (value) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error('R3_DATABASE_URL_REQUIRED')
  const url = new URL(value)
  if (url.hostname !== '127.0.0.1' || url.port !== '55434' || url.pathname !== '/conexus_r3_project') {
    throw new Error('R3_SCRATCH_DATABASE_REQUIRED')
  }
  return value
}

const databaseUrl = requireScratchDatabase(connectionString)
const repositoryRoot = resolve(import.meta.dirname, '../../..')
const freezePath = resolve(repositoryRoot, 'docs/evidence/4f/4f-r3-rf05-rf08-candidate-freeze.md')
const receiptPath = resolve(repositoryRoot, 'docs/evidence/4f/4f-r3-p4-a-project-qualification-receipt.json')
const databaseName = decodeURIComponent(new URL(databaseUrl).pathname.slice(1))
const projectRoleSuffix = createHash('md5').update(databaseName, 'utf8').digest('hex')
const projectRoles = Object.freeze({
  migration: `project_migration_owner_${projectRoleSuffix}`,
  sync: `project_sync_runtime_${projectRoleSuffix}`,
  query: `project_query_runtime_${projectRoleSuffix}`,
})
const qualificationAdopters = Object.freeze({
  sync: `project_qualification_sync_${projectRoleSuffix}`,
  query: `project_qualification_query_${projectRoleSuffix}`,
})
const qualificationPasswords = Object.freeze({
  sync: randomBytes(24).toString('hex'),
  query: randomBytes(24).toString('hex'),
})
const pool = new pg.Pool({ connectionString: databaseUrl, max: 6, application_name: 'conexus-r3-root-qualification' })
const require = createRequire(import.meta.url)
const pgVersion = require('pg/package.json').version
const pgBossVersion = require('pg-boss/package.json').version

const runtimeConnectionStrings = Object.freeze(Object.fromEntries(Object.entries(qualificationAdopters).map(([capability, adopter]) => {
  const url = new URL(databaseUrl)
  url.username = adopter
  url.password = qualificationPasswords[capability]
  return [capability, url.toString()]
})))

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const row = (budgetRef, value, customer = 'Customer') => ({
  budget_ref: budgetRef,
  canonical_business_date: '2026-09-09',
  last_change_at: '2026-09-09T12:00:00Z',
  budget_value: value,
  currency_code: 'BRL',
  seller_id: 'seller-1',
  seller_name: 'Seller 1',
  customer_id: `customer-${budgetRef}`,
  customer_name: customer,
  source_company_id: 'company-1',
  pending_evidence_state: 'CONFIRMED',
})

const observations = {
  emptyComplete: { id: 'r3-empty-complete', kind: 'FULL_SNAPSHOT', complete: true, cursor: { snapshot: 0 }, freshness: 'CURRENT', coverage: 'COMPLETE', source: 'binding-r0', semantic: 'semantic-r1', rows: [] },
  duplicateBudgetRef: { id: 'r3-duplicate-budget-ref', kind: 'FULL_SNAPSHOT', complete: true, cursor: { snapshot: 0 }, freshness: 'CURRENT', coverage: 'COMPLETE', source: 'binding-r0', semantic: 'semantic-r1', rows: [row('B-DUPLICATE', '1.00'), row('B-DUPLICATE', '2.00')] },
  firstPartial: { id: 'r3-first-partial', kind: 'FULL_SNAPSHOT', complete: false, cursor: { snapshot: 1, page: 1 }, freshness: 'STALE', coverage: 'PARTIAL', source: 'binding-r0', semantic: 'semantic-r1', rows: [row('B-001', '90.00')] },
  semanticDrift: { id: 'r3-first-semantic-drift', kind: 'FULL_SNAPSHOT', complete: true, cursor: { snapshot: 1, page: 2 }, freshness: 'CURRENT', coverage: 'COMPLETE', source: 'binding-r0', semantic: 'semantic-r2', rows: [row('B-001', '100.00'), row('B-002', '200.00')] },
  full1: { id: 'r3-full-1', kind: 'FULL_SNAPSHOT', complete: true, cursor: { page: 1 }, freshness: 'CURRENT', coverage: 'COMPLETE', source: 'binding-r1', semantic: 'semantic-r1', rows: [row('B-001', '100.00'), row('B-002', '200.00')] },
  partial: { id: 'r3-full-partial', kind: 'FULL_SNAPSHOT', complete: false, cursor: { page: 2 }, freshness: 'STALE', coverage: 'PARTIAL', source: 'binding-r1', semantic: 'semantic-r1', rows: [row('B-001', '110.00')] },
  full2: { id: 'r3-full-2', kind: 'FULL_SNAPSHOT', complete: true, cursor: { page: 1, snapshot: 2 }, freshness: 'CURRENT', coverage: 'COMPLETE', source: 'binding-r1', semantic: 'semantic-r1', rows: [row('B-001', '120.00'), row('B-003', '300.00')] },
  delta1: { id: 'r3-delta-1', kind: 'INCREMENTAL_DELTA', complete: true, cursor: { cursor: 3 }, freshness: 'CURRENT', coverage: 'COMPLETE', source: 'binding-r1', semantic: 'semantic-r1', rows: [row('B-001', '125.00')], removed: [] },
  delta2: { id: 'r3-delta-2', kind: 'INCREMENTAL_DELTA', complete: true, cursor: { cursor: 4 }, freshness: 'CURRENT', coverage: 'COMPLETE', source: 'binding-r1', semantic: 'semantic-r1', rows: [], removed: ['B-003'] },
  drift: { id: 'r3-drift', kind: 'FULL_SNAPSHOT', complete: true, cursor: { snapshot: 5 }, freshness: 'CURRENT', coverage: 'COMPLETE', source: 'binding-r2', semantic: 'semantic-r1', rows: [row('B-004', '400.00')] },
  rebaselinePartial: { id: 'r3-rebaseline-partial', kind: 'FULL_SNAPSHOT', complete: false, cursor: { snapshot: 6, page: 1 }, freshness: 'STALE', coverage: 'PARTIAL', source: 'binding-r2', semantic: 'semantic-r1', rows: [row('B-004', '400.00')] },
  rebaselineDrift: { id: 'r3-rebaseline-drift', kind: 'FULL_SNAPSHOT', complete: true, cursor: { snapshot: 6, page: 2 }, freshness: 'CURRENT', coverage: 'COMPLETE', source: 'binding-r3', semantic: 'semantic-r1', rows: [row('B-004', '405.00')] },
  rebaseline: { id: 'r3-rebaseline', kind: 'FULL_SNAPSHOT', complete: true, cursor: { snapshot: 6, page: 2 }, freshness: 'CURRENT', coverage: 'COMPLETE', source: 'binding-r2', semantic: 'semantic-r1', rows: [row('B-004', '400.00')] },
  gapRecoveryPartial: { id: 'r3-gap-recovery-partial', kind: 'FULL_SNAPSHOT', complete: false, cursor: { snapshot: 7, page: 1 }, freshness: 'STALE', coverage: 'PARTIAL', source: 'binding-r3', semantic: 'semantic-r1', rows: [row('B-004', '405.00')] },
  gapRecovery: { id: 'r3-gap-recovery', kind: 'FULL_SNAPSHOT', complete: true, cursor: { snapshot: 7, page: 2 }, freshness: 'CURRENT', coverage: 'COMPLETE', source: 'binding-r3', semantic: 'semantic-r1', rows: [row('B-004', '410.00')] },
  postRecoveryDrift: { id: 'r3-post-recovery-drift', kind: 'FULL_SNAPSHOT', complete: true, cursor: { snapshot: 8, page: 1 }, freshness: 'CURRENT', coverage: 'COMPLETE', source: 'binding-r4', semantic: 'semantic-r1', rows: [row('B-004', '420.00')] },
  postDriftRecovery: { id: 'r3-post-drift-recovery', kind: 'FULL_SNAPSHOT', complete: true, cursor: { snapshot: 8, page: 2 }, freshness: 'CURRENT', coverage: 'COMPLETE', source: 'binding-r4', semantic: 'semantic-r1', rows: [row('B-004', '420.00')] },
  missingGapRecovery: { id: 'r3-missing-gap-recovery', kind: 'FULL_SNAPSHOT', complete: true, cursor: { snapshot: 9, page: 1 }, freshness: 'CURRENT', coverage: 'COMPLETE', source: 'binding-r4', semantic: 'semantic-r1', rows: [row('B-004', '430.00')] },
}

const toAdapterObservation = observation => ({
  observationId: observation.id,
  observationKind: observation.kind,
  complete: observation.complete,
  cursor: observation.cursor,
  freshness: observation.freshness,
  coverage: observation.coverage,
  sourceBindingRevision: observation.source,
  semanticRevision: observation.semantic,
  rows: observation.rows.map(item => ({
    budgetRef: item.budget_ref,
    canonicalBusinessDate: item.canonical_business_date,
    lastChangeAt: item.last_change_at,
    budgetValue: item.budget_value,
    currencyCode: item.currency_code,
    sellerId: item.seller_id,
    sellerName: item.seller_name,
    customerId: item.customer_id,
    customerName: item.customer_name,
    sourceCompanyId: item.source_company_id,
    pendingEvidenceState: item.pending_evidence_state,
  })),
  removedBudgetRefs: observation.removed ?? [],
})

const invoke = async (observation, expectedRevision) => {
  const result = await applyBudgetObservation({
    pool: adapterPool(projectRoles.sync),
    observation: toAdapterObservation(observation),
    expectedCheckpointRevision: expectedRevision,
  })
  return {
    status: result.status,
    checkpoint_revision: result.checkpointRevision,
    committed_generation: result.committedGeneration,
    freshness: result.freshness,
    coverage: result.coverage,
    merge_state: result.mergeState,
  }
}

const invokeGap = async (client, gapKind, expectedRevision, { observationId = `r3-gap-${gapKind.toLowerCase()}`, digestOverride } = {}) => (await client.query(`
  SELECT * FROM budget_analyzer.record_observation_gap($1,$2,$3,$4,$5)
`, [
  'budget-analyzer-sync/v1', expectedRevision, observationId, digestOverride ?? observationGapDigest({ observationId, gapKind }), gapKind,
])).rows[0]

const asRole = async (role, work) => {
  const capability = role === projectRoles.sync ? 'sync' : role === projectRoles.query ? 'query' : null
  if (!capability) throw new Error('PROJECT_SYNC_RUNTIME_ROLE_REFUSED')
  const client = new pg.Client({ connectionString: runtimeConnectionStrings[capability], application_name: `conexus-r3-runtime-${role}` })
  try {
    await client.connect()
    await client.query('BEGIN')
    await client.query(`SET LOCAL ROLE ${role}`)
    const value = await work(client)
    await client.query('COMMIT')
    return value
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    await client.end()
  }
}

const adapterPool = (role) => ({
  connect: async () => {
    const capability = role === projectRoles.sync ? 'sync' : role === projectRoles.query ? 'query' : null
    if (!capability) throw new Error('PROJECT_SYNC_RUNTIME_ROLE_REFUSED')
    const client = new pg.Client({ connectionString: runtimeConnectionStrings[capability], application_name: `conexus-r3-adapter-${role}` })
    await client.connect()
    await client.query(`SET ROLE ${role}`)
    client.release = () => { void client.end() }
    return client
  },
})

const provisionQualificationAdopters = async () => {
  for (const capability of ['sync', 'query']) {
    const adopter = qualificationAdopters[capability]
    const password = qualificationPasswords[capability]
    const capabilityRole = projectRoles[capability]
    await pool.query(`
      DO $$
      DECLARE
        v_role text := '${adopter}';
        v_password text := '${password}';
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
          EXECUTE format('CREATE ROLE %I LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS PASSWORD %L', v_role, v_password);
        ELSE
          EXECUTE format('ALTER ROLE %I LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS PASSWORD %L', v_role, v_password);
        END IF;
      END $$;
    `)
    await pool.query(`GRANT CONNECT ON DATABASE "${databaseName}" TO "${adopter}"`)
    await pool.query(`GRANT "${capabilityRole}" TO "${adopter}"`)
  }
}

const expectCode = async (work, code) => {
  let observed
  await assert.rejects(work, (error) => {
    observed = error.message
    assert.equal(error.message, code)
    return true
  })
  return observed
}

const proofPass = observed => ({ observed })

const current = async () => asRole(projectRoles.query, async (client) => ({
  state: (await client.query('SELECT * FROM budget_analyzer.current_sync_state')).rows[0],
  items: (await client.query('SELECT budget_ref,budget_value,generation FROM budget_analyzer.current_pending_budget ORDER BY budget_ref')).rows,
}))

try {
  const first = await runProjectMigrations({ connectionString: databaseUrl, projectSourceRevision: sourceRevision })
  const second = await runProjectMigrations({ connectionString: databaseUrl, projectSourceRevision: sourceRevision })
  assert.deepEqual(first.appliedNow, ['001', '002'])
  assert.deepEqual(second.appliedNow, [])
  await provisionQualificationAdopters()
  const runtimeRoleAdoption = {
    sync: await asRole(projectRoles.sync, async (client) => (await client.query('SELECT session_user, current_user')).rows[0]),
    query: await asRole(projectRoles.query, async (client) => (await client.query('SELECT session_user, current_user')).rows[0]),
  }
  assert.deepEqual(runtimeRoleAdoption.sync, { session_user: qualificationAdopters.sync, current_user: projectRoles.sync })
  assert.deepEqual(runtimeRoleAdoption.query, { session_user: qualificationAdopters.query, current_user: projectRoles.query })
  const sourceRevisionMismatch = await expectCode(() => runProjectMigrations({ connectionString: databaseUrl, projectSourceRevision: 'wrong-source-revision' }), 'PROJECT_MIGRATION_SOURCE_REVISION_MISMATCH:001')
  const emptyCompleteRejected = await expectCode(() => invoke(observations.emptyComplete, '0'), 'PROJECT_SYNC_EMPTY_COMPLETE_REFUSED')
  const duplicateBudgetRefAdapterRejected = await expectCode(() => invoke(observations.duplicateBudgetRef, '0'), 'PROJECT_SYNC_DUPLICATE_BUDGET_REF_REFUSED')
  const duplicateBudgetRefCapabilityRejected = await expectCode(() => asRole(projectRoles.sync, (client) => client.query(`
    SELECT * FROM budget_analyzer.apply_budget_observation(
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
    )
  `, [
    'budget-analyzer-sync/v1', '0', observations.duplicateBudgetRef.id, 'd'.repeat(64),
    observations.duplicateBudgetRef.kind, observations.duplicateBudgetRef.complete,
    observations.duplicateBudgetRef.cursor, observations.duplicateBudgetRef.freshness,
    observations.duplicateBudgetRef.coverage, observations.duplicateBudgetRef.source,
    observations.duplicateBudgetRef.semantic, JSON.stringify(observations.duplicateBudgetRef.rows), [],
  ])), 'PROJECT_SYNC_DUPLICATE_BUDGET_REF_REFUSED')

  const firstPartial = await invoke(observations.firstPartial, '0')
  assert.equal(firstPartial.status, 'STAGED')
  let snapshot = await current()
  assert.equal(snapshot.state.committed_generation, '0')
  assert.equal(snapshot.state.working_generation, '1')
  assert.deepEqual(snapshot.state.working_cursor, { snapshot: 1, page: 1 })
  assert.equal(snapshot.state.observation_kind, 'FULL_SNAPSHOT')
  assert.equal(firstPartial.freshness, 'UNKNOWN')
  assert.equal(firstPartial.coverage, 'UNKNOWN')
  assert.equal(firstPartial.merge_state, 'UNKNOWN')
  assert.equal(snapshot.state.freshness, 'UNKNOWN')
  assert.equal(snapshot.state.coverage, 'UNKNOWN')
  assert.equal(snapshot.state.merge_state, 'UNKNOWN')
  assert.deepEqual(snapshot.items, [])
  const snapshotAtomicVisibility = proofPass({
    status: firstPartial.status,
    committedGeneration: snapshot.state.committed_generation,
    workingGeneration: snapshot.state.working_generation,
    freshness: snapshot.state.freshness,
    coverage: snapshot.state.coverage,
    currentItems: snapshot.items,
  })
  const workingStateVisible = proofPass({
    workingGeneration: snapshot.state.working_generation,
    workingCursor: snapshot.state.working_cursor,
    observationKind: snapshot.state.observation_kind,
    freshness: snapshot.state.freshness,
    coverage: snapshot.state.coverage,
    mergeState: snapshot.state.merge_state,
  })

  const semanticDrift = await invoke(observations.semanticDrift, '1')
  assert.equal(semanticDrift.status, 'REJECTED_DRIFT')
  snapshot = await current()
  assert.equal(snapshot.state.committed_generation, '0')
  assert.equal(snapshot.state.working_generation, null)
  assert.equal(snapshot.state.freshness, 'UNKNOWN')
  const semanticOnlyDriftRejected = proofPass({ status: semanticDrift.status, committedGeneration: snapshot.state.committed_generation, workingGeneration: snapshot.state.working_generation, freshness: snapshot.state.freshness })

  const initial = await invoke(observations.full1, '2')
  assert.equal(initial.status, 'COMMITTED')
  snapshot = await current()
  assert.deepEqual(snapshot.items.map((item) => item.budget_ref), ['B-001', 'B-002'])
  assert.equal(snapshot.state.freshness, 'CURRENT')

  const staged = await invoke(observations.partial, '3')
  assert.equal(staged.status, 'STAGED')
  snapshot = await current()
  assert.deepEqual(snapshot.items.map((item) => item.budget_ref), ['B-001', 'B-002'])
  assert.equal(snapshot.items.find((item) => item.budget_ref === 'B-001').budget_value, '100.00')
  assert.equal(snapshot.state.merge_state, 'INGESTING')
  assert.equal(snapshot.state.committed_generation, '1')
  assert.equal(snapshot.state.working_generation, '2')
  assert.deepEqual(snapshot.state.working_cursor, { page: 2 })

  const completed = await invoke(observations.full2, '4')
  assert.equal(completed.status, 'COMMITTED')
  snapshot = await current()
  assert.deepEqual(snapshot.items.map((item) => item.budget_ref), ['B-001', 'B-003'])
  assert.equal(snapshot.items.find((item) => item.budget_ref === 'B-001').budget_value, '120.00')
  const snapshotDeletion = proofPass({ status: completed.status, currentRefs: snapshot.items.map((item) => item.budget_ref), omittedRef: 'B-002' })

  const delta = await invoke(observations.delta1, '5')
  assert.equal(delta.status, 'COMMITTED')
  snapshot = await current()
  assert.deepEqual(snapshot.items.map((item) => item.budget_ref), ['B-001', 'B-003'])
  assert.equal(snapshot.items.find((item) => item.budget_ref === 'B-003').budget_value, '300.00')
  const deltaOmissionRetains = proofPass({ status: delta.status, currentRefs: snapshot.items.map((item) => item.budget_ref), retainedRef: 'B-003' })

  const tombstone = await invoke(observations.delta2, '6')
  assert.equal(tombstone.status, 'COMMITTED')
  snapshot = await current()
  assert.deepEqual(snapshot.items.map((item) => item.budget_ref), ['B-001'])
  assert.equal(snapshot.items[0].budget_value, '125.00')
  const deltaExplicitTombstoneDeletes = proofPass({ status: tombstone.status, currentRefs: snapshot.items.map((item) => item.budget_ref), deletedRef: 'B-003' })

  const staleWriterError = await expectCode(() => invoke(observations.full2, '3'), 'PROJECT_SYNC_STALE_WRITER')
  const afterStale = await current()
  assert.equal(afterStale.state.committed_generation, '4')

  const drift = await invoke(observations.drift, '7')
  assert.equal(drift.status, 'REJECTED_DRIFT')
  snapshot = await current()
  assert.equal(snapshot.state.freshness, 'UNKNOWN')
  assert.equal(snapshot.state.merge_state, 'UNKNOWN')
  assert.deepEqual(snapshot.items.map((item) => item.budget_ref), ['B-001'])
  const sourceDriftDegradesCurrent = proofPass({ status: drift.status, freshness: snapshot.state.freshness, coverage: snapshot.state.coverage, mergeState: snapshot.state.merge_state, currentRefs: snapshot.items.map((item) => item.budget_ref) })
  const deltaRebaselineError = await expectCode(() => invoke(observations.delta1, '8'), 'PROJECT_SYNC_REBASELINE_REQUIRED')
  const rebaselinePartial = await invoke(observations.rebaselinePartial, '8')
  assert.equal(rebaselinePartial.status, 'STAGED')
  assert.equal(rebaselinePartial.freshness, 'UNKNOWN')
  assert.equal(rebaselinePartial.coverage, 'UNKNOWN')
  snapshot = await current()
  assert.equal(snapshot.state.freshness, 'UNKNOWN')
  assert.equal(snapshot.state.coverage, 'UNKNOWN')
  assert.equal(snapshot.state.merge_state, 'UNKNOWN')
  assert.equal(snapshot.state.committed_generation, '4')
  assert.deepEqual(snapshot.items.map((item) => item.budget_ref), ['B-001'])
  const multiBatchRebaselineAfterDrift = proofPass({
    partialStatus: rebaselinePartial.status,
    partialFreshness: rebaselinePartial.freshness,
    partialCoverage: rebaselinePartial.coverage,
    persistedFreshness: snapshot.state.freshness,
    persistedCoverage: snapshot.state.coverage,
    persistedMergeState: snapshot.state.merge_state,
    commitStatus: null,
  })
  const midRecoveryDrift = await invoke(observations.rebaselineDrift, '9')
  assert.equal(midRecoveryDrift.status, 'REJECTED_DRIFT')
  snapshot = await current()
  assert.equal(snapshot.state.committed_generation, '4')
  assert.equal(snapshot.state.working_generation, null)
  assert.equal(snapshot.state.freshness, 'UNKNOWN')
  assert.equal(snapshot.state.coverage, 'UNKNOWN')
  assert.equal(snapshot.state.merge_state, 'UNKNOWN')
  const midRecoveryDriftRejected = proofPass({
    status: midRecoveryDrift.status,
    committedGeneration: snapshot.state.committed_generation,
    workingGeneration: snapshot.state.working_generation,
    freshness: snapshot.state.freshness,
    coverage: snapshot.state.coverage,
    mergeState: snapshot.state.merge_state,
  })
  multiBatchRebaselineAfterDrift.observed.terminationStatus = midRecoveryDrift.status
  const rebaseline = await invoke(observations.rebaseline, '10')
  assert.equal(rebaseline.status, 'COMMITTED')
  snapshot = await current()
  assert.deepEqual(snapshot.items.map((item) => item.budget_ref), ['B-004'])

  const gap = await recordBudgetObservationGap({
    pool: adapterPool(projectRoles.sync),
    gap: { observationId: 'r3-gap-ambiguous', gapKind: 'AMBIGUOUS' },
    expectedCheckpointRevision: '11',
  })
  assert.equal(gap.status, 'GAP_RECORDED')
  snapshot = await current()
  assert.equal(snapshot.state.freshness, 'UNKNOWN')
  assert.equal(snapshot.state.coverage, 'UNKNOWN')
  assert.equal(snapshot.state.merge_state, 'UNKNOWN')
  assert.equal(snapshot.state.last_gap_kind, 'AMBIGUOUS')
  assert.equal(snapshot.state.committed_generation, '5')
  assert.deepEqual(snapshot.items.map((item) => item.budget_ref), ['B-004'])
  const ambiguousObservationRemainsUnknown = proofPass({ status: gap.status, freshness: snapshot.state.freshness, coverage: snapshot.state.coverage, mergeState: snapshot.state.merge_state, lastGapKind: snapshot.state.last_gap_kind, currentRefs: snapshot.items.map((item) => item.budget_ref) })
  const observationGapKindVisible = proofPass({ status: gap.status, lastGapKind: snapshot.state.last_gap_kind })

  const gapReplay = await recordBudgetObservationGap({
    pool: adapterPool(projectRoles.sync),
    gap: { observationId: 'r3-gap-ambiguous', gapKind: 'AMBIGUOUS' },
    expectedCheckpointRevision: '12',
  })
  assert.equal(gapReplay.status, 'REPLAYED')
  assert.equal(gapReplay.checkpointRevision, '12')
  const observationGapReplayIdempotent = proofPass({ status: gapReplay.status, checkpointRevision: gapReplay.checkpointRevision, committedGeneration: gapReplay.committedGeneration })
  const gapConflictError = await expectCode(() => asRole(projectRoles.sync, (client) => invokeGap(client, 'AMBIGUOUS', '12', { digestOverride: 'f'.repeat(64) })), 'PROJECT_SYNC_OBSERVATION_CONFLICT')
  const observationGapConflictRejected = proofPass(gapConflictError)
  const gapStaleWriterError = await expectCode(() => asRole(projectRoles.sync, (client) => invokeGap(client, 'AMBIGUOUS', '11', { observationId: 'r3-gap-stale-writer' })), 'PROJECT_SYNC_STALE_WRITER')
  const observationGapStaleWriterRejected = proofPass(gapStaleWriterError)

  const gapRecoveryPartial = await invoke(observations.gapRecoveryPartial, '12')
  assert.equal(gapRecoveryPartial.status, 'STAGED')
  assert.equal(gapRecoveryPartial.freshness, 'UNKNOWN')
  snapshot = await current()
  assert.equal(snapshot.state.freshness, 'UNKNOWN')
  assert.equal(snapshot.state.last_gap_kind, 'AMBIGUOUS')
  assert.equal(snapshot.state.committed_generation, '5')
  assert.deepEqual(snapshot.items.map((item) => item.budget_ref), ['B-004'])
  const observationGapPartialRemainsUnknown = proofPass({ status: gapRecoveryPartial.status, returnedFreshness: gapRecoveryPartial.freshness, persistedFreshness: snapshot.state.freshness, persistedCoverage: snapshot.state.coverage, persistedMergeState: snapshot.state.merge_state, persistedLastGapKind: snapshot.state.last_gap_kind })

  const gapRecovery = await invoke(observations.gapRecovery, '13')
  assert.equal(gapRecovery.status, 'COMMITTED')
  snapshot = await current()
  assert.equal(snapshot.state.last_gap_kind, null)
  assert.equal(snapshot.state.freshness, 'CURRENT')
  assert.equal(snapshot.state.committed_generation, '6')
  const observationGapRebaseline = proofPass({ status: gapRecovery.status, freshness: snapshot.state.freshness, lastGapKind: snapshot.state.last_gap_kind })

  const postRecoveryDrift = await invoke(observations.postRecoveryDrift, '14')
  assert.equal(postRecoveryDrift.status, 'REJECTED_DRIFT')
  snapshot = await current()
  assert.equal(snapshot.state.freshness, 'UNKNOWN')
  assert.equal(snapshot.state.last_gap_kind, null)
  const observationGapKindClearedOnDrift = proofPass({ status: postRecoveryDrift.status, freshness: snapshot.state.freshness, lastGapKind: snapshot.state.last_gap_kind })

  const postDriftRecovery = await invoke(observations.postDriftRecovery, '15')
  assert.equal(postDriftRecovery.status, 'COMMITTED')
  snapshot = await current()
  assert.equal(snapshot.state.freshness, 'CURRENT')
  assert.equal(snapshot.state.committed_generation, '7')
  assert.equal(snapshot.state.last_gap_kind, null)
  const observationGapKindClearedOnRecovery = proofPass({ status: postDriftRecovery.status, freshness: snapshot.state.freshness, lastGapKind: snapshot.state.last_gap_kind })

  const missingGap = await recordBudgetObservationGap({
    pool: adapterPool(projectRoles.sync),
    gap: { observationId: 'r3-gap-missing', gapKind: 'MISSING' },
    expectedCheckpointRevision: '16',
  })
  assert.equal(missingGap.status, 'GAP_RECORDED')
  snapshot = await current()
  assert.equal(snapshot.state.freshness, 'UNKNOWN')
  assert.equal(snapshot.state.coverage, 'UNKNOWN')
  assert.equal(snapshot.state.merge_state, 'UNKNOWN')
  assert.equal(snapshot.state.last_gap_kind, 'MISSING')
  assert.equal(snapshot.state.committed_generation, '7')
  assert.deepEqual(snapshot.items.map((item) => item.budget_ref), ['B-004'])
  const missingObservationRemainsUnknown = proofPass({ status: missingGap.status, freshness: snapshot.state.freshness, coverage: snapshot.state.coverage, mergeState: snapshot.state.merge_state, lastGapKind: snapshot.state.last_gap_kind, currentRefs: snapshot.items.map((item) => item.budget_ref) })

  const missingGapRecovery = await invoke(observations.missingGapRecovery, '17')
  assert.equal(missingGapRecovery.status, 'COMMITTED')
  snapshot = await current()
  assert.equal(snapshot.state.last_gap_kind, null)
  assert.equal(snapshot.state.freshness, 'CURRENT')
  assert.equal(snapshot.state.committed_generation, '8')
  const missingObservationRebaseline = proofPass({ status: missingGapRecovery.status, freshness: snapshot.state.freshness, lastGapKind: snapshot.state.last_gap_kind, committedGeneration: snapshot.state.committed_generation })

  const adapterSnapshot = await readCurrentBudgetSnapshot({ pool: adapterPool(projectRoles.query) })
  assert.equal(adapterSnapshot.state.committedGeneration, '8')
  assert.equal(adapterSnapshot.state.freshness, 'CURRENT')
  assert.equal(adapterSnapshot.state.coverage, 'COMPLETE')
  assert.equal(adapterSnapshot.state.mergeState, 'IDLE')
  assert.deepEqual(adapterSnapshot.items.map((item) => item.budgetRef), ['B-004'])
  assert.equal(adapterSnapshot.items[0].canonicalBusinessDate, '2026-09-09')
  const readModelAdapterObserved = proofPass({
    committedGeneration: adapterSnapshot.state.committedGeneration,
    freshness: adapterSnapshot.state.freshness,
    coverage: adapterSnapshot.state.coverage,
    mergeState: adapterSnapshot.state.mergeState,
    currentRefs: adapterSnapshot.items.map((item) => item.budgetRef),
    canonicalBusinessDate: adapterSnapshot.items[0].canonicalBusinessDate,
  })

  const directDml = await asRole(projectRoles.sync, async (client) => {
    const result = {}
    for (const [key, statement] of Object.entries({
      insert: `INSERT INTO budget_analyzer.pending_budget (generation,budget_ref,canonical_business_date,budget_value,currency_code,seller_id,seller_name,customer_id,customer_name,source_company_id,pending_evidence_state) VALUES (999,'DIRECT','2026-09-09',1,'BRL','s','S','c','C','co','CONFIRMED')`,
      update: `UPDATE budget_analyzer.sync_checkpoint SET freshness='CURRENT' WHERE sync_id='budget-analyzer-sync/v1'`,
      delete: `DELETE FROM budget_analyzer.pending_budget`,
    })) {
      await client.query('SAVEPOINT direct_dml_probe')
      try {
        await client.query(statement)
        result[key] = 'UNEXPECTED_SUCCESS'
        await client.query('RELEASE SAVEPOINT direct_dml_probe')
      } catch (error) {
        result[key] = error.code
        await client.query('ROLLBACK TO SAVEPOINT direct_dml_probe')
        await client.query('RELEASE SAVEPOINT direct_dml_probe')
      }
    }
    return result
  })
  assert.deepEqual(directDml, { insert: '42501', update: '42501', delete: '42501' })
  const queryDirectDml = await asRole(projectRoles.query, async (client) => {
    try { await client.query('SELECT * FROM budget_analyzer.pending_budget'); return 'UNEXPECTED_SUCCESS' } catch (error) { return error.code }
  })
  assert.equal(queryDirectDml, '42501')

  const catalog = (await pool.query(`
    SELECT p.prosecdef, pg_get_userbyid(p.proowner) AS owner, p.proconfig,
      has_function_privilege($1, 'budget_analyzer.apply_budget_observation(text,bigint,text,text,text,boolean,jsonb,text,text,text,text,jsonb,text[])', 'EXECUTE') AS sync_execute,
      has_function_privilege($2, 'budget_analyzer.apply_budget_observation(text,bigint,text,text,text,boolean,jsonb,text,text,text,text,jsonb,text[])', 'EXECUTE') AS query_execute,
      has_function_privilege('public', 'budget_analyzer.apply_budget_observation(text,bigint,text,text,text,boolean,jsonb,text,text,text,text,jsonb,text[])', 'EXECUTE') AS public_execute,
      has_table_privilege($1, 'budget_analyzer.pending_budget', 'INSERT') AS sync_insert,
      has_table_privilege($2, 'budget_analyzer.current_pending_budget', 'SELECT') AS query_view_select,
      has_database_privilege('public', current_database(), 'CONNECT') AS public_database_connect_grant,
      has_database_privilege($1, current_database(), 'CONNECT') AS sync_database_connect_grant,
      has_database_privilege($2, current_database(), 'CONNECT') AS query_database_connect_grant
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='budget_analyzer' AND p.proname='apply_budget_observation'
  `, [projectRoles.sync, projectRoles.query])).rows[0]
  assert.equal(catalog.prosecdef, true)
  assert.equal(catalog.owner, projectRoles.migration)
  assert.deepEqual(catalog.proconfig, ['search_path=pg_catalog, budget_analyzer, pg_temp'])
  assert.equal(catalog.sync_execute, true)
  assert.equal(catalog.query_execute, false)
  assert.equal(catalog.public_execute, false)
  assert.equal(catalog.sync_insert, false)
  assert.equal(catalog.query_view_select, true)
  assert.equal(catalog.public_database_connect_grant, false)
  assert.equal(catalog.sync_database_connect_grant, true)
  assert.equal(catalog.query_database_connect_grant, true)

  const roleCatalog = (await pool.query(`
    SELECT rolname, rolcanlogin
    FROM pg_roles
    WHERE rolname = ANY($1::name[])
    ORDER BY rolname
  `, [[projectRoles.migration, projectRoles.sync, projectRoles.query]])).rows
  assert.deepEqual(roleCatalog, [
    { rolname: projectRoles.migration, rolcanlogin: false },
    { rolname: projectRoles.query, rolcanlogin: false },
    { rolname: projectRoles.sync, rolcanlogin: false },
  ])
  const projectRolesNoLogin = proofPass(roleCatalog)

  const gapCatalog = (await pool.query(`
    SELECT p.prosecdef, pg_get_userbyid(p.proowner) AS owner, p.proconfig,
      has_function_privilege($1, 'budget_analyzer.record_observation_gap(text,bigint,text,text,text)', 'EXECUTE') AS sync_execute,
      has_function_privilege($2, 'budget_analyzer.record_observation_gap(text,bigint,text,text,text)', 'EXECUTE') AS query_execute,
      has_function_privilege('public', 'budget_analyzer.record_observation_gap(text,bigint,text,text,text)', 'EXECUTE') AS public_execute
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='budget_analyzer' AND p.proname='record_observation_gap'
  `, [projectRoles.sync, projectRoles.query])).rows[0]
  assert.equal(gapCatalog.prosecdef, true)
  assert.equal(gapCatalog.owner, projectRoles.migration)
  assert.deepEqual(gapCatalog.proconfig, ['search_path=pg_catalog, budget_analyzer, pg_temp'])
  assert.equal(gapCatalog.sync_execute, true)
  assert.equal(gapCatalog.query_execute, false)
  assert.equal(gapCatalog.public_execute, false)

  const defaultAcl = (await pool.query(`
    SELECT COALESCE(bool_or(acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'), false) AS public_execute
    FROM pg_default_acl d
    JOIN pg_namespace n ON n.oid = d.defaclnamespace
    LEFT JOIN LATERAL aclexplode(d.defaclacl) acl ON true
    WHERE d.defaclrole = $1::regrole
      AND n.nspname = 'budget_analyzer'
      AND d.defaclobjtype = 'f'
  `, [projectRoles.migration])).rows[0]
  assert.equal(defaultAcl.public_execute, false)
  const defaultFunctionPublicExecuteClosed = proofPass(defaultAcl)

  const identity = (await pool.query(`SELECT current_database(), current_setting('server_version_num') AS server_version_num, current_setting('server_version') AS server_version`)).rows[0]
  const rawFalsifiers = {
    semanticOnlyDriftRejected,
    snapshotAtomicVisibility,
    workingStateVisible,
    snapshotDeletion,
    deltaOmissionRetains,
    deltaExplicitTombstoneDeletes,
    staleWriterRejected: proofPass(staleWriterError),
    midRecoveryDriftRejected,
    sourceDriftDegradesCurrent,
    deltaRebaselineRejectedAfterDrift: proofPass(deltaRebaselineError),
    multiBatchRebaselineAfterDrift,
    ambiguousObservationRemainsUnknown,
    observationGapKindVisible,
    observationGapReplayIdempotent,
    observationGapConflictRejected,
    observationGapStaleWriterRejected,
    observationGapPartialRemainsUnknown,
    observationGapKindClearedOnDrift,
    observationGapKindClearedOnRecovery,
    missingObservationRemainsUnknown,
    missingObservationRebaseline,
    emptyCompleteRejected: proofPass(emptyCompleteRejected),
    readModelAdapterObserved,
    observationGapRebaseline,
    directDmlDenied: proofPass(directDml),
    queryBaseTableDenied: proofPass(queryDirectDml),
    catalog: proofPass(catalog),
    gapCatalog: proofPass(gapCatalog),
    defaultFunctionPublicExecuteClosed,
    projectRolesNoLogin,
    runtimeRoleAdoption: proofPass(runtimeRoleAdoption),
    definerOwner: proofPass(catalog.owner),
    definerSearchPath: proofPass(catalog.proconfig),
    duplicateBudgetRefAdapterRejected: proofPass(duplicateBudgetRefAdapterRejected),
    duplicateBudgetRefCapabilityRejected: proofPass(duplicateBudgetRefCapabilityRejected),
  }
  const falsifiers = Object.fromEntries(Object.entries(rawFalsifiers).map(([name, value]) => [
    name,
    Object.hasOwn(value ?? {}, 'observed') ? value : proofPass(value),
  ]))
  const freeze = verifyR3CandidateFreeze({ root: repositoryRoot })
  const base = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8' }).trim()
  const receipt = {
    schema: 'conexus.r3-p4-a-project-qualification/v1',
    status: 'QUALIFIED_CONTROLLED_PROJECT_P4_A',
    executedAt: new Date().toISOString(),
    authority: 'R3 P4-A implementation review brief',
    repoHead: base,
    candidate: {
      base,
      freezeSha256: sha256(readFileSync(freezePath)),
      candidateManifestDigest: freeze.candidateManifestDigest,
      projectSourceRevision: sourceRevision,
    },
    tuple: { node: process.versions.node, pg: pgVersion, pgBoss: pgBossVersion, postgres: identity.server_version, serverVersionNum: identity.server_version_num, projectSourceRevision: sourceRevision, projectRoles },
    subject: {
      script: 'qualification/4f/r3-root-tuple/run.mjs',
      database: identity.current_database,
      migration: { firstRun: first.appliedNow, restartRun: second.appliedNow, sourceRevisionMismatch: sourceRevisionMismatch.error ?? sourceRevisionMismatch, isolationLedger: 'project_meta.schema_migration' },
      proofGate: { status: 'PASS_AFTER_LINEAR_ASSERTION_GATE', note: 'The fixture aborts on any failed assertion; falsifier records below are observations from that one gated execution.' },
      falsifiers,
      finalState: {
        freshness: adapterSnapshot.state.freshness,
        coverage: adapterSnapshot.state.coverage,
        mergeState: adapterSnapshot.state.mergeState,
        committedGeneration: adapterSnapshot.state.committedGeneration,
        lastGapKind: adapterSnapshot.state.lastGapKind,
        currentRefs: adapterSnapshot.items.map((item) => item.budgetRef),
        currentValue: adapterSnapshot.items[0]?.budgetValue ?? null,
      },
    },
    verdict: 'P4_A_CONTROLLED_PROJECT_FALSIFIERS_PASS',
    nonClaims: [
    'R3-P1..P7 closure',
    'independent dual-lane review closure',
    'Product runtime Project credential provisioning',
    'MAR single-flight, settlement or quiescence',
      'live JobRun, Sankhya, provider, model or external effect',
      'served Release, deployment, publication or merge',
    ],
    reopenTriggers: [
      'candidate freeze, tuple, dependency, vendor-DDL or runtime-config drift',
      'project source-revision or migration-ledger drift',
      'a P4-A falsifier failure or material independent-review finding',
      'new Product meaning, shared database, cross-owner write or effect route',
    ],
  }
  const serializedReceipt = `${JSON.stringify(receipt, null, 2)}\n`
  if (process.env.CONEXUS_R3_P4_A_RECEIPT_FILE !== undefined) {
    const requestedPath = resolve(repositoryRoot, process.env.CONEXUS_R3_P4_A_RECEIPT_FILE)
    if (requestedPath !== receiptPath) throw new Error('R3_P4_A_RECEIPT_PATH_REFUSED')
    writeFileSync(receiptPath, serializedReceipt, 'utf8')
  }
  process.stdout.write(serializedReceipt)
} finally {
  await pool.end()
}
