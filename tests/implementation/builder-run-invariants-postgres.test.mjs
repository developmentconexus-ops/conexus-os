import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import pg from 'pg'
import { runHubMigrations } from '../../scripts/run-hub-migrations.mjs'
import { refuseProtectedCluster } from './protected-cluster.mjs'

const configured = ['CONEXUS_TEST_DB_HOST', 'CONEXUS_TEST_DB_PORT', 'CONEXUS_TEST_DB_NAME', 'CONEXUS_TEST_DB_USER', 'CONEXUS_TEST_DB_PASSWORD'].every(name => process.env[name])
const connect = async (connection) => { const client = new pg.Client(connection); await client.connect(); return client }

test('C-020 preserves state invariants and separates response settlement from build settlement', { skip: configured ? false : 'real PostgreSQL configuration not supplied' }, async (t) => {
  await refuseProtectedCluster()
  const admin = { host: process.env.CONEXUS_TEST_DB_HOST, port: Number(process.env.CONEXUS_TEST_DB_PORT), database: process.env.CONEXUS_TEST_DB_NAME, user: process.env.CONEXUS_TEST_DB_USER, password: process.env.CONEXUS_TEST_DB_PASSWORD }
  const database = `conexus_run_invariants_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 8)}`
  const ownerClient = await connect(admin)
  let adminClient
  let ingressClient
  let executorClient
  await ownerClient.query(`CREATE DATABASE "${database}"`)
  t.after(async () => {
    await executorClient?.end(); await ingressClient?.end(); await adminClient?.end()
    await ownerClient.query(`DROP DATABASE "${database}" WITH (FORCE)`); await ownerClient.end()
  })
  const current = { ...admin, database }
  const connectionString = new URL('postgresql://localhost')
  connectionString.hostname = current.host; connectionString.port = String(current.port)
  connectionString.pathname = `/${database}`; connectionString.username = current.user; connectionString.password = current.password
  await runHubMigrations({ connectionString: connectionString.toString() })

  const ingress = { ...current, user: 'hub_builder_ingress', password: 'invariants-ingress' }
  const executor = { ...current, user: 'hub_builder_executor', password: 'invariants-executor' }
  const accountId = randomUUID(); const workspaceId = randomUUID(); const projectId = randomUUID()
  const source = 'a'.repeat(40); const nextSource = 'b'.repeat(40)
  adminClient = await connect(current)
  await adminClient.query("ALTER ROLE hub_builder_ingress PASSWORD 'invariants-ingress'; ALTER ROLE hub_builder_executor PASSWORD 'invariants-executor'")
  await adminClient.query('INSERT INTO iam.account(account_id, issuer, external_subject, display_name) VALUES ($1, $2, $3, $4)', [accountId, 'https://invariants.test', accountId, '030'])
  await adminClient.query('INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1, $2)', [workspaceId, '030'])
  await adminClient.query("INSERT INTO iam.workspace_membership(account_id, workspace_id, role) VALUES ($1, $2, 'owner')", [accountId, workspaceId])
  await adminClient.query("INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision) VALUES ($1, $2, '030', 'NEW', $3, '030')", [projectId, workspaceId, source])
  await adminClient.query('INSERT INTO builder.project_working_state(project_id, working_source_revision) VALUES ($1, $2)', [projectId, source])

  const rejectsUpdate = (statement, values) => assert.rejects(() => adminClient.query(statement, values), /violates check constraint/)
  await rejectsUpdate('UPDATE builder.project_working_state SET working_source_revision = $1 WHERE project_id = $2', ['bad', projectId])
  await rejectsUpdate('UPDATE builder.project_working_state SET working_version = -1 WHERE project_id = $1', [projectId])
  await rejectsUpdate("UPDATE builder.project_working_state SET current_state = 'UNKNOWN' WHERE project_id = $1", [projectId])
  await rejectsUpdate('UPDATE builder.project_working_state SET last_preview_source_revision = $1 WHERE project_id = $2', ['bad', projectId])
  await rejectsUpdate('UPDATE builder.project_working_state SET last_preview_artifact_digest = $1 WHERE project_id = $2', ['bad', projectId])
  const previousArtifactRevisionId = randomUUID(); const previousArtifactDigest = 'c'.repeat(64)
  await adminClient.query('UPDATE builder.project_working_state SET last_preview_source_revision = $1, last_preview_artifact_revision_id = $2, last_preview_artifact_digest = $3 WHERE project_id = $4', [source, previousArtifactRevisionId, previousArtifactDigest, projectId])
  await adminClient.query("UPDATE builder.project_working_state SET current_state = 'PREVIEW_READY' WHERE project_id = $1", [projectId])
  await adminClient.query("UPDATE builder.project_working_state SET current_state = 'BUILD_FAILED' WHERE project_id = $1", [projectId])
  await adminClient.query("UPDATE builder.project_working_state SET current_state = 'IDLE' WHERE project_id = $1", [projectId])
  await adminClient.query('UPDATE builder.project_working_state SET last_preview_source_revision = NULL, last_preview_artifact_revision_id = NULL, last_preview_artifact_digest = NULL WHERE project_id = $1', [projectId])

  ingressClient = await connect(ingress); executorClient = await connect(executor)
  const create = async (client, mode, id, key = randomUUID(), request = randomUUID()) => (await client.query('SELECT builder.create_builder_run($1,$2,$3,$4,$5,$6,$7,$8,$9) AS value', [accountId, projectId, key.replaceAll('-', '').padEnd(64, '0'), request.replaceAll('-', '').padEnd(64, '1'), 'pedido', null, mode, id, null])).rows[0].value
  const claim = async (id) => (await executorClient.query('SELECT builder.claim_builder_run($1,$2,$3,$4) AS value', [id, randomUUID(), 'provider', 'model'])).rows[0].value

  const planId = randomUUID(); await create(ingressClient, 'PLAN', planId)
  assert.equal((await claim(planId)).state, 'RUNNING')
  assert.equal((await adminClient.query('SELECT working_source_revision FROM builder.project_working_state WHERE project_id = $1', [projectId])).rows[0].working_source_revision, source)
  assert.equal((await executorClient.query('SELECT builder.settle_builder_run($1,$2,$3,$4)', [planId, nextSource, 'SOURCE_CHANGED', null])).rows[0].settle_builder_run, false)
  assert.equal((await executorClient.query('SELECT builder.settle_builder_run($1,$2,$3,$4)', [planId, null, 'RESPONSE_ONLY', 'FAIL'])).rows[0].settle_builder_run, false)
  assert.equal((await executorClient.query('SELECT builder.settle_builder_run($1,$2,$3,$4)', [planId, null, 'RESPONSE_ONLY', null])).rows[0].settle_builder_run, true)

  await adminClient.query('UPDATE builder.project_working_state SET last_preview_source_revision = $1, last_preview_artifact_revision_id = $2, last_preview_artifact_digest = $3 WHERE project_id = $4', [source, previousArtifactRevisionId, previousArtifactDigest, projectId])
  const sourceId = randomUUID(); await create(ingressClient, 'BUILD', sourceId)
  await claim(sourceId)
  assert.equal((await executorClient.query('SELECT builder.settle_builder_run($1,$2,$3,$4)', [sourceId, nextSource, 'SOURCE_CHANGED', null])).rows[0].settle_builder_run, false)
  assert.equal((await executorClient.query('SELECT builder.settle_builder_run($1,$2,$3,$4)', [sourceId, nextSource, 'SOURCE_CHANGED_BUILD_FAILED', 'COMPILE_FAILED'])).rows[0].settle_builder_run, false)
  assert.equal((await executorClient.query('SELECT builder.advance_builder_run_source($1,$2)', [sourceId, nextSource])).rows[0].advance_builder_run_source, true)
  assert.equal((await executorClient.query('SELECT builder.settle_builder_run_build($1,$2,$3,$4,$5)', [sourceId, nextSource, null, null, 'COMPILE_FAILED'])).rows[0].settle_builder_run_build, true)
  assert.deepEqual((await adminClient.query('SELECT working_source_revision, working_version, current_state, last_preview_source_revision, last_preview_artifact_revision_id, last_preview_artifact_digest FROM builder.project_working_state WHERE project_id = $1', [projectId])).rows[0], {
    working_source_revision: nextSource, working_version: '1', current_state: 'BUILD_FAILED',
    last_preview_source_revision: source, last_preview_artifact_revision_id: previousArtifactRevisionId, last_preview_artifact_digest: previousArtifactDigest,
  })
  assert.deepEqual((await adminClient.query('SELECT state, result_source_revision, result_kind, failure_code FROM builder.builder_run WHERE builder_run_id = $1', [sourceId])).rows[0], {
    state: 'FAILED', result_source_revision: nextSource, result_kind: 'SOURCE_CHANGED_BUILD_FAILED', failure_code: 'COMPILE_FAILED',
  })

  // Removing the member is now the whole revocation: the queued run's next claim asks again
  // under its own author and is refused.
  const staleId = randomUUID(); await create(ingressClient, 'BUILD', staleId)
  await adminClient.query('DELETE FROM iam.workspace_membership WHERE account_id = $1 AND workspace_id = $2', [accountId, workspaceId])
  await assert.rejects(() => claim(staleId), /NOT_ADMITTED/)
  await adminClient.query("INSERT INTO iam.workspace_membership(account_id, workspace_id, role) VALUES ($1, $2, 'owner')", [accountId, workspaceId])
  await adminClient.query('UPDATE builder.project_working_state SET working_version = working_version + 1 WHERE project_id = $1', [projectId])
  await assert.rejects(() => claim(staleId), /BUILDER_RUN_BASE_STALE/)
})
