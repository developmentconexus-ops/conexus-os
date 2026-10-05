import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { EXPECTED_NATIVE_ORDER, FAKE_CREDENTIAL, NATIVE_ORDER_DATASET, startFakeGateway } from './connector-fake-gateway.mjs'
import { connectorRecord } from './connector-record.mjs'
import { hubModuleUrl } from './hub-build.mjs'
import { setupConnectors, skip } from './connector-fixture.mjs'

const { createBroker } = await import(hubModuleUrl('connectors/broker.js'))
const { createHandlerPorts } = await import(hubModuleUrl('connectors/handler-port.js'))
const { createSankhyaGateway } = await import(hubModuleUrl('connectors/sankhya/gateway.js'))
const { sankhyaDefinition } = await import(hubModuleUrl('connectors/sankhya/definition.js'))

const LOAD = 'CRUDServiceProvider.loadRecords'
const READ = Object.freeze({
  connection: 'erp', method: 'POST', path: '/gateway/v1/mge/service.sbr',
  query: { serviceName: LOAD, outputType: 'json' },
  body: { serviceName: LOAD, requestBody: { dataSet: NATIVE_ORDER_DATASET } },
})
const ORDER_READ = Object.freeze({ ok: true, status: 200, bytes: Buffer.byteLength(JSON.stringify(EXPECTED_NATIVE_ORDER)), body: EXPECTED_NATIVE_ORDER })
const NOT_GRANTED = Object.freeze({ ok: false, code: 'NOT_GRANTED' })

const fetchThrough = (socketPath, body = READ) => new Promise((resolve) => {
  const payload = Buffer.from(JSON.stringify(body))
  const outgoing = request({ socketPath, path: '/v1/fetch', method: 'POST', headers: { 'content-type': 'application/json', 'content-length': payload.byteLength } }, (response) => {
    const chunks = []
    response.on('data', (chunk) => chunks.push(chunk))
    response.on('end', () => resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))))
  })
  outgoing.on('error', (error) => resolve(error.code))
  outgoing.end(payload)
})

const setup = async (t) => {
  const fixture = await setupConnectors(t, 'connector_broker')
  const { envelope, brokerStore, addConnection, bind, scopeOf, seedProject } = fixture
  const connectionId = await addConnection('sankhya', 'ERP', FAKE_CREDENTIAL)
  const fake = await startFakeGateway()
  t.after(() => fake.close())
  const broker = createBroker({
    connectors: [{ definition: sankhyaDefinition, adapter: createSankhyaGateway({ origin: fake.origin }) }],
    store: brokerStore, envelope, observability: connectorRecord().observability,
  })
  const directory = mkdtempSync(join(tmpdir(), 'cx-broker-pg-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const ports = createHandlerPorts({ directory, broker })
  const openPort = async (projectId) => {
    const port = await ports.open(scopeOf(projectId))
    t.after(() => port.close())
    return port
  }
  return { ...fixture, connectionId, bind, project: seedProject, openPort, fake }
}

test('M1 and P8: the binding is read on every fetch, through one open port; unbind refuses the next fetch', { skip }, async (t) => {
  const { connectionId, bind, unbind, project, openPort } = await setup(t)
  const projectA = await project('a')
  const binding = await bind(projectA, connectionId, 'erp')
  const port = await openPort(projectA)
  assert.deepEqual(await fetchThrough(port.socketPath), ORDER_READ)
  await unbind(projectA, binding.bindingId)
  assert.deepEqual(await fetchThrough(port.socketPath), NOT_GRANTED)

  const unbound = await openPort(await project('never-bound'))
  assert.deepEqual(await fetchThrough(unbound.socketPath), NOT_GRANTED)
})

test('P8: disabling the Connection refuses the next fetch of every Project', { skip }, async (t) => {
  const { connectionId, bind, disable, project, openPort, fake } = await setup(t)
  const projects = [await project('a'), await project('b')]
  const ports = []
  for (const projectId of projects) {
    await bind(projectId, connectionId, 'erp')
    ports.push(await openPort(projectId))
  }
  for (const port of ports) assert.deepEqual(await fetchThrough(port.socketPath), ORDER_READ)
  await disable(connectionId)
  const before = fake.requests.length
  for (const port of ports) assert.deepEqual(await fetchThrough(port.socketPath), NOT_GRANTED)
  assert.equal(fake.requests.length, before, 'refused before the network, although a token is still cached')
})
