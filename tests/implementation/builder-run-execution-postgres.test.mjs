import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import pg from 'pg'
import { runHubMigrations } from '../../scripts/run-hub-migrations.mjs'
import { refuseProtectedCluster } from './protected-cluster.mjs'

const configured = ['CONEXUS_TEST_DB_HOST', 'CONEXUS_TEST_DB_PORT', 'CONEXUS_TEST_DB_NAME', 'CONEXUS_TEST_DB_USER', 'CONEXUS_TEST_DB_PASSWORD']
  .every(name => process.env[name])

const connect = async (connection) => {
  const client = new pg.Client(connection)
  await client.connect()
  return client
}

test('BuilderRun admission and settlement are idempotent, serialized, and CAS-protected', {
  skip: configured ? false : 'real PostgreSQL configuration not supplied',
}, async (t) => {
  await refuseProtectedCluster()
  const admin = {
    host: process.env.CONEXUS_TEST_DB_HOST,
    port: Number(process.env.CONEXUS_TEST_DB_PORT),
    database: process.env.CONEXUS_TEST_DB_NAME,
    user: process.env.CONEXUS_TEST_DB_USER,
    password: process.env.CONEXUS_TEST_DB_PASSWORD,
  }
  const database = `conexus_run_execution_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 8)}`
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

  const ingress = { ...current, user: 'hub_builder_ingress', password: 'task1-ingress' }
  const executor = { ...current, user: 'hub_builder_executor', password: 'task1-executor' }
  const accountId = randomUUID()
  const workspaceId = randomUUID()
  const projectId = randomUUID()
  const runId = randomUUID()
  const secondRunId = randomUUID()
  const concurrentRunA = randomUUID()
  const concurrentRunB = randomUUID()
  const source = 'a'.repeat(40)
  const nextSource = 'b'.repeat(40)
  const keyDigest = '1'.repeat(64)
  const requestDigest = '2'.repeat(64)

  adminClient = await connect(current)
  await adminClient.query("ALTER ROLE hub_builder_ingress PASSWORD 'task1-ingress'; ALTER ROLE hub_builder_executor PASSWORD 'task1-executor'")
  await adminClient.query('BEGIN')
  try {
    await adminClient.query('INSERT INTO iam.account(account_id, issuer, external_subject, display_name) VALUES ($1, $2, $3, $4)', [accountId, 'https://task1.test', accountId, 'Task 1'])
    await adminClient.query('INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1, $2)', [workspaceId, 'Task 1'])
    await adminClient.query("INSERT INTO iam.workspace_membership(account_id, workspace_id, role) VALUES ($1, $2, 'owner')", [accountId, workspaceId])
    await adminClient.query("INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision) VALUES ($1, $2, 'Task 1', 'NEW', $3, 'task1')", [projectId, workspaceId, source])
    await adminClient.query('INSERT INTO builder.project_working_state(project_id, working_source_revision) VALUES ($1, $2)', [projectId, source])
    await adminClient.query('COMMIT')
  } catch (error) {
    await adminClient.query('ROLLBACK')
    throw error
  }

  const create = async (client, id, key = keyDigest, request = requestDigest) => (await client.query(
    'SELECT builder.create_builder_run($1,$2,$3,$4,$5,$6,$7,$8,$9) AS value',
    [accountId, projectId, `conversa-${projectId}`, key, request, 'pedido', null, 'BUILD', id],
  )).rows[0].value
  ingressClient = await connect(ingress)
  const first = await create(ingressClient, runId)
  assert.equal(first.builderRunId, runId)
  assert.equal(first.baseSourceRevision, source)
  assert.deepEqual(await create(ingressClient, runId), first)
  await assert.rejects(() => create(ingressClient, secondRunId, keyDigest, '3'.repeat(64)), /IDEMPOTENCY_CONFLICT/)
  await assert.rejects(() => create(ingressClient, secondRunId, '4'.repeat(64)), /PROJECT_BUSY/)

  executorClient = await connect(executor)
  assert.equal((await executorClient.query('SELECT builder.claim_builder_run($1) AS value', [runId])).rows[0].value.state, 'RUNNING')
  assert.equal((await executorClient.query('SELECT builder.bind_builder_run_message($1,$2)', [runId, 'mastra-message-1'])).rows[0].bind_builder_run_message, true)
  assert.equal((await executorClient.query('SELECT builder.bind_builder_run_sandbox($1,$2)', [runId, 'sandbox-1'])).rows[0].bind_builder_run_sandbox, true)
  assert.equal((await executorClient.query('SELECT builder.settle_builder_run($1,$2,$3,$4)', [runId, nextSource, 'SOURCE_CHANGED', null])).rows[0].settle_builder_run, false)
  assert.equal((await executorClient.query('SELECT builder.advance_builder_run_source($1,$2)', [runId, nextSource])).rows[0].advance_builder_run_source, true)
  assert.equal((await executorClient.query('SELECT builder.settle_builder_run_build($1,$2,$3,$4,$5)', [runId, nextSource, null, null, 'COMPILE_FAILED'])).rows[0].settle_builder_run_build, true)
  assert.deepEqual((await adminClient.query('SELECT state, trigger_message_id, sandbox_id, conversation_id, base_working_version, result_source_revision FROM builder.builder_run WHERE builder_run_id = $1', [runId])).rows[0], {
    state: 'FAILED', trigger_message_id: 'mastra-message-1', sandbox_id: 'sandbox-1', conversation_id: `conversa-${projectId}`, base_working_version: '0', result_source_revision: nextSource,
  })
  await executorClient.end()
  executorClient = undefined
  const second = await create(ingressClient, secondRunId, '4'.repeat(64), '5'.repeat(64))
  assert.equal(second.baseSourceRevision, nextSource)
  await adminClient.query('DELETE FROM builder.builder_run WHERE builder_run_id = $1', [secondRunId])
  const raceA = await connect(ingress)
  const raceB = await connect(ingress)
  const race = await Promise.all([create(raceA, concurrentRunA, '6'.repeat(64), '7'.repeat(64)), create(raceB, concurrentRunB, '6'.repeat(64), '7'.repeat(64))])
  assert.equal(race[0].builderRunId, race[1].builderRunId)
  assert.ok([concurrentRunA, concurrentRunB].includes(race[0].builderRunId))
  await raceA.end()
  await raceB.end()
})
