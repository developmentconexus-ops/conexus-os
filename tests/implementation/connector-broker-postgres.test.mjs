import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import pg from 'pg'
import { EXPECTED_ORDER_22790, FAKE_CREDENTIAL, startFakeGateway } from './connector-fake-gateway.mjs'
import { connectorRecord } from './connector-record.mjs'
import { loadHubMigrationFiles, runHubMigrations, runMigrations } from '../../scripts/run-hub-migrations.mjs'
import { hubModuleUrl } from './hub-build.mjs'
import { buildHubDatabase, createEmptyDatabase } from './hub-database.mjs'

const configured = ['CONEXUS_TEST_DB_HOST', 'CONEXUS_TEST_DB_PORT', 'CONEXUS_TEST_DB_NAME', 'CONEXUS_TEST_DB_USER', 'CONEXUS_TEST_DB_PASSWORD'].every((name) => process.env[name])

const { createBroker } = await import(hubModuleUrl('connectors/broker.js'))
const { createHandlerPorts } = await import(hubModuleUrl('connectors/handler-port.js'))
const { createBrokerStore, createConnectorStore } = await import(hubModuleUrl('connectors/store.js'))
const { createSankhyaGateway } = await import(hubModuleUrl('connectors/sankhya/gateway.js'))
const { sankhyaDefinition } = await import(hubModuleUrl('connectors/sankhya/definition.js'))
const { scopeFromArtifactSource } = await import(hubModuleUrl('connectors/scope.js'))
const { createSecretEnvelope } = await import(hubModuleUrl('platform/secrets.js'))

const READ = 'sankhya.purchase-order.read'

const call = (socketPath, body) => new Promise((resolve) => {
  const payload = Buffer.from(JSON.stringify(body))
  const outgoing = request({ socketPath, path: '/v1/call', method: 'POST', headers: { 'content-type': 'application/json', 'content-length': payload.byteLength } }, (response) => {
    const chunks = []
    response.on('data', (chunk) => chunks.push(chunk))
    response.on('end', () => resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))))
  })
  outgoing.on('error', (error) => resolve(error.code))
  outgoing.end(payload)
})

// `legacySchema`: the database is still before 0039, so the Connection is inserted the way that schema stored it.
const setup = async (t, { database, beforeBindings = async () => {}, legacySchema = false } = {}) => {
  const fixture = database ?? await buildHubDatabase(t, 'connector_broker')
  const owner = new pg.Client({ connectionString: fixture.connectionString })
  await owner.connect()
  const runtimePool = new pg.Pool({ connectionString: fixture.connectionString, options: '-c role=hub_iam_runtime', max: 4 })
  runtimePool.on('error', () => {})
  fixture.onCleanup(() => owner.end())
  fixture.onCleanup(() => runtimePool.end())

  const admin = randomUUID()
  await owner.query('INSERT INTO iam.account(account_id, issuer, external_subject, display_name, email, active) VALUES ($1,$2,$3,$4,$5,true)',
    [admin, 'https://connector-broker.test', admin, 'admin', 'admin@connector-broker.test'])
  await owner.query("INSERT INTO iam.installation_administrator(account_id, granted_via) VALUES ($1, 'OPERATOR_BOOTSTRAP')", [admin])
  const workspaceId = randomUUID()
  await owner.query('INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1,$2)', [workspaceId, 'purchasing'])
  await owner.query("INSERT INTO iam.workspace_membership(account_id, workspace_id, role) VALUES ($1,$2,'owner')", [admin, workspaceId])
  const project = async (name) => {
    const projectId = randomUUID()
    await owner.query("INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision) VALUES ($1,$2,$3,'NEW',$4,$5)",
      [projectId, workspaceId, name, 'a'.repeat(40), name])
    return projectId
  }

  const envelope = createSecretEnvelope('ab'.repeat(32))
  const store = createConnectorStore({ pool: runtimePool, envelope })
  const connectionId = randomUUID()
  if (legacySchema) {
    await owner.query(`INSERT INTO connector.connection(connection_id, workspace_id, connector_id, label, credential_sealed, credential_digest, created_by)
      VALUES ($1, $2, 'sankhya', 'ERP', $3, $4, $5)`, [connectionId, workspaceId, await envelope.seal(JSON.stringify(FAKE_CREDENTIAL)), envelope.fingerprints(JSON.stringify(FAKE_CREDENTIAL, Object.keys(FAKE_CREDENTIAL).sort()))[0], admin])
  } else {
    await store.createConnection({ actor: admin, connectionId, workspaceId, connectorId: 'sankhya', label: 'ERP', destination: 'production', credential: FAKE_CREDENTIAL })
  }
  await beforeBindings({ owner, admin, workspaceId, connectionId, project })

  const fake = await startFakeGateway()
  t.after(() => fake.close())
  const broker = createBroker({
    connectors: [{ definition: sankhyaDefinition, adapters: { production: createSankhyaGateway({ origin: fake.origin }) } }],
    store: createBrokerStore(runtimePool), envelope, observability: connectorRecord().observability,
  })
  const directory = mkdtempSync(join(tmpdir(), 'cx-broker-pg-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const ports = createHandlerPorts({ directory, broker })
  const openPort = async (projectId) => {
    const port = await ports.open(scopeFromArtifactSource({ via: 'PREVIEW', projectId }))
    t.after(() => port.close())
    return port
  }
  return { admin, workspaceId, connectionId, store, project, openPort, fake }
}

test('M1 and P8: the binding is read on every call, through one open port; unbind refuses the next call', { skip: configured ? false : 'real PostgreSQL configuration not supplied' }, async (t) => {
  const { admin, connectionId, store, project, openPort } = await setup(t)
  const projectA = await project('a')
  const binding = await store.bindConnection({ actor: admin, projectId: projectA, connectionId, name: 'erp' })
  const port = await openPort(projectA)
  assert.deepEqual(await call(port.socketPath, { operation: READ, input: { documentNumber: 22790 } }), { ok: true, value: EXPECTED_ORDER_22790 })
  assert.equal(await store.unbindConnection({ actor: admin, projectId: projectA, bindingId: binding.bindingId }), true)
  assert.deepEqual(await call(port.socketPath, { operation: READ, input: { documentNumber: 22790 } }), { ok: false, code: 'NOT_GRANTED' })

  const unbound = await openPort(await project('never-bound'))
  assert.deepEqual(await call(unbound.socketPath, { operation: READ, input: { documentNumber: 22790 } }), { ok: false, code: 'NOT_GRANTED' })
})

test('P8: disabling the Connection refuses the next call of every Project', { skip: configured ? false : 'real PostgreSQL configuration not supplied' }, async (t) => {
  const { admin, workspaceId, connectionId, store, project, openPort, fake } = await setup(t)
  const projects = [await project('a'), await project('b')]
  const ports = []
  for (const projectId of projects) {
    await store.bindConnection({ actor: admin, projectId, connectionId, name: 'erp' })
    ports.push(await openPort(projectId))
  }
  for (const port of ports) assert.deepEqual(await call(port.socketPath, { operation: READ, input: { documentNumber: 22790 } }), { ok: true, value: EXPECTED_ORDER_22790 })
  assert.equal(await store.disableConnection({ actor: admin, workspaceId, connectionId }), true)
  const before = fake.requests.length
  for (const port of ports) assert.deepEqual(await call(port.socketPath, { operation: READ, input: { documentNumber: 22790 } }), { ok: false, code: 'NOT_GRANTED' })
  assert.equal(fake.requests.length, before, 'refused before the network, although a token is still cached')
})

test('the operation path never picks between two bindings of one integrator: a second one refuses the call until one is unbound', { skip: configured ? false : 'real PostgreSQL configuration not supplied' }, async (t) => {
  const { admin, workspaceId, connectionId, store, project, openPort, fake } = await setup(t)
  const projectId = await project('a')
  await store.bindConnection({ actor: admin, projectId, connectionId, name: 'erp' })
  const port = await openPort(projectId)
  assert.deepEqual(await call(port.socketPath, { operation: READ, input: { documentNumber: 22790 } }), { ok: true, value: EXPECTED_ORDER_22790 })

  const branch = randomUUID()
  await store.createConnection({ actor: admin, connectionId: branch, workspaceId, connectorId: 'sankhya', label: 'ERP filial', destination: 'production', credential: FAKE_CREDENTIAL })
  const second = await store.bindConnection({ actor: admin, projectId, connectionId: branch, name: 'filial' })
  const before = fake.requests.length
  assert.deepEqual(await call(port.socketPath, { operation: READ, input: { documentNumber: 22790 } }), { ok: false, code: 'NOT_GRANTED' })
  assert.equal(fake.requests.length, before, 'refused before the network')
  await store.unbindConnection({ actor: admin, projectId, bindingId: second.bindingId })
  assert.deepEqual(await call(port.socketPath, { operation: READ, input: { documentNumber: 22790 } }), { ok: true, value: EXPECTED_ORDER_22790 })
})

test('a grant made before 0031 reads through its migrated binding, and unbinding it refuses the next call', { skip: configured ? false : 'real PostgreSQL configuration not supplied' }, async (t) => {
  const fixture = await createEmptyDatabase(t, 'connector_broker_move')
  await runMigrations({ connectionString: fixture.connectionString, migrations: loadHubMigrationFiles().filter(({ version }) => version <= '0030'), catalogSnapshot: null })
  let grantedProject
  let grantId
  const { admin, store, openPort } = await setup(t, {
    database: fixture,
    legacySchema: true,
    beforeBindings: async ({ owner, admin: actor, connectionId, project }) => {
      grantedProject = await project('granted')
      grantId = (await owner.query('SELECT grant_id FROM connector.grant_capability($1, $2, $3, $4)', [actor, grantedProject, connectionId, READ])).rows[0].grant_id
      await runHubMigrations({ connectionString: fixture.connectionString })
    },
  })
  const port = await openPort(grantedProject)
  assert.deepEqual(await call(port.socketPath, { operation: READ, input: { documentNumber: 22790 } }), { ok: true, value: EXPECTED_ORDER_22790 })
  assert.equal(await store.unbindConnection({ actor: admin, projectId: grantedProject, bindingId: grantId }), true, 'the binding keeps the grant id')
  assert.deepEqual(await call(port.socketPath, { operation: READ, input: { documentNumber: 22790 } }), { ok: false, code: 'NOT_GRANTED' })
})
