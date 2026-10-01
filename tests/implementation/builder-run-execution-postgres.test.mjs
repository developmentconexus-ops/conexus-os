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
    await adminClient.query('SELECT builder.register_project_repository($1)', [projectId])
    await adminClient.query('COMMIT')
  } catch (error) {
    await adminClient.query('ROLLBACK')
    throw error
  }

  const create = async (client, id, key = keyDigest, request = requestDigest, base = source) => (await client.query(
    'SELECT builder.create_builder_run($1,$2,$3,$4,$5,$6,$7,$8,$9) AS value',
    [accountId, projectId, `conversa-${projectId}`, key, request, 'pedido', null, id, base],
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
  // Every account that paid for one of the run's model calls is recorded once; the same one again converges.
  const modelAccount = randomUUID()
  const otherModelAccount = randomUUID()
  const recordModelAccount = async (value) => (await executorClient.query('SELECT builder.record_builder_run_model_account($1,$2) AS recorded', [runId, value])).rows[0].recorded
  assert.deepEqual([await recordModelAccount(modelAccount), await recordModelAccount(modelAccount), await recordModelAccount(otherModelAccount), await recordModelAccount(null)], [true, true, true, false])
  assert.deepEqual((await adminClient.query('SELECT model_account_id FROM builder.builder_run_model_account WHERE builder_run_id = $1 ORDER BY first_used_at', [runId])).rows.map((row) => row.model_account_id), [modelAccount, otherModelAccount])
  assert.equal((await executorClient.query('SELECT builder.settle_builder_run($1,$2,$3,$4)', [runId, nextSource, 'SOURCE_CHANGED', null])).rows[0].settle_builder_run, false)
  assert.equal((await executorClient.query('SELECT builder.record_builder_run_candidate($1,$2)', [runId, nextSource])).rows[0].record_builder_run_candidate, true)
  assert.equal((await executorClient.query('SELECT builder.advance_builder_run_source($1,$2)', [runId, nextSource])).rows[0].advance_builder_run_source, true)
  assert.equal((await executorClient.query('SELECT builder.settle_builder_run_build($1,$2,$3,$4,$5)', [runId, nextSource, null, null, 'COMPILE_FAILED'])).rows[0].settle_builder_run_build, true)
  assert.deepEqual((await adminClient.query('SELECT state, trigger_message_id, sandbox_id, conversation_id, candidate_revision, result_source_revision FROM builder.builder_run WHERE builder_run_id = $1', [runId])).rows[0], {
    state: 'FAILED', trigger_message_id: 'mastra-message-1', sandbox_id: 'sandbox-1', conversation_id: `conversa-${projectId}`, candidate_revision: nextSource, result_source_revision: nextSource,
  })
  assert.equal(await recordModelAccount(modelAccount), false, 'a settled run records no account')
  await executorClient.end()
  executorClient = undefined
  await assert.rejects(() => create(ingressClient, secondRunId, '4'.repeat(64), '5'.repeat(64), 'main'), /BUILDER_RUN_INPUT_REFUSED/)
  const second = await create(ingressClient, secondRunId, '4'.repeat(64), '5'.repeat(64), nextSource)
  assert.equal(second.baseSourceRevision, nextSource)
  await adminClient.query('DELETE FROM builder.builder_run WHERE builder_run_id = $1', [secondRunId])

  // The Hub holds the Project's lock while it reads `main`, so no other run starts in between.
  const holder = await connect(ingress)
  const waiter = await connect(ingress)
  await holder.query('BEGIN')
  assert.equal((await holder.query('SELECT builder.lock_project_for_run($1,$2) AS locked', [accountId, projectId])).rows[0].locked, true)
  await waiter.query("SET lock_timeout = '300ms'")
  await assert.rejects(() => create(waiter, randomUUID(), '8'.repeat(64), '9'.repeat(64)), /lock timeout/)
  await holder.query('ROLLBACK')
  await assert.rejects(() => holder.query('SELECT builder.lock_project_for_run($1,$2)', [randomUUID(), projectId]), /NOT_ADMITTED/)
  await holder.end()
  await waiter.end()
  const raceA = await connect(ingress)
  const raceB = await connect(ingress)
  const race = await Promise.all([create(raceA, concurrentRunA, '6'.repeat(64), '7'.repeat(64)), create(raceB, concurrentRunB, '6'.repeat(64), '7'.repeat(64))])
  assert.equal(race[0].builderRunId, race[1].builderRunId)
  assert.ok([concurrentRunA, concurrentRunB].includes(race[0].builderRunId))
  await raceA.end()
  await raceB.end()
})
