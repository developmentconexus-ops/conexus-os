import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { EXPECTED_ORDER_22790, FAKE_CREDENTIAL, startFakeGateway } from './connector-fake-gateway.mjs'
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
const READ = 'sankhya.purchase-order.read'
const scope = scopeFromArtifactSource({ via: 'PREVIEW', projectId: PROJECT })

/** One raw POST over a unix socket; resolves the parsed answer or the connection error's code. */
const post = (socketPath, body, path = '/v1/call') => new Promise((resolve) => {
  const payload = Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))
  const outgoing = request({ socketPath, path, method: 'POST', headers: { 'content-type': 'application/json', 'content-length': payload.byteLength } }, (response) => {
    const chunks = []
    response.on('data', (chunk) => chunks.push(chunk))
    response.on('end', () => resolve(response.statusCode === 200 ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : response.statusCode))
  })
  outgoing.on('error', (error) => resolve(error.code))
  outgoing.end(payload)
})

const socketDirectory = (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'cx-port-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  return directory
}

// A broker stand-in that records who asked and can hold calls open.
const recordingBroker = () => {
  const calls = []
  const held = []
  let hold = false
  return {
    calls,
    holdCalls: (value) => { hold = value },
    release: () => { for (const resolve of held.splice(0)) resolve() },
    call: async (consumer, operationId, input) => {
      calls.push({ consumer, operationId, input })
      if (hold) await new Promise((resolve) => held.push(resolve))
      return { ok: true, value: { echoed: operationId } }
    },
  }
}

test('M2: a port is an owner-only socket; close() stops it, unlinks it and a connect then fails', async (t) => {
  const directory = socketDirectory(t)
  const broker = recordingBroker()
  const ports = createHandlerPorts({ directory, broker })
  const port = await ports.open(scope)
  assert.equal(port.socketPath.startsWith(`${directory}/`), true)
  assert.equal(statSync(port.socketPath).isSocket(), true)
  assert.equal(statSync(port.socketPath).mode & 0o777, 0o600)
  assert.deepEqual(await post(port.socketPath, { operation: READ, input: { documentNumber: 1 } }), { ok: true, value: { echoed: READ } })
  assert.equal(broker.calls[0].consumer.kind, 'handler')
  assert.equal(broker.calls[0].consumer.scope, scope)

  broker.holdCalls(true)
  const inFlight = post(port.socketPath, { operation: READ, input: {} })
  await new Promise((resolve) => setTimeout(resolve, 50))
  await port.close()
  assert.equal(await inFlight, 'ECONNRESET')
  assert.equal(existsSync(port.socketPath), false)
  assert.equal(await post(port.socketPath, { operation: READ, input: {} }), 'ENOENT')
  await port.close()
  broker.release()
})

test('M2: the startup sweep empties the directory, stale sockets and files included, and keeps it owner-only', async (t) => {
  const directory = socketDirectory(t)
  const ports = createHandlerPorts({ directory, broker: recordingBroker() })
  const stale = await ports.open(scope)
  writeFileSync(join(directory, 'leftover.s'), 'x')
  await ports.sweep()
  assert.equal(existsSync(stale.socketPath), false)
  assert.equal(existsSync(join(directory, 'leftover.s')), false)
  assert.equal(statSync(directory).mode & 0o777, 0o700)
  await stale.close()
  const fresh = join(directory, 'missing', 'nested')
  await createHandlerPorts({ directory: fresh, broker: recordingBroker() }).sweep()
  assert.equal(statSync(fresh).mode & 0o777, 0o700)
})

test('P6: another Project in the input or in extra body keys never changes the resolved grant', async (t) => {
  const fake = await startFakeGateway()
  t.after(() => fake.close())
  const envelope = createSecretEnvelope('ef'.repeat(32))
  const sealed = await envelope.seal(JSON.stringify(FAKE_CREDENTIAL))
  const resolved = []
  const store = {
    resolveGrant: async (input) => { resolved.push(input.projectId); return input.projectId === PROJECT ? { grantId: 'g', connectionId: CONNECTION } : null },
    readConnectionCredential: async () => sealed,
    listGrantedCapabilities: async () => [],
  }
  const broker = createBroker({ connectors: [{ definition: sankhyaDefinition, adapter: createSankhyaGateway({ origin: fake.origin }) }], store, envelope, audit: () => undefined })
  const port = await createHandlerPorts({ directory: socketDirectory(t), broker }).open(scope)
  t.after(() => port.close())

  assert.deepEqual(await post(port.socketPath, { operation: READ, input: { documentNumber: 22790 } }), { ok: true, value: EXPECTED_ORDER_22790 })
  assert.deepEqual(await post(port.socketPath, { operation: READ, input: { documentNumber: 22790, projectId: OTHER_PROJECT } }), { ok: false, code: 'INPUT_REFUSED', issues: ['/projectId'] })
  for (const extra of [{ projectId: OTHER_PROJECT }, { scope: { projectId: OTHER_PROJECT, environment: 'preview' } }, { environment: 'published' }, { connectionId: CONNECTION }]) {
    assert.deepEqual(await post(port.socketPath, { operation: READ, input: { documentNumber: 22790 }, ...extra }), { ok: false, code: 'INPUT_REFUSED' }, JSON.stringify(extra))
  }
  assert.deepEqual(resolved, [PROJECT])
})

test('the port refuses a body that is not strict JSON of at most 64 KiB, and answers nothing off its one path', async (t) => {
  const broker = recordingBroker()
  const port = await createHandlerPorts({ directory: socketDirectory(t), broker }).open(scope)
  t.after(() => port.close())
  assert.deepEqual(await post(port.socketPath, 'not json'), { ok: false, code: 'INPUT_REFUSED' })
  assert.deepEqual(await post(port.socketPath, { input: {} }), { ok: false, code: 'INPUT_REFUSED' })
  assert.deepEqual(await post(port.socketPath, { operation: READ, input: { text: 'x'.repeat(70 * 1024) } }), { ok: false, code: 'INPUT_REFUSED' })
  assert.equal(await post(port.socketPath, { operation: READ, input: {} }, '/v1/other'), 404)
  assert.equal(broker.calls.length, 0)
})

test('CALL_LIMIT: at most 8 calls and 2 concurrent calls per invocation', async (t) => {
  const directory = socketDirectory(t)
  const broker = recordingBroker()
  const ports = createHandlerPorts({ directory, broker })
  const concurrent = await ports.open(scope)
  t.after(() => concurrent.close())
  broker.holdCalls(true)
  const first = post(concurrent.socketPath, { operation: READ, input: {} })
  const second = post(concurrent.socketPath, { operation: READ, input: {} })
  await new Promise((resolve) => setTimeout(resolve, 50))
  assert.deepEqual(await post(concurrent.socketPath, { operation: READ, input: {} }), { ok: false, code: 'CALL_LIMIT' })
  broker.release()
  assert.deepEqual([await first, await second], [{ ok: true, value: { echoed: READ } }, { ok: true, value: { echoed: READ } }])
  broker.holdCalls(false)

  const sequential = await ports.open(scope)
  t.after(() => sequential.close())
  const answers = []
  for (let index = 0; index < 9; index += 1) answers.push(await post(sequential.socketPath, { operation: READ, input: {} }))
  assert.deepEqual(answers, [...Array(8).fill({ ok: true, value: { echoed: READ } }), { ok: false, code: 'CALL_LIMIT' }])
})
