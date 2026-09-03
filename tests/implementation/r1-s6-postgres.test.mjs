import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import test from 'node:test'
import pg from 'pg'
import { canonicalBytes, sha256 } from '../../packages/canonical-json/src/index.mjs'
import { runHubMigrations } from '../../scripts/run-hub-migrations.mjs'

const { Client } = pg
const repositoryRoot = resolve(import.meta.dirname, '../..')
const required = (name) => process.env[name] || (() => { throw new Error(`MISSING_TEST_CONFIG_${name}`) })()
const adminConnection = {
  host: required('CONEXUS_TEST_DB_HOST'), port: Number(required('CONEXUS_TEST_DB_PORT')),
  database: required('CONEXUS_TEST_DB_NAME'), user: required('CONEXUS_TEST_DB_USER'),
  password: required('CONEXUS_TEST_DB_PASSWORD'),
}
const quote = (value) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error('UNSAFE_TEST_IDENTIFIER')
  return `"${value}"`
}
const connectionString = (connection) => {
  const url = new URL('postgresql://localhost')
  url.hostname = connection.host; url.port = String(connection.port); url.pathname = `/${connection.database}`
  url.username = connection.user; url.password = connection.password
  return url.toString()
}
const query = async (connection, statement, values = []) => {
  const client = new Client(connection)
  await client.connect()
  try { return await client.query(statement, values) } finally { await client.end() }
}

test('S6-P0 PostgreSQL rechecks authority/source and settles one immutable candidate', async (t) => {
  const database = `conexus_s6_p0_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 8)}`
  await query(adminConnection, `CREATE DATABASE ${quote(database)}`)
  const fresh = { ...adminConnection, database }
  t.after(async () => {
    await query(adminConnection, 'ALTER ROLE hub_s6_inception_command PASSWORD NULL').catch(() => {})
    await query(adminConnection, `DROP DATABASE ${quote(database)} WITH (FORCE)`)
  })
  const migration = await runHubMigrations({ connectionString: connectionString(fresh) })
  assert.deepEqual(migration.versions, ['001', '002', '003', '004', '005', '006', '007', '008', '009', '010'])

  const accountId = '10000000-0000-4000-8000-000000000106'
  const workspaceId = '20000000-0000-4000-8000-000000000106'
  const projectId = '30000000-0000-4000-8000-000000000106'
  const sourceRevision = 'a'.repeat(40)
  await query(fresh, `INSERT INTO iam.account(account_id, issuer, external_subject, display_name)
    VALUES ($1, 'https://issuer.test', 's6-p0', 'S6 P0')`, [accountId])
  await query(fresh, 'INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1, $2)', [workspaceId, 'S6 Workspace'])
  await query(fresh, `INSERT INTO iam.workspace_membership(account_id, workspace_id, can_create_project)
    VALUES ($1, $2, true)`, [accountId, workspaceId])
  await query(fresh, `INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision)
    VALUES ($1, $2, 'S6 Project', 'NEW', $3, 'revision-s6')`, [projectId, workspaceId, sourceRevision])
  await query(fresh, `INSERT INTO iam.account_project_grant(account_id, project_id, can_read, can_manage)
    VALUES ($1, $2, true, true)`, [accountId, projectId])

  const password = 's6-p0-command-test-only'
  await query(fresh, `ALTER ROLE hub_s6_inception_command PASSWORD '${password}'`)
  const runtime = { ...fresh, user: 'hub_s6_inception_command', password }
  const keyDigest = sha256(Buffer.from('intake-1'))
  const requestDigest = sha256(canonicalBytes({ intent: 'Bounded intent' }))
  const attemptId = '40000000-0000-4000-8000-000000000106'
  const reserve = (connection, attempt = attemptId) => query(connection,
    'SELECT * FROM project.reserve_or_replay_inception($1,$2,$3,$4,$5,$6)',
    [accountId, projectId, keyDigest, requestDigest, attempt, null])
  assert.equal((await reserve(runtime)).rows[0].state, 'RESERVED')
  assert.equal((await reserve(runtime, '40000000-0000-4000-8000-000000000107')).rows[0].state, 'IN_PROGRESS')

  const candidate = { sourceRevision, sourceText: 'Immutable proposal', applicationRuntimeProfile: 'MANAGED' }
  const response = { candidateBaselineDigest: sha256(canonicalBytes(candidate)), ...candidate }
  const completed = await query(runtime, `SELECT project.complete_inception(
    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11
  ) AS response`, [accountId, projectId, keyDigest, requestDigest, attemptId, sourceRevision, null,
    response.candidateBaselineDigest, response.sourceText, response.applicationRuntimeProfile, JSON.stringify(response)])
  assert.deepEqual(completed.rows[0].response, response)
  assert.deepEqual((await reserve(runtime, '40000000-0000-4000-8000-000000000108')).rows[0].response_body, response)
  assert.equal((await query(fresh, 'SELECT count(*)::integer AS count FROM project.baseline_candidate WHERE project_id = $1', [projectId])).rows[0].count, 1)
  assert.equal((await query(fresh, 'SELECT current_candidate_digest FROM project.baseline_state WHERE project_id = $1', [projectId])).rows[0].current_candidate_digest, response.candidateBaselineDigest)

  await query(fresh, 'UPDATE project.project SET source_revision = $2 WHERE project_id = $1', [projectId, 'b'.repeat(40)])
  const nextKey = sha256(Buffer.from('intake-2'))
  const nextAttempt = '40000000-0000-4000-8000-000000000109'
  const nextReservation = await query(runtime, 'SELECT * FROM project.reserve_or_replay_inception($1,$2,$3,$4,$5,$6)',
    [accountId, projectId, nextKey, requestDigest, nextAttempt, null])
  assert.equal(nextReservation.rows[0].source_revision, 'b'.repeat(40))
  await query(fresh, 'UPDATE project.project SET source_revision = $2 WHERE project_id = $1', [projectId, 'c'.repeat(40)])
  await assert.rejects(query(runtime, 'SELECT project.complete_inception($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
    [accountId, projectId, nextKey, requestDigest, nextAttempt, 'b'.repeat(40), null, 'd'.repeat(64), 'stale', 'MANAGED', JSON.stringify(response)]), /PRJ07_SOURCE_STALE/)

  await query(fresh, 'DELETE FROM iam.workspace_membership WHERE account_id = $1 AND workspace_id = $2', [accountId, workspaceId])
  await assert.rejects(query(runtime, 'SELECT * FROM project.reserve_or_replay_inception($1,$2,$3,$4,$5,$6)',
    [accountId, projectId, sha256(Buffer.from('intake-3')), requestDigest, randomUUID(), null]), /PRJ07_NOT_AUTHORIZED/)
  assert.equal(repositoryRoot.endsWith('conexus-os'), true)
})
