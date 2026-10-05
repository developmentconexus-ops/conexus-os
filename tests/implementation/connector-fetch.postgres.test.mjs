import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { EXPECTED_NATIVE_ORDER, FAKE_CREDENTIAL, NATIVE_ORDER_DATASET, startFakeGateway } from './connector-fake-gateway.mjs'
import { createRestAdapter, REST_ACCOUNTS, REST_CONNECTOR_ID, restDefinition, startFakeRest } from './connector-fake-rest.mjs'
import { connectorRecord } from './connector-record.mjs'
import { hubModuleUrl } from './hub-build.mjs'
import { setupConnectors, skip } from './connector-fixture.mjs'


const { createBroker, registryOf } = await import(hubModuleUrl('connectors/broker.js'))
const { createSankhyaGateway } = await import(hubModuleUrl('connectors/sankhya/gateway.js'))
const { sankhyaDefinition } = await import(hubModuleUrl('connectors/sankhya/definition.js'))

const LOAD = 'CRUDServiceProvider.loadRecords'
const ROUTE = '/gateway/v1/mge/service.sbr'
// The fakes answer `JSON.stringify(body)`, so that is the size the executor read.
const answered = (body) => Object.freeze({ ok: true, status: 200, bytes: Buffer.byteLength(JSON.stringify(body)), body })
const ORDER_READ = answered(EXPECTED_NATIVE_ORDER)
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

const setup = async (t) => {
  const fixture = await setupConnectors(t, 'connector_fetch')
  const { database, envelope, brokerStore, addConnection, bind, unbind, disable, archive, scopeOf, seedProject } = fixture
  const fake = await startFakeGateway()
  const other = await startFakeGateway()
  const rest = await startFakeRest()
  t.after(() => Promise.all([fake.close(), other.close(), rest.close()]))
  const broker = createBroker({
    connectors: registryOf([
      { definition: sankhyaDefinition, adapter: createSankhyaGateway({ origin: fake.origin }) },
      { definition: restDefinition, adapter: createRestAdapter({ origin: rest.origin }) },
    ]),
    store: brokerStore, envelope, observability: connectorRecord().observability,
  })
  const fetchAs = (projectId, request) => broker.fetch({ kind: 'handler', invocationId: randomUUID(), scope: scopeOf(projectId) }, request)
  const sent = () => fake.requests.length + other.requests.length + rest.requests.length
  const assertPinned = () => {
    assert.deepEqual([...new Set(fake.requests.map(({ origin }) => origin))], fake.requests.length ? [fake.origin] : [])
    assert.deepEqual([...new Set(rest.requests.map(({ origin }) => origin))], rest.requests.length ? [rest.origin] : [])
    assert.deepEqual(other.requests, [])
  }
  return { database, project: seedProject, archive, addConnection, bind, unbind, disable, fetchAs, sent, assertPinned, fake, rest }
}

test('P6: a Project with no binding of that name, and a request naming another Project, read nothing', { skip }, async (t) => {
  const { project, addConnection, bind, fetchAs, sent, assertPinned } = await setup(t)
  const erp = await addConnection('sankhya', 'ERP', FAKE_CREDENTIAL)
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
  const { project, archive, addConnection, bind, unbind, disable, fetchAs, sent, assertPinned } = await setup(t)
  const erp = await addConnection('sankhya', 'ERP', FAKE_CREDENTIAL)
  const [unbound, archived, first, second] = [await project('unbound'), await project('archived'), await project('first'), await project('second')]
  const bindingOf = {}
  for (const projectId of [unbound, archived, first, second]) bindingOf[projectId] = (await bind(projectId, erp, 'erp')).bindingId
  for (const projectId of [unbound, archived, first, second]) assert.deepEqual(await fetchAs(projectId, read('erp')), ORDER_READ)

  await unbind(unbound, bindingOf[unbound])
  let before = sent()
  assert.deepEqual(await fetchAs(unbound, read('erp')), NOT_GRANTED)
  assert.equal(sent(), before, 'the removed binding sent nothing')

  await archive(archived, true)
  before = sent()
  assert.deepEqual(await fetchAs(archived, read('erp')), NOT_GRANTED)
  assert.equal(sent(), before, 'the archived Project sent nothing')
  await archive(archived, false)
  assert.deepEqual(await fetchAs(archived, read('erp')), ORDER_READ)

  await disable(erp)
  before = sent()
  for (const projectId of [archived, first, second]) assert.deepEqual(await fetchAs(projectId, read('erp')), NOT_GRANTED)
  assert.equal(sent(), before, 'refused before the network, although the token is still cached')
  assertPinned()
})

test('several Connections of one integrator: two Sankhya accounts bound to one Project under two names each authenticate with their own credential and token', { skip }, async (t) => {
  const { project, addConnection, bind, fetchAs, fake, assertPinned } = await setup(t)
  const matriz = { clientId: 'client-matriz', clientSecret: 'secret-matriz-1a7e', xToken: 'x-token-matriz' }
  const filial = { clientId: 'client-filial', clientSecret: 'secret-filial-9c3b', xToken: 'x-token-filial' }
  const projectId = await project('compras')
  await bind(projectId, await addConnection('sankhya', 'ERP matriz', matriz), 'erp')
  await bind(projectId, await addConnection('sankhya', 'ERP filial', filial), 'filial')

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
  const { project, addConnection, bind, fetchAs, sent, rest, fake, assertPinned } = await setup(t)
  const credentialOf = (account) => ({ clientId: REST_ACCOUNTS[account].clientId, clientSecret: REST_ACCOUNTS[account].clientSecret })
  const crmA = await addConnection(REST_CONNECTOR_ID, 'CRM A', credentialOf('account-a'))
  const crmB = await addConnection(REST_CONNECTOR_ID, 'CRM B', credentialOf('account-b'))
  const both = await project('both')
  const onlyA = await project('only-a')
  await bind(both, crmA, 'crm-a')
  await bind(both, crmB, 'crm-b')
  await bind(onlyA, crmA, 'crm-a')

  assert.deepEqual(await fetchAs(onlyA, records('crm-b')), NOT_GRANTED)
  assert.equal(sent(), 0, 'refused before the network')

  const accountA = answered({ account: 'account-a', records: [{ id: 'a-1', name: 'Registro A1' }] })
  assert.deepEqual(await fetchAs(both, records('crm-a')), accountA)
  assert.deepEqual(await fetchAs(both, records('crm-b')), answered({ account: 'account-b', records: [{ id: 'b-1', name: 'Registro B1' }, { id: 'b-2', name: 'Registro B2' }] }))
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
