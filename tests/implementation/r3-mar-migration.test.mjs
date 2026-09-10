import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const migrationPath = resolve(repositoryRoot, 'apps/hub/migrations/024_mar_pg_boss_projection.sql')
const vendorPath = resolve(repositoryRoot, 'qualification/3l/managed-execution/vendor/pgboss-12.26.3-mar.sql')
const migration = readFileSync(migrationPath, 'utf8')
const vendor = readFileSync(vendorPath, 'utf8')
const sha256 = (value) => createHash('sha256').update(value).digest('hex')

test('R3 MAR migration embeds the exact pinned pg-boss vendor object body', () => {
  assert.match(migration, /Source SHA-256: 9b5b191f613733ae68fd43a455ce986a89e5ba4c369dc33eb148230b74a647f9/)
  assert.equal(sha256(vendor), '9b5b191f613733ae68fd43a455ce986a89e5ba4c369dc33eb148230b74a647f9')
  const start = 'CREATE TYPE mar.job_state'
  const end = "INSERT INTO mar.version(version) VALUES ('37');"
  assert.equal(
    migration.slice(migration.indexOf(start), migration.indexOf(end) + end.length),
    vendor.slice(vendor.indexOf(start), vendor.indexOf(end) + end.length),
  )
  assert.doesNotMatch(migration, /CREATE SCHEMA IF NOT EXISTS mar/)
  assert.doesNotMatch(migration, /pg_advisory_xact_lock\(/)
})

test('R3 MAR migration keeps the owner occurrence record separate from queue substrate', () => {
  assert.match(migration, /SET LOCAL ROLE mar_owner;/)
  assert.match(migration, /CREATE TABLE mar\.job_run \([\s\S]*?\n\);/)
  for (const column of [
    'project_id text NOT NULL',
    'release_id text NOT NULL',
    'job_id text NOT NULL',
    'logical_occurrence_key text NOT NULL',
    "state text NOT NULL DEFAULT 'ADMITTED'",
    'admitted_at timestamptz NOT NULL',
    'evidence_refs text[] NOT NULL DEFAULT',
  ]) assert.match(migration, new RegExp(column.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.match(migration, /UNIQUE \(logical_occurrence_key\)/)
  assert.match(migration, /CHECK \(started_at IS NULL OR started_at >= admitted_at\)/)
  assert.match(migration, /CHECK \(completed_at IS NULL OR completed_at >= admitted_at\)/)
})

test('R3 MAR migration closes runtime privilege boundary around owner truth', () => {
  assert.match(migration, /REVOKE ALL ON SCHEMA mar FROM PUBLIC;/)
  assert.match(migration, /GRANT USAGE ON SCHEMA mar TO hub_mar_runtime;/)
  assert.match(migration, /REVOKE ALL ON ALL TABLES IN SCHEMA mar FROM PUBLIC;/)
  assert.match(migration, /REVOKE ALL ON ALL FUNCTIONS IN SCHEMA mar FROM PUBLIC;/)
  assert.match(migration, /REVOKE CREATE ON SCHEMA mar FROM hub_mar_runtime;/)
  assert.match(migration, /GRANT SELECT, INSERT, UPDATE, DELETE ON\s+mar\.queue, mar\.job, mar\.job_common, mar\.job_dependency TO hub_mar_runtime;/)
  assert.doesNotMatch(migration, /GRANT (?:[^;]*\b)?(?:SELECT|INSERT|UPDATE|DELETE)[^;]*mar\.job_run[^;]*TO hub_mar_runtime/)
  assert.doesNotMatch(migration, /GRANT EXECUTE[^;]*TO hub_mar_runtime/)
})

test('R3 migration runner pins the MAR corpus entries and catalog assertions', () => {
  const runner = readFileSync(resolve(repositoryRoot, 'scripts/run-hub-migrations.mjs'), 'utf8')
  assert.match(runner, /'024_mar_pg_boss_projection\.sql'/)
  assert.match(runner, /const migration024Digest = '8afb8add42959c19bc5f5edc3dad73a4d511195597656dbcb9505b6e75cae735'/)
  assert.match(runner, /if \(applied\.has\('024'\)\) await assert024Catalog\(client\)/)
  assert.match(runner, /'025_mar_admission_function\.sql'/)
  assert.match(runner, /const migration025Digest = '707852bfe0b820ea5df21aa40076dbbb62733f9ce38e8911f9a9553a8b1bc36b'/)
  assert.match(runner, /if \(applied\.has\('025'\)\) await assert025Catalog\(client\)/)
  assert.match(runner, /AND rolname <> 'hub_mar_runtime'/)
})

test('R3 MAR admission migration keeps owner truth behind a bounded definer function', () => {
  const admissionPath = resolve(repositoryRoot, 'apps/hub/migrations/025_mar_admission_function.sql')
  const admission = readFileSync(admissionPath, 'utf8')
  assert.match(admission, /CREATE OR REPLACE FUNCTION mar\.admit_job_run\(/)
  assert.match(admission, /SECURITY DEFINER\s+SET search_path = pg_catalog, mar, pg_temp/)
  assert.match(admission, /GRANT EXECUTE ON FUNCTION mar\.admit_job_run\([^;]+\) TO hub_mar_runtime;/s)
  assert.doesNotMatch(admission, /GRANT (?:SELECT|INSERT|UPDATE|DELETE)[^;]*mar\.job_run[^;]*TO hub_mar_runtime/)
})
