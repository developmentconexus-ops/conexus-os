import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import pg from 'pg'
import { runCurrentHubMigrations } from '../../scripts/run-hub-migrations.mjs'

const configured = ['CONEXUS_TEST_DB_HOST', 'CONEXUS_TEST_DB_PORT', 'CONEXUS_TEST_DB_NAME', 'CONEXUS_TEST_DB_USER', 'CONEXUS_TEST_DB_PASSWORD']
  .every(name => process.env[name])
const query = async (connection, statement, values = []) => {
  const client = new pg.Client(connection)
  await client.connect()
  try { return await client.query(statement, values) } finally { await client.end() }
}

test('working source survives compile failure and no-code response without replacing last-good Preview', {
  skip: configured ? false : 'real PostgreSQL configuration not supplied',
}, async (t) => {
  const admin = {
    host: process.env.CONEXUS_TEST_DB_HOST,
    port: Number(process.env.CONEXUS_TEST_DB_PORT),
    database: process.env.CONEXUS_TEST_DB_NAME,
    user: process.env.CONEXUS_TEST_DB_USER,
    password: process.env.CONEXUS_TEST_DB_PASSWORD,
  }
  const database = `conexus_working_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 8)}`
  await query(admin, `CREATE DATABASE "${database}"`)
  t.after(() => query(admin, `DROP DATABASE "${database}" WITH (FORCE)`))
  const current = { ...admin, database }
  const connectionString = new URL('postgresql://localhost')
  connectionString.hostname = current.host
  connectionString.port = String(current.port)
  connectionString.pathname = `/${database}`
  connectionString.username = current.user
  connectionString.password = current.password
  await runCurrentHubMigrations({ connectionString: connectionString.toString() })

  const accountId = '70000000-0000-4000-8000-000000000001'
  const workspaceId = '70000000-0000-4000-8000-000000000002'
  const projectId = '70000000-0000-4000-8000-000000000003'
  const baselineRevision = 'a'.repeat(40)
  const baselineDigest = 'b'.repeat(64)
  await query(current, "INSERT INTO iam.account(account_id, issuer, external_subject, display_name) VALUES ($1, 'https://issuer.test', 'working-source-owner', 'Working Source Owner')", [accountId])
  await query(current, 'INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1, $2)', [workspaceId, 'Working Source Workspace'])
  await query(current, 'INSERT INTO iam.workspace_membership(account_id, workspace_id, can_create_project) VALUES ($1, $2, true)', [accountId, workspaceId])
  await query(current, `INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision)
    VALUES ($1, $2, 'Working Source Project', 'NEW', $3, 'working-source-revision')`, [projectId, workspaceId, baselineRevision])
  await query(current, 'INSERT INTO iam.account_project_grant(account_id, project_id, can_read, can_manage) VALUES ($1, $2, true, true)', [accountId, projectId])
  await query(current, `INSERT INTO project.operation_idempotency(operation_id, account_id, workspace_id, key_digest, request_digest,
    reserved_project_id, outcome, response_status, response_digest, response_body, completed_at)
    VALUES ('PRJ-03', $1, $2, $3, $3, $4, 'SUCCEEDED', 201, $3, '{}'::jsonb, clock_timestamp())`, [accountId, workspaceId, 'c'.repeat(64), projectId])
  await query(current, `INSERT INTO project.baseline_candidate(project_id, candidate_digest, source_revision, source_text, application_runtime_profile)
    VALUES ($1, $2, $3, 'Working source baseline', 'MANAGED')`, [projectId, baselineDigest, baselineRevision])
  await query(current, `INSERT INTO project.baseline_state(project_id, current_candidate_digest, approved_candidate_digest, approval_revision)
    VALUES ($1, $2, $2, $3)`, [projectId, baselineDigest, '70000000-0000-4000-8000-000000000004'])
  await query(current, "ALTER ROLE hub_rb_ingress PASSWORD 'working-ingress'; ALTER ROLE hub_rb_executor PASSWORD 'working-executor'")
  const ingress = { ...current, user: 'hub_rb_ingress', password: 'working-ingress' }
  const executor = { ...current, user: 'hub_rb_executor', password: 'working-executor' }

  const createChange = async (changeId, key, requestDigest, plan, item, session, unit, intent, expectedSourceRevision) => {
    await query(ingress, 'SELECT builder.create_change($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', [
      accountId, projectId, key, requestDigest, changeId, plan, item, session, unit, intent, expectedSourceRevision,
    ])
  }
  const claim = async (changeId, actorRunId, token) => {
    await query(executor, 'SELECT builder.claim_change($1,$2,$3,$4,$5,$6)', [
      changeId, actorRunId, token, 'builder-coding-primary', 'anthropic', 'claude-opus-5',
    ])
    await query(executor, 'SELECT builder.bind_sandbox($1,$2,$3)', [actorRunId, token, `sandbox-${actorRunId}`])
  }

  const firstChange = '71000000-0000-4000-8000-000000000001'
  const firstRun = '71000000-0000-4000-8000-000000000002'
  const firstToken = '71000000-0000-4000-8000-000000000003'
  const firstCandidate = '1'.repeat(40)
  await createChange(firstChange, '1'.repeat(64), '2'.repeat(64), '71000000-0000-4000-8000-000000000004', '71000000-0000-4000-8000-000000000005', '71000000-0000-4000-8000-000000000006', '71000000-0000-4000-8000-000000000007', 'Create the first Preview', baselineRevision)
  await claim(firstChange, firstRun, firstToken)
  await query(executor, 'SELECT builder.settle_result($1,$2,$3,$4,$5,$6,$7)', [firstRun, firstToken, `sandbox-${firstRun}`, baselineRevision, firstCandidate, 'first diff', 'first candidate'])
  // Seed the previously retained artifact as a fixture. The transition under
  // test must preserve it while a later candidate is prepared or fails.
  await query(current, `UPDATE builder.change SET state = 'PREVIEW_READY' WHERE change_id = $1`, [firstChange])
  await query(current, `UPDATE builder.project_working_state
    SET current_state = 'PREVIEW_READY', preparation_attempt_id = $2,
      last_preview_change_id = $1, last_preview_source_revision = $3,
      last_preview_artifact_revision_id = $4, last_preview_artifact_digest = $5
    WHERE project_id = $6`, [firstChange, firstRun, firstCandidate, '71000000-0000-4000-8000-000000000008', 'd'.repeat(64), projectId])

  const failedChange = '72000000-0000-4000-8000-000000000001'
  const failedRun = '72000000-0000-4000-8000-000000000002'
  const failedToken = '72000000-0000-4000-8000-000000000003'
  const failedCandidate = '3'.repeat(40)
  await createChange(failedChange, '3'.repeat(64), '4'.repeat(64), '72000000-0000-4000-8000-000000000004', '72000000-0000-4000-8000-000000000005', '72000000-0000-4000-8000-000000000006', '72000000-0000-4000-8000-000000000007', 'Create a candidate that will fail compilation', firstCandidate)
  await claim(failedChange, failedRun, failedToken)
  await query(executor, 'SELECT builder.settle_result($1,$2,$3,$4,$5,$6,$7)', [failedRun, failedToken, `sandbox-${failedRun}`, firstCandidate, failedCandidate, 'failed diff', 'candidate retained for correction'])
  await query(executor, 'SELECT builder.settle_preparation($1,$2,$3,$4,$5,$6,$7)', [accountId, projectId, failedChange, failedCandidate, null, null, 'BUILD_FAILED'])
  assert.deepEqual((await query(current, `SELECT state, candidate_source_revision FROM builder.change WHERE change_id = $1`, [failedChange])).rows[0], {
    state: 'BUILD_FAILED', candidate_source_revision: failedCandidate,
  })
  assert.deepEqual((await query(current, `SELECT current_state, working_source_revision, last_preview_change_id,
    last_preview_source_revision, last_preview_artifact_revision_id, last_preview_artifact_digest
    FROM builder.project_working_state WHERE project_id = $1`, [projectId])).rows[0], {
    current_state: 'BUILD_FAILED', working_source_revision: failedCandidate,
    last_preview_change_id: firstChange, last_preview_source_revision: firstCandidate,
    last_preview_artifact_revision_id: '71000000-0000-4000-8000-000000000008', last_preview_artifact_digest: 'd'.repeat(64),
  })

  const responseChange = '73000000-0000-4000-8000-000000000001'
  const responseRun = '73000000-0000-4000-8000-000000000002'
  const responseToken = '73000000-0000-4000-8000-000000000003'
  await createChange(responseChange, '5'.repeat(64), '6'.repeat(64), '73000000-0000-4000-8000-000000000004', '73000000-0000-4000-8000-000000000005', '73000000-0000-4000-8000-000000000006', '73000000-0000-4000-8000-000000000007', 'Explain the current app without editing source', failedCandidate)
  await claim(responseChange, responseRun, responseToken)
  await query(executor, 'SELECT builder.settle_response($1,$2,$3,$4)', [responseRun, responseToken, `sandbox-${responseRun}`, 'The app is ready for a correction.'])
  assert.equal((await query(current, 'SELECT state FROM builder.change WHERE change_id = $1', [responseChange])).rows[0].state, 'RESPONDED')
  assert.deepEqual((await query(current, 'SELECT current_state, working_source_revision, last_preview_source_revision FROM builder.project_working_state WHERE project_id = $1', [projectId])).rows[0], {
    current_state: 'RESPONDED', working_source_revision: failedCandidate, last_preview_source_revision: firstCandidate,
  })

  const runtimeFailureChange = '74000000-0000-4000-8000-000000000001'
  const runtimeFailureRun = '74000000-0000-4000-8000-000000000002'
  const runtimeFailureToken = '74000000-0000-4000-8000-000000000003'
  await createChange(runtimeFailureChange, '7'.repeat(64), '8'.repeat(64), '74000000-0000-4000-8000-000000000004', '74000000-0000-4000-8000-000000000005', '74000000-0000-4000-8000-000000000006', '74000000-0000-4000-8000-000000000007', 'Fail the coding Turn', failedCandidate)
  await claim(runtimeFailureChange, runtimeFailureRun, runtimeFailureToken)
  assert.equal((await query(current, 'SELECT current_state FROM builder.project_working_state WHERE project_id = $1', [projectId])).rows[0].current_state, 'CODING')
  await query(executor, 'SELECT builder.fail_run($1,$2)', [runtimeFailureRun, runtimeFailureToken])
  assert.deepEqual((await query(current, `SELECT state FROM builder.change WHERE change_id = $1`, [runtimeFailureChange])).rows[0], {
    state: 'FAILED',
  })
  assert.deepEqual((await query(current, `SELECT current_state, current_change_id, working_source_revision,
    last_preview_change_id, last_preview_source_revision FROM builder.project_working_state WHERE project_id = $1`, [projectId])).rows[0], {
    current_state: 'IDLE', current_change_id: null, working_source_revision: failedCandidate,
    last_preview_change_id: firstChange, last_preview_source_revision: firstCandidate,
  })
})
