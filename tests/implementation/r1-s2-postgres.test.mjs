import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { test } from 'node:test'
import pg from 'pg'
import { loadMigrationFiles, runHubMigrations } from '../../scripts/run-hub-migrations.mjs'

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
const typeArguments = (value) => value.split(', ').map((argument) => argument.replace(/^[a-z_][a-z0-9_]* /, '')).join(',')
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

test('S2 P1 real PostgreSQL proves migration custody, exact catalog and six-function Workspace foundation', async (t) => {
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
  const firstRun = await runHubMigrations({ connectionString: freshUrl })
  assert.deepEqual(firstRun.appliedNow, ['001', '002', '003'])
  assert.deepEqual(firstRun.versions, ['001', '002', '003'])
  const restartRun = await runHubMigrations({ connectionString: freshUrl })
  assert.deepEqual(restartRun.appliedNow, [])
  assert.deepEqual(restartRun.versions, ['001', '002', '003'])

  const ledger = await query(fresh, `SELECT version, checksum_sha256 FROM iam.schema_migration ORDER BY version`)
  assert.deepEqual(ledger.rows, [
    { version: '001', checksum_sha256: sha256(migrationBytes('001_iam_foundation.sql')) },
    { version: '002', checksum_sha256: sha256(migrationBytes('002_workspace_foundation.sql')) },
    { version: '003', checksum_sha256: sha256(migrationBytes('003_project_foundation.sql')) },
  ])

  const driftRoot = makeMigrationFixture((root) => {
    const target = resolve(root, '002_workspace_foundation.sql')
    writeFileSync(target, Buffer.concat([readFileSync(target), Buffer.from('\n-- applied-byte drift\n')]))
  })
  migrationFixtures.push(driftRoot)
  await assert.rejects(
    runHubMigrations({ connectionString: freshUrl, migrationsRoot: driftRoot }),
    /MIGRATION_002_DIGEST_REFUSED/,
  )

  await resetDatabase(fresh)
  await runHubMigrations({ connectionString: connectionString(fresh) })
  await query(fresh, `DELETE FROM iam.schema_migration WHERE version = '001'`)
  await assert.rejects(
    runHubMigrations({ connectionString: connectionString(fresh) }),
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
    runHubMigrations({ connectionString: connectionString(fresh) }),
    /MIGRATION_(?:001|002)_CATALOG_REFUSED/,
  )

  await resetDatabase(fresh)
  await query(fresh, 'CREATE SCHEMA iam')
  await assert.rejects(
    runHubMigrations({ connectionString: connectionString(fresh) }),
    /MIGRATION_DIRTY_BASELINE_REFUSED/,
  )

  await resetDatabase(fresh)
  await query(fresh, migrationBytes('001_iam_foundation.sql').toString('utf8'))
  await query(fresh, 'ALTER TABLE iam.account ADD COLUMN unauthorized text')
  await assert.rejects(
    runHubMigrations({ connectionString: connectionString(fresh) }),
    /MIGRATION_001_CATALOG_REFUSED/,
  )

  await resetDatabase(fresh)
  await query(fresh, migrationBytes('001_iam_foundation.sql').toString('utf8'))
  await query(fresh, `
    ALTER TABLE iam.account DROP CONSTRAINT account_issuer_check;
    ALTER TABLE iam.account ADD CONSTRAINT account_issuer_check CHECK (true);
    ALTER TABLE iam.account ALTER COLUMN active SET DEFAULT false
  `)
  await assert.rejects(
    runHubMigrations({ connectionString: connectionString(fresh) }),
    /MIGRATION_001_CATALOG_REFUSED/,
  )

  await resetDatabase(fresh)
  await query(fresh, migrationBytes('001_iam_foundation.sql').toString('utf8'))
  const legacyRun = await runHubMigrations({ connectionString: connectionString(fresh) })
  assert.deepEqual(legacyRun.appliedNow, ['001', '002', '003'])
  assert.deepEqual(legacyRun.versions, ['001', '002', '003'])

  await query(fresh, `INSERT INTO iam.schema_migration(version, checksum_sha256) VALUES ('999', $1)`, ['f'.repeat(64)])
  await assert.rejects(
    runHubMigrations({ connectionString: connectionString(fresh) }),
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
    runHubMigrations({ connectionString: connectionString(fresh) }),
    /MIGRATION_002_CATALOG_REFUSED/,
  )
  await resetDatabase(fresh)
  await query(fresh, migrationBytes('001_iam_foundation.sql').toString('utf8'))
  await runHubMigrations({ connectionString: connectionString(fresh) })

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
    () => loadMigrationFiles(invalidOrderRoot),
    /MIGRATION_(?:CENSUS|001_DIGEST)_REFUSED/,
  )
  const extraMigrationRoot = makeMigrationFixture((root) => {
    writeFileSync(resolve(root, '004_unlisted.sql'), Buffer.from('BEGIN;\nSELECT 1;\nCOMMIT;\n'))
  })
  migrationFixtures.push(extraMigrationRoot)
  assert.throws(
    () => loadMigrationFiles(extraMigrationRoot),
    /MIGRATION_CENSUS_REFUSED/,
  )

  const roles = await query(fresh, `
    SELECT rolname, rolcanlogin, rolsuper, rolinherit, rolbypassrls
    FROM pg_roles
    WHERE rolname IN ('iam_owner', 'workspace_owner', 'hub_ws01_command', 'hub_s2_read')
      OR rolname LIKE 'hub_ws%' OR rolname LIKE 'hub_s2%'
    ORDER BY rolname
  `)
  assert.deepEqual(roles.rows, [
    { rolname: 'hub_s2_read', rolcanlogin: true, rolsuper: false, rolinherit: false, rolbypassrls: false },
    { rolname: 'hub_ws01_command', rolcanlogin: true, rolsuper: false, rolinherit: false, rolbypassrls: false },
    { rolname: 'iam_owner', rolcanlogin: false, rolsuper: false, rolinherit: false, rolbypassrls: false },
    { rolname: 'workspace_owner', rolcanlogin: false, rolsuper: false, rolinherit: false, rolbypassrls: false },
  ])
  const schemas = await query(fresh, `
    SELECT nspname AS schema_name, pg_get_userbyid(nspowner) AS schema_owner
    FROM pg_namespace
    WHERE nspname IN ('iam', 'workspace') ORDER BY nspname
  `)
  assert.deepEqual(schemas.rows, [
    { schema_name: 'iam', schema_owner: 'iam_owner' },
    { schema_name: 'workspace', schema_owner: 'workspace_owner' },
  ])
  const tables = await query(fresh, `
    SELECT schemaname, tablename, tableowner
    FROM pg_tables
    WHERE (schemaname, tablename) IN (
      ('iam', 'account'), ('iam', 'bootstrap_context'), ('iam', 'oidc_transaction'),
      ('iam', 'operation_idempotency'), ('iam', 'schema_migration'), ('iam', 'session'),
      ('iam', 'workspace_membership'), ('workspace', 'operation_idempotency'), ('workspace', 'workspace')
    ) ORDER BY schemaname, tablename
  `)
  assert.deepEqual(tables.rows, [
    { schemaname: 'iam', tablename: 'account', tableowner: 'iam_owner' },
    { schemaname: 'iam', tablename: 'bootstrap_context', tableowner: 'iam_owner' },
    { schemaname: 'iam', tablename: 'oidc_transaction', tableowner: 'iam_owner' },
    { schemaname: 'iam', tablename: 'operation_idempotency', tableowner: 'iam_owner' },
    { schemaname: 'iam', tablename: 'schema_migration', tableowner: 'iam_owner' },
    { schemaname: 'iam', tablename: 'session', tableowner: 'iam_owner' },
    { schemaname: 'iam', tablename: 'workspace_membership', tableowner: 'iam_owner' },
    { schemaname: 'workspace', tablename: 'operation_idempotency', tableowner: 'workspace_owner' },
    { schemaname: 'workspace', tablename: 'workspace', tableowner: 'workspace_owner' },
  ])

  const columns = await query(fresh, `
    SELECT table_schema, table_name, column_name, udt_name, is_nullable
    FROM information_schema.columns
    WHERE (table_schema, table_name) IN (('workspace', 'workspace'), ('workspace', 'operation_idempotency'), ('iam', 'workspace_membership'))
    ORDER BY table_schema, table_name, ordinal_position
  `)
  assert.deepEqual(columns.rows, [
    { table_schema: 'iam', table_name: 'workspace_membership', column_name: 'account_id', udt_name: 'uuid', is_nullable: 'NO' },
    { table_schema: 'iam', table_name: 'workspace_membership', column_name: 'workspace_id', udt_name: 'uuid', is_nullable: 'NO' },
    { table_schema: 'iam', table_name: 'workspace_membership', column_name: 'can_create_project', udt_name: 'bool', is_nullable: 'NO' },
    { table_schema: 'iam', table_name: 'workspace_membership', column_name: 'created_at', udt_name: 'timestamptz', is_nullable: 'NO' },
    { table_schema: 'workspace', table_name: 'operation_idempotency', column_name: 'operation_id', udt_name: 'text', is_nullable: 'NO' },
    { table_schema: 'workspace', table_name: 'operation_idempotency', column_name: 'account_id', udt_name: 'uuid', is_nullable: 'NO' },
    { table_schema: 'workspace', table_name: 'operation_idempotency', column_name: 'key_digest', udt_name: 'text', is_nullable: 'NO' },
    { table_schema: 'workspace', table_name: 'operation_idempotency', column_name: 'request_digest', udt_name: 'text', is_nullable: 'NO' },
    { table_schema: 'workspace', table_name: 'operation_idempotency', column_name: 'reserved_workspace_id', udt_name: 'uuid', is_nullable: 'NO' },
    { table_schema: 'workspace', table_name: 'operation_idempotency', column_name: 'outcome', udt_name: 'text', is_nullable: 'NO' },
    { table_schema: 'workspace', table_name: 'operation_idempotency', column_name: 'response_status', udt_name: 'int4', is_nullable: 'YES' },
    { table_schema: 'workspace', table_name: 'operation_idempotency', column_name: 'response_digest', udt_name: 'text', is_nullable: 'YES' },
    { table_schema: 'workspace', table_name: 'operation_idempotency', column_name: 'response_body', udt_name: 'jsonb', is_nullable: 'YES' },
    { table_schema: 'workspace', table_name: 'operation_idempotency', column_name: 'created_at', udt_name: 'timestamptz', is_nullable: 'NO' },
    { table_schema: 'workspace', table_name: 'operation_idempotency', column_name: 'completed_at', udt_name: 'timestamptz', is_nullable: 'YES' },
    { table_schema: 'workspace', table_name: 'workspace', column_name: 'workspace_id', udt_name: 'uuid', is_nullable: 'NO' },
    { table_schema: 'workspace', table_name: 'workspace', column_name: 'name', udt_name: 'text', is_nullable: 'NO' },
    { table_schema: 'workspace', table_name: 'workspace', column_name: 'created_at', udt_name: 'timestamptz', is_nullable: 'NO' },
  ])

  const constraints = await query(fresh, `
    SELECT n.nspname AS schema_name, c.relname AS table_name, constraint_row.conname AS constraint_name,
      constraint_row.contype AS constraint_type,
      CASE WHEN constraint_row.contype = 'f' THEN pg_get_constraintdef(constraint_row.oid, true) ELSE NULL END AS foreign_key
    FROM pg_constraint AS constraint_row
    JOIN pg_class AS c ON c.oid = constraint_row.conrelid
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE (n.nspname, c.relname) IN (
      ('iam', 'workspace_membership'),
      ('workspace', 'operation_idempotency'),
      ('workspace', 'workspace')
    )
    ORDER BY n.nspname, c.relname, constraint_row.conname
  `)
  assert.deepEqual(constraints.rows, [
    { schema_name: 'iam', table_name: 'workspace_membership', constraint_name: 'workspace_membership_account_id_fkey', constraint_type: 'f', foreign_key: 'FOREIGN KEY (account_id) REFERENCES iam.account(account_id)' },
    { schema_name: 'iam', table_name: 'workspace_membership', constraint_name: 'workspace_membership_pkey', constraint_type: 'p', foreign_key: null },
    { schema_name: 'iam', table_name: 'workspace_membership', constraint_name: 'workspace_membership_workspace_id_fkey', constraint_type: 'f', foreign_key: 'FOREIGN KEY (workspace_id) REFERENCES workspace.workspace(workspace_id) ON DELETE RESTRICT' },
    { schema_name: 'workspace', table_name: 'operation_idempotency', constraint_name: 'operation_idempotency_check', constraint_type: 'c', foreign_key: null },
    { schema_name: 'workspace', table_name: 'operation_idempotency', constraint_name: 'operation_idempotency_key_digest_check', constraint_type: 'c', foreign_key: null },
    { schema_name: 'workspace', table_name: 'operation_idempotency', constraint_name: 'operation_idempotency_operation_id_check', constraint_type: 'c', foreign_key: null },
    { schema_name: 'workspace', table_name: 'operation_idempotency', constraint_name: 'operation_idempotency_outcome_check', constraint_type: 'c', foreign_key: null },
    { schema_name: 'workspace', table_name: 'operation_idempotency', constraint_name: 'operation_idempotency_pkey', constraint_type: 'p', foreign_key: null },
    { schema_name: 'workspace', table_name: 'operation_idempotency', constraint_name: 'operation_idempotency_request_digest_check', constraint_type: 'c', foreign_key: null },
    { schema_name: 'workspace', table_name: 'operation_idempotency', constraint_name: 'operation_idempotency_response_digest_check', constraint_type: 'c', foreign_key: null },
    { schema_name: 'workspace', table_name: 'workspace', constraint_name: 'workspace_name_check', constraint_type: 'c', foreign_key: null },
    { schema_name: 'workspace', table_name: 'workspace', constraint_name: 'workspace_pkey', constraint_type: 'p', foreign_key: null },
  ])

  const functionCatalog = await query(fresh, `
    SELECT n.nspname AS schema_name, p.proname AS function_name,
      pg_get_function_identity_arguments(p.oid) AS identity_arguments,
      pg_get_userbyid(p.proowner) AS function_owner, p.prosecdef,
      p.proconfig, pg_get_function_result(p.oid) AS result_type
    FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('iam', 'workspace')
      AND p.proname IN ('establish_workspace_creator_access', 'list_workspace_memberships',
        'complete_create_workspace_receipt', 'create_workspace', 'list_workspace_summaries',
        'reserve_or_replay_create_workspace')
    ORDER BY n.nspname, p.proname
  `)
  assert.deepEqual(functionCatalog.rows, [
    {
      schema_name: 'iam', function_name: 'establish_workspace_creator_access', identity_arguments: 'p_account_id uuid, p_workspace_id uuid',
      function_owner: 'iam_owner', prosecdef: true, proconfig: ['search_path=pg_catalog, pg_temp'], result_type: 'void',
    },
    {
      schema_name: 'iam', function_name: 'list_workspace_memberships', identity_arguments: 'p_account_id uuid',
      function_owner: 'iam_owner', prosecdef: true, proconfig: ['search_path=pg_catalog, pg_temp'], result_type: 'TABLE(workspace_id uuid)',
    },
    {
      schema_name: 'workspace', function_name: 'complete_create_workspace_receipt', identity_arguments: 'p_account_id uuid, p_key_digest text, p_response_status integer, p_response_digest text, p_response_body jsonb',
      function_owner: 'workspace_owner', prosecdef: true, proconfig: ['search_path=pg_catalog, pg_temp'], result_type: 'void',
    },
    {
      schema_name: 'workspace', function_name: 'create_workspace', identity_arguments: 'p_workspace_id uuid, p_name text',
      function_owner: 'workspace_owner', prosecdef: true, proconfig: ['search_path=pg_catalog, pg_temp'], result_type: 'void',
    },
    {
      schema_name: 'workspace', function_name: 'list_workspace_summaries', identity_arguments: 'p_workspace_ids uuid[]',
      function_owner: 'workspace_owner', prosecdef: true, proconfig: ['search_path=pg_catalog, pg_temp'], result_type: 'TABLE(workspace_id uuid, name text)',
    },
    {
      schema_name: 'workspace', function_name: 'reserve_or_replay_create_workspace', identity_arguments: 'p_account_id uuid, p_key_digest text, p_request_digest text, p_candidate_workspace_id uuid',
      function_owner: 'workspace_owner', prosecdef: true, proconfig: ['search_path=pg_catalog, pg_temp'], result_type: 'TABLE(state text, workspace_id uuid, response_status integer, response_body jsonb)',
    },
  ])

  const functionSignatures = functionCatalog.rows.map(({ schema_name, function_name, identity_arguments }) => `${schema_name}.${function_name}(${typeArguments(identity_arguments)})`)
  const executeFor = async (role) => {
    const result = await query(fresh, `
      SELECT n.nspname AS schema_name, p.proname AS function_name,
        pg_get_function_identity_arguments(p.oid) AS identity_arguments
      FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
      WHERE n.nspname IN ('iam', 'workspace')
        AND p.proname IN ('establish_workspace_creator_access', 'list_workspace_memberships',
          'complete_create_workspace_receipt', 'create_workspace', 'list_workspace_summaries',
          'reserve_or_replay_create_workspace')
        AND has_function_privilege($1, p.oid, 'EXECUTE')
      ORDER BY n.nspname, p.proname
    `, [role])
    return result.rows.map(({ schema_name, function_name, identity_arguments }) => `${schema_name}.${function_name}(${typeArguments(identity_arguments)})`)
  }
  assert.deepEqual(await executeFor('hub_ws01_command'), [
    'workspace.complete_create_workspace_receipt(uuid,text,integer,text,jsonb)',
    'workspace.create_workspace(uuid,text)',
    'workspace.reserve_or_replay_create_workspace(uuid,text,text,uuid)',
    'iam.establish_workspace_creator_access(uuid,uuid)',
  ].sort())
  assert.deepEqual(await executeFor('hub_s2_read'), [
    'iam.list_workspace_memberships(uuid)', 'workspace.list_workspace_summaries(uuid[])',
  ].sort())
  assert.deepEqual(await executeFor('public'), [])
  assert.deepEqual(functionSignatures.sort(), [
    'iam.establish_workspace_creator_access(uuid,uuid)', 'iam.list_workspace_memberships(uuid)',
    'workspace.complete_create_workspace_receipt(uuid,text,integer,text,jsonb)', 'workspace.create_workspace(uuid,text)',
    'workspace.list_workspace_summaries(uuid[])', 'workspace.reserve_or_replay_create_workspace(uuid,text,text,uuid)',
  ].sort())

  for (const role of ['hub_ws01_command', 'hub_s2_read']) {
    const schemaPrivileges = await query(fresh, `
      SELECT has_schema_privilege($1, 'iam', 'USAGE') AS iam_usage,
        has_schema_privilege($1, 'iam', 'CREATE') AS iam_create,
        has_schema_privilege($1, 'workspace', 'USAGE') AS workspace_usage,
        has_schema_privilege($1, 'workspace', 'CREATE') AS workspace_create
    `, [role])
    assert.deepEqual(schemaPrivileges.rows[0], { iam_usage: true, iam_create: false, workspace_usage: true, workspace_create: false })
    const tablePrivileges = await query(fresh, `
      SELECT has_table_privilege($1, 'iam.workspace_membership', 'SELECT') AS membership_select,
        has_table_privilege($1, 'workspace.workspace', 'SELECT') AS workspace_select,
        has_table_privilege($1, 'workspace.operation_idempotency', 'INSERT') AS receipt_insert
    `, [role])
    assert.deepEqual(tablePrivileges.rows[0], { membership_select: false, workspace_select: false, receipt_insert: false })
  }
  const directApplicationTableGrants = await query(fresh, `
    SELECT grantee, table_schema, table_name, privilege_type
    FROM information_schema.table_privileges
    WHERE table_schema IN ('iam', 'workspace')
      AND grantee IN ('hub_ws01_command', 'hub_s2_read', 'PUBLIC')
    ORDER BY grantee, table_schema, table_name, privilege_type
  `)
  assert.deepEqual(directApplicationTableGrants.rows, [])
  const publicPrivileges = await query(fresh, `
    SELECT has_schema_privilege('public', 'iam', 'USAGE') AS iam_usage,
      has_schema_privilege('public', 'workspace', 'USAGE') AS workspace_usage,
      has_table_privilege('public', 'iam.workspace_membership', 'SELECT') AS membership_select,
      has_table_privilege('public', 'workspace.workspace', 'SELECT') AS workspace_select
  `)
  assert.deepEqual(publicPrivileges.rows[0], { iam_usage: false, workspace_usage: false, membership_select: false, workspace_select: false })
  const ownerReference = await query(fresh, `SELECT has_table_privilege('iam_owner', 'workspace.workspace', 'REFERENCES') AS references_grant`)
  assert.deepEqual(ownerReference.rows[0], { references_grant: true })

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
