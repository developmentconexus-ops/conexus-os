import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import pg from 'pg'
import { runHubMigrations } from '../../scripts/run-hub-migrations.mjs'
import { refuseProtectedCluster } from './protected-cluster.mjs'

const { Client } = pg
const repositoryRoot = resolve(import.meta.dirname, '../..')
const hubBuild = mkdtempSync(resolve(repositoryRoot, 'apps/hub/project-postgres-build-'))
process.once('exit', () => rmSync(hubBuild, { recursive: true, force: true }))
const compiled = spawnSync(process.execPath, [
  resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'),
  '--project', resolve(repositoryRoot, 'apps/hub/tsconfig.json'),
  '--noEmit', 'false', '--outDir', hubBuild,
], { encoding: 'utf8' })
if (compiled.status !== 0) throw new Error(`S3_HUB_COMPILE_FAILED\n${compiled.stdout}\n${compiled.stderr}`)
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
const HEAD = 'a'.repeat(40)
// A new Project is created bound to its repository; these are the Factory ids that binding names.
const REPOSITORY = ['factory-project-1', 'project-repository-1', 'repository-1', HEAD]
const CREATE = 'SELECT project.create_project_with_repository($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)'

// The first two tests install the R1 ledger, which ends at 010, so they name the roles R1 itself
// creates. The capability names arrive at 059 and the third test, which installs the current
// ledger, uses them.
test('real PostgreSQL proves exact PRJ-03 receipt, creator grant and rollback boundary', async (t) => {
  await refuseProtectedCluster()
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
      await cleanup.query('ALTER ROLE hub_project_command PASSWORD NULL').catch(() => {})
      await cleanup.query(`DROP DATABASE ${quoteIdentifier(database)} WITH (FORCE)`)
    } finally {
      await cleanup.end()
    }
  })

  await runHubMigrations({ connectionString: connectionString(fresh) })

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
    INSERT INTO iam.workspace_membership(account_id, workspace_id, role)
    VALUES ($1, $2, 'owner')
  `, [accountId, workspaceId])

  const commandPassword = 's3-p1-command-test-only'
  await query(fresh, `ALTER ROLE hub_project_command PASSWORD '${commandPassword}'`)
  const commandConnection = { ...fresh, user: 'hub_project_command', password: commandPassword }
  const command = new Client(commandConnection)
  const contender = new Client(commandConnection)
  await command.connect()
  await contender.connect()
  liveClients.push(command, contender)

  await query(fresh, `DELETE FROM iam.workspace_membership WHERE account_id = $1 AND workspace_id = $2`, [accountId, workspaceId])
  await assert.rejects(
    command.query('SELECT * FROM project.reserve_or_replay_create_project($1, $2, $3, $4, $5)', [accountId, workspaceId, digest('0'), digest('b'), projectId]),
    /NOT_ADMITTED/,
  )
  assert.deepEqual((await query(fresh, `SELECT count(*)::integer AS count FROM project.operation_idempotency`)).rows, [{ count: 0 }])
  await query(fresh, `INSERT INTO iam.workspace_membership(account_id, workspace_id, role) VALUES ($1, $2, 'owner')`, [accountId, workspaceId])

  await assert.rejects(command.query('SELECT * FROM project.project'), /permission denied/)
  await assert.rejects(command.query('INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision) VALUES ($1, $2, $3, $4, $5, $6)', [projectId, workspaceId, 'Denied', 'NEW', 'a', 'b']), /permission denied/)
  await assert.rejects(command.query('SET ROLE project_owner'), /permission denied/)
  await assert.rejects(command.query('SELECT workspace.create_workspace($1, $2)', [otherProjectId, 'Unlisted']), /permission denied/)
  await assert.rejects(command.query('SELECT project.create_project_with_source($1, $2, $3, $4, $5, $6, $7, $8, $9)', [accountId, workspaceId, digest('a'), digest('b'), projectId, 'Unbound', 'NEW', HEAD, 'revision-a']), /permission denied for function create_project_with_source/)
  await assert.rejects(command.query(CREATE, [accountId, workspaceId, digest('a'), digest('b'), projectId, 'No receipt', 'revision-a', ...REPOSITORY]), /PRJ03_RECEIPT_NOT_RESERVED/)
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
  const responseBody = { projectId, workspaceId, name: 'Project One', sourceMode: 'NEW', sourceRevision: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', projectRevision: 'project-1', archived: false }
  await command.query('BEGIN')
  const reservation = await command.query('SELECT * FROM project.reserve_or_replay_create_project($1, $2, $3, $4, $5)', [accountId, workspaceId, keyDigest, requestDigest, projectId])
  assert.deepEqual(reservation.rows, [{ state: 'RESERVED', project_id: projectId, response_status: null, response_body: null }])
  const locked = await command.query('SELECT * FROM project.lock_create_project_receipt($1, $2, $3, $4, $5)', [accountId, workspaceId, keyDigest, requestDigest, projectId])
  assert.deepEqual(locked.rows, [{ outcome: 'RESERVED', project_id: projectId }])
  await command.query(CREATE, [accountId, workspaceId, keyDigest, requestDigest, projectId, 'Project One', 'project-1', ...REPOSITORY])
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
  await rollbackCase('e', () => command.query(CREATE, [accountId, workspaceId, digest('e'), requestDigest, projectId, '', 'project-1', ...REPOSITORY]), /check constraint/)
  await rollbackCase('2', () => command.query(CREATE, [accountId, workspaceId, digest('2'), requestDigest, projectId, 'Unborn head', 'project-1', ...REPOSITORY.slice(0, 3), 'main']), /working_source_revision_check/)
  await rollbackCase('f', () => command.query('SELECT project.complete_create_project_receipt($1, $2, $3, $4, $5, $6, $7, $8)', [accountId, workspaceId, digest('f'), requestDigest, projectId, 201, responseDigest, responseBody]), /PRJ03_SETTLEMENT_INCOMPLETE/)
  await rollbackCase('1', async () => {
    await command.query(CREATE, [accountId, workspaceId, digest('1'), requestDigest, projectId, 'Project One', 'project-1', ...REPOSITORY])
    return command.query('SELECT project.complete_create_project_receipt($1, $2, $3, $4, $5, $6, $7, $8)', [accountId, workspaceId, digest('1'), requestDigest, projectId, 201, 'invalid', responseBody])
  }, /check constraint/)

  const lockKey = digest('9')
  await command.query('BEGIN')
  await command.query('SELECT * FROM project.reserve_or_replay_create_project($1, $2, $3, $4, $5)', [accountId, workspaceId, lockKey, requestDigest, otherProjectId])
  await command.query('COMMIT')
  await query(fresh, `DELETE FROM iam.workspace_membership WHERE account_id = $1 AND workspace_id = $2`, [accountId, workspaceId])
  await assert.rejects(
    command.query('SELECT * FROM project.lock_create_project_receipt($1, $2, $3, $4, $5)', [accountId, workspaceId, lockKey, requestDigest, otherProjectId]),
    /NOT_ADMITTED/,
  )
  await query(fresh, `INSERT INTO iam.workspace_membership(account_id, workspace_id, role) VALUES ($1, $2, 'owner')`, [accountId, workspaceId])
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
      (SELECT count(*)::integer FROM project.operation_idempotency WHERE outcome = 'SUCCEEDED') AS terminal_receipt_count,
      (SELECT count(*)::integer FROM builder.factory_binding) AS binding_count
  `)
  assert.deepEqual(durable.rows, [{ project_count: 0, terminal_receipt_count: 0, binding_count: 0 }])

})

test('real PostgreSQL proves current project.read disclosure and revocation', async (t) => {
  await refuseProtectedCluster()
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
      await cleanup.query('ALTER ROLE hub_project_read PASSWORD NULL').catch(() => {})
      await cleanup.query(`DROP DATABASE ${quoteIdentifier(database)} WITH (FORCE)`)
    } finally {
      await cleanup.end()
    }
  })

  await runHubMigrations({ connectionString: connectionString(fresh) })
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
  await query(fresh, `INSERT INTO iam.workspace_membership(account_id, workspace_id, role)
    VALUES ($1, $2, 'owner')`, [accountId, workspaceId])
  await query(fresh, `INSERT INTO iam.workspace_membership(account_id, workspace_id, role)
    VALUES ($1, $2, 'owner')`, [otherAccountId, otherWorkspaceId])
  await query(fresh, `INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision) VALUES
    ($1, $4, 'Visible Project', 'NEW', 'source-visible', 'revision-visible'),
    ($2, $4, 'Sibling Project', 'NEW', 'source-sibling', 'revision-sibling'),
    ($3, $5, 'Cross Workspace', 'NEW', 'source-cross', 'revision-cross')`,
  [projectId, siblingProjectId, crossWorkspaceProjectId, workspaceId, otherWorkspaceId])
  const readPassword = 's3-p6-read-test-only'
  await query(fresh, `ALTER ROLE hub_project_read PASSWORD '${readPassword}'`)
  const read = new Client({ ...fresh, user: 'hub_project_read', password: readPassword })
  await read.connect()
  liveClients.push(read)
  await assert.rejects(read.query('SELECT * FROM project.project'), /permission denied/)
  await assert.rejects(read.query('SELECT * FROM iam.workspace_membership'), /permission denied/)

  // The Workspace is the boundary: a member reads every Project in it, including one they did
  // not create, and nothing in a Workspace they do not belong to.
  const list = await read.query('SELECT summary.* FROM project.list_project_summaries($1, $2) summary', [accountId, workspaceId])
  assert.deepEqual(list.rows, [
    { project_id: siblingProjectId, workspace_id: workspaceId, name: 'Sibling Project', archived: false },
    { project_id: projectId, workspace_id: workspaceId, name: 'Visible Project', archived: false },
  ])
  assert.deepEqual((await read.query('SELECT summary.* FROM project.list_project_summaries($1, $2) summary', [accountId, otherWorkspaceId])).rows, [])

  const detail = await read.query('SELECT detail.* FROM project.get_project($1, $2) detail', [accountId, projectId])
  assert.deepEqual(detail.rows, [{
    project_id: projectId,
    workspace_id: workspaceId,
    name: 'Visible Project',
    project_revision: 'revision-visible',
    archived: false,
  }])
  assert.deepEqual((await read.query('SELECT * FROM project.get_project($1, $2)', [accountId, crossWorkspaceProjectId])).rows, [])

  // One DELETE closes the list and the detail read together, because both derive from that row.
  await query(fresh, 'DELETE FROM iam.workspace_membership WHERE account_id = $1 AND workspace_id = $2', [accountId, workspaceId])
  assert.deepEqual((await read.query('SELECT * FROM project.get_project($1, $2)', [accountId, projectId])).rows, [])
  assert.deepEqual((await read.query('SELECT summary.* FROM project.list_project_summaries($1, $2) summary', [accountId, workspaceId])).rows, [])
})
