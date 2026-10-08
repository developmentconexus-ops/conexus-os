import assert from 'node:assert/strict'
import test from 'node:test'
import { SqlError } from 'libpg-query'
import { hubModuleUrl } from './hub-build.mjs'

const { validateMigrationBatch } = await import(hubModuleUrl('app-runner/migration-sql.js'))
const { applyPendingMigrations, planMigrations } = await import(hubModuleUrl('app-runner/data-plane.js'))
const migration = (name, sql) => ({ name, sql, sha256: 'a'.repeat(64) })

test('native transaction variants refuse the whole batch before any database query', async () => {
  for (const sql of [
    'BEGIN', 'BEGIN WORK', 'START TRANSACTION READ WRITE',
    'COMMIT', 'COMMIT WORK AND CHAIN', 'COMMIT AND NO CHAIN',
    'END WORK', 'END TRANSACTION AND NO CHAIN', 'END AND CHAIN',
    'ABORT', 'ABORT WORK AND CHAIN', 'ROLLBACK', 'ROLLBACK WORK AND CHAIN',
    'SAVEPOINT a', 'RELEASE a', 'RELEASE SAVEPOINT a',
    'ROLLBACK TO a', 'ROLLBACK WORK TO SAVEPOINT a',
    "PREPARE TRANSACTION 'a'", "COMMIT PREPARED 'a'", "ROLLBACK PREPARED 'a'",
  ]) {
    const queries = []
    const result = await applyPendingMigrations({ query: async (...args) => { queries.push(args); return { rows: [] } } }, 'example', planMigrations([], [
      migration('001_table.sql', 'CREATE TABLE example.notes(i int)'),
      migration('002_control.sql', `SELECT 1; /* boundary */ ${sql}; SELECT 2`),
    ]).pending)
    assert.equal(result.ok, false, sql)
    assert.deepEqual({ code: result.error.code, migration: result.error.migration, reason: result.error.cause.reason }, {
      code: 'APPLICATION_MIGRATION_FAILED', migration: '002_control.sql', reason: 'TRANSACTION_CONTROL',
    }, sql)
    assert.deepEqual(queries, [], sql)
  }
})

test('syntax and native C-string truncation refuse the named file before any batch query', async () => {
  for (const [sql, reason] of [['SELECT 1\0; COMMIT', 'NUL_BYTE'], ['SELEC broken', undefined]]) {
    const queries = []
    const result = await applyPendingMigrations({ query: async (...args) => { queries.push(args); return { rows: [] } } }, 'example', planMigrations([], [
      migration('001_table.sql', 'CREATE TABLE example.notes(i int)'), migration('002_bad.sql', sql),
    ]).pending)
    assert.equal(result.ok, false)
    assert.equal(result.error.migration, '002_bad.sql')
    assert.equal(result.error.cause instanceof Error, true)
    assert.equal(result.error.cause.reason, reason)
    if (reason === undefined) assert.equal(result.error.cause instanceof SqlError, true)
    assert.deepEqual(queries, [])
  }
})

test('native grammar accepts ordinary DDL, literal transaction words, nested comments and transaction characteristics', async () => {
  for (const sql of [
    ' \n\t', '-- COMMIT\n', '/* outer /* COMMIT */ END */',
    `CREATE TABLE "COMMIT" (id bigint GENERATED ALWAYS AS IDENTITY, note text DEFAULT $$END; ROLLBACK$$, data jsonb);
      CREATE INDEX ON "COMMIT" USING gin(data); COMMENT ON TABLE "COMMIT" IS 'BEGIN;';`,
    "SELECT E'escape\\nCOMMIT', U&'d\\0061t', 'ROLLBACK;'; -- END\nSELECT 2",
    'SET TRANSACTION READ ONLY', 'SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY',
    String.raw`SELECT '\'; SELECT '; COMMIT; --';`,
  ]) assert.deepEqual(await validateMigrationBatch([migration('001_valid.sql', sql)]), { ok: true, result: undefined }, sql)
})

test('a runtime failure preserves its native cause even when rollback fails', async () => {
  const cause = Object.assign(new Error('database refusal'), { code: '22012' })
  const result = await applyPendingMigrations({ query: async (sql) => {
    if (sql === 'SELECT 1/0') throw cause
    if (sql === 'ROLLBACK') throw new Error('connection ended')
    return { rows: [] }
  } }, 'example', planMigrations([], [migration('001_runtime.sql', 'SELECT 1/0')]).pending)
  assert.equal(result.ok, false)
  assert.equal(result.error.cause, cause)
  assert.equal(result.error.migration, '001_runtime.sql')
})
