import assert from 'node:assert/strict'
import test from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'
import { takeHubLogs } from './hub-log-capture.mjs'

const { createApplicationRunnerApp } = await import(hubModuleUrl('app-runner/http.js'))

const fakeSupervisor = (overrides = {}) => ({
  prepare: async () => { throw new Error('SUPERVISOR_PREPARE_NOT_STUBBED') },
  invoke: async () => ({ ok: true, result: { ok: true } }),
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

test('a handled prepare refusal uses private JSON without a failure log', async () => {
  const { instance, failures } = app({ prepare: async () => ({ ok: false, error: { code: 'SERVER_TREE_REFUSED' } }) })
  const response = await instance.inject({ method: 'POST', url: '/v1/prepare', payload: PREPARE_BODY })
  assert.equal(response.statusCode, 200)
  assert.equal(response.headers['content-type'], 'application/json; charset=utf-8')
  assert.deepEqual(JSON.parse(response.body), { ok: false, error: { code: 'SERVER_TREE_REFUSED' } })
  assert.deepEqual(failures(), [])
})

test('a malformed prepare request is refused before the supervisor is ever called and does not create a runner failure log', async () => {
  const { instance, failures } = app()
  const response = await instance.inject({ method: 'POST', url: '/v1/prepare', payload: { projectId: 'not-a-uuid', files: [], onDivergence: 'REFUSE' } })
  assert.equal(response.statusCode, 400)
  assert.equal(JSON.parse(response.body).code, 'RUNNER_REQUEST_REFUSED')
  assert.deepEqual(failures(), [])
})

test('an admission refusal carries only its code in the private answer', async () => {
  const { instance, failures } = app({ prepare: async () => ({ ok: false, error: { code: 'MANIFEST_REFUSED' } }) })
  const response = await instance.inject({ method: 'POST', url: '/v1/prepare', payload: PREPARE_BODY })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(JSON.parse(response.body), { ok: false, error: { code: 'MANIFEST_REFUSED' } })
  assert.deepEqual(failures(), [])
})

test('an escaping platform fault during prepare becomes a Problem without a duplicate runner failure log', async () => {
  const { instance, failures } = app({ prepare: async () => { throw new Error('connection terminated unexpectedly') } })
  const response = await instance.inject({ method: 'POST', url: '/v1/prepare', payload: PREPARE_BODY })
  assert.equal(response.statusCode, 500)
  assert.equal(JSON.parse(response.body).code, 'INTERNAL_UNEXPECTED')
  assert.deepEqual(failures(), [])
})

test('a handled invoke refusal answers privately and logs only its code, never SQLSTATE', async () => {
  const { instance, logged, failures } = app({ invoke: async () => ({ ok: false, error: { code: 'HANDLER_FAILED', sqlstate: '23505' } }) })
  const response = await instance.inject({ method: 'POST', url: '/v1/invoke', payload: INVOKE_BODY })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(JSON.parse(response.body), { ok: false, error: { code: 'HANDLER_FAILED', sqlstate: '23505' } })
  const [line] = logged()
  assert.equal(line.event, 'RUNNER_INVOKE')
  assert.equal(line.code, 'HANDLER_FAILED')
  assert.equal(line.status, 200)
  assert.equal(JSON.stringify(line).includes('23505'), false)
  assert.deepEqual(failures(), [])
})

test('an output refusal carries and logs its structured pointer and rule', async () => {
  const { instance, logged } = app({ invoke: async () => ({ ok: false, error: { code: 'HANDLER_OUTPUT_REFUSED', violation: { pointer: '/items/3/price', rule: 'expected string' } } }) })
  const response = await instance.inject({ method: 'POST', url: '/v1/invoke', payload: INVOKE_BODY })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(JSON.parse(response.body), { ok: false, error: { code: 'HANDLER_OUTPUT_REFUSED', violation: { pointer: '/items/3/price', rule: 'expected string' } } })
  const [line] = logged()
  assert.deepEqual({ ...line, ms: 0 }, { event: 'RUNNER_INVOKE', projectId: INVOKE_BODY.projectId, operation: 'listOpenTitles', status: 200, code: 'HANDLER_OUTPUT_REFUSED', pointer: '/items/3/price', rule: 'expected string', ms: 0 })
})

test('a successful invoke logs its status with no error code', async () => {
  const { instance, logged } = app()
  const response = await instance.inject({ method: 'POST', url: '/v1/invoke', payload: INVOKE_BODY })
  assert.equal(response.statusCode, 200)
  const [line] = logged()
  assert.equal(line.status, 200)
  assert.equal('code' in line, false)
})

test('a release refusal is answered as a row without a duplicate runner failure log', async () => {
  const { instance, failures } = app({ release: async () => { throw new Error('RELEASE_REFUSED_BY_PROVISIONER') } })
  const response = await instance.inject({ method: 'POST', url: '/v1/release', payload: { projectId: PREPARE_BODY.projectId } })
  assert.equal(response.statusCode, 500)
  assert.equal(JSON.parse(response.body).code, 'INTERNAL_UNEXPECTED')
  assert.deepEqual(failures(), [])
})
