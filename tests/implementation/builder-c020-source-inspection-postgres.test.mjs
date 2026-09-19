import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import pg from 'pg'
import { runCurrentHubMigrations } from '../../scripts/run-hub-migrations.mjs'
import { refuseProtectedCluster } from './protected-cluster.mjs'

const configured = ['CONEXUS_TEST_DB_HOST', 'CONEXUS_TEST_DB_PORT', 'CONEXUS_TEST_DB_NAME', 'CONEXUS_TEST_DB_USER', 'CONEXUS_TEST_DB_PASSWORD']
  .every((name) => process.env[name])
const connect = async (connection) => { const client = new pg.Client(connection); await client.connect(); return client }

test('C-020 source inspection admits current subjects and latest code-changing run only', {
  skip: configured ? false : 'real PostgreSQL configuration not supplied',
}, async (t) => {
  await refuseProtectedCluster()
  const admin = {
    host: process.env.CONEXUS_TEST_DB_HOST, port: Number(process.env.CONEXUS_TEST_DB_PORT),
    database: process.env.CONEXUS_TEST_DB_NAME, user: process.env.CONEXUS_TEST_DB_USER, password: process.env.CONEXUS_TEST_DB_PASSWORD,
  }
  const database = `conexus_source_inspection_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 8)}`
  const adminClient = await connect(admin)
  await adminClient.query(`CREATE DATABASE "${database}"`)
  t.after(async () => { await adminClient.query(`DROP DATABASE "${database}" WITH (FORCE)`); await adminClient.end() })
  const current = { ...admin, database }
  const connectionString = new URL('postgresql://localhost')
  connectionString.hostname = current.host; connectionString.port = String(current.port)
  connectionString.pathname = `/${database}`; connectionString.username = current.user; connectionString.password = current.password
  await runCurrentHubMigrations({ connectionString: connectionString.toString() })

  const account = '81000000-0000-4000-8000-000000000001'
  const workspace = '81000000-0000-4000-8000-000000000002'
  const project = '81000000-0000-4000-8000-000000000003'
  const otherProject = '81000000-0000-4000-8000-000000000004'
  const unauthorized = '81000000-0000-4000-8000-000000000005'
  const source = (letter) => letter.repeat(40)
  const baseline = source('a'); const runOneResult = source('b'); const preview = source('c')
  const working = source('d')
  const olderRunOnly = source('e'); const unrelated = source('8'); const otherResult = source('9')
  const runOne = '82000000-0000-4000-8000-000000000001'
  const runTwo = '82000000-0000-4000-8000-000000000002'
  const responseOnly = '82000000-0000-4000-8000-000000000003'
  const otherRun = '82000000-0000-4000-8000-000000000004'
  const qWorking = source('f')
  const query = async (statement, values = []) => {
    const client = await connect(current)
    try { return await client.query(statement, values) } finally { await client.end() }
  }
  await query('INSERT INTO iam.account(account_id, issuer, external_subject, display_name) VALUES ($1, $2, $3, $4), ($5, $2, $6, $7)', [account, 'https://source-inspection.test', account, 'Source Reader', unauthorized, unauthorized, 'Unauthorized'])
  await query('INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1, $2)', [workspace, 'Source Inspection'])
  await query("INSERT INTO iam.workspace_membership(account_id, workspace_id, role) VALUES ($1, $2, 'owner')", [account, workspace])
  await query(`INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision)
    VALUES ($1, $2, 'Project P', 'NEW', $3, 'p-revision'), ($4, $2, 'Project Q', 'NEW', $5, 'q-revision')`, [project, workspace, baseline, otherProject, qWorking])
  await query(`INSERT INTO builder.project_working_state(project_id, working_source_revision, last_preview_source_revision,
    last_preview_artifact_revision_id, last_preview_artifact_digest)
    VALUES ($1, $2, $3, $4, $5), ($6, $7, NULL, NULL, NULL)`, [project, working, preview, '83000000-0000-4000-8000-000000000001', '1'.repeat(64), otherProject, qWorking])
  await query(`INSERT INTO project.baseline_candidate(project_id, candidate_digest, source_revision, source_text, application_runtime_profile)
    VALUES ($1, $2, $3, 'legacy baseline', 'MANAGED')`, [project, '2'.repeat(64), baseline])
  await query(`INSERT INTO project.baseline_state(project_id, current_candidate_digest, approved_candidate_digest, approval_revision)
    VALUES ($1, $2, $2, $3)`, [project, '2'.repeat(64), '83000000-0000-4000-8000-000000000002'])
  const insertRun = async (id, revision, kind, createdAt, base) => query(`INSERT INTO builder.builder_run(
    builder_run_id, project_id, account_id, trigger_message_id, idempotency_digest, request_digest, mode,
    base_source_revision, expected_working_version, base_working_version, state, result_source_revision, result_kind, created_at
  ) VALUES ($1, $2, $3, $4, $5, $5, 'BUILD', $6, 0, 0, 'SUCCEEDED', $7, $8, $9)`, [id, project, account, id, id.replaceAll('-', '').padEnd(64, '0'), base, revision, kind, createdAt])
  await insertRun(runOne, runOneResult, 'SOURCE_CHANGED', '2026-09-14T10:00:00Z', olderRunOnly)
  await insertRun(runTwo, working, 'SOURCE_CHANGED_BUILD_FAILED', '2026-09-14T11:00:00Z', runOneResult)
  await insertRun(responseOnly, null, 'RESPONSE_ONLY', '2026-09-14T12:00:00Z', working)
  await query(`INSERT INTO builder.builder_run(
    builder_run_id, project_id, account_id, trigger_message_id, idempotency_digest, request_digest, mode,
    base_source_revision, expected_working_version, base_working_version, state, result_source_revision, result_kind
  ) VALUES ($1, $2, $3, $4, $5, $5, 'BUILD', $6, 0, 0, 'SUCCEEDED', $7, 'SOURCE_CHANGED')`, [otherRun, otherProject, account, otherRun, otherRun.replaceAll('-', '').padEnd(64, '0'), qWorking, otherResult])
  const ingress = { ...current, user: 'hub_rb_ingress', password: 'source-inspection-ingress' }
  await query("ALTER ROLE hub_rb_ingress PASSWORD 'source-inspection-ingress'")
  const admit = async (revision, subject = project, actor = account) => {
    const client = await connect(ingress)
    try { return (await client.query('SELECT builder.admit_source_revision($1, $2, $3) AS admitted', [actor, subject, revision])).rows[0].admitted } finally { await client.end() }
  }
  for (const revision of [working, preview, runOneResult]) assert.equal(await admit(revision), true, revision)
  for (const revision of [baseline, olderRunOnly, unrelated, otherResult]) assert.equal(await admit(revision), false, revision)
  assert.equal(await admit('not-an-oid'), false)
  assert.equal(await admit(working, project, unauthorized), false)

  const projected = (await query('SELECT builder.read_latest_code_changing_builder_run($1, $2) AS value', [account, project])).rows[0].value
  assert.deepEqual(projected, { builderRunId: runTwo, projectId: project, baseSourceRevision: runOneResult, resultSourceRevision: working, resultKind: 'SOURCE_CHANGED_BUILD_FAILED' })
  assert.equal((await query('SELECT builder.read_latest_code_changing_builder_run($1, $2) AS value', [unauthorized, project])).rows[0].value, null)
  assert.equal((await query('SELECT builder.read_latest_code_changing_builder_run($1, $2) AS value', [account, otherProject])).rows[0].value.builderRunId, otherRun)
  await query('DELETE FROM builder.builder_run WHERE project_id = $1', [otherProject])
  await query(`INSERT INTO builder.builder_run(
    builder_run_id, project_id, account_id, trigger_message_id, idempotency_digest, request_digest, mode,
    base_source_revision, expected_working_version, base_working_version, state, result_source_revision, result_kind
  ) VALUES ($1, $2, $3, $4, $5, $5, 'BUILD', $6, 0, 0, 'SUCCEEDED', NULL, 'RESPONSE_ONLY')`, [otherRun, otherProject, account, otherRun, otherRun.replaceAll('-', '').padEnd(64, '0'), qWorking])
  assert.equal((await query('SELECT builder.read_latest_code_changing_builder_run($1, $2) AS value', [account, otherProject])).rows[0].value, null)
})
