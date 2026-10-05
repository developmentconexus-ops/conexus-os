import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { EXPECTED_NATIVE_ORDER, FAKE_CREDENTIAL, NATIVE_ORDER_DATASET, SECRET_MARKER, startFakeGateway } from './connector-fake-gateway.mjs'
import { connectorRecord } from './connector-record.mjs'
import { hubModuleUrl } from './hub-build.mjs'

const { createHandlerPorts } = await import(hubModuleUrl('connectors/handler-port.js'))
const { createBroker } = await import(hubModuleUrl('connectors/broker.js'))
const { createSankhyaGateway } = await import(hubModuleUrl('connectors/sankhya/gateway.js'))
const { sankhyaDefinition } = await import(hubModuleUrl('connectors/sankhya/definition.js'))
const { scopeFromArtifactSource } = await import(hubModuleUrl('connectors/scope.js'))
const { createSecretEnvelope } = await import(hubModuleUrl('platform/secrets.js'))

const PROJECT = '22222222-2222-4222-8222-222222222222'
const OTHER_PROJECT = '66666666-6666-4666-8666-666666666666'
const CONNECTION = '33333333-3333-4333-8333-333333333333'
const LOAD = 'CRUDServiceProvider.loadRecords'
const ROUTE = '/gateway/v1/mge/service.sbr'

const post = (socketPath, body, path = '/v1/fetch') => new Promise((resolve) => {
  const payload = Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))
  const outgoing = request({ socketPath, path, method: 'POST', headers: { 'content-type': 'application/json', 'content-length': payload.byteLength } }, (response) => {
    const chunks = []
    response.on('data', (chunk) => chunks.push(chunk))
    response.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8')
      resolve(response.statusCode === 200 ? { text, json: JSON.parse(text) } : response.statusCode)
    })
  })
  outgoing.on('error', (error) => resolve(error.code))
  outgoing.end(payload)
})

const READ = {
  connection: 'erp', method: 'POST', path: ROUTE,
  query: { serviceName: LOAD, outputType: 'json' },
  body: { serviceName: LOAD, requestBody: { dataSet: NATIVE_ORDER_DATASET } },
}
const ORDER_BYTES = Buffer.byteLength(JSON.stringify(EXPECTED_NATIVE_ORDER))

const setup = async (t, { limits, tokenPrefix, lookupDelayMs = 0 } = {}) => {
  const fake = await startFakeGateway(tokenPrefix ? { tokenPrefix } : {})
  t.after(() => fake.close())
  const envelope = createSecretEnvelope('ef'.repeat(32))
  const sealed = await envelope.seal(JSON.stringify(FAKE_CREDENTIAL))
  const store = {
    listBindings: async ({ projectId, environment }) => { await new Promise((resolve) => setTimeout(resolve, lookupDelayMs)); return environment === 'preview' && projectId === PROJECT
      ? [{ bindingId: 'b', name: 'erp', connectionId: CONNECTION, connectorId: 'sankhya' }] : [] },
    readConnectionCredential: async () => sealed,
  }
  const broker = createBroker({ connectors: [{ definition: sankhyaDefinition, adapter: createSankhyaGateway({ origin: fake.origin }) }], store, envelope, observability: connectorRecord().observability })
  const directory = mkdtempSync(join(tmpdir(), 'cx-fetch-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const ports = createHandlerPorts({ directory, broker, ...(limits ? { limits } : {}) })
  const open = async (projectId = PROJECT) => {
    const port = await ports.open(scopeFromArtifactSource({ via: 'PREVIEW', accountId: '55555555-5555-4555-8555-555555555555', projectId }))
    t.after(() => port.close())
    return port
  }
  return { fake, open }
}

test('control: /v1/fetch answers the native read, at the pinned origin', async (t) => {
  const { fake, open } = await setup(t)
  const port = await open()
  const answer = await post(port.socketPath, READ)
  assert.deepEqual(answer.json, { ok: true, status: 200, bytes: ORDER_BYTES, body: EXPECTED_NATIVE_ORDER })
  assert.deepEqual(fake.requests.map((r) => r.path), ['/authenticate', ROUTE])
  assert.deepEqual(fake.requests.map((r) => r.origin), [fake.origin, fake.origin])
})

test('the socket decides the Project, and the body cannot name one', async (t) => {
  const { fake, open } = await setup(t)
  const other = await open(OTHER_PROJECT)
  assert.deepEqual((await post(other.socketPath, READ)).json, { ok: false, code: 'NOT_GRANTED' })
  assert.equal(fake.requests.length, 0)
  const port = await open()
  assert.deepEqual((await post(port.socketPath, { ...READ, projectId: PROJECT })).json, { ok: false, code: 'INPUT_REFUSED', issues: ['/<unrecognized>'] })
  assert.equal(fake.requests.length, 0)
})

test('one budget of 8 per invocation: the 9th fetch is CALL_LIMIT and reaches no vendor', async (t) => {
  const { fake, open } = await setup(t)
  const port = await open()
  for (let index = 0; index < 8; index += 1) assert.equal((await post(port.socketPath, READ)).json.ok, true, `call ${index + 1}`)
  assert.deepEqual((await post(port.socketPath, READ)).json, { ok: false, code: 'CALL_LIMIT' })
  assert.equal(fake.requests.filter((r) => r.path === ROUTE).length, 8)
})

test('a vendor error inside a 2xx reaches the handler as codes only, with no vendor body', async (t) => {
  const { fake, open } = await setup(t)
  fake.mode.service = 'envelope-error'
  const port = await open()
  const answer = await post(port.socketPath, READ)
  assert.deepEqual(answer.json, { ok: false, code: 'PROVIDER_ERROR', status: 200, vendorStatus: '0' })
  assert.equal(answer.text.includes(SECRET_MARKER), false)
})

test('caps: a raw vendor body over 256 KiB, and a serialized answer over the port cap', async (t) => {
  const { fake, open } = await setup(t)
  fake.mode.service = 'oversized'
  const port = await open()
  assert.deepEqual((await post(port.socketPath, READ)).json, { ok: false, code: 'RESPONSE_TOO_LARGE', status: 200 })

  const small = await setup(t, { limits: { bodyBytes: 64 * 1024, calls: 8, concurrent: 2, answerBytes: 256 } })
  const smallPort = await small.open()
  assert.deepEqual((await post(smallPort.socketPath, READ)).json, { ok: false, code: 'RESPONSE_TOO_LARGE' })
  assert.equal(small.fake.requests.filter((r) => r.path === ROUTE).length, 1)
})

test('transport: not JSON and over 64 KiB are INPUT_REFUSED, another path is 404', async (t) => {
  const { fake, open } = await setup(t)
  const port = await open()
  assert.deepEqual((await post(port.socketPath, 'not json')).json, { ok: false, code: 'INPUT_REFUSED' })
  assert.deepEqual((await post(port.socketPath, { ...READ, body: { text: 'x'.repeat(70 * 1024) } })).json, { ok: false, code: 'INPUT_REFUSED' })
  assert.equal(await post(port.socketPath, READ, '/v1/other'), 404)
  assert.equal(fake.requests.length, 0)
})

test('the bearer never reaches the handler', async (t) => {
  const { fake, open } = await setup(t)
  fake.mode.service = 'echo-bearer'
  const port = await open()
  const answer = await post(port.socketPath, READ)
  assert.equal(answer.json.ok, true)
  assert.equal(answer.text.includes('fake-token-'), false)
})

test('a slow vendor ends in PROVIDER_TIMEOUT inside the invocation, and a fetch after the deadline spends no request', async (t) => {
  const { fake, open } = await setup(t, { limits: { invocationMs: 700, marginMs: 100 } })
  fake.mode.service = 'stall'
  const port = await open()
  const started = Date.now()
  assert.deepEqual((await post(port.socketPath, READ)).json, { ok: false, code: 'PROVIDER_TIMEOUT' })
  const elapsed = Date.now() - started
  assert.ok(elapsed >= 400 && elapsed < 700, `the fetch ended at ${elapsed} ms, inside the 700 ms invocation and before the 10 s native deadline`)
  await new Promise((resolve) => setTimeout(resolve, 200))
  const before = fake.requests.length
  assert.deepEqual((await post(port.socketPath, READ)).json, { ok: false, code: 'PROVIDER_TIMEOUT' })
  assert.equal(fake.requests.length, before)
})

test('by default a serialized answer over 256 KiB is RESPONSE_TOO_LARGE', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'cx-fetch-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const broker = { fetch: async () => ({ ok: true, status: 200, bytes: 0, body: 'x'.repeat(300 * 1024) }) }
  const port = await createHandlerPorts({ directory, broker }).open(scopeFromArtifactSource({ via: 'PREVIEW', accountId: '55555555-5555-4555-8555-555555555555', projectId: PROJECT }))
  t.after(() => port.close())
  assert.deepEqual((await post(port.socketPath, READ)).json, { ok: false, code: 'RESPONSE_TOO_LARGE' })
})

test('a binding lookup that outlasts the invocation ends in PROVIDER_TIMEOUT and the vendor sees nothing', async (t) => {
  const { fake, open } = await setup(t, { limits: { invocationMs: 300, marginMs: 80 }, lookupDelayMs: 450 })
  const port = await open()
  const started = Date.now()
  assert.deepEqual((await post(port.socketPath, READ)).json, { ok: false, code: 'PROVIDER_TIMEOUT' })
  assert.ok(Date.now() - started < 400, 'the answer comes at the deadline, not after the lookup')
  await new Promise((resolve) => setTimeout(resolve, 300))
  assert.deepEqual(fake.requests, [])
})
