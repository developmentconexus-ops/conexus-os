import assert from 'node:assert/strict'
import test from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'
import { takeHubLogs } from './hub-log-capture.mjs'

const { createApplicationRunnerApp } = await import(hubModuleUrl('app-runner/http.js'))

const fakeSupervisor = (overrides = {}) => ({
  preparePreview: async () => { throw new Error('SUPERVISOR_PREPARE_NOT_STUBBED') },
  invoke: async () => ({ ok: true, result: { ok: true } }),
  disposePreview: async () => {},
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
const INVOKE_BODY = { projectId: '11111111-1111-4111-8111-111111111111', kind: 'PREVIEW', operation: 'listOpenTitles', input: {}, files: PREPARE_BODY.files, caller: { accountId: '22222222-2222-4222-8222-222222222222', email: null, displayName: 'Ana' } }

test('a handled prepare refusal uses private JSON without a failure log', async () => {
  const { instance, failures } = app({ preparePreview: async () => ({ ok: false, error: { code: 'SERVER_TREE_REFUSED' } }) })
  const response = await instance.inject({ method: 'POST', url: '/v1/prepare-preview', payload: PREPARE_BODY })
  assert.equal(response.statusCode, 200)
  assert.equal(response.headers['content-type'], 'application/json; charset=utf-8')
  assert.deepEqual(JSON.parse(response.body), { ok: false, error: { code: 'SERVER_TREE_REFUSED' } })
  assert.deepEqual(failures(), [])
})

test('a malformed prepare request is refused before the supervisor is ever called and does not create a runner failure log', async () => {
  const { instance, failures } = app()
  const response = await instance.inject({ method: 'POST', url: '/v1/prepare-preview', payload: { projectId: 'not-a-uuid', files: [], onDivergence: 'REFUSE' } })
  assert.equal(response.statusCode, 400)
  assert.equal(JSON.parse(response.body).code, 'RUNNER_REQUEST_REFUSED')
  assert.deepEqual(failures(), [])
})

test('an admission refusal carries only its code in the private answer', async () => {
  const { instance, failures } = app({ preparePreview: async () => ({ ok: false, error: { code: 'MANIFEST_REFUSED' } }) })
  const response = await instance.inject({ method: 'POST', url: '/v1/prepare-preview', payload: PREPARE_BODY })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(JSON.parse(response.body), { ok: false, error: { code: 'MANIFEST_REFUSED' } })
  assert.deepEqual(failures(), [])
})

test('an escaping platform fault during prepare becomes a Problem without a duplicate runner failure log', async () => {
  const { instance, failures } = app({ preparePreview: async () => { throw new Error('connection terminated unexpectedly') } })
  const response = await instance.inject({ method: 'POST', url: '/v1/prepare-preview', payload: PREPARE_BODY })
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
  const { instance, failures } = app({ disposePreview: async () => { throw new Error('RELEASE_REFUSED_BY_PROVISIONER') } })
  const response = await instance.inject({ method: 'POST', url: '/v1/dispose-preview', payload: { projectId: PREPARE_BODY.projectId } })
  assert.equal(response.statusCode, 500)
  assert.equal(JSON.parse(response.body).code, 'INTERNAL_UNEXPECTED')
  assert.deepEqual(failures(), [])
})

test('an invoke without an owner-selected domain, with a forged domain or with supplied coordinates is refused before supervisor work', async () => {
  let calls = 0
  const { instance } = app({ invoke: async () => { calls += 1; return { ok: true, result: {} } } })
  const { kind: _kind, ...missingDomain } = INVOKE_BODY
  for (const payload of [missingDomain, { ...INVOKE_BODY, kind: 'preview' }, { ...INVOKE_BODY, kind: 'PRODUCTION' }, { ...INVOKE_BODY, schema: 'p_foreign_preview' }]) {
    const response = await instance.inject({ method: 'POST', url: '/v1/invoke', payload })
    assert.deepEqual([response.statusCode, response.json().code, calls], [400, 'RUNNER_REQUEST_REFUSED', 0])
  }
  for (const kind of ['PREVIEW', 'PUBLISHED']) {
    const response = await instance.inject({ method: 'POST', url: '/v1/invoke', payload: { ...INVOKE_BODY, kind } })
    assert.equal(response.statusCode, 200)
  }
  assert.equal(calls, 2)
})

test('Published cannot enter Preview preparation or disposal, and obsolete generic endpoints are absent', async () => {
  let calls = 0
  const { instance } = app({ preparePreview: async () => { calls += 1; return { ok: true, result: { reset: false, applied: [] } } }, disposePreview: async () => { calls += 1 } })
  for (const [url, payload] of [['/v1/prepare-preview', { ...PREPARE_BODY, kind: 'PUBLISHED' }], ['/v1/dispose-preview', { projectId: PREPARE_BODY.projectId, kind: 'PUBLISHED' }]]) {
    const response = await instance.inject({ method: 'POST', url, payload })
    assert.deepEqual([response.statusCode, response.json().code, calls], [400, 'RUNNER_REQUEST_REFUSED', 0])
  }
  for (const url of ['/v1/prepare', '/v1/release']) {
    const response = await instance.inject({ method: 'POST', url, payload: PREPARE_BODY })
    assert.equal(response.statusCode, 404)
  }
  assert.equal(calls, 0)
})
