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
const refusal = async (client, sql, parameters) => {
  try {
    await client.query(sql, parameters)
    return null
  } catch (error) {
    return error.message
  }
}

test('the accepted request text is stored on the run, bounded, and part of the idempotent key', {
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
  const database = `conexus_request_text_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 8)}`
  const ownerClient = await connect(admin)
  let adminClient
  let ingressClient
  await ownerClient.query(`CREATE DATABASE "${database}"`)
  t.after(async () => {
    await ingressClient?.end(); await adminClient?.end()
    await ownerClient.query(`DROP DATABASE "${database}" WITH (FORCE)`); await ownerClient.end()
  })
  const current = { ...admin, database }
  const connectionString = new URL('postgresql://localhost')
  connectionString.hostname = current.host; connectionString.port = String(current.port)
  connectionString.pathname = `/${database}`; connectionString.username = current.user; connectionString.password = current.password
  await runHubMigrations({ connectionString: connectionString.toString() })

  const accountId = randomUUID()
  const workspaceId = randomUUID()
  const projectId = randomUUID()
  const source = 'a'.repeat(40)
  adminClient = await connect(current)
  await adminClient.query("ALTER ROLE hub_builder_ingress PASSWORD 'request-text-ingress'")
  await adminClient.query('BEGIN')
  try {
    await adminClient.query('INSERT INTO iam.account(account_id, issuer, external_subject, display_name) VALUES ($1, $2, $3, $4)', [accountId, 'https://request-text.test', accountId, 'Request text'])
    await adminClient.query('INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1, $2)', [workspaceId, 'Request text'])
    await adminClient.query("INSERT INTO iam.workspace_membership(account_id, workspace_id, role) VALUES ($1, $2, 'owner')", [accountId, workspaceId])
    await adminClient.query("INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision) VALUES ($1, $2, 'Request text', 'NEW', $3, 'request-text')", [projectId, workspaceId, source])
    await adminClient.query('INSERT INTO builder.project_working_state(project_id, working_source_revision) VALUES ($1, $2)', [projectId, source])
    await adminClient.query('COMMIT')
  } catch (error) {
    await adminClient.query('ROLLBACK')
    throw error
  }

  ingressClient = await connect({ ...current, user: 'hub_builder_ingress', password: 'request-text-ingress' })
  const create = async (key, text, id = randomUUID()) => (await ingressClient.query(
    'SELECT builder.create_builder_run($1,$2,$3,$4,$5,$6,$7,$8,$9) AS value',
    [accountId, projectId, `conversa-${projectId}`, key, '2'.repeat(64), text, null, 'BUILD', id],
  )).rows[0].value

  const first = await create('1'.repeat(64), 'Crie um contador até 100')
  assert.equal(first.requestText, 'Crie um contador até 100')
  assert.equal((await adminClient.query('SELECT request_text FROM builder.builder_run WHERE builder_run_id = $1', [first.builderRunId])).rows[0].request_text, 'Crie um contador até 100')

  const replayed = await create('1'.repeat(64), 'Crie um contador até 100')
  assert.equal(replayed.builderRunId, first.builderRunId)
  assert.equal(replayed.requestText, 'Crie um contador até 100')

  assert.match(await refusal(ingressClient, 'SELECT builder.create_builder_run($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [accountId, projectId, `conversa-${projectId}`, '1'.repeat(64), '2'.repeat(64), 'Outro pedido', null, 'BUILD', randomUUID()]), /IDEMPOTENCY_CONFLICT/)

  assert.match(await refusal(ingressClient, 'SELECT builder.create_builder_run($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [accountId, projectId, `conversa-${projectId}`, '3'.repeat(64), '2'.repeat(64), 'x'.repeat(20_001), null, 'BUILD', randomUUID()]), /BUILDER_RUN_INPUT_REFUSED/)

  // Runs written before the column existed keep NULL, and both read projections say so.
  await adminClient.query('UPDATE builder.builder_run SET request_text = NULL, state = $2 WHERE builder_run_id = $1', [first.builderRunId, 'FAILED'])
  const latest = (await ingressClient.query('SELECT builder.read_builder_run($1,$2) AS value', [accountId, projectId])).rows[0].value
  assert.equal(latest.requestText, null)
  assert.match(latest.createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  const listed = (await ingressClient.query('SELECT builder.list_builder_runs($1,$2,$3) AS value', [accountId, projectId, 20])).rows[0].value
  assert.equal(listed.length, 1)
  assert.equal(listed[0].requestText, null)
  assert.equal(listed[0].createdAt, latest.createdAt)
})
