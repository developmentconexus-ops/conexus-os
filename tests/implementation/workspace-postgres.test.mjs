import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { test } from 'node:test'
import pg from 'pg'
import { loadR1MigrationFiles, runR1HubMigrations } from '../../scripts/run-hub-migrations.mjs'
import { refuseProtectedCluster } from './protected-cluster.mjs'

// The R1 corpus is whatever loadR1MigrationFiles admits. A literal list here rotted twice as the
// corpus grew, and nothing noticed because these suites were outside the candidate graph.
const r1Versions = loadR1MigrationFiles().map(({ version }) => version)

const { Client } = pg
const repositoryRoot = resolve(import.meta.dirname, '../..')
const migrationsRoot = resolve(repositoryRoot, 'apps/hub/migrations')
const required = (name) => {
  const value = process.env[name]
  if (!value) throw new Error(`MISSING_TEST_CONFIG_${name}`)
  return value
}
const adminConnection = {
  host: required('CONEXUS_TEST_DB_HOST'), port: Number(required('CONEXUS_TEST_DB_PORT')),
  database: required('CONEXUS_TEST_DB_NAME'), user: required('CONEXUS_TEST_DB_USER'), password: required('CONEXUS_TEST_DB_PASSWORD'),
}
const migrationBytes = (name) => readFileSync(resolve(migrationsRoot, name))
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const quoteIdentifier = (value) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error(`UNSAFE_TEST_IDENTIFIER_${value}`)
  return `"${value}"`
}
const connectionString = ({ host, port, database, user, password }) => {
  const url = new URL('postgresql://localhost')
  url.hostname = host
  url.port = String(port)
  url.pathname = `/${encodeURIComponent(database)}`
  url.username = user
  url.password = password
  return url.toString()
}
const query = async (connection, statement, values = []) => {
  const client = new Client(connection)
  await client.connect()
  try {
    return await client.query(statement, values)
  } finally {
    await client.end()
  }
}
const makeMigrationFixture = (mutate = () => {}) => {
  const root = mkdtempSync(resolve(tmpdir(), 'conexus-s2-migrations-'))
  for (const name of readdirSync(migrationsRoot).filter((entry) => entry.endsWith('.sql'))) {
    writeFileSync(resolve(root, name), migrationBytes(name))
  }
  mutate(root)
  return root
}

test('real PostgreSQL proves migration custody and the six-function Workspace foundation', async (t) => {
  await refuseProtectedCluster()
  const databases = []
  const migrationFixtures = []
  const liveClients = []
  const createDatabase = async (label) => {
    const name = `conexus_s2_${label}_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 10)}`
    const admin = new Client(adminConnection)
    await admin.connect()
    try {
      await admin.query(`CREATE DATABASE ${quoteIdentifier(name)}`)
    } finally {
      await admin.end()
    }
    databases.push(name)
    return { ...adminConnection, database: name }
  }
  const dropDatabase = async (name) => {
    const admin = new Client(adminConnection)
    await admin.connect()
    try {
      await admin.query(`DROP DATABASE ${quoteIdentifier(name)} WITH (FORCE)`)
    } finally {
      await admin.end()
    }
  }
  const resetDatabase = async (connection) => {
    await query(connection, 'DROP SCHEMA IF EXISTS project CASCADE')
    await query(connection, 'DROP SCHEMA IF EXISTS workspace CASCADE')
    await query(connection, 'DROP SCHEMA IF EXISTS iam CASCADE')
  }
  t.after(async () => {
    for (const client of liveClients.reverse()) await client.end().catch(() => {})
    for (const fixture of migrationFixtures) rmSync(fixture, { recursive: true, force: true })
    for (const name of databases.reverse()) await dropDatabase(name)
    const admin = new Client(adminConnection)
    await admin.connect()
    try {
      await admin.query('ALTER ROLE hub_ws01_command PASSWORD NULL').catch(() => {})
      await admin.query('ALTER ROLE hub_s2_read PASSWORD NULL').catch(() => {})
      await admin.query('ALTER ROLE hub_prj03_command PASSWORD NULL').catch(() => {})
    } finally {
      await admin.end()
    }
  })

  const fresh = await createDatabase('fresh')
  const freshUrl = connectionString(fresh)
  const firstRun = await runR1HubMigrations({ connectionString: freshUrl })
  assert.deepEqual(firstRun.appliedNow, r1Versions)
  assert.deepEqual(firstRun.versions, r1Versions)
  const restartRun = await runR1HubMigrations({ connectionString: freshUrl })
  assert.deepEqual(restartRun.appliedNow, [])
  assert.deepEqual(restartRun.versions, r1Versions)

  const ledger = await query(fresh, `SELECT version, checksum_sha256 FROM iam.schema_migration ORDER BY version`)
  assert.deepEqual(ledger.rows, loadR1MigrationFiles().map(({ version, checksum }) => ({ version, checksum_sha256: checksum })))

  const driftRoot = makeMigrationFixture((root) => {
    const target = resolve(root, '002_workspace_foundation.sql')
    writeFileSync(target, Buffer.concat([readFileSync(target), Buffer.from('\n-- applied-byte drift\n')]))
  })
  migrationFixtures.push(driftRoot)
  // The loader refuses drifted bytes before any connection opens, so this throws synchronously.
  assert.throws(
    () => runR1HubMigrations({ connectionString: freshUrl, migrationsRoot: driftRoot }),
    /MIGRATION_002_DIGEST_REFUSED/,
  )

  await resetDatabase(fresh)
  await runR1HubMigrations({ connectionString: connectionString(fresh) })
  await query(fresh, `DELETE FROM iam.schema_migration WHERE version = '001'`)
  await assert.rejects(
    runR1HubMigrations({ connectionString: connectionString(fresh) }),
    /MIGRATION_BACK_INSERT_REFUSED:001/,
  )

  await resetDatabase(fresh)
  await query(fresh, 'CREATE SCHEMA iam AUTHORIZATION iam_owner')
  await query(fresh, `
    CREATE TABLE iam.schema_migration (
      version text PRIMARY KEY,
      checksum_sha256 text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
    )
  `)
  await query(fresh, `
    INSERT INTO iam.schema_migration(version, checksum_sha256) VALUES ('001', $1), ('002', $2)
  `, [sha256(migrationBytes('001_iam_foundation.sql')), sha256(migrationBytes('002_workspace_foundation.sql'))])
  await assert.rejects(
    runR1HubMigrations({ connectionString: connectionString(fresh) }),
    /MIGRATION_CATALOG_DRIFT/,
  )

  await resetDatabase(fresh)
  await query(fresh, 'CREATE SCHEMA iam')
  await assert.rejects(
    runR1HubMigrations({ connectionString: connectionString(fresh) }),
    /MIGRATION_DIRTY_BASELINE_REFUSED/,
  )

  await resetDatabase(fresh)
  await query(fresh, migrationBytes('001_iam_foundation.sql').toString('utf8'))
  await query(fresh, 'ALTER TABLE iam.account ADD COLUMN unauthorized text')
  await assert.rejects(
    runR1HubMigrations({ connectionString: connectionString(fresh) }),
    /MIGRATION_CATALOG_DRIFT/,
  )

  await resetDatabase(fresh)
  await query(fresh, migrationBytes('001_iam_foundation.sql').toString('utf8'))
  await query(fresh, `
    ALTER TABLE iam.account DROP CONSTRAINT account_issuer_check;
    ALTER TABLE iam.account ADD CONSTRAINT account_issuer_check CHECK (true);
    ALTER TABLE iam.account ALTER COLUMN active SET DEFAULT false
  `)
  await assert.rejects(
    runR1HubMigrations({ connectionString: connectionString(fresh) }),
    /MIGRATION_CATALOG_DRIFT/,
  )

  await resetDatabase(fresh)
  await query(fresh, migrationBytes('001_iam_foundation.sql').toString('utf8'))
  const legacyRun = await runR1HubMigrations({ connectionString: connectionString(fresh) })
  assert.deepEqual(legacyRun.appliedNow, r1Versions)
  assert.deepEqual(legacyRun.versions, r1Versions)

  await query(fresh, `INSERT INTO iam.schema_migration(version, checksum_sha256) VALUES ('999', $1)`, ['f'.repeat(64)])
  await assert.rejects(
    runR1HubMigrations({ connectionString: connectionString(fresh) }),
    /MIGRATION_UNKNOWN_APPLIED:999/,
  )
  await query(fresh, `DELETE FROM iam.schema_migration WHERE version = '999'`)

  await query(fresh, `
    SET ROLE workspace_owner;
    CREATE OR REPLACE FUNCTION workspace.create_workspace(p_workspace_id uuid, p_name text)
    RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
    AS $$ SELECT NULL::void $$;
    RESET ROLE
  `)
  await assert.rejects(
    runR1HubMigrations({ connectionString: connectionString(fresh) }),
    /MIGRATION_CATALOG_DRIFT/,
  )
  await resetDatabase(fresh)
  await query(fresh, migrationBytes('001_iam_foundation.sql').toString('utf8'))
  await runR1HubMigrations({ connectionString: connectionString(fresh) })

  const invalidOrderRoot = makeMigrationFixture((root) => {
    const baseline = resolve(root, '001_iam_foundation.sql')
    const workspace = resolve(root, '002_workspace_foundation.sql')
    rmSync(baseline)
    rmSync(workspace)
    writeFileSync(resolve(root, '002_iam_foundation.sql'), migrationBytes('001_iam_foundation.sql'))
    writeFileSync(resolve(root, '003_workspace_foundation.sql'), migrationBytes('002_workspace_foundation.sql'))
  })
  migrationFixtures.push(invalidOrderRoot)
  assert.throws(
    () => loadR1MigrationFiles(invalidOrderRoot),
    /MIGRATION_(?:CENSUS|001_DIGEST)_REFUSED/,
  )
  const extraMigrationRoot = makeMigrationFixture((root) => {
    writeFileSync(resolve(root, '004_unlisted.sql'), Buffer.from('BEGIN;\nSELECT 1;\nCOMMIT;\n'))
  })
  migrationFixtures.push(extraMigrationRoot)
  assert.throws(
    () => loadR1MigrationFiles(extraMigrationRoot),
    /MIGRATION_CENSUS_REFUSED/,
  )

  const commandPassword = 's2-command-test-only'
  const readPassword = 's2-read-test-only'
  await query(fresh, `ALTER ROLE hub_ws01_command PASSWORD '${commandPassword}'`)
  await query(fresh, `ALTER ROLE hub_s2_read PASSWORD '${readPassword}'`)
  const commandConnection = { ...fresh, user: 'hub_ws01_command', password: commandPassword }
  const readConnection = { ...fresh, user: 'hub_s2_read', password: readPassword }
  const command = new Client(commandConnection)
  const read = new Client(readConnection)
  await command.connect()
  await read.connect()
  liveClients.push(command, read)

  const accountId = '10000000-0000-4000-8000-000000000001'
  const otherAccountId = '10000000-0000-4000-8000-000000000002'
  const workspaceId = '20000000-0000-4000-8000-000000000001'
  const otherWorkspaceId = '20000000-0000-4000-8000-000000000002'
  await query(fresh, `
    INSERT INTO iam.account(account_id, issuer, external_subject, display_name, email)
    VALUES ($1, 'https://issuer.test', 'subject-1', 'Test Account', 'test@example.test'),
      ($2, 'https://issuer.test', 'subject-2', 'Other Account', 'other@example.test')
  `, [accountId, otherAccountId])

  const keyDigest = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  const requestDigest = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
  const responseDigest = 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
  await command.query('BEGIN')
  const reservation = await command.query(`SELECT * FROM workspace.reserve_or_replay_create_workspace($1, $2, $3, $4)`, [accountId, keyDigest, requestDigest, workspaceId])
  assert.deepEqual(reservation.rows, [{ state: 'RESERVED', workspace_id: workspaceId, response_status: null, response_body: null }])
  await command.query('SELECT workspace.create_workspace($1, $2)', [workspaceId, 'Workspace One'])
  await command.query('SELECT iam.establish_workspace_creator_access($1, $2)', [accountId, workspaceId])
  const responseBody = { workspaceId, name: 'Workspace One' }
  await command.query('SELECT workspace.complete_create_workspace_receipt($1, $2, $3, $4, $5)', [accountId, keyDigest, 201, responseDigest, responseBody])
  await command.query('COMMIT')

  await command.query('BEGIN')
  const replay = await command.query(`SELECT * FROM workspace.reserve_or_replay_create_workspace($1, $2, $3, $4)`, [accountId, keyDigest, requestDigest, otherWorkspaceId])
  assert.deepEqual(replay.rows, [{ state: 'REPLAY', workspace_id: workspaceId, response_status: 201, response_body: responseBody }])
  await command.query('COMMIT')
  await command.query('BEGIN')
  const conflict = await command.query(`SELECT * FROM workspace.reserve_or_replay_create_workspace($1, $2, $3, $4)`, [accountId, keyDigest, 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd', otherWorkspaceId])
  assert.deepEqual(conflict.rows, [{ state: 'CONFLICT', workspace_id: workspaceId, response_status: null, response_body: null }])
  await command.query('COMMIT')

  await command.query('BEGIN')
  await command.query(`SELECT * FROM workspace.reserve_or_replay_create_workspace($1, $2, $3, $4)`, [accountId, 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', requestDigest, otherWorkspaceId])
  await assert.rejects(command.query('SELECT workspace.create_workspace($1, $2)', [otherWorkspaceId, '']), /new row for relation|violates check constraint/)
  await command.query('ROLLBACK')
  const orphan = await query(fresh, `
    SELECT (SELECT count(*)::integer FROM workspace.workspace WHERE workspace_id = $1) AS workspace_count,
      (SELECT count(*)::integer FROM workspace.operation_idempotency WHERE reserved_workspace_id = $1) AS receipt_count
  `, [otherWorkspaceId])
  assert.deepEqual(orphan.rows[0], { workspace_count: 0, receipt_count: 0 })

  await query(fresh, `
    INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1, 'Workspace Two')
  `, [otherWorkspaceId])
  await query(fresh, `
    INSERT INTO iam.workspace_membership(account_id, workspace_id, can_create_project)
    VALUES ($1, $2, true)
  `, [otherAccountId, otherWorkspaceId])
  await read.query('BEGIN READ ONLY')
  const memberships = await read.query('SELECT * FROM iam.list_workspace_memberships($1)', [accountId])
  assert.deepEqual(memberships.rows, [{ workspace_id: workspaceId }])
  const summaries = await read.query(`
    SELECT s.workspace_id, s.name
    FROM workspace.list_workspace_summaries(
      ARRAY(SELECT m.workspace_id FROM iam.list_workspace_memberships($1) AS m)
    ) AS s ORDER BY s.name, s.workspace_id
  `, [accountId])
  assert.deepEqual(summaries.rows, [{ workspace_id: workspaceId, name: 'Workspace One' }])
  const membershipFilteredOut = await read.query(`
    SELECT s.workspace_id, s.name
    FROM workspace.list_workspace_summaries(
      ARRAY(SELECT m.workspace_id FROM iam.list_workspace_memberships($1) AS m WHERE m.workspace_id = $2)
    ) AS s
  `, [accountId, otherWorkspaceId])
  assert.deepEqual(membershipFilteredOut.rows, [])
  await read.query('COMMIT')

  await assert.rejects(command.query('SELECT * FROM workspace.workspace'), /permission denied/)
  await assert.rejects(read.query('SELECT * FROM iam.workspace_membership'), /permission denied/)
  await assert.rejects(command.query('SET ROLE workspace_owner'), /permission denied/)
  await assert.rejects(read.query('SET ROLE iam_owner'), /permission denied/)
})
