import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { failureHttpScript } from './error-model-http-fixture.mjs'
import { hubModuleUrl } from './hub-build.mjs'
import { jsonLines, runWithTelemetry, startCollector } from './telemetry-harness.mjs'

function protobufFields(bytes) {
  const fields = []
  let offset = 0
  function varint() {
    let value = 0
    let multiplier = 1
    let byte
    do {
      byte = bytes[offset++]
      value += (byte & 127) * multiplier
      multiplier *= 128
    } while (byte & 128)
    return value
  }
  while (offset < bytes.length) {
    const tag = varint()
    const field = Math.floor(tag / 8)
    switch (tag & 7) {
      case 0: fields.push([field, varint()]); break
      case 1: offset += 8; break
      case 2: {
        const length = varint()
        fields.push([field, bytes.subarray(offset, offset + length)])
        offset += length
        break
      }
      case 5: offset += 4; break
      default: throw new Error('Unsupported OTLP wire type')
    }
  }
  return fields
}

function exportedRequestSpans(bodies) {
  const resources = bodies.flatMap((body) => protobufFields(body).filter(([field]) => field === 1).map(([, value]) => value))
  const scopes = resources.flatMap((resource) => protobufFields(resource).filter(([field]) => field === 2).map(([, value]) => value))
  const spans = scopes.flatMap((scope) => protobufFields(scope).filter(([field]) => field === 2).map(([, value]) => protobufFields(value)))
  return spans.filter((span) => span.some(([field, value]) => field === 5 && value.toString() === 'request'))
    .map((span) => Object.fromEntries(span.filter(([field]) => field === 9).map(([, value]) => {
      const attribute = protobufFields(value)
      const key = attribute.find(([field]) => field === 1)[1].toString()
      const encoded = attribute.find(([field]) => field === 2)[1]
      const [kind, data] = protobufFields(encoded)[0]
      return [key, kind === 1 ? data.toString() : data]
    })))
}

test('real Hub and mounted Mastra sockets preserve failure status, headers, single failure log and request span', async () => {
  const collector = await startCollector()
  try {
    const result = await runWithTelemetry(failureHttpScript({ network: true }), { endpoint: collector.endpoint })
    assert.equal(result.code, 0, result.stderr)
    const records = jsonLines(result.stdout)
    const { report, onSend, onErrorCalls } = records.find((record) => record.report)
    const spans = exportedRequestSpans(collector.bodies('/v1/traces'))
    const expected = [
      ['project refusal', '/project', 404, 'PROJECT_NOT_FOUND'],
      ['native query validation', '/native-query?count=invalid', 400, 'REQUEST_VALIDATION_FAILED'],
      ['native path validation', '/native-path/not-a-uuid', 400, 'REQUEST_VALIDATION_FAILED'],
      ['root async Failure', '/root-async', 500, 'INTERNAL_UNEXPECTED'],
      ['root sync Failure', '/root-sync', 404, 'NOT_FOUND'],
      ['plain Error', '/vendor', 500, 'INTERNAL_UNEXPECTED'],
      ['scoped route', '/scoped/route', 404, 'NOT_FOUND'],
      ['onRequest hook', '/scoped/hook', 404, 'NOT_FOUND'],
      ['unknown route', '/nowhere', 404, 'NOT_FOUND'],
      ['invalid body', '/validated', 400, 'REQUEST_VALIDATION_FAILED'],
      ['malformed JSON', '/validated', 400, 'REQUEST_JSON_INVALID'],
      ['unsupported media type', '/validated', 415, 'REQUEST_MEDIA_TYPE_UNSUPPORTED'],
      ['mount invalid body', '/api/builder/agent-controller/conexus-builder/sessions/project:33333333-3333-4333-8333-333333333333/model?sessionScope=conversation:77777777-7777-4777-8777-777777777777', 400, 'REQUEST_VALIDATION_FAILED'],
      ['mount plain Error', '/api/builder/agent-controller/conexus-builder/sessions/project:33333333-3333-4333-8333-333333333333/threads?sessionScope=conversation:77777777-7777-4777-8777-777777777777', 500, 'INTERNAL_UNEXPECTED'],
    ]
    assert.deepEqual(onSend, expected.map(([, url, status]) => [url, status]))
    assert.deepEqual(spans.map((span) => [span['http.route'] ?? null, span['http.response.status_code']]), expected.map(([, url, status]) => [url === '/nowhere' ? null : url.startsWith('/native-query') ? '/native-query' : url.startsWith('/native-path') ? '/native-path/:id' : url.startsWith('/api/builder') ? `/api/builder/agent-controller/:controllerId/sessions/:resourceId/${url.includes('/model?') ? 'model' : 'threads'}` : url, status]))
    for (const [name, , status, code] of expected) {
      const [wireStatus, contentType, text, headers] = report[name]
      const body = JSON.parse(text)
      assert.equal(wireStatus, status, name)
      assert.deepEqual({ type: body.type, title: body.title, status: body.status, code: body.code }, { type: `urn:conexus:problem:${code}`, title: code, status, code }, name)
      // U5 flips the mounted validation baseline to problem+json per wire-contract §5.
      assert.equal(contentType, name === 'mount invalid body' || name.startsWith('native ') ? 'application/json; charset=utf-8' : name === 'mount plain Error' ? 'application/problem+json' : 'application/problem+json; charset=utf-8', name)
      assert.equal(headers['x-content-type-options'], 'nosniff', name)
      assert.equal(headers['referrer-policy'], 'strict-origin', name)
      assert.equal(headers['content-security-policy'].replaceAll(/'nonce-[^']+'/g, "'nonce'"), "default-src 'self';base-uri 'self';font-src 'self' https: data:;form-action 'self';frame-ancestors 'self';img-src 'self' data:;object-src 'none';script-src 'self' 'nonce';script-src-attr 'none';style-src 'self' 'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=' 'sha256-kLmvWqfziFavKtqHqRsb90f006UAK2Dmd0It5Iz2KFA=' 'sha256-StEaX+se6YS7pqjzrzMIA0KaX9zF/8zAhvQXZAe5epY=' 'nonce';upgrade-insecure-requests;style-src-attr 'unsafe-inline'", name)
      assert.equal(text.includes('PLANTED_VENDOR_TEXT'), false, name)
      if (code === 'INTERNAL_UNEXPECTED') assert.match(body.traceId, /^[0-9a-f]{32}$/, name)
      else assert.equal(body.traceId, undefined, name)
      const from = records.findIndex((record) => record.msg === `CASE ${name}`)
      const rest = records.slice(from + 1)
      const end = rest.findIndex((record) => record.msg?.startsWith('CASE '))
      assert.deepEqual(rest.slice(0, end).filter((record) => record.msg).map((record) => record.msg), [code], name)
    }
    assert.deepEqual(onErrorCalls, [])
  } finally { await collector.close() }
})

async function invokeWorker(t, source) {
  const directory = await mkdtemp(join(tmpdir(), 'conexus-error-model-worker-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const module = join(directory, 'handler.mjs')
  await writeFile(module, source)
  const job = { kind: 'invoke', login: { host: '/nonexistent/conexus-pin-socket', user: 'p_none_runtime', database: 'conexus_apps' }, module, export: 'handler', input: {}, caller: { accountId: '44444444-4444-4444-8444-444444444444', email: null, displayName: 'Synthetic' }, responseLimit: 1024, connector: false }
  const worker = spawn(process.execPath, [fileURLToPath(hubModuleUrl('app-runner/worker.js'))], { stdio: ['pipe', 'ignore', 'pipe', 'pipe'] })
  t.after(() => { if (worker.exitCode === null) worker.kill() })
  const chunks = []
  let stderr = ''
  worker.stderr.on('data', (chunk) => { stderr += chunk })
  worker.stdio[3].on('data', (chunk) => chunks.push(chunk))
  worker.stdin.end(JSON.stringify(job))
  const [exitCode] = await once(worker, 'close')
  assert.equal(exitCode, 0, stderr)
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

test('real worker fd 3 pins success, load/export/serialization failure and old private detail exposure', async (t) => {
  assert.deepEqual(await invokeWorker(t, 'export function handler() { return { count: 1 } }'), { ok: true, value: { count: 1 } })
  assert.deepEqual(await invokeWorker(t, 'export function handler() {}'), { ok: true, value: null })
  assert.deepEqual(await invokeWorker(t, 'export function handler() { throw new Error("PRIVATE_WORKER_MARKER") }'), { ok: false, code: 'HANDLER_FAILED', detail: 'PRIVATE_WORKER_MARKER' })
  // U4 removes diagnostic text from fd 3; U5/U6 remove it from HTTP and browser carriers.
  assert.deepEqual(await invokeWorker(t, 'throw new Error("PRIVATE_LOAD_MARKER")'), { ok: false, code: 'HANDLER_LOAD_FAILED', detail: 'PRIVATE_LOAD_MARKER' })
  assert.deepEqual(await invokeWorker(t, 'export const handler = 1'), { ok: false, code: 'HANDLER_EXPORT_MISSING', detail: 'handler' })
  assert.deepEqual(await invokeWorker(t, 'export function handler() { return 1n }'), { ok: false, code: 'HANDLER_OUTPUT_UNSERIALIZABLE', detail: 'Do not know how to serialize a BigInt' })
  assert.deepEqual(await invokeWorker(t, 'export function handler() { return "x".repeat(1024) }'), { ok: false, code: 'RESPONSE_TOO_LARGE' })
})

const { createApplicationRunnerApp } = await import(hubModuleUrl('app-runner/http.js'))
const { createApplicationRunnerClient } = await import(hubModuleUrl('app-runner/module.js'))
const { failureProblem } = await import(hubModuleUrl('http/problem.js'))
const { Failure } = await import(hubModuleUrl('platform/failure.js'))
const { api } = await import('./error-model-client-fixture.mjs')

test('worker failure fixture crosses real runner and Hub transports and reaches the generated client; success remains JSON', async (t) => {
  const worker = await invokeWorker(t, 'export function handler() { throw new Error("PRIVATE_CHAIN_MARKER") }')
  assert.deepEqual(worker, { ok: false, code: 'HANDLER_FAILED', detail: 'PRIVATE_CHAIN_MARKER' })
  const directory = await mkdtemp(join(tmpdir(), 'cx-pin-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const socketPath = join(directory, 'runner.sock')
  // The supervisor boundary is replaced by its old reply; the worker and both HTTP transports run.
  let answer = { status: 500, body: { ...failureProblem(new Failure('HANDLER_FAILED')), detail: worker.detail } }
  const runner = createApplicationRunnerApp({ supervisor: { invoke: async () => answer, prepare: async () => ({ state: 'READY', reset: false, applied: [] }), release: async () => {} }, log: () => {} })
  t.after(() => runner.close())
  await runner.listen({ path: socketPath })
  const client = createApplicationRunnerClient(socketPath)
  const input = { projectId: '11111111-1111-4111-8111-111111111111', operation: 'find', input: {}, files: [{ path: 'conexus-server/manifest.json', content: 'e30=', sha256: 'a'.repeat(64) }], caller: { accountId: '22222222-2222-4222-8222-222222222222', email: null, displayName: 'Synthetic' } }
  const reply = await client.invoke(input)
  assert.deepEqual(reply, { status: 500, body: { type: 'urn:conexus:problem:HANDLER_FAILED', title: 'HANDLER_FAILED', status: 500, code: 'HANDLER_FAILED', detail: 'PRIVATE_CHAIN_MARKER' } })
  // U4–U6 replace this observed end-to-end diagnostic exposure with code-only carriers.
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(reply.body), { status: reply.status }))
  await assert.rejects(api.find({}), { code: 'HANDLER_FAILED', detail: 'PRIVATE_CHAIN_MARKER', message: 'HANDLER_FAILED: PRIVATE_CHAIN_MARKER' })
  answer = { status: 200, body: { count: 1 } }
  assert.deepEqual(await client.invoke(input), { status: 200, body: { count: 1 } })
})
