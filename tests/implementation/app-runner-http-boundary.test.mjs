import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import test from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'

const { createApplicationRunnerApp } = await import(hubModuleUrl('app-runner/http.js'))
const { createApplicationRunnerClient } = await import(hubModuleUrl('app-runner/module.js'))
const { createHttpApp } = await import(hubModuleUrl('http/app.js'))
const { routes } = await import(hubModuleUrl('http/access.js'))

const projectId = '11111111-1111-4111-8111-111111111111'
const input = { projectId, operation: 'listNotes', input: {}, files: [{ path: 'conexus-server/manifest.json', sha256: 'a'.repeat(64), content: 'e30=' }], caller: { accountId: '22222222-2222-4222-8222-222222222222', email: null, displayName: 'Synthetic' } }
const matrix = [
  ['json', 400, 'REQUEST_JSON_INVALID', '{"PRIVATE_MARKER":', 'application/json'],
  ['size', 413, 'REQUEST_BODY_TOO_LARGE', JSON.stringify({ padding: 'x'.repeat(16 * 1024 * 1024) }), 'application/json'],
  ['media', 415, 'REQUEST_MEDIA_TYPE_UNSUPPORTED', 'PRIVATE_MARKER', 'application/octet-stream'],
  ['shape', 400, 'RUNNER_REQUEST_REFUSED', '{}', 'application/json'],
  ['native', 500, 'INTERNAL_UNEXPECTED', JSON.stringify(input), 'application/json'],
]

function captureRequestLogs(t, instance) {
  const records = []
  instance.addHook('onRequest', async (request) => {
    for (const level of ['info', 'warn', 'error']) {
      const write = request.log[level].bind(request.log)
      t.mock.method(request.log, level, (fields, message) => {
        records.push({ fields, message })
        return write(fields, message)
      })
    }
  })
  return () => records.splice(0)
}

function runner(t) {
  const instance = createApplicationRunnerApp({
    supervisor: {
      prepare: async () => ({ ok: true, result: { reset: false, applied: [] } }),
      invoke: async () => { throw new Error('PRIVATE_NATIVE_CAUSE') },
      release: async () => {},
    },
    log: () => {},
  })
  t.after(() => instance.close())
  return instance
}

test('native parser and handler refusals use canonical Problems without runner failure logs', async (t) => {
  const instance = runner(t)
  const takeLogs = captureRequestLogs(t, instance)
  for (const [name, status, code, payload, media] of matrix) {
    takeLogs()
    const response = await instance.inject({ method: 'POST', url: '/v1/invoke', headers: { 'content-type': media }, payload })
    assert.equal(response.statusCode, status, name)
    assert.equal(response.headers['content-type'], 'application/problem+json', name)
    assert.deepEqual(response.json(), { type: `urn:conexus:problem:${code}`, title: code, status, code }, name)
    assert.deepEqual(takeLogs(), [], name)
    assert.doesNotMatch(response.body, /PRIVATE_/)
  }
})

test('the actual Hub client preserves parser identity and only final Hub exposure logs it', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'cx-parser-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const socketPath = join(directory, 'runner.sock')
  const instance = runner(t)
  const takeLogs = captureRequestLogs(t, instance)
  let mode = 'native'
  instance.addHook('onRequest', async (request) => {
    if (mode === 'media') request.headers['content-type'] = 'application/octet-stream'
  })
  instance.addHook('preParsing', async (request, _reply, payload) => {
    if (mode !== 'json') return payload
    const broken = '{"PRIVATE_MARKER":'
    request.headers['content-length'] = String(Buffer.byteLength(broken))
    payload.resume()
    return Readable.from([broken])
  })
  await instance.listen({ path: socketPath })
  const client = createApplicationRunnerClient(socketPath)
  let takeHubLogs
  const hub = await createHttpApp({ policy: { listener: 'hub' }, registerRoutes: async (app) => {
    takeHubLogs = captureRequestLogs(t, app)
    routes(app).navigation({ url: '/invoke', handler: () => client.invoke(mode === 'shape' ? {} : mode === 'size' ? { ...input, input: { padding: 'x'.repeat(16 * 1024 * 1024) } } : input) })
    return ['/invoke']
  } })
  t.after(() => hub.close())
  for (const [name, status, code] of matrix) {
    mode = name
    takeHubLogs()
    await assert.rejects(client.invoke(mode === 'shape' ? {} : mode === 'size' ? { ...input, input: { padding: 'x'.repeat(16 * 1024 * 1024) } } : input), (error) => error.id === code)
    assert.deepEqual(takeLogs(), [], name)
    const response = await hub.inject('/invoke')
    assert.equal(response.statusCode, status, name)
    assert.equal(response.json().code, code, name)
    assert.deepEqual(takeHubLogs().map((line) => line.message), [code], name)
  }
})
