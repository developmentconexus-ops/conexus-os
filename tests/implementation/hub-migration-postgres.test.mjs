import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import pg from 'pg'
import { loadCurrentHubMigrationFiles, runCurrentHubMigrations, runHubMigrations, runR2HubMigrations } from '../../scripts/run-hub-migrations.mjs'

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
  '026', '027', '028', '029', '030', '031', '032', '033', '034', '035', '036', '037', '038', '039', '040', '041', '042', '043', '044', '045', '046', '047', '048', '049', '050',
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
      to_regclass('builder.actor_run')::text AS actor_run,
      to_regclass('builder.work_unit')::text AS work_unit,
      to_regclass('builder.coding_session')::text AS coding_session,
      to_regclass('builder.plan')::text AS plan,
      to_regclass('builder.finding')::text AS finding,
      to_regclass('builder.verification_evidence')::text AS verification_evidence,
      to_regclass('builder.operation_receipt')::text AS operation_receipt,
      to_regprocedure('reg.retain_application(uuid,uuid,uuid,text,jsonb)')::text AS retain_application,
      to_regprocedure('reg.get_application(uuid,uuid,uuid,text)')::text AS get_application,
      to_regprocedure('reg.read_application_file(uuid,uuid,uuid,text,uuid,text)')::text AS read_application_file,
      to_regnamespace('mar')::text AS held_schema
  `)).rows, [{ account: 'iam.account', artifact: 'reg.artifact', change: null, actor_run: null, work_unit: null,
    coding_session: null, plan: null, finding: null, verification_evidence: null, operation_receipt: null,
    retain_application: null, get_application: null, read_application_file: null, held_schema: null }])
  assert.deepEqual((await query(fixture.connection, `
    SELECT a.attname AS column_name,
      EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'builder.builder_run'::regclass AND conname = 'builder_run_phase_check') AS phase_check,
      EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'builder.builder_run'::regclass AND tgname = 'builder_run_phase_boundary') AS phase_trigger
    FROM pg_attribute AS a
    WHERE a.attrelid = 'builder.builder_run'::regclass AND a.attname = 'phase' AND NOT a.attisdropped
  `)).rows, [{ column_name: 'phase', phase_check: true, phase_trigger: true }])

  const accountId = randomUUID(); const workspaceId = randomUUID(); const projectId = randomUUID()
  const sourceRevision = 'd'.repeat(40); const keyDigest = 'e'.repeat(64); const requestDigest = 'f'.repeat(64)
  await query(admin, "ALTER ROLE hub_prj03_command PASSWORD 'migration-bootstrap-test'")
  await query(fixture.connection, "INSERT INTO iam.account(account_id, issuer, external_subject, display_name) VALUES ($1, 'https://migration-bootstrap.test', $2, 'Bootstrap')", [accountId, accountId])
  await query(fixture.connection, 'INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1, $2)', [workspaceId, 'Bootstrap'])
  await query(fixture.connection, 'INSERT INTO iam.workspace_membership(account_id, workspace_id, can_create_project) VALUES ($1, $2, true)', [accountId, workspaceId])
  const command = { ...fixture.connection, user: 'hub_prj03_command', password: 'migration-bootstrap-test' }
  await query(command, 'SELECT * FROM project.reserve_or_replay_create_project($1, $2, $3, $4, $5)', [accountId, workspaceId, keyDigest, requestDigest, projectId])
  await query(command, 'SELECT project.create_project_with_source($1, $2, $3, $4, $5, $6, $7, $8, $9)', [accountId, workspaceId, keyDigest, requestDigest, projectId, 'Bootstrap', 'NEW', sourceRevision, 'project-revision'])
  assert.deepEqual((await query(fixture.connection, 'SELECT project_id, working_source_revision, working_version, current_state FROM builder.project_working_state WHERE project_id = $1', [projectId])).rows, [
    { project_id: projectId, working_source_revision: sourceRevision, working_version: '0', current_state: 'IDLE' },
  ])

  const builderRunId = randomUUID()
  await query(fixture.connection, `INSERT INTO builder.builder_run(
    builder_run_id, project_id, account_id, idempotency_digest, request_digest, mode,
    base_source_revision, expected_working_version, base_working_version
  ) VALUES ($1, $2, $3, $4, $5, 'BUILD', $6, 0, 0)`, [builderRunId, projectId, accountId, '1'.repeat(64), '2'.repeat(64), sourceRevision])
  assert.equal((await query(fixture.connection, 'SELECT builder.set_builder_run_phase($1, $2)', [builderRunId, 'AGENT'])).rows[0].set_builder_run_phase, false)
  await query(fixture.connection, "UPDATE builder.builder_run SET state = 'RUNNING' WHERE builder_run_id = $1", [builderRunId])
  assert.equal((await query(fixture.connection, 'SELECT builder.set_builder_run_phase($1, $2)', [builderRunId, 'AGENT'])).rows[0].set_builder_run_phase, true)
  assert.equal((await query(fixture.connection, 'SELECT phase FROM builder.builder_run WHERE builder_run_id = $1', [builderRunId])).rows[0].phase, 'AGENT')
  await query(fixture.connection, 'UPDATE builder.builder_run SET cancellation_requested_at = clock_timestamp() WHERE builder_run_id = $1', [builderRunId])
  assert.equal((await query(fixture.connection, 'SELECT phase FROM builder.builder_run WHERE builder_run_id = $1', [builderRunId])).rows[0].phase, null)
  assert.equal((await query(fixture.connection, 'SELECT builder.set_builder_run_phase($1, $2)', [builderRunId, 'COMPILING'])).rows[0].set_builder_run_phase, false)
  await query(fixture.connection, "UPDATE builder.builder_run SET state = 'FAILED' WHERE builder_run_id = $1", [builderRunId])
  assert.equal((await query(fixture.connection, 'SELECT phase FROM builder.builder_run WHERE builder_run_id = $1', [builderRunId])).rows[0].phase, null)
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
  assert.deepEqual(upgraded, { verdict: 'PASS', appliedNow: versions.slice(18), versions })
  assert.deepEqual((await ledger(fixture.connection)).slice(0, 18), before)
  assert.deepEqual((await query(fixture.connection,
    'SELECT account_id, display_name FROM iam.account WHERE account_id = $1', [accountId])).rows,
  [{ account_id: accountId, display_name: 'Keep this account' }])
})

test('current Hub upgrades an existing 023 database and removes legacy Builder schema', async (t) => {
  const fixture = await databaseFixture(t)
  await runR2HubMigrations(fixture)
  for (const migration of loadCurrentHubMigrationFiles().filter(({ version }) => version >= '019' && version <= '023')) {
    await query(fixture.connection, migration.bytes.toString('utf8'))
    await query(fixture.connection, 'INSERT INTO iam.schema_migration(version, checksum_sha256) VALUES ($1,$2)', [migration.version, migration.checksum])
  }
  const before = await ledger(fixture.connection)
  assert.deepEqual(before.map(({ version }) => version), versions.slice(0, 23))
  assert.deepEqual(await runCurrentHubMigrations(fixture), { verdict: 'PASS', appliedNow: versions.slice(23), versions })
  assert.deepEqual((await ledger(fixture.connection)).slice(0, 23), before)
  const catalog = (await query(fixture.connection, `SELECT to_regclass('builder.change')::text AS change_table,
    to_regclass('builder.work_unit')::text AS work_unit_table,
    to_regprocedure('reg.retain_application(uuid,uuid,uuid,text,jsonb)')::text AS legacy_retain,
    to_regprocedure('project.lock_application_baseline(uuid)')::text AS legacy_lock`)).rows[0]
  assert.deepEqual(catalog, { change_table: null, work_unit_table: null, legacy_retain: null, legacy_lock: null })
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
