import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import pg from 'pg'
import { canonicalBytes, sha256 } from '../../packages/canonical-json/src/index.mjs'
import { runHubMigrations } from '../../scripts/run-hub-migrations.mjs'

const { Client } = pg
const repositoryRoot = resolve(import.meta.dirname, '../..')
const required = (name) => {
  const value = process.env[name]
  if (!value) throw new Error(`MISSING_TEST_CONFIG_${name}`)
  return value
}
const adminConnection = {
  host: required('CONEXUS_TEST_DB_HOST'), port: Number(required('CONEXUS_TEST_DB_PORT')),
  database: required('CONEXUS_TEST_DB_NAME'), user: required('CONEXUS_TEST_DB_USER'),
  password: required('CONEXUS_TEST_DB_PASSWORD'),
}
const quoteIdentifier = (value) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error('UNSAFE_TEST_IDENTIFIER')
  return `"${value}"`
}
const connectionString = (connection) => {
  const url = new URL('postgresql://localhost')
  Object.assign(url, { hostname: connection.host, port: String(connection.port), pathname: `/${connection.database}` })
  url.username = connection.user
  url.password = connection.password
  return url.toString()
}
const query = async (connection, statement, values = []) => {
  const client = new Client(connection)
  await client.connect()
  try { return await client.query(statement, values) } finally { await client.end() }
}

test('S4-P1/P2 real PostgreSQL proves re-entry, concurrent approval and stale refusal', async (t) => {
  const database = `conexus_s4_p1_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 10)}`
  const admin = new Client(adminConnection)
  await admin.connect()
  await admin.query(`CREATE DATABASE ${quoteIdentifier(database)}`)
  await admin.end()
  const fresh = { ...adminConnection, database }
  t.after(async () => {
    const cleanup = new Client(adminConnection)
    await cleanup.connect()
    try {
      await cleanup.query('ALTER ROLE hub_s4_baseline_read PASSWORD NULL').catch(() => {})
      await cleanup.query('ALTER ROLE hub_s4_baseline_command PASSWORD NULL').catch(() => {})
      await cleanup.query(`DROP DATABASE ${quoteIdentifier(database)} WITH (FORCE)`)
    } finally { await cleanup.end() }
  })

  assert.deepEqual((await runHubMigrations({ connectionString: connectionString(fresh) })).versions.slice(0, 8),
    ['001', '002', '003', '004', '005', '006', '007', '008'])
  assert.equal((await query(fresh, `SELECT to_regprocedure('project.inject_baseline_candidate(uuid,text,text,text)') AS fixture`)).rows[0].fixture, null)

  const accountId = '10000000-0000-4000-8000-000000000091'
  const workspaceId = '20000000-0000-4000-8000-000000000091'
  const projectId = '30000000-0000-4000-8000-000000000091'
  const otherProjectId = '30000000-0000-4000-8000-000000000092'
  await query(fresh, `INSERT INTO iam.account(account_id, issuer, external_subject, display_name)
    VALUES ($1, 'https://issuer.test', 's4-p1', 'S4 P1')`, [accountId])
  await query(fresh, 'INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1, $2)',
    [workspaceId, 'S4 Workspace'])
  await query(fresh, `INSERT INTO iam.workspace_membership(account_id, workspace_id, can_create_project)
    VALUES ($1, $2, true)`, [accountId, workspaceId])
  await query(fresh, `INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision)
    VALUES ($1, $3, 'S4 Project', 'NEW', 'source-project', 'revision-project'),
           ($2, $3, 'Other Project', 'NEW', 'source-other', 'revision-other')`,
  [projectId, otherProjectId, workspaceId])
  await query(fresh, `INSERT INTO iam.account_project_grant(account_id, project_id, can_read, can_manage)
    VALUES ($1, $2, true, true)`, [accountId, projectId])
  await query(fresh, readFileSync(resolve(repositoryRoot, 'tests/fixtures/r1-s4-baseline-candidate.sql'), 'utf8'))
  const candidate = { applicationRuntimeProfile: 'MANAGED', sourceRevision: 'source-exact', sourceText: 'Exact immutable candidate' }
  const expectedDigest = sha256(canonicalBytes(candidate))
  const injected = await query(fresh, 'SELECT project.inject_baseline_candidate($1, $2, $3, $4) AS digest',
    [projectId, candidate.sourceRevision, candidate.sourceText, candidate.applicationRuntimeProfile])
  assert.equal(injected.rows[0].digest, expectedDigest)

  const readPassword = 's4-p1-read-test-only'
  await query(fresh, `ALTER ROLE hub_s4_baseline_read PASSWORD '${readPassword}'`)
  const connectRead = async () => {
    const client = new Client({ ...fresh, user: 'hub_s4_baseline_read', password: readPassword })
    await client.connect()
    return client
  }
  let read = await connectRead()
  await assert.rejects(read.query('UPDATE project.baseline_candidate SET source_text = $1', ['mutated']), /permission denied/)
  await assert.rejects(read.query('SELECT project.inject_baseline_candidate($1, $2, $3, $4)',
    [projectId, 'x', 'x', 'MANAGED']), /permission denied/)
  const disclose = (client, subjectProjectId, digest) => client.query(`
    SELECT candidate.* FROM project.get_baseline_candidate(
      $2, $3, ARRAY(SELECT admitted.project_id FROM iam.admit_project_manage($1, $2) admitted)
    ) candidate
  `, [accountId, subjectProjectId, digest])
  assert.deepEqual((await disclose(read, projectId, expectedDigest)).rows, [{
    candidate_baseline_digest: expectedDigest,
    source_revision: candidate.sourceRevision,
    source_text: candidate.sourceText,
    application_runtime_profile: candidate.applicationRuntimeProfile,
  }])
  assert.deepEqual((await disclose(read, otherProjectId, expectedDigest)).rows, [])
  await read.end()
  read = await connectRead()
  assert.equal((await disclose(read, projectId, expectedDigest)).rowCount, 1)

  const commandPassword = 's4-p2-command-test-only'
  await query(fresh, `ALTER ROLE hub_s4_baseline_command PASSWORD '${commandPassword}'`)
  const connectCommand = async () => {
    const client = new Client({ ...fresh, user: 'hub_s4_baseline_command', password: commandPassword })
    await client.connect()
    return client
  }
  const approve = (client, digest, revision) => client.query(`
    SELECT approved.* FROM project.approve_baseline_revision(
      $1, $2, $3, $4,
      ARRAY(SELECT admitted.project_id FROM iam.admit_project_manage($1, $2) admitted)
    ) approved
  `, [accountId, projectId, digest, revision])
  const firstCommand = await connectCommand()
  const secondCommand = await connectCommand()
  const concurrent = await Promise.all([
    approve(firstCommand, expectedDigest, '50000000-0000-4000-8000-000000000091'),
    approve(secondCommand, expectedDigest, '50000000-0000-4000-8000-000000000092'),
  ])
  assert.equal(concurrent[0].rows[0].baseline_digest, expectedDigest)
  assert.equal(concurrent[1].rows[0].baseline_digest, expectedDigest)
  assert.equal(concurrent[0].rows[0].approval_revision, concurrent[1].rows[0].approval_revision)
  await firstCommand.end()
  await secondCommand.end()
  const approved = await read.query(`
    SELECT baseline.* FROM project.get_approved_baseline(
      $2, ARRAY(SELECT admitted.project_id FROM iam.admit_project_manage($1, $2) admitted)
    ) baseline
  `, [accountId, projectId])
  assert.equal(approved.rows[0].baseline_digest, expectedDigest)

  const nextCandidate = { applicationRuntimeProfile: 'DEDICATED', sourceRevision: 'source-next', sourceText: 'Next immutable candidate' }
  const nextDigest = sha256(canonicalBytes(nextCandidate))
  assert.equal((await query(fresh, 'SELECT project.inject_baseline_candidate($1, $2, $3, $4) AS digest',
    [projectId, nextCandidate.sourceRevision, nextCandidate.sourceText, nextCandidate.applicationRuntimeProfile])).rows[0].digest, nextDigest)
  const staleCommand = await connectCommand()
  await assert.rejects(
    approve(staleCommand, expectedDigest, '50000000-0000-4000-8000-000000000093'),
    /PRJ09_STALE_CANDIDATE/,
  )
  assert.equal((await approve(staleCommand, nextDigest, '50000000-0000-4000-8000-000000000094')).rows[0].baseline_digest, nextDigest)
  await staleCommand.end()
  await read.end()
  await query(fresh, 'DELETE FROM iam.workspace_membership WHERE account_id = $1 AND workspace_id = $2', [accountId, workspaceId])
  read = await connectRead()
  assert.deepEqual((await disclose(read, projectId, expectedDigest)).rows, [])
  await read.end()
})
