import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import pg from 'pg'
import { EXPECTED_NATIVE_ORDER, FAKE_CREDENTIAL, NATIVE_ORDER_DATASET, startFakeGateway } from './connector-fake-gateway.mjs'
import { createRestAdapter, REST_ACCOUNTS, REST_CONNECTOR_ID, restDefinition, startFakeRest } from './connector-fake-rest.mjs'
import { connectorRecord } from './connector-record.mjs'
import { hubModuleUrl } from './hub-build.mjs'
import { buildHubDatabase } from './hub-database.mjs'

const configured = ['CONEXUS_TEST_DB_HOST', 'CONEXUS_TEST_DB_PORT', 'CONEXUS_TEST_DB_NAME', 'CONEXUS_TEST_DB_USER', 'CONEXUS_TEST_DB_PASSWORD'].every((name) => process.env[name])
const skip = configured ? false : 'real PostgreSQL configuration not supplied'

const { createBroker } = await import(hubModuleUrl('connectors/broker.js'))
const { createBrokerStore, createConnectorStore } = await import(hubModuleUrl('connectors/store.js'))
const { createSankhyaGateway } = await import(hubModuleUrl('connectors/sankhya/gateway.js'))
const { sankhyaDefinition } = await import(hubModuleUrl('connectors/sankhya/definition.js'))
const { scopeFromArtifactSource } = await import(hubModuleUrl('connectors/scope.js'))
const { createSecretEnvelope } = await import(hubModuleUrl('platform/secrets.js'))

const LOAD = 'CRUDServiceProvider.loadRecords'
const ROUTE = '/gateway/v1/mge/service.sbr'
const ORDER_READ = Object.freeze({ ok: true, status: 200, truncated: false, body: EXPECTED_NATIVE_ORDER })
const NOT_GRANTED = Object.freeze({ ok: false, code: 'NOT_GRANTED' })

const read = (connection, overrides = {}) => ({
  connection,
  method: 'POST',
  path: ROUTE,
  query: { serviceName: LOAD, outputType: 'json' },
  body: { serviceName: LOAD, requestBody: { dataSet: NATIVE_ORDER_DATASET } },
  ...overrides,
})
const records = (connection) => ({ connection, method: 'GET', path: '/v1/records' })

// broker.fetch over the Hub's real schema: hub_iam_runtime runs the broker's functions, the Workspace
// owner binds through connector.bind_connection, and the Project's bindings are read on every fetch.
const setup = async (t) => {
  const fixture = await buildHubDatabase(t, 'connector_fetch')
  const owner = new pg.Client({ connectionString: fixture.connectionString })
  await owner.connect()
  const runtimePool = new pg.Pool({ connectionString: fixture.connectionString, options: '-c role=hub_iam_runtime', max: 4 })
  runtimePool.on('error', () => {})
  fixture.onCleanup(() => owner.end())
  fixture.onCleanup(() => runtimePool.end())

  const admin = randomUUID()
  await owner.query('INSERT INTO iam.account(account_id, issuer, external_subject, display_name, email, active) VALUES ($1,$2,$3,$4,$5,true)',
    [admin, 'https://connector-fetch.test', admin, 'admin', 'admin@connector-fetch.test'])
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
  const archive = (projectId, archived) => owner.query('UPDATE project.project SET archived = $2 WHERE project_id = $1', [projectId, archived])

  const envelope = createSecretEnvelope('ab'.repeat(32))
  const store = createConnectorStore({ pool: runtimePool, envelope })
  const connection = async (connectorId, label, credential) => {
    const connectionId = randomUUID()
    await store.createConnection({ actor: admin, connectionId, workspaceId, connectorId, label, credential })
    return connectionId
  }
  const bind = (projectId, connectionId, name) => store.bindConnection({ actor: admin, projectId, connectionId, name })
  const unbind = (projectId, bindingId) => store.unbindConnection({ actor: admin, projectId, bindingId })
  const disable = (connectionId) => store.disableConnection({ actor: admin, workspaceId, connectionId })

  const fake = await startFakeGateway()
  const other = await startFakeGateway()
  const rest = await startFakeRest()
  t.after(() => Promise.all([fake.close(), other.close(), rest.close()]))
  const broker = createBroker({
    connectors: [
      { definition: sankhyaDefinition, adapter: createSankhyaGateway({ origin: fake.origin }) },
      { definition: restDefinition, adapter: createRestAdapter({ origin: rest.origin }) },
    ],
    store: createBrokerStore(runtimePool), envelope, observability: connectorRecord().observability,
  })
  const fetchAs = (projectId, request) => broker.fetch({ kind: 'handler', invocationId: randomUUID(), scope: scopeFromArtifactSource({ via: 'PREVIEW', projectId }) }, request)
  const sent = () => fake.requests.length + other.requests.length + rest.requests.length
  const assertPinned = () => {
    assert.deepEqual([...new Set(fake.requests.map(({ origin }) => origin))], fake.requests.length ? [fake.origin] : [])
    assert.deepEqual([...new Set(rest.requests.map(({ origin }) => origin))], rest.requests.length ? [rest.origin] : [])
    assert.deepEqual(other.requests, [])
  }
  return { project, archive, connection, bind, unbind, disable, fetchAs, sent, assertPinned, fake, rest }
}

test('P6: a Project with no binding of that name, and a request naming another Project, read nothing', { skip }, async (t) => {
  const { project, connection, bind, fetchAs, sent, assertPinned } = await setup(t)
  const erp = await connection('sankhya', 'ERP', FAKE_CREDENTIAL)
  const projectA = await project('a')
  const projectB = await project('b')
  await bind(projectA, erp, 'erp')
  await bind(projectB, erp, 'compras')

  assert.deepEqual(await fetchAs(projectB, read('erp')), NOT_GRANTED)
  assert.deepEqual(await fetchAs(await project('never-bound'), read('erp')), NOT_GRANTED)
  assert.deepEqual(await fetchAs(projectB, read('compras', { project: projectA })), { ok: false, code: 'INPUT_REFUSED', issues: ['/<unrecognized>'] })
  assert.equal(sent(), 0, 'no request reached any fake, authentication included')

  assert.deepEqual(await fetchAs(projectA, read('erp')), ORDER_READ)
  assert.deepEqual(await fetchAs(projectB, read('compras')), ORDER_READ)
  assertPinned()
})

test('P8: unbinding refuses the next fetch, an archived Project reads nothing, and disabling the Connection refuses every Project bound to it', { skip }, async (t) => {
  const { project, archive, connection, bind, unbind, disable, fetchAs, sent, assertPinned } = await setup(t)
  const erp = await connection('sankhya', 'ERP', FAKE_CREDENTIAL)
  const [unbound, archived, first, second] = [await project('unbound'), await project('archived'), await project('first'), await project('second')]
  const bindingOf = {}
  for (const projectId of [unbound, archived, first, second]) bindingOf[projectId] = (await bind(projectId, erp, 'erp')).bindingId
  for (const projectId of [unbound, archived, first, second]) assert.deepEqual(await fetchAs(projectId, read('erp')), ORDER_READ)

  assert.equal(await unbind(unbound, bindingOf[unbound]), true)
  let before = sent()
  assert.deepEqual(await fetchAs(unbound, read('erp')), NOT_GRANTED)
  assert.equal(sent(), before, 'the removed binding sent nothing')

  await archive(archived, true)
  before = sent()
  assert.deepEqual(await fetchAs(archived, read('erp')), NOT_GRANTED)
  assert.equal(sent(), before, 'the archived Project sent nothing')
  await archive(archived, false)
  assert.deepEqual(await fetchAs(archived, read('erp')), ORDER_READ)

  assert.equal(await disable(erp), true)
  before = sent()
  for (const projectId of [archived, first, second]) assert.deepEqual(await fetchAs(projectId, read('erp')), NOT_GRANTED)
  assert.equal(sent(), before, 'refused before the network, although the token is still cached')
  assertPinned()
})

test('several Connections of one integrator: two Sankhya accounts bound to one Project under two names each authenticate with their own credential and token', { skip }, async (t) => {
  const { project, connection, bind, fetchAs, fake, assertPinned } = await setup(t)
  const matriz = { clientId: 'client-matriz', clientSecret: 'secret-matriz-1a7e', xToken: 'x-token-matriz' }
  const filial = { clientId: 'client-filial', clientSecret: 'secret-filial-9c3b', xToken: 'x-token-filial' }
  const projectId = await project('compras')
  await bind(projectId, await connection('sankhya', 'ERP matriz', matriz), 'erp')
  await bind(projectId, await connection('sankhya', 'ERP filial', filial), 'filial')

  assert.deepEqual(await fetchAs(projectId, read('erp')), ORDER_READ)
  assert.deepEqual(await fetchAs(projectId, read('filial')), ORDER_READ)
  assert.deepEqual(await fetchAs(projectId, read('erp')), ORDER_READ)
  assert.deepEqual(fake.requests.map(({ path, form, xToken, authorization }) => [path, form?.client_id ?? null, xToken, authorization]), [
    ['/authenticate', 'client-matriz', 'x-token-matriz', null],
    [ROUTE, null, null, 'Bearer fake-token-1'],
    ['/authenticate', 'client-filial', 'x-token-filial', null],
    [ROUTE, null, null, 'Bearer fake-token-2'],
    [ROUTE, null, null, 'Bearer fake-token-1'],
  ])
  assertPinned()
})

test('the generic seam on stored rows: two Connections of the synthetic REST integrator bound as crm-a and crm-b each reach only their own account', { skip }, async (t) => {
  const { project, connection, bind, fetchAs, sent, rest, fake, assertPinned } = await setup(t)
  const credentialOf = (account) => ({ clientId: REST_ACCOUNTS[account].clientId, clientSecret: REST_ACCOUNTS[account].clientSecret })
  const crmA = await connection(REST_CONNECTOR_ID, 'CRM A', credentialOf('account-a'))
  const crmB = await connection(REST_CONNECTOR_ID, 'CRM B', credentialOf('account-b'))
  const both = await project('both')
  const onlyA = await project('only-a')
  await bind(both, crmA, 'crm-a')
  await bind(both, crmB, 'crm-b')
  await bind(onlyA, crmA, 'crm-a')

  assert.deepEqual(await fetchAs(onlyA, records('crm-b')), NOT_GRANTED)
  assert.equal(sent(), 0, 'refused before the network')

  const accountA = { ok: true, status: 200, truncated: false, body: { account: 'account-a', records: [{ id: 'a-1', name: 'Registro A1' }] } }
  assert.deepEqual(await fetchAs(both, records('crm-a')), accountA)
  assert.deepEqual(await fetchAs(both, records('crm-b')), {
    ok: true, status: 200, truncated: false, body: { account: 'account-b', records: [{ id: 'b-1', name: 'Registro B1' }, { id: 'b-2', name: 'Registro B2' }] },
  })
  assert.deepEqual(await fetchAs(onlyA, records('crm-a')), accountA)
  assert.deepEqual(rest.requests.map(({ method, path, account }) => [method, path, account]), [
    ['POST', '/oauth/token', null],
    ['GET', '/v1/records', 'account-a'],
    ['POST', '/oauth/token', null],
    ['GET', '/v1/records', 'account-b'],
    ['GET', '/v1/records', 'account-a'],
  ])
  assert.deepEqual(await fetchAs(onlyA, records('crm-b')), NOT_GRANTED)
  assert.equal(rest.requests.length, 5)
  assert.deepEqual(fake.requests, [])
  assertPinned()
})
