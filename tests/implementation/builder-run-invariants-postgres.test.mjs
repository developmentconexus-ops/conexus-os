import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import pg from 'pg'

const configured = ['CONEXUS_TEST_DB_HOST', 'CONEXUS_TEST_DB_PORT', 'CONEXUS_TEST_DB_NAME', 'CONEXUS_TEST_DB_USER', 'CONEXUS_TEST_DB_PASSWORD'].every(name => process.env[name])
const connect = async (connection) => { const client = new pg.Client(connection); await client.connect(); return client }

test('030 restores state invariants and closes BuilderRun settlement loopholes', { skip: configured ? false : 'real PostgreSQL configuration not supplied' }, async (t) => {
  const admin = { host: process.env.CONEXUS_TEST_DB_HOST, port: Number(process.env.CONEXUS_TEST_DB_PORT), database: process.env.CONEXUS_TEST_DB_NAME, user: process.env.CONEXUS_TEST_DB_USER, password: process.env.CONEXUS_TEST_DB_PASSWORD }
  const ingress = { ...admin, user: 'hub_rb_ingress', password: 'invariants-ingress' }
  const executor = { ...admin, user: 'hub_rb_executor', password: 'invariants-executor' }
  const accountId = randomUUID(); const workspaceId = randomUUID(); const projectId = randomUUID()
  const source = 'a'.repeat(40); const nextSource = 'b'.repeat(40)
  const adminClient = await connect(admin)
  await adminClient.query("ALTER ROLE hub_rb_ingress PASSWORD 'invariants-ingress'; ALTER ROLE hub_rb_executor PASSWORD 'invariants-executor'")
  await adminClient.query('INSERT INTO iam.account(account_id, issuer, external_subject, display_name) VALUES ($1, $2, $3, $4)', [accountId, 'https://invariants.test', accountId, '030'])
  await adminClient.query('INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1, $2)', [workspaceId, '030'])
  await adminClient.query('INSERT INTO iam.workspace_membership(account_id, workspace_id, can_create_project) VALUES ($1, $2, true)', [accountId, workspaceId])
  await adminClient.query("INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision) VALUES ($1, $2, '030', 'NEW', $3, '030')", [projectId, workspaceId, source])
  await adminClient.query('INSERT INTO iam.project_builder_grant(account_id, project_id, can_build, can_read_source) VALUES ($1, $2, true, true)', [accountId, projectId])
  await adminClient.query('INSERT INTO builder.project_working_state(project_id, working_source_revision) VALUES ($1, $2)', [projectId, source])
  t.after(async () => {
    await adminClient.query('DELETE FROM builder.builder_run WHERE project_id = $1', [projectId])
    await adminClient.query('DELETE FROM builder.project_working_state WHERE project_id = $1', [projectId])
    await adminClient.query('DELETE FROM iam.project_builder_grant WHERE project_id = $1', [projectId])
    await adminClient.query('DELETE FROM project.project WHERE project_id = $1', [projectId])
    await adminClient.query('DELETE FROM iam.workspace_membership WHERE account_id = $1', [accountId])
    await adminClient.query('DELETE FROM workspace.workspace WHERE workspace_id = $1', [workspaceId])
    await adminClient.query('DELETE FROM iam.account WHERE account_id = $1', [accountId])
    await adminClient.end()
  })

  const rejectsUpdate = (statement, values) => assert.rejects(() => adminClient.query(statement, values), /violates check constraint/)
  await rejectsUpdate('UPDATE builder.project_working_state SET working_source_revision = $1 WHERE project_id = $2', ['bad', projectId])
  await rejectsUpdate('UPDATE builder.project_working_state SET working_version = -1 WHERE project_id = $1', [projectId])
  await rejectsUpdate("UPDATE builder.project_working_state SET current_state = 'UNKNOWN' WHERE project_id = $1", [projectId])
  await rejectsUpdate('UPDATE builder.project_working_state SET last_preview_source_revision = $1 WHERE project_id = $2', ['bad', projectId])
  await rejectsUpdate('UPDATE builder.project_working_state SET last_preview_artifact_digest = $1 WHERE project_id = $2', ['bad', projectId])
  await adminClient.query("UPDATE builder.project_working_state SET last_preview_source_revision = $1, last_preview_artifact_revision_id = $2, last_preview_artifact_digest = $3, last_preview_change_id = NULL WHERE project_id = $4", [source, randomUUID(), 'c'.repeat(64), projectId])
  await adminClient.query('UPDATE builder.project_working_state SET last_preview_source_revision = NULL, last_preview_artifact_revision_id = NULL, last_preview_artifact_digest = NULL WHERE project_id = $1', [projectId])

  const ingressClient = await connect(ingress); const executorClient = await connect(executor)
  t.after(() => Promise.all([ingressClient.end(), executorClient.end()]))
  const create = async (client, mode, id, key = randomUUID(), request = randomUUID()) => (await client.query('SELECT builder.create_builder_run($1,$2,$3,$4,$5,$6,$7) AS value', [accountId, projectId, key.replaceAll('-', '').padEnd(64, '0'), request.replaceAll('-', '').padEnd(64, '1'), null, mode, id])).rows[0].value
  const claim = async (id) => (await executorClient.query('SELECT builder.claim_builder_run($1,$2,$3,$4) AS value', [id, randomUUID(), 'provider', 'model'])).rows[0].value

  const planId = randomUUID(); await create(ingressClient, 'PLAN', planId)
  assert.equal((await executorClient.query('SELECT builder.claim_builder_run($1,$2,$3,$4) AS value', [planId, randomUUID(), 'provider', 'model'])).rows[0].value.state, 'RUNNING')
  assert.equal((await executorClient.query('SELECT builder.settle_builder_run($1,$2,$3,$4)', [planId, nextSource, 'SOURCE_CHANGED', null])).rows[0].settle_builder_run, false)
  assert.equal((await executorClient.query('SELECT builder.settle_builder_run($1,$2,$3,$4)', [planId, null, 'RESPONSE_ONLY', 'FAIL'])).rows[0].settle_builder_run, false)
  assert.equal((await executorClient.query('SELECT builder.settle_builder_run($1,$2,$3,$4)', [planId, null, 'RESPONSE_ONLY', null])).rows[0].settle_builder_run, true)

  const sourceId = randomUUID(); await create(ingressClient, 'BUILD', sourceId)
  await executorClient.query('SELECT builder.claim_builder_run($1,$2,$3,$4)', [sourceId, randomUUID(), 'provider', 'model'])
  assert.equal((await executorClient.query('SELECT builder.settle_builder_run($1,$2,$3,$4)', [sourceId, nextSource, 'SOURCE_CHANGED', 'FAIL'])).rows[0].settle_builder_run, false)
  assert.equal((await executorClient.query('SELECT builder.settle_builder_run($1,$2,$3,$4)', [sourceId, nextSource, 'SOURCE_CHANGED_BUILD_FAILED', null])).rows[0].settle_builder_run, false)
  assert.equal((await executorClient.query('SELECT builder.settle_builder_run($1,$2,$3,$4)', [sourceId, nextSource, 'SOURCE_CHANGED_BUILD_FAILED', 'COMPILE_FAILED'])).rows[0].settle_builder_run, true)

  const staleId = randomUUID(); await create(ingressClient, 'BUILD', staleId)
  await adminClient.query('UPDATE iam.project_builder_grant SET can_build = false WHERE project_id = $1', [projectId])
  await assert.rejects(() => claim(staleId), /NOT_AUTHORIZED/)
  await adminClient.query('UPDATE iam.project_builder_grant SET can_build = true WHERE project_id = $1', [projectId])
  await adminClient.query('UPDATE builder.project_working_state SET working_version = working_version + 1 WHERE project_id = $1', [projectId])
  await assert.rejects(() => claim(staleId), /BUILDER_RUN_BASE_STALE/)
})
