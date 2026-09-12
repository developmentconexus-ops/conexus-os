import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import pg from 'pg'
import { runCurrentHubMigrations, runHubMigrations, runR2HubMigrations } from '../../scripts/run-hub-migrations.mjs'

const required = (name) => {
  const value = process.env[name]
  if (!value) throw new Error(`MISSING_TEST_CONFIG_${name}`)
  return value
}
const admin = {
  host: required('CONEXUS_TEST_DB_HOST'), port: Number(required('CONEXUS_TEST_DB_PORT')),
  database: required('CONEXUS_TEST_DB_NAME'), user: required('CONEXUS_TEST_DB_USER'),
  password: required('CONEXUS_TEST_DB_PASSWORD'),
}
const versions = [
  '001', '002', '003', '004', '005', '006', '007', '008', '009', '010',
  '011', '012', '013', '014', '015', '016', '017', '018', '019', '020',
  '021', '022', '023',
]
const query = async (connection, sql, parameters = []) => {
  const client = new pg.Client(connection)
  await client.connect()
  try { return await client.query(sql, parameters) } finally { await client.end() }
}
const databaseFixture = async (t) => {
  const database = `conexus_migration_${randomUUID().replaceAll('-', '')}`
  await query(admin, `CREATE DATABASE "${database}"`)
  t.after(() => query(admin, `DROP DATABASE "${database}" WITH (FORCE)`))
  const connection = { ...admin, database }
  const url = new URL('postgresql://localhost')
  url.hostname = connection.host
  url.port = String(connection.port)
  url.pathname = `/${database}`
  url.username = connection.user
  url.password = connection.password
  return { connection, connectionString: url.toString() }
}
const ledger = async (connection) => (await query(connection,
  'SELECT version, checksum_sha256, applied_at FROM iam.schema_migration ORDER BY version')).rows

test('current Hub installs accepted schemas and restarts without applying held R3', async (t) => {
  const fixture = await databaseFixture(t)
  const installed = await runCurrentHubMigrations(fixture)
  assert.deepEqual(installed, { verdict: 'PASS', appliedNow: versions, versions })
  const before = await ledger(fixture.connection)
  const restarted = await runCurrentHubMigrations(fixture)
  assert.deepEqual(restarted, { verdict: 'PASS', appliedNow: [], versions })
  assert.deepEqual(await ledger(fixture.connection), before)
  assert.deepEqual((await query(fixture.connection, `
    SELECT to_regclass('iam.account')::text AS account,
      to_regclass('reg.artifact')::text AS artifact,
      to_regclass('builder.change')::text AS change,
      to_regnamespace('mar')::text AS held_schema
  `)).rows, [{ account: 'iam.account', artifact: 'reg.artifact', change: 'builder.change', held_schema: null }])
})

test('R1 and R2 upgrade to current Hub without rewriting prior ledger or account data', async (t) => {
  const fixture = await databaseFixture(t)
  assert.deepEqual((await runHubMigrations(fixture)).versions, versions.slice(0, 10))
  const accountId = '71111111-1111-4111-8111-111111111111'
  await query(fixture.connection, `INSERT INTO iam.account(account_id, issuer, external_subject, display_name)
    VALUES ($1, 'https://migration.invalid', 'retained-account', 'Keep this account')`, [accountId])
  assert.deepEqual((await runR2HubMigrations(fixture)).appliedNow, versions.slice(10, 18))
  const before = await ledger(fixture.connection)
  const upgraded = await runCurrentHubMigrations(fixture)
  assert.deepEqual(upgraded, { verdict: 'PASS', appliedNow: ['019', '020', '021', '022', '023'], versions })
  assert.deepEqual((await ledger(fixture.connection)).slice(0, 18), before)
  assert.deepEqual((await query(fixture.connection,
    'SELECT account_id, display_name FROM iam.account WHERE account_id = $1', [accountId])).rows,
  [{ account_id: accountId, display_name: 'Keep this account' }])
})

test('concurrent current Hub installers record each accepted migration once', async (t) => {
  const fixture = await databaseFixture(t)
  const results = await Promise.all([runCurrentHubMigrations(fixture), runCurrentHubMigrations(fixture)])
  for (const result of results) assert.deepEqual(result.versions, versions)
  assert.deepEqual(results.flatMap((result) => result.appliedNow).sort(), versions)
  assert.deepEqual((await ledger(fixture.connection)).map((row) => row.version), versions)
})

test('current Hub refuses incompatible applied ledgers before changing data or schemas', async (t) => {
  const fixture = await databaseFixture(t)
  await runR2HubMigrations(fixture)
  const valid = await ledger(fixture.connection)
  for (const version of ['024', '025', '999']) {
    await query(fixture.connection,
      'INSERT INTO iam.schema_migration(version, checksum_sha256) VALUES ($1, $2)', [version, 'a'.repeat(64)])
    const before = await ledger(fixture.connection)
    await assert.rejects(runCurrentHubMigrations(fixture), new RegExp(`MIGRATION_UNKNOWN_APPLIED:${version}`))
    assert.deepEqual(await ledger(fixture.connection), before)
    assert.deepEqual((await query(fixture.connection, `SELECT
      to_regnamespace('builder')::text AS builder, to_regnamespace('mar')::text AS mar`)).rows,
    [{ builder: null, mar: null }])
    await query(fixture.connection, 'DELETE FROM iam.schema_migration WHERE version = $1', [version])
  }
  await query(fixture.connection,
    "UPDATE iam.schema_migration SET checksum_sha256 = $1 WHERE version = '018'", ['b'.repeat(64)])
  const drifted = await ledger(fixture.connection)
  await assert.rejects(runCurrentHubMigrations(fixture), /MIGRATION_APPLIED_DIGEST_DRIFT:018/)
  assert.deepEqual(await ledger(fixture.connection), drifted)
  await query(fixture.connection,
    "UPDATE iam.schema_migration SET checksum_sha256 = $1 WHERE version = '018'", [valid.at(-1).checksum_sha256])
  await query(fixture.connection, "DELETE FROM iam.schema_migration WHERE version = '001'")
  const missing = await ledger(fixture.connection)
  await assert.rejects(runCurrentHubMigrations(fixture), /MIGRATION_BACK_INSERT_REFUSED:001/)
  assert.deepEqual(await ledger(fixture.connection), missing)
})
