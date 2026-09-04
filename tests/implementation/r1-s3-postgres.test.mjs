import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import pg from 'pg'
import { runHubMigrations } from '../../scripts/run-hub-migrations.mjs'

const { Client } = pg
const repositoryRoot = resolve(import.meta.dirname, '../..')
const hubBuild = mkdtempSync(resolve(repositoryRoot, 'apps/hub/r1-s3-postgres-build-'))
process.once('exit', () => rmSync(hubBuild, { recursive: true, force: true }))
const compiled = spawnSync(process.execPath, [
  resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'),
  '--project', resolve(repositoryRoot, 'apps/hub/tsconfig.json'),
  '--noEmit', 'false', '--outDir', hubBuild,
], { encoding: 'utf8' })
if (compiled.status !== 0) throw new Error(`S3_HUB_COMPILE_FAILED\n${compiled.stdout}\n${compiled.stderr}`)
const { createProjectSourceRecovery } = await import(pathToFileURL(resolve(hubBuild, 'project/source-recovery.js')).href)
const required = (name) => {
  const value = process.env[name]
  if (!value) throw new Error(`MISSING_TEST_CONFIG_${name}`)
  return value
}
const adminConnection = {
  host: required('CONEXUS_TEST_DB_HOST'),
  port: Number(required('CONEXUS_TEST_DB_PORT')),
  database: required('CONEXUS_TEST_DB_NAME'),
  user: required('CONEXUS_TEST_DB_USER'),
  password: required('CONEXUS_TEST_DB_PASSWORD'),
}
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
const digest = (character) => character.repeat(64)

test('S3 P1 real PostgreSQL proves exact PRJ-03 receipt, creator grant and rollback boundary', async (t) => {
  const database = `conexus_s3_p1_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 10)}`
  const liveClients = []
  const admin = new Client(adminConnection)
  await admin.connect()
  await admin.query(`CREATE DATABASE ${quoteIdentifier(database)}`)
  await admin.end()
  const fresh = { ...adminConnection, database }

  t.after(async () => {
    for (const client of liveClients.reverse()) await client.end().catch(() => {})
    const cleanup = new Client(adminConnection)
    await cleanup.connect()
    try {
      await cleanup.query('ALTER ROLE hub_prj03_command PASSWORD NULL').catch(() => {})
      await cleanup.query(`DROP DATABASE ${quoteIdentifier(database)} WITH (FORCE)`)
    } finally {
      await cleanup.end()
    }
  })

  const migration = await runHubMigrations({ connectionString: connectionString(fresh) })
  assert.deepEqual(migration.appliedNow, ['001', '002', '003', '004', '005', '006', '007', '008'])
  assert.deepEqual(migration.versions, ['001', '002', '003', '004', '005', '006', '007', '008'])
  assert.deepEqual((await runHubMigrations({ connectionString: connectionString(fresh) })).appliedNow, [])

  const role = await query(fresh, `
    SELECT rolname, rolcanlogin, rolsuper, rolinherit, rolcreaterole, rolcreatedb, rolreplication, rolbypassrls
    FROM pg_roles WHERE rolname IN ('hub_prj03_command', 'project_owner') ORDER BY rolname
  `)
  assert.deepEqual(role.rows, [
    { rolname: 'hub_prj03_command', rolcanlogin: true, rolsuper: false, rolinherit: false, rolcreaterole: false, rolcreatedb: false, rolreplication: false, rolbypassrls: false },
    { rolname: 'project_owner', rolcanlogin: false, rolsuper: false, rolinherit: false, rolcreaterole: false, rolcreatedb: false, rolreplication: false, rolbypassrls: false },
  ])
  const relations = await query(fresh, `
    SELECT schemaname, tablename, tableowner FROM pg_tables
    WHERE (schemaname, tablename) IN (('iam', 'account_project_grant'),
      ('project', 'operation_idempotency'), ('project', 'project'))
    ORDER BY schemaname, tablename
  `)
  assert.deepEqual(relations.rows, [
    { schemaname: 'iam', tablename: 'account_project_grant', tableowner: 'iam_owner' },
    { schemaname: 'project', tablename: 'operation_idempotency', tableowner: 'project_owner' },
    { schemaname: 'project', tablename: 'project', tableowner: 'project_owner' },
  ])
  const functions = await query(fresh, `
    SELECT n.nspname || '.' || p.proname AS name, pg_get_userbyid(p.proowner) AS owner,
      p.prosecdef, p.proconfig
    FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE (n.nspname, p.proname) IN (
      ('iam', 'establish_project_creator_grant'),
      ('project', 'complete_create_project_receipt'),
      ('project', 'create_project_with_source'),
      ('project', 'lock_create_project_receipt'),
      ('project', 'reserve_or_replay_create_project'))
    ORDER BY n.nspname, p.proname
  `)
  assert.deepEqual(functions.rows, [
    { name: 'iam.establish_project_creator_grant', owner: 'iam_owner', prosecdef: true, proconfig: ['search_path=pg_catalog, pg_temp'] },
    { name: 'project.complete_create_project_receipt', owner: 'project_owner', prosecdef: true, proconfig: ['search_path=pg_catalog, pg_temp'] },
    { name: 'project.create_project_with_source', owner: 'project_owner', prosecdef: true, proconfig: ['search_path=pg_catalog, pg_temp'] },
    { name: 'project.lock_create_project_receipt', owner: 'project_owner', prosecdef: true, proconfig: ['search_path=pg_catalog, pg_temp'] },
    { name: 'project.reserve_or_replay_create_project', owner: 'project_owner', prosecdef: true, proconfig: ['search_path=pg_catalog, pg_temp'] },
  ])
  const boundary = await query(fresh, `
    SELECT has_schema_privilege('hub_prj03_command', 'iam', 'USAGE') AS iam_usage,
      has_schema_privilege('hub_prj03_command', 'project', 'USAGE') AS project_usage,
      has_schema_privilege('hub_prj03_command', 'workspace', 'USAGE') AS workspace_usage,
      has_schema_privilege('hub_prj03_command', 'project', 'CREATE') AS project_create,
      (has_table_privilege('hub_prj03_command', 'project.project', 'SELECT')
        OR has_table_privilege('hub_prj03_command', 'project.project', 'INSERT')
        OR has_table_privilege('hub_prj03_command', 'project.project', 'UPDATE')
        OR has_table_privilege('hub_prj03_command', 'project.project', 'DELETE')) AS project_dml,
      (has_table_privilege('hub_prj03_command', 'iam.account_project_grant', 'SELECT')
        OR has_table_privilege('hub_prj03_command', 'iam.account_project_grant', 'INSERT')
        OR has_table_privilege('hub_prj03_command', 'iam.account_project_grant', 'UPDATE')
        OR has_table_privilege('hub_prj03_command', 'iam.account_project_grant', 'DELETE')) AS grant_dml,
      pg_has_role('hub_prj03_command', 'project_owner', 'MEMBER') AS project_owner_member,
      pg_has_role('hub_prj03_command', 'iam_owner', 'MEMBER') AS iam_owner_member
  `)
  assert.deepEqual(boundary.rows[0], {
    iam_usage: true, project_usage: true, workspace_usage: false, project_create: false,
    project_dml: false, grant_dml: false, project_owner_member: false, iam_owner_member: false,
  })
  const createAuthorityBoundary = await query(fresh, `
    SELECT has_function_privilege('hub_prj03_command', 'iam.can_create_project(uuid, uuid)', 'EXECUTE') AS command_execute,
      has_function_privilege('project_owner', 'iam.can_create_project(uuid, uuid)', 'EXECUTE') AS project_owner_execute,
      has_function_privilege('public', 'iam.can_create_project(uuid, uuid)', 'EXECUTE') AS public_execute
  `)
  assert.deepEqual(createAuthorityBoundary.rows, [{
    command_execute: false,
    project_owner_execute: true,
    public_execute: false,
  }])
  const publicExecute = await query(fresh, `
    SELECT count(*)::integer AS count
    FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE (n.nspname, p.proname) IN (
      ('iam', 'establish_project_creator_grant'),
      ('project', 'complete_create_project_receipt'),
      ('project', 'create_project_with_source'),
      ('project', 'lock_create_project_receipt'),
      ('project', 'reserve_or_replay_create_project'))
      AND has_function_privilege('public', p.oid, 'EXECUTE')
  `)
  assert.deepEqual(publicExecute.rows, [{ count: 0 }])

  const accountId = '10000000-0000-4000-8000-000000000031'
  const workspaceId = '20000000-0000-4000-8000-000000000031'
  const projectId = '30000000-0000-4000-8000-000000000031'
  const otherProjectId = '30000000-0000-4000-8000-000000000032'
  await query(fresh, `
    INSERT INTO iam.account(account_id, issuer, external_subject, display_name)
    VALUES ($1, 'https://issuer.test', 's3-subject', 'S3 Account')
  `, [accountId])
  await query(fresh, `INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1, 'S3 Workspace')`, [workspaceId])
  await query(fresh, `
    INSERT INTO iam.workspace_membership(account_id, workspace_id, can_create_project)
    VALUES ($1, $2, true)
  `, [accountId, workspaceId])

  const commandPassword = 's3-p1-command-test-only'
  await query(fresh, `ALTER ROLE hub_prj03_command PASSWORD '${commandPassword}'`)
  const commandConnection = { ...fresh, user: 'hub_prj03_command', password: commandPassword }
  const command = new Client(commandConnection)
  const contender = new Client(commandConnection)
  await command.connect()
  await contender.connect()
  liveClients.push(command, contender)

  await query(fresh, `UPDATE iam.workspace_membership SET can_create_project = false WHERE account_id = $1 AND workspace_id = $2`, [accountId, workspaceId])
  await assert.rejects(
    command.query('SELECT * FROM project.reserve_or_replay_create_project($1, $2, $3, $4, $5)', [accountId, workspaceId, digest('0'), digest('b'), projectId]),
    /PRJ03_CREATE_NOT_AUTHORIZED/,
  )
  assert.deepEqual((await query(fresh, `SELECT count(*)::integer AS count FROM project.operation_idempotency`)).rows, [{ count: 0 }])
  await query(fresh, `UPDATE iam.workspace_membership SET can_create_project = true WHERE account_id = $1 AND workspace_id = $2`, [accountId, workspaceId])

  await assert.rejects(command.query('SELECT * FROM project.project'), /permission denied/)
  await assert.rejects(command.query('INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision) VALUES ($1, $2, $3, $4, $5, $6)', [projectId, workspaceId, 'Denied', 'NEW', 'a', 'b']), /permission denied/)
  await assert.rejects(command.query('SET ROLE project_owner'), /permission denied/)
  await assert.rejects(command.query('SELECT workspace.create_workspace($1, $2)', [otherProjectId, 'Unlisted']), /permission denied/)
  await assert.rejects(command.query(`SELECT project.create_project_with_source($1, $2, $3, $4, $5, $6, $7, $8, $9)`, [accountId, workspaceId, digest('a'), digest('b'), projectId, 'No receipt', 'NEW', 'source-a', 'revision-a']), /PRJ03_RECEIPT_NOT_RESERVED/)
  const preexistingProjectId = '30000000-0000-4000-8000-000000000039'
  await query(fresh, `
    INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision)
    VALUES ($1, $2, 'Preexisting Project', 'NEW', 'source-existing', 'project-existing')
  `, [preexistingProjectId, workspaceId])
  await assert.rejects(command.query('SELECT * FROM project.reserve_or_replay_create_project($1, $2, $3, $4, $5)', [accountId, workspaceId, digest('7'), digest('b'), preexistingProjectId]), /PRJ03_PROJECT_ID_ALREADY_EXISTS/)
  await query(fresh, 'DELETE FROM project.project WHERE project_id = $1', [preexistingProjectId])

  const keyDigest = digest('a')
  const requestDigest = digest('b')
  const responseDigest = digest('c')
  const responseBody = { projectId, workspaceId, name: 'Project One', sourceMode: 'NEW', sourceRevision: 'source-1', projectRevision: 'project-1', archived: false }
  await command.query('BEGIN')
  const reservation = await command.query('SELECT * FROM project.reserve_or_replay_create_project($1, $2, $3, $4, $5)', [accountId, workspaceId, keyDigest, requestDigest, projectId])
  assert.deepEqual(reservation.rows, [{ state: 'RESERVED', project_id: projectId, response_status: null, response_body: null }])
  const locked = await command.query('SELECT * FROM project.lock_create_project_receipt($1, $2, $3, $4, $5)', [accountId, workspaceId, keyDigest, requestDigest, projectId])
  assert.deepEqual(locked.rows, [{ outcome: 'RESERVED', project_id: projectId }])
  await command.query('SELECT project.create_project_with_source($1, $2, $3, $4, $5, $6, $7, $8, $9)', [accountId, workspaceId, keyDigest, requestDigest, projectId, 'Project One', 'NEW', 'source-1', 'project-1'])
  await command.query('SELECT iam.establish_project_creator_grant($1, $2, $3, $4, $5)', [accountId, workspaceId, keyDigest, requestDigest, projectId])
  await command.query('SELECT project.complete_create_project_receipt($1, $2, $3, $4, $5, $6, $7, $8)', [accountId, workspaceId, keyDigest, requestDigest, projectId, 201, responseDigest, responseBody])
  const replay = await command.query('SELECT * FROM project.reserve_or_replay_create_project($1, $2, $3, $4, $5)', [accountId, workspaceId, keyDigest, requestDigest, otherProjectId])
  assert.deepEqual(replay.rows, [{ state: 'REPLAY', project_id: projectId, response_status: 201, response_body: responseBody }])
  const conflict = await command.query('SELECT * FROM project.reserve_or_replay_create_project($1, $2, $3, $4, $5)', [accountId, workspaceId, keyDigest, digest('d'), otherProjectId])
  assert.deepEqual(conflict.rows, [{ state: 'CONFLICT', project_id: projectId, response_status: null, response_body: null }])
  await command.query('ROLLBACK')

  const rollbackCase = async (keyCharacter, action, expected) => {
    await command.query('BEGIN')
    try {
      await command.query('SELECT * FROM project.reserve_or_replay_create_project($1, $2, $3, $4, $5)', [accountId, workspaceId, digest(keyCharacter), requestDigest, projectId])
      await assert.rejects(action(), expected)
    } finally {
      await command.query('ROLLBACK')
    }
  }
  await rollbackCase('e', () => command.query('SELECT project.create_project_with_source($1, $2, $3, $4, $5, $6, $7, $8, $9)', [accountId, workspaceId, digest('e'), requestDigest, projectId, '', 'NEW', 'source-1', 'project-1']), /check constraint/)
  await rollbackCase('f', async () => {
    await command.query('SELECT project.create_project_with_source($1, $2, $3, $4, $5, $6, $7, $8, $9)', [accountId, workspaceId, digest('f'), requestDigest, projectId, 'Project One', 'NEW', 'source-1', 'project-1'])
    return command.query('SELECT project.complete_create_project_receipt($1, $2, $3, $4, $5, $6, $7, $8)', [accountId, workspaceId, digest('f'), requestDigest, projectId, 201, responseDigest, responseBody])
  }, /PRJ03_SETTLEMENT_INCOMPLETE/)
  await rollbackCase('1', async () => {
    await command.query('SELECT project.create_project_with_source($1, $2, $3, $4, $5, $6, $7, $8, $9)', [accountId, workspaceId, digest('1'), requestDigest, projectId, 'Project One', 'NEW', 'source-1', 'project-1'])
    await command.query('SELECT iam.establish_project_creator_grant($1, $2, $3, $4, $5)', [accountId, workspaceId, digest('1'), requestDigest, projectId])
    return command.query('SELECT project.complete_create_project_receipt($1, $2, $3, $4, $5, $6, $7, $8)', [accountId, workspaceId, digest('1'), requestDigest, projectId, 201, 'invalid', responseBody])
  }, /check constraint/)

  const lockKey = digest('9')
  await command.query('BEGIN')
  await command.query('SELECT * FROM project.reserve_or_replay_create_project($1, $2, $3, $4, $5)', [accountId, workspaceId, lockKey, requestDigest, otherProjectId])
  await command.query('COMMIT')
  await query(fresh, `UPDATE iam.workspace_membership SET can_create_project = false WHERE account_id = $1 AND workspace_id = $2`, [accountId, workspaceId])
  await assert.rejects(
    command.query('SELECT * FROM project.lock_create_project_receipt($1, $2, $3, $4, $5)', [accountId, workspaceId, lockKey, requestDigest, otherProjectId]),
    /PRJ03_CREATE_NOT_AUTHORIZED/,
  )
  await query(fresh, `UPDATE iam.workspace_membership SET can_create_project = true WHERE account_id = $1 AND workspace_id = $2`, [accountId, workspaceId])
  await command.query('BEGIN')
  await command.query('SELECT * FROM project.lock_create_project_receipt($1, $2, $3, $4, $5)', [accountId, workspaceId, lockKey, requestDigest, otherProjectId])
  await contender.query('BEGIN')
  await contender.query(`SET LOCAL statement_timeout = '200ms'`)
  await assert.rejects(contender.query('SELECT * FROM project.lock_create_project_receipt($1, $2, $3, $4, $5)', [accountId, workspaceId, lockKey, requestDigest, otherProjectId]), /statement timeout|canceling statement/)
  await contender.query('ROLLBACK')
  await command.query('ROLLBACK')
  await assert.rejects(command.query('SELECT * FROM project.reserve_or_replay_create_project($1, $2, $3, $4, $5)', [accountId, workspaceId, digest('8'), requestDigest, otherProjectId]), /PRJ03_PROJECT_ID_ALREADY_RESERVED/)

  const durable = await query(fresh, `
    SELECT (SELECT count(*)::integer FROM project.project) AS project_count,
      (SELECT count(*)::integer FROM iam.account_project_grant) AS grant_count,
      (SELECT count(*)::integer FROM project.operation_idempotency WHERE outcome = 'SUCCEEDED') AS terminal_receipt_count
  `)
  assert.deepEqual(durable.rows, [{ project_count: 0, grant_count: 0, terminal_receipt_count: 0 }])

  await query(fresh, `
    SET ROLE project_owner;
    CREATE OR REPLACE FUNCTION project.lock_create_project_receipt(
      p_account_id uuid,
      p_workspace_id uuid,
      p_key_digest text,
      p_request_digest text,
      p_project_id uuid
    )
    RETURNS TABLE(outcome text, project_id uuid)
    LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
    AS $$ SELECT 'RESERVED'::text, $5::uuid $$;
    RESET ROLE
  `)
  await assert.rejects(
    runHubMigrations({ connectionString: connectionString(fresh) }),
    /MIGRATION_003_FUNCTION_SOURCE_REFUSED/,
  )
})

test('S3 P4-B real PostgreSQL proves receipt-locked abandoned-attempt cleanup composition', async (t) => {
  const database = `conexus_s3_p4b_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 10)}`
  const ownerRoot = await mkdtemp(join(tmpdir(), 'conexus-s3-p4b-'))
  const liveClients = []
  const admin = new Client(adminConnection)
  await admin.connect()
  await admin.query(`CREATE DATABASE ${quoteIdentifier(database)}`)
  await admin.end()
  const fresh = { ...adminConnection, database }

  t.after(async () => {
    for (const client of liveClients.reverse()) await client.end().catch(() => {})
    await rm(ownerRoot, { recursive: true, force: true })
    const cleanup = new Client(adminConnection)
    await cleanup.connect()
    try {
      await cleanup.query('ALTER ROLE hub_prj03_command PASSWORD NULL').catch(() => {})
      await cleanup.query(`DROP DATABASE ${quoteIdentifier(database)} WITH (FORCE)`)
    } finally {
      await cleanup.end()
    }
  })

  const migration = await runHubMigrations({ connectionString: connectionString(fresh) })
  assert.deepEqual(migration.appliedNow, ['001', '002', '003', '004', '005', '006', '007', '008'])
  assert.deepEqual(migration.versions, ['001', '002', '003', '004', '005', '006', '007', '008'])
  assert.deepEqual((await runHubMigrations({ connectionString: connectionString(fresh) })).appliedNow, [])

  const claimCatalog = await query(fresh, `
    SELECT oidvectortypes(p.proargtypes) AS arguments,
      pg_get_userbyid(p.proowner) AS owner, p.prosecdef, p.proconfig,
      pg_get_function_result(p.oid) AS result,
      has_function_privilege('hub_prj03_command', p.oid, 'EXECUTE') AS command_execute,
      has_function_privilege('public', p.oid, 'EXECUTE') AS public_execute
    FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'project' AND p.proname = 'claim_abandoned_create_project_attempt'
    ORDER BY oidvectortypes(p.proargtypes)
  `)
  assert.deepEqual(claimCatalog.rows, [
    {
      arguments: 'timestamp with time zone, integer',
      owner: 'project_owner',
      prosecdef: true,
      proconfig: ['search_path=pg_catalog, pg_temp'],
      result: 'TABLE(account_id uuid, workspace_id uuid, key_digest text, request_digest text, project_id uuid)',
      command_execute: true,
      public_execute: false,
    },
    {
      arguments: 'uuid, uuid, text, text, uuid, timestamp with time zone',
      owner: 'project_owner',
      prosecdef: true,
      proconfig: ['search_path=pg_catalog, pg_temp'],
      result: 'uuid',
      command_execute: true,
      public_execute: false,
    },
  ])

  const accountId = '10000000-0000-4000-8000-000000000041'
  const workspaceId = '20000000-0000-4000-8000-000000000041'
  await query(fresh, `
    INSERT INTO iam.account(account_id, issuer, external_subject, display_name)
    VALUES ($1, 'https://issuer.test', 's3-p4b-subject', 'S3 P4-B Account')
  `, [accountId])
  await query(fresh, `INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1, 'S3 P4-B Workspace')`, [workspaceId])
  await query(fresh, `
    INSERT INTO iam.workspace_membership(account_id, workspace_id, can_create_project)
    VALUES ($1, $2, true)
  `, [accountId, workspaceId])

  const commandPassword = 's3-p4b-command-test-only'
  await query(fresh, `ALTER ROLE hub_prj03_command PASSWORD '${commandPassword}'`)
  const commandConnection = { ...fresh, user: 'hub_prj03_command', password: commandPassword }
  const command = new Client(commandConnection)
  const contender = new Client(commandConnection)
  await command.connect()
  await contender.connect()
  liveClients.push(command, contender)
  const recovery = createProjectSourceRecovery(ownerRoot)

  const requestDigest = digest('b')
  const reserve = (client, keyDigest, projectId) => client.query(
    'SELECT * FROM project.reserve_or_replay_create_project($1, $2, $3, $4, $5)',
    [accountId, workspaceId, keyDigest, requestDigest, projectId],
  )
  const claim = (client, keyDigest, projectId, expiredBefore) => client.query(
    'SELECT project.claim_abandoned_create_project_attempt($1, $2, $3, $4, $5, $6) AS project_id',
    [accountId, workspaceId, keyDigest, requestDigest, projectId, expiredBefore],
  )
  const backdate = (keyDigest, age) => query(fresh, `
    UPDATE project.operation_idempotency SET created_at = clock_timestamp() - $5::interval
    WHERE operation_id = 'PRJ-03' AND account_id = $1 AND workspace_id = $2
      AND key_digest = $3 AND request_digest = $4
  `, [accountId, workspaceId, keyDigest, requestDigest, age])

  const keyDigest = digest('a')
  const projectId = '30000000-0000-8000-8000-000000000041'
  await reserve(command, keyDigest, projectId)
  const expiredBefore = new Date(Date.now() - 30 * 60 * 1000).toISOString()
  await assert.rejects(claim(command, keyDigest, projectId, expiredBefore), /PRJ03_ABANDONED_RECEIPT_NOT_EXPIRED/)
  await assert.rejects(
    command.query(
      'SELECT project.claim_abandoned_create_project_attempt($1, $2, $3, $4, $5, $6)',
      [accountId, workspaceId, keyDigest, digest('c'), projectId, expiredBefore],
    ),
    /PRJ03_ABANDONED_RECEIPT_IDENTITY_MISMATCH/,
  )
  await assert.rejects(claim(command, digest('f'), projectId, expiredBefore), /PRJ03_ABANDONED_RECEIPT_NOT_FOUND/)
  await assert.rejects(
    claim(command, keyDigest, projectId, new Date(Date.now() + 60_000).toISOString()),
    /PRJ03_ABANDONED_RECEIPT_NOT_EXPIRED/,
  )
  await backdate(keyDigest, '2 hours')

  const attemptId = '40000000-0000-4000-8000-000000000041'
  const sourceRevision = '1111111111111111111111111111111111111111'
  const staging = join(ownerRoot, 'staging', projectId, attemptId)
  const quarantine = join(ownerRoot, 'quarantine', projectId, attemptId)
  const quarantineProject = join(ownerRoot, 'quarantine', projectId)
  const bundle = join(ownerRoot, 'bundles', projectId, `${sourceRevision}.bundle`)
  const canonicalSentinel = join(ownerRoot, 'projects', projectId, 'sentinel')
  for (const path of [staging, quarantine, join(ownerRoot, 'bundles', projectId), join(ownerRoot, 'projects', projectId)]) {
    await mkdir(path, { recursive: true })
  }
  await writeFile(bundle, 'candidate bundle')
  await writeFile(canonicalSentinel, 'canonical')
  const outside = join(ownerRoot, 'outside')
  await mkdir(outside)
  await rm(quarantineProject, { recursive: true })
  await symlink(outside, quarantineProject, 'dir')

  await command.query('BEGIN')
  assert.deepEqual((await claim(command, keyDigest, projectId, expiredBefore)).rows, [{ project_id: projectId }])
  assert.deepEqual(await recovery.cleanupClaimedProjectSource(projectId), {
    status: 'REFUSED',
    code: 'CANDIDATE_PATH_REFUSED',
  })
  await command.query('ROLLBACK')
  assert.equal((await query(fresh, `SELECT count(*)::integer AS count FROM project.operation_idempotency WHERE key_digest = $1`, [keyDigest])).rows[0].count, 1)
  await rm(quarantineProject)
  await mkdir(quarantine, { recursive: true })
  await mkdir(staging, { recursive: true })

  await command.query('BEGIN')
  assert.deepEqual((await claim(command, keyDigest, projectId, expiredBefore)).rows, [{ project_id: projectId }])
  await contender.query('BEGIN')
  await contender.query(`SET LOCAL statement_timeout = '200ms'`)
  await assert.rejects(claim(contender, keyDigest, projectId, expiredBefore), /statement timeout|canceling statement/)
  await contender.query('ROLLBACK')
  assert.deepEqual(await recovery.cleanupClaimedProjectSource(projectId), {
    status: 'CLEANED',
    projectId,
    removed: ['staging', 'quarantine', 'bundles', 'projects'],
  })
  assert.equal(existsSync(canonicalSentinel), false)
  await command.query('COMMIT')
  assert.equal((await query(fresh, `SELECT count(*)::integer AS count FROM project.operation_idempotency WHERE key_digest = $1`, [keyDigest])).rows[0].count, 0)

  const terminalKey = digest('c')
  const terminalProjectId = '30000000-0000-4000-8000-000000000042'
  await command.query('BEGIN')
  await reserve(command, terminalKey, terminalProjectId)
  await command.query(
    'SELECT project.create_project_with_source($1, $2, $3, $4, $5, $6, $7, $8, $9)',
    [accountId, workspaceId, terminalKey, requestDigest, terminalProjectId, 'Terminal', 'NEW', 'source-terminal', 'project-terminal'],
  )
  await command.query(
    'SELECT iam.establish_project_creator_grant($1, $2, $3, $4, $5)',
    [accountId, workspaceId, terminalKey, requestDigest, terminalProjectId],
  )
  await command.query(
    'SELECT project.complete_create_project_receipt($1, $2, $3, $4, $5, $6, $7, $8)',
    [accountId, workspaceId, terminalKey, requestDigest, terminalProjectId, 201, digest('e'), { projectId: terminalProjectId }],
  )
  await command.query('COMMIT')
  await assert.rejects(
    claim(command, terminalKey, terminalProjectId, new Date(Date.now() + 60_000).toISOString()),
    /PRJ03_ABANDONED_RECEIPT_TERMINAL/,
  )

  const committedKey = digest('d')
  const committedProjectId = '30000000-0000-4000-8000-000000000043'
  await reserve(command, committedKey, committedProjectId)
  await backdate(committedKey, '2 hours')
  await query(fresh, `
    INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision)
    VALUES ($1, $2, 'Committed', 'NEW', 'source-committed', 'project-committed')
  `, [committedProjectId, workspaceId])
  const committedCanonical = join(ownerRoot, 'projects', committedProjectId, 'sentinel')
  await mkdir(join(ownerRoot, 'projects', committedProjectId), { recursive: true })
  await writeFile(committedCanonical, 'committed')
  await assert.rejects(claim(command, committedKey, committedProjectId, expiredBefore), /PRJ03_ABANDONED_PROJECT_EXISTS/)
  assert.equal(existsSync(committedCanonical), true)

  const scanReceipts = []
  for (let index = 1; index <= 18; index += 1) {
    const scanKey = index.toString(16).padStart(64, '0')
    const scanProjectId = randomUUID()
    await reserve(command, scanKey, scanProjectId)
    await backdate(scanKey, `${180 - index} minutes`)
    scanReceipts.push({ keyDigest: scanKey, projectId: scanProjectId })
  }
  await assert.rejects(
    command.query('SELECT * FROM project.claim_abandoned_create_project_attempt($1, $2)', [expiredBefore, 17]),
    /PRJ03_ABANDONED_SCAN_LIMIT_REFUSED/,
  )
  await assert.rejects(
    command.query('SELECT * FROM project.claim_abandoned_create_project_attempt($1, $2)', [new Date(Date.now() + 60_000).toISOString(), 16]),
    /PRJ03_ABANDONED_SCAN_CUTOFF_REFUSED/,
  )
  await command.query('BEGIN')
  await command.query(
    'SELECT * FROM project.lock_create_project_receipt($1, $2, $3, $4, $5)',
    [accountId, workspaceId, scanReceipts[0].keyDigest, requestDigest, scanReceipts[0].projectId],
  )
  await contender.query('BEGIN')
  const settlementExcluded = (await contender.query(
    'SELECT * FROM project.claim_abandoned_create_project_attempt($1, $2)',
    [expiredBefore, 16],
  )).rows
  assert.equal(settlementExcluded.length, 16)
  assert.equal(settlementExcluded.some(({ project_id: value }) => value === scanReceipts[0].projectId), false)
  await contender.query('ROLLBACK')
  await command.query('ROLLBACK')

  await command.query('BEGIN')
  const firstScanner = (await command.query(
    'SELECT * FROM project.claim_abandoned_create_project_attempt($1, $2)',
    [expiredBefore, 16],
  )).rows
  await contender.query('BEGIN')
  const secondScanner = (await contender.query(
    'SELECT * FROM project.claim_abandoned_create_project_attempt($1, $2)',
    [expiredBefore, 16],
  )).rows
  assert.equal(firstScanner.length, 16)
  assert.equal(secondScanner.length, 2)
  assert.deepEqual(
    secondScanner.map(({ project_id: value }) => value),
    scanReceipts.slice(16).map(({ projectId: value }) => value),
  )
  await contender.query('ROLLBACK')
  await command.query('ROLLBACK')

  await command.query('BEGIN')
  const oldest = (await command.query(
    'SELECT * FROM project.claim_abandoned_create_project_attempt($1, $2)',
    [expiredBefore, 16],
  )).rows
  assert.equal(oldest.length, 16)
  assert.deepEqual(oldest.map(({ project_id: value }) => value), scanReceipts.slice(0, 16).map(({ projectId: value }) => value))
  for (const receipt of oldest) {
    assert.deepEqual(await recovery.cleanupClaimedProjectSource(receipt.project_id), {
      status: 'CLEANED',
      projectId: receipt.project_id,
      removed: [],
    })
  }
  await command.query('COMMIT')
  const scanRemaining = await query(fresh, `
    SELECT count(*)::integer AS count FROM project.operation_idempotency
    WHERE reserved_project_id = ANY($1::uuid[])
  `, [scanReceipts.map(({ projectId: value }) => value)])
  assert.deepEqual(scanRemaining.rows, [{ count: 2 }])

  await query(fresh, `
    SET ROLE project_owner;
    CREATE OR REPLACE FUNCTION project.claim_abandoned_create_project_attempt(
      p_account_id uuid,
      p_workspace_id uuid,
      p_key_digest text,
      p_request_digest text,
      p_project_id uuid,
      p_expired_before timestamptz
    ) RETURNS uuid
    LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
    AS $$ SELECT $5::uuid $$;
    RESET ROLE
  `)
  await assert.rejects(
    runHubMigrations({ connectionString: connectionString(fresh) }),
    /MIGRATION_005_FUNCTION_SOURCE_REFUSED/,
  )
})

test('S3 P6 real PostgreSQL proves current project.read disclosure and revocation', async (t) => {
  const database = `conexus_s3_p6_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 10)}`
  const liveClients = []
  const admin = new Client(adminConnection)
  await admin.connect()
  await admin.query(`CREATE DATABASE ${quoteIdentifier(database)}`)
  await admin.end()
  const fresh = { ...adminConnection, database }

  t.after(async () => {
    for (const client of liveClients.reverse()) await client.end().catch(() => {})
    const cleanup = new Client(adminConnection)
    await cleanup.connect()
    try {
      await cleanup.query('ALTER ROLE hub_s3_read PASSWORD NULL').catch(() => {})
      await cleanup.query(`DROP DATABASE ${quoteIdentifier(database)} WITH (FORCE)`)
    } finally {
      await cleanup.end()
    }
  })

  assert.deepEqual((await runHubMigrations({ connectionString: connectionString(fresh) })).versions,
    ['001', '002', '003', '004', '005', '006', '007', '008'])
  const accountId = '10000000-0000-4000-8000-000000000081'
  const otherAccountId = '10000000-0000-4000-8000-000000000082'
  const workspaceId = '20000000-0000-4000-8000-000000000081'
  const otherWorkspaceId = '20000000-0000-4000-8000-000000000082'
  const projectId = '30000000-0000-4000-8000-000000000081'
  const siblingProjectId = '30000000-0000-4000-8000-000000000082'
  const crossWorkspaceProjectId = '30000000-0000-4000-8000-000000000083'
  await query(fresh, `INSERT INTO iam.account(account_id, issuer, external_subject, display_name) VALUES
    ($1, 'https://issuer.test', 'p6-reader', 'P6 Reader'),
    ($2, 'https://issuer.test', 'p6-other', 'P6 Other')`, [accountId, otherAccountId])
  await query(fresh, `INSERT INTO workspace.workspace(workspace_id, name) VALUES
    ($1, 'P6 Workspace'), ($2, 'Other Workspace')`, [workspaceId, otherWorkspaceId])
  await query(fresh, `INSERT INTO iam.workspace_membership(account_id, workspace_id, can_create_project)
    VALUES ($1, $2, true)`, [accountId, workspaceId])
  await query(fresh, `INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision) VALUES
    ($1, $4, 'Visible Project', 'NEW', 'source-visible', 'revision-visible'),
    ($2, $4, 'Sibling Project', 'NEW', 'source-sibling', 'revision-sibling'),
    ($3, $5, 'Cross Workspace', 'NEW', 'source-cross', 'revision-cross')`,
  [projectId, siblingProjectId, crossWorkspaceProjectId, workspaceId, otherWorkspaceId])
  await query(fresh, `INSERT INTO iam.account_project_grant(account_id, project_id, can_read, can_manage) VALUES
    ($1, $3, true, true), ($2, $4, true, true), ($1, $5, true, true)`,
  [accountId, otherAccountId, projectId, siblingProjectId, crossWorkspaceProjectId])

  const readPassword = 's3-p6-read-test-only'
  await query(fresh, `ALTER ROLE hub_s3_read PASSWORD '${readPassword}'`)
  const read = new Client({ ...fresh, user: 'hub_s3_read', password: readPassword })
  await read.connect()
  liveClients.push(read)
  await assert.rejects(read.query('SELECT * FROM project.project'), /permission denied/)
  await assert.rejects(read.query('SELECT * FROM iam.account_project_grant'), /permission denied/)

  const list = await read.query(`
    SELECT summary.* FROM project.list_project_summaries(
      $2, ARRAY(SELECT admitted.project_id
                FROM iam.list_workspace_readable_project_ids($1, $2) admitted)
    ) summary
  `, [accountId, workspaceId])
  assert.deepEqual(list.rows, [{
    project_id: projectId,
    workspace_id: workspaceId,
    name: 'Visible Project',
    archived: false,
  }])
  const detail = await read.query(`
    SELECT detail.* FROM project.get_project_representation(
      $2, ARRAY(SELECT admitted.project_id FROM iam.admit_project_read($1, $2) admitted)
    ) detail
  `, [accountId, projectId])
  assert.deepEqual(detail.rows, [{
    project_id: projectId,
    workspace_id: workspaceId,
    name: 'Visible Project',
    project_revision: 'revision-visible',
    archived: false,
  }])
  assert.deepEqual((await read.query('SELECT * FROM iam.admit_project_read($1, $2)', [accountId, siblingProjectId])).rows, [])
  assert.deepEqual((await read.query('SELECT * FROM iam.admit_project_read($1, $2)', [accountId, crossWorkspaceProjectId])).rows, [])

  await query(fresh, 'DELETE FROM iam.account_project_grant WHERE account_id = $1 AND project_id = $2', [accountId, projectId])
  assert.deepEqual((await read.query('SELECT * FROM iam.admit_project_read($1, $2)', [accountId, projectId])).rows, [])
  assert.deepEqual((await read.query('SELECT * FROM iam.list_workspace_readable_project_ids($1, $2)', [accountId, workspaceId])).rows, [])
})
