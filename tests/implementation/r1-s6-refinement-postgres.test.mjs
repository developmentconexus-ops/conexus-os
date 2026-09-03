import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import pg from 'pg'
import { canonicalBytes, sha256 } from '../../packages/canonical-json/src/index.mjs'
import { runHubMigrations } from '../../scripts/run-hub-migrations.mjs'

const { Client } = pg
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

test('S6-P1 PostgreSQL resolves Candidate A and CAS-settles distinct Candidate B', async (t) => {
  const database = `conexus_s6_p1_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 8)}`
  await query(adminConnection, `CREATE DATABASE ${quote(database)}`)
  const fresh = { ...adminConnection, database }
  t.after(async () => {
    await query(adminConnection, 'ALTER ROLE hub_s6_inception_command PASSWORD NULL').catch(() => {})
    await query(adminConnection, `DROP DATABASE ${quote(database)} WITH (FORCE)`)
  })
  const migration = await runHubMigrations({ connectionString: connectionString(fresh) })
  assert.equal(migration.versions.at(-1), '010')

  const accountId = '10000000-0000-4000-8000-000000000210'
  const workspaceId = '20000000-0000-4000-8000-000000000210'
  const projectId = '30000000-0000-4000-8000-000000000210'
  const sourceRevision = 'a'.repeat(40)
  await query(fresh, `INSERT INTO iam.account(account_id, issuer, external_subject, display_name)
    VALUES ($1, 'https://issuer.test', 's6-p1', 'S6 P1')`, [accountId])
  await query(fresh, 'INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1, $2)', [workspaceId, 'S6 P1 Workspace'])
  await query(fresh, `INSERT INTO iam.workspace_membership(account_id, workspace_id, can_create_project)
    VALUES ($1, $2, true)`, [accountId, workspaceId])
  await query(fresh, `INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision)
    VALUES ($1, $2, 'S6 P1 Project', 'NEW', $3, 'revision-s6-p1')`, [projectId, workspaceId, sourceRevision])
  await query(fresh, `INSERT INTO iam.account_project_grant(account_id, project_id, can_read, can_manage)
    VALUES ($1, $2, true, true)`, [accountId, projectId])

  const candidateAValue = { sourceRevision, sourceText: 'Candidate A immutable', applicationRuntimeProfile: 'MANAGED' }
  const candidateA = { candidateBaselineDigest: sha256(canonicalBytes(candidateAValue)), ...candidateAValue }
  await query(fresh, `INSERT INTO project.baseline_candidate(
    project_id, candidate_digest, source_revision, source_text, application_runtime_profile
  ) VALUES ($1,$2,$3,$4,$5)`, [projectId, candidateA.candidateBaselineDigest, sourceRevision,
    candidateA.sourceText, candidateA.applicationRuntimeProfile])
  await query(fresh, 'INSERT INTO project.baseline_state(project_id, current_candidate_digest) VALUES ($1,$2)',
    [projectId, candidateA.candidateBaselineDigest])

  const password = 's6-p1-command-test-only'
  await query(fresh, `ALTER ROLE hub_s6_inception_command PASSWORD '${password}'`)
  const runtime = { ...fresh, user: 'hub_s6_inception_command', password }
  const reserve = (key, request, attempt, prior) => query(runtime,
    'SELECT * FROM project.reserve_or_replay_inception($1,$2,$3,$4,$5,$6)',
    [accountId, projectId, sha256(Buffer.from(key)), sha256(canonicalBytes(request)), attempt, prior])

  await assert.rejects(reserve('unknown-prior', {
    intent: 'Refine unknown', priorCandidateBaselineDigest: 'f'.repeat(64), reviewFeedback: 'Must refuse',
  }, randomUUID(), 'f'.repeat(64)), /PRJ07_PRIOR_CANDIDATE_NOT_FOUND/)

  const requestB = { intent: 'Refine A', priorCandidateBaselineDigest: candidateA.candidateBaselineDigest, reviewFeedback: 'Add supervisor' }
  const attemptB = '40000000-0000-4000-8000-000000000210'
  const reservedB = (await reserve('refine-a', requestB, attemptB, candidateA.candidateBaselineDigest)).rows[0]
  assert.equal(reservedB.state, 'RESERVED')
  assert.equal(reservedB.prior_candidate_digest, candidateA.candidateBaselineDigest)
  assert.equal(reservedB.prior_source_text, candidateA.sourceText)
  assert.equal(reservedB.prior_application_runtime_profile, candidateA.applicationRuntimeProfile)

  const candidateBValue = { sourceRevision, sourceText: 'Candidate B refined', applicationRuntimeProfile: 'MANAGED' }
  const candidateB = { candidateBaselineDigest: sha256(canonicalBytes(candidateBValue)), ...candidateBValue }
  const completedB = await query(runtime, `SELECT project.complete_inception(
    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11
  ) AS response`, [accountId, projectId, sha256(Buffer.from('refine-a')), sha256(canonicalBytes(requestB)), attemptB,
    sourceRevision, candidateA.candidateBaselineDigest, candidateB.candidateBaselineDigest,
    candidateB.sourceText, candidateB.applicationRuntimeProfile, JSON.stringify(candidateB)])
  assert.deepEqual(completedB.rows[0].response, candidateB)
  assert.equal((await query(fresh, `SELECT source_text FROM project.baseline_candidate
    WHERE project_id = $1 AND candidate_digest = $2`, [projectId, candidateA.candidateBaselineDigest])).rows[0].source_text, candidateA.sourceText)
  assert.equal((await query(fresh, 'SELECT current_candidate_digest FROM project.baseline_state WHERE project_id = $1',
    [projectId])).rows[0].current_candidate_digest, candidateB.candidateBaselineDigest)

  const replayedB = (await reserve('refine-a', requestB, randomUUID(), candidateA.candidateBaselineDigest)).rows[0]
  assert.equal(replayedB.state, 'REPLAY')
  assert.deepEqual(replayedB.response_body, candidateB)

  await assert.rejects(reserve('stale-a', requestB, randomUUID(), candidateA.candidateBaselineDigest), /PRJ07_PRIOR_CANDIDATE_STALE/)

  const requestNoChange = { intent: 'Refine B', priorCandidateBaselineDigest: candidateB.candidateBaselineDigest, reviewFeedback: 'No effective change' }
  const attemptNoChange = '40000000-0000-4000-8000-000000000211'
  await reserve('no-change', requestNoChange, attemptNoChange, candidateB.candidateBaselineDigest)
  await assert.rejects(query(runtime, `SELECT project.complete_inception(
    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11
  )`, [accountId, projectId, sha256(Buffer.from('no-change')), sha256(canonicalBytes(requestNoChange)), attemptNoChange,
    sourceRevision, candidateB.candidateBaselineDigest, candidateB.candidateBaselineDigest,
    candidateB.sourceText, candidateB.applicationRuntimeProfile, JSON.stringify(candidateB)]), /PRJ07_REFINEMENT_NO_CHANGE/)

  const requestC = { intent: 'Refine B again', priorCandidateBaselineDigest: candidateB.candidateBaselineDigest, reviewFeedback: 'Add another user' }
  const attemptC = '40000000-0000-4000-8000-000000000212'
  await reserve('stale-settlement', requestC, attemptC, candidateB.candidateBaselineDigest)
  await query(fresh, 'UPDATE project.baseline_state SET current_candidate_digest = $2 WHERE project_id = $1',
    [projectId, candidateA.candidateBaselineDigest])
  const candidateCValue = { sourceRevision, sourceText: 'Candidate C must not settle', applicationRuntimeProfile: 'MANAGED' }
  const candidateC = { candidateBaselineDigest: sha256(canonicalBytes(candidateCValue)), ...candidateCValue }
  await assert.rejects(query(runtime, `SELECT project.complete_inception(
    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11
  )`, [accountId, projectId, sha256(Buffer.from('stale-settlement')), sha256(canonicalBytes(requestC)), attemptC,
    sourceRevision, candidateB.candidateBaselineDigest, candidateC.candidateBaselineDigest,
    candidateC.sourceText, candidateC.applicationRuntimeProfile, JSON.stringify(candidateC)]), /PRJ07_PRIOR_CANDIDATE_STALE/)
  assert.equal((await query(fresh, 'SELECT count(*)::integer AS count FROM project.baseline_candidate WHERE candidate_digest = $1',
    [candidateC.candidateBaselineDigest])).rows[0].count, 0)
})
