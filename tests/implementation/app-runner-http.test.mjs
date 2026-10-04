import assert from 'node:assert/strict'
import test from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'
import { takeHubLogs } from './hub-log-capture.mjs'

const { createApplicationRunnerApp } = await import(hubModuleUrl('app-runner/http.js'))

const fakeSupervisor = (overrides = {}) => ({
  prepare: async () => { throw new Error('SUPERVISOR_PREPARE_NOT_STUBBED') },
  invoke: async () => ({ status: 200, body: { ok: true } }),
  release: async () => {},
  ...overrides,
})

const app = (overrides) => {
  const events = []
  takeHubLogs()
  const instance = createApplicationRunnerApp({ supervisor: fakeSupervisor(overrides), log: (code, fields) => events.push({ event: code, ...fields }) })
  return { instance, events, logged: () => events, failures: () => takeHubLogs().map(({ level, message, fields }) => ({ level, message, ...fields })) }
}

const PREPARE_BODY = {
  projectId: '11111111-1111-4111-8111-111111111111',
  files: [{ path: 'conexus-server/manifest.json', sha256: 'a'.repeat(64), content: 'e30=' }],
  onDivergence: 'REFUSE',
}
const INVOKE_BODY = { projectId: '11111111-1111-4111-8111-111111111111', operation: 'listOpenTitles', input: {}, files: PREPARE_BODY.files, caller: { accountId: '22222222-2222-4222-8222-222222222222', email: null, displayName: 'Ana' } }

test('a prepare refusal is logged once, as its row', async () => {
  const { instance, failures } = app({ prepare: async () => { throw new Error('SERVER_TREE_REFUSED') } })
  const response = await instance.inject({ method: 'POST', url: '/v1/prepare', payload: PREPARE_BODY })
  assert.equal(response.statusCode, 500)
  assert.equal(response.headers['content-type'], 'application/problem+json; charset=utf-8')
  assert.deepEqual(JSON.parse(response.body), { type: 'urn:conexus:problem:SERVER_TREE_REFUSED', title: 'SERVER_TREE_REFUSED', status: 500, code: 'SERVER_TREE_REFUSED', detail: 'SERVER_TREE_REFUSED' })
  assert.deepEqual(failures().map(({ level, message }) => [level, message]), [['info', 'SERVER_TREE_REFUSED']])
})

test('a malformed prepare request is refused and logged before the supervisor is ever called', async () => {
  const { instance, failures } = app()
  const response = await instance.inject({ method: 'POST', url: '/v1/prepare', payload: { projectId: 'not-a-uuid', files: [], onDivergence: 'REFUSE' } })
  assert.equal(response.statusCode, 400)
  assert.equal(JSON.parse(response.body).code, 'RUNNER_REQUEST_REFUSED')
  assert.deepEqual(failures().map(({ level, message }) => [level, message]), [['error', 'RUNNER_REQUEST_REFUSED']])
})

test('a manifest refusal is logged with its full reason, not just the code', async () => {
  const detail = 'MANIFEST_REFUSED: operations.x: unknown key "format"'
  const { instance, failures } = app({ prepare: async () => { throw new Error(detail) } })
  const response = await instance.inject({ method: 'POST', url: '/v1/prepare', payload: PREPARE_BODY })
  assert.equal(response.statusCode, 500)
  assert.deepEqual([JSON.parse(response.body).code, JSON.parse(response.body).detail], ['MANIFEST_REFUSED', detail])
  assert.deepEqual(failures().map((line) => [line.message, line['failure.detail']]), [['MANIFEST_REFUSED', detail]])
})

test('a platform fault during prepare still gets one log line, which main.ts never wrote before', async () => {
  const { instance, failures } = app({ prepare: async () => { throw new Error('connection terminated unexpectedly') } })
  const response = await instance.inject({ method: 'POST', url: '/v1/prepare', payload: PREPARE_BODY })
  assert.equal(response.statusCode, 500)
  assert.equal(JSON.parse(response.body).code, 'INTERNAL_UNEXPECTED')
  assert.deepEqual(failures().map(({ level, message }) => [level, message]), [['error', 'INTERNAL_UNEXPECTED']])
})

test('an invoke failure logs its error code, never the thrown message, which can carry a vendor value', async () => {
  const vendorDetail = 'Tipo RECDESP inesperado no título NUFIN 123456: 2'
  const { instance, logged } = app({ invoke: async () => ({ status: 500, body: { code: 'HANDLER_FAILED', detail: vendorDetail } }) })
  const response = await instance.inject({ method: 'POST', url: '/v1/invoke', payload: INVOKE_BODY })
  assert.equal(response.statusCode, 500)
  assert.equal(JSON.parse(response.body).detail, vendorDetail)
  const [line] = logged()
  assert.equal(line.event, 'RUNNER_INVOKE')
  assert.equal(line.code, 'HANDLER_FAILED')
  assert.equal(JSON.stringify(line).includes('NUFIN'), false)
  assert.equal(JSON.stringify(line).includes(vendorDetail), false)
})

test('an output refusal is logged with the runner\'s own pointer and rule', async () => {
  const detail = '/items/3/price: expected string'
  const { instance, logged } = app({ invoke: async () => ({ status: 502, body: { code: 'HANDLER_OUTPUT_REFUSED', detail } }) })
  const response = await instance.inject({ method: 'POST', url: '/v1/invoke', payload: INVOKE_BODY })
  assert.equal(response.statusCode, 502)
  const [line] = logged()
  assert.deepEqual({ ...line, ms: 0 }, { event: 'RUNNER_INVOKE', projectId: INVOKE_BODY.projectId, operation: 'listOpenTitles', status: 502, code: 'HANDLER_OUTPUT_REFUSED', detail, ms: 0 })
})

test('a successful invoke logs its status with no error code', async () => {
  const { instance, logged } = app()
  const response = await instance.inject({ method: 'POST', url: '/v1/invoke', payload: INVOKE_BODY })
  assert.equal(response.statusCode, 200)
  const [line] = logged()
  assert.equal(line.status, 200)
  assert.equal('code' in line, false)
})

test('a release refusal is answered as a row and logged once', async () => {
  const { instance, failures } = app({ release: async () => { throw new Error('RELEASE_REFUSED_BY_PROVISIONER') } })
  const response = await instance.inject({ method: 'POST', url: '/v1/release', payload: { projectId: PREPARE_BODY.projectId } })
  assert.equal(response.statusCode, 500)
  assert.equal(JSON.parse(response.body).code, 'INTERNAL_UNEXPECTED')
  assert.deepEqual(failures().map(({ message }) => message), ['INTERNAL_UNEXPECTED'])
})
