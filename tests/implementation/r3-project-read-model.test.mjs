import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const migration = readFileSync(resolve(repositoryRoot, 'apps/hub/project-migrations/001_budget_analyzer_read_model.sql'), 'utf8')
const gapMigration = readFileSync(resolve(repositoryRoot, 'apps/hub/project-migrations/002_budget_analyzer_observation_gap.sql'), 'utf8')
const readModel = readFileSync(resolve(repositoryRoot, 'apps/hub/src/project/read-model.ts'), 'utf8')
const runner = readFileSync(resolve(repositoryRoot, 'scripts/run-project-migrations.mjs'), 'utf8')

test('R3 Project read model uses generation-scoped physical state and committed-only views', () => {
  assert.match(migration, /CREATE TABLE budget_analyzer\.pending_budget \([\s\S]*PRIMARY KEY \(generation, budget_ref\)/)
  assert.match(migration, /CREATE TABLE budget_analyzer\.sync_checkpoint \(/)
  assert.match(migration, /observation_kind text CHECK \(observation_kind IN \('FULL_SNAPSHOT', 'INCREMENTAL_DELTA'\)\)/)
  assert.match(migration, /checkpoint_revision bigint NOT NULL DEFAULT 0/)
  assert.match(migration, /CREATE VIEW budget_analyzer\.current_pending_budget AS[\s\S]*p\.generation = s\.committed_generation/)
  assert.match(migration, /CREATE VIEW budget_analyzer\.current_sync_state AS/)
  assert.match(migration, /current_sync_state AS[\s\S]*working_generation,[\s\S]*working_cursor,[\s\S]*observation_kind/)
  assert.match(migration, /DELETE FROM budget_analyzer\.pending_budget\s+WHERE generation <> v_working_generation;/)
  assert.match(migration, /md5\(current_database\(\)\)/)
  assert.match(migration, /REVOKE CONNECT ON DATABASE/)
  assert.match(migration, /ALTER DEFAULT PRIVILEGES IN SCHEMA budget_analyzer[\s\S]*REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC/)
  assert.match(migration, /CREATE ROLE %I NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS'[\s\S]*CREATE ROLE %I NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS'[\s\S]*CREATE ROLE %I NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS'/)
})

test('R3 Project merge authority rejects stale writers and separates snapshot/delta deletion', () => {
  assert.match(gapMigration, /PROJECT_SYNC_STALE_WRITER/)
  assert.match(gapMigration, /PROJECT_SYNC_BATCH_LIMIT_REFUSED/)
  assert.match(gapMigration, /PROJECT_SYNC_EMPTY_COMPLETE_REFUSED/)
  assert.match(gapMigration, /PROJECT_SYNC_DUPLICATE_BUDGET_REF_REFUSED/)
  assert.match(gapMigration, /PROJECT_SYNC_SNAPSHOT_TOMBSTONE_REFUSED/)
  assert.match(gapMigration, /p_observation_kind = 'INCREMENTAL_DELTA'/)
  assert.match(gapMigration, /budget_ref = ANY\(v_removed_budget_refs\)/)
  assert.match(gapMigration, /CREATE OR REPLACE FUNCTION budget_analyzer\.apply_budget_observation\([\s\S]*SECURITY DEFINER\s+SET search_path = pg_catalog, budget_analyzer, pg_temp/)
  assert.match(gapMigration, /GRANT EXECUTE ON FUNCTION budget_analyzer\.apply_budget_observation/)
  assert.doesNotMatch(gapMigration, /GRANT (?:SELECT|INSERT|UPDATE|DELETE)[^;]*\bpending_budget\b[^;]*TO project_(?:sync|query)_runtime/)
})

test('R3 Project rebaseline permits bounded full-snapshot batches after drift', () => {
  assert.match(gapMigration, /IF v_checkpoint\.merge_state = 'UNKNOWN'\s+AND p_observation_kind <> 'FULL_SNAPSHOT'/)
  assert.doesNotMatch(gapMigration, /v_checkpoint\.merge_state = 'UNKNOWN'[\s\S]{0,120}OR NOT p_complete/)
})

test('R3 Project rejects source or mapping drift even before the first committed generation', () => {
  assert.match(gapMigration, /IF v_checkpoint\.source_binding_revision IS NOT NULL\s+AND \([\s\S]*v_checkpoint\.merge_state <> 'UNKNOWN'[\s\S]*OR v_checkpoint\.working_generation IS NOT NULL/)
  assert.match(readModel, /workingGeneration: string \| null/)
  assert.match(readModel, /workingCursor: Readonly<Record<string, unknown>> \| null/)
  assert.match(readModel, /observationKind: BudgetObservationKind \| null/)
})

test('R3 Project records missing or ambiguous observations as unknown without changing committed rows', () => {
  assert.match(gapMigration, /CREATE OR REPLACE FUNCTION budget_analyzer\.record_observation_gap\(/)
  assert.match(gapMigration, /p_gap_kind IS NULL OR p_gap_kind NOT IN \('MISSING', 'AMBIGUOUS'\)/)
  assert.match(gapMigration, /freshness = 'UNKNOWN'/)
  assert.match(gapMigration, /coverage = 'UNKNOWN'/)
  assert.match(gapMigration, /merge_state = 'UNKNOWN'/)
  assert.match(gapMigration, /last_gap_kind = p_gap_kind/)
  assert.match(gapMigration, /CREATE OR REPLACE FUNCTION budget_analyzer\.apply_budget_observation\([\s\S]*v_was_degraded[\s\S]*freshness = CASE WHEN v_was_degraded THEN 'UNKNOWN'/)
  assert.doesNotMatch(gapMigration, /apply_budget_observation_legacy|RENAME TO apply_budget_observation_legacy/)
  assert.match(gapMigration, /last_gap_kind = NULL/)
  assert.match(gapMigration, /REVOKE ALL ON FUNCTION budget_analyzer\.apply_budget_observation\([\s\S]*FROM PUBLIC, %I/)
  assert.match(gapMigration, /CREATE OR REPLACE VIEW budget_analyzer\.current_sync_state AS[\s\S]*last_gap_kind/)
  assert.match(gapMigration, /DELETE FROM budget_analyzer\.pending_budget\s+WHERE generation > v_checkpoint\.committed_generation;/)
  assert.match(gapMigration, /GRANT EXECUTE ON FUNCTION budget_analyzer\.record_observation_gap\([^;]+\) TO %I/s)
  assert.match(gapMigration, /v_checkpoint\.committed_generation = 0/)
  assert.match(readModel, /recordBudgetObservationGap/)
  assert.match(readModel, /observationGapDigest/)
  assert.match(readModel, /const digest = observationDigest\(observation\)/)
  assert.match(readModel, /PROJECT_SYNC_DUPLICATE_BUDGET_REF_REFUSED/)
  assert.match(readModel, /BudgetObservationGapKind = 'MISSING' \| 'AMBIGUOUS'/)
  assert.match(readModel, /lastGapKind: BudgetObservationGapKind \| null/)
})

test('R3 Project runtime calls only the bounded merge function and committed read views', () => {
  assert.match(readModel, /SELECT \* FROM budget_analyzer\.apply_budget_observation\(/)
  assert.match(readModel, /FROM budget_analyzer\.current_sync_state/)
  assert.match(readModel, /FROM budget_analyzer\.current_pending_budget/)
  assert.match(readModel, /canonical_business_date::text AS canonical_business_date/)
  assert.doesNotMatch(readModel, /canonical_business_date instanceof Date/)
  assert.match(readModel, /BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY/)
  assert.doesNotMatch(readModel, /INSERT\s+INTO\s+budget_analyzer\./i)
  assert.doesNotMatch(readModel, /UPDATE\s+budget_analyzer\./i)
  assert.doesNotMatch(readModel, /DELETE\s+FROM\s+budget_analyzer\./i)
  assert.match(readModel, /packages\/canonical-json\/src\/index\.mjs/)
  assert.doesNotMatch(readModel, /from 'canonicalize'/)
})

test('R3 Project runner is native, checksum-bound, source-revision-bound, and isolated', () => {
  assert.match(runner, /project_meta\.schema_migration/)
  assert.match(runner, /pg_advisory_xact_lock\(\$1::bigint\)/)
  assert.match(runner, /project_source_revision/)
  assert.match(runner, /PROJECT_MIGRATION_SOURCE_REVISION_REFUSED/)
  assert.match(runner, /PROJECT_MIGRATION_SOURCE_REVISION_MISMATCH/)
  assert.match(runner, /current_database\(\)/)
  assert.match(runner, /CONEXUS_PROJECT_MIGRATION_DATABASE_URL_FILE/)
  assert.doesNotMatch(runner, /atlas|kysely|typeorm|prisma migrate/i)
})
