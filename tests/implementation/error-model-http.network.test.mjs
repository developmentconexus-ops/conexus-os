import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { request } from 'node:http'
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
    .map((span) => ({
      traceId: span.find(([field]) => field === 1)?.[1].toString('hex'),
      spanId: span.find(([field]) => field === 2)?.[1].toString('hex'),
      ...Object.fromEntries(span.filter(([field]) => field === 9).map(([, value]) => {
      const attribute = protobufFields(value)
      const key = attribute.find(([field]) => field === 1)[1].toString()
      const encoded = attribute.find(([field]) => field === 2)[1]
      const [kind, data] = protobufFields(encoded)[0]
      return [key, kind === 1 ? data.toString() : data]
      })),
    }))
}

function exportedExceptionEvents(bodies) {
  const resources = bodies.flatMap((body) => protobufFields(body).filter(([field]) => field === 1).map(([, value]) => value))
  const scopes = resources.flatMap((resource) => protobufFields(resource).filter(([field]) => field === 2).map(([, value]) => value))
  const spans = scopes.flatMap((scope) => protobufFields(scope).filter(([field]) => field === 2).map(([, value]) => protobufFields(value)))
  return spans.flatMap((span) => span.filter(([field]) => field === 11).map(([, value]) => {
    const event = protobufFields(value)
    const attributes = Object.fromEntries(event.filter(([field]) => field === 3).map(([, attributeValue]) => {
      const attribute = protobufFields(attributeValue)
      const key = attribute.find(([field]) => field === 1)[1].toString()
      const encoded = attribute.find(([field]) => field === 2)[1]
      const [kind, data] = protobufFields(encoded)[0]
      return [key, kind === 1 ? data.toString() : data]
    }))
    return {
      traceId: span.find(([field]) => field === 1)?.[1].toString('hex'),
      spanId: span.find(([field]) => field === 2)?.[1].toString('hex'),
      name: event.find(([field]) => field === 2)?.[1].toString(),
      attributes,
    }
  }))
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
      ['HEAD refusal', '/head-failure', 404, 'NOT_FOUND'],
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
      const body = name === 'HEAD refusal' ? null : JSON.parse(text)
      if (body === null) assert.equal(text, '', name)
      assert.equal(wireStatus, status, name)
      if (body !== null) assert.deepEqual({ type: body.type, title: body.title, status: body.status, code: body.code }, { type: `urn:conexus:problem:${code}`, title: code, status, code }, name)
      assert.equal(contentType, 'application/problem+json', name)
      assert.equal(headers['x-content-type-options'], 'nosniff', name)
      assert.equal(headers['referrer-policy'], 'strict-origin', name)
      assert.equal(headers['content-security-policy'].replaceAll(/'nonce-[^']+'/g, "'nonce'"), "default-src 'self';base-uri 'self';font-src 'self' https: data:;form-action 'self';frame-ancestors 'self';img-src 'self' data:;object-src 'none';script-src 'self' 'nonce';script-src-attr 'none';style-src 'self' 'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=' 'sha256-kLmvWqfziFavKtqHqRsb90f006UAK2Dmd0It5Iz2KFA=' 'sha256-StEaX+se6YS7pqjzrzMIA0KaX9zF/8zAhvQXZAe5epY=' 'nonce';upgrade-insecure-requests;style-src-attr 'unsafe-inline'", name)
      assert.equal(text.includes('PLANTED_VENDOR_TEXT'), false, name)
      if (code === 'INTERNAL_UNEXPECTED') {
        assert.match(body.traceId, /^[0-9a-f]{32}$/, name)
        const route = name === 'mount plain Error' ? '/api/builder/agent-controller/:controllerId/sessions/:resourceId/threads' : name === 'root async Failure' ? '/root-async' : '/vendor'
        assert.equal(spans.find((span) => span['http.route'] === route)?.traceId, body.traceId, name)
        assert.equal(restFailureLine(records, name, code)?.trace_id, body.traceId, name)
      }
      else if (body !== null) assert.equal(body.traceId, undefined, name)
      const from = records.findIndex((record) => record.msg === `CASE ${name}`)
      const rest = records.slice(from + 1)
      const end = rest.findIndex((record) => record.msg?.startsWith('CASE '))
      assert.deepEqual(rest.slice(0, end).filter((record) => record.msg).map((record) => record.msg), [code], name)
    }
    assert.deepEqual(onErrorCalls, [])
  } finally { await collector.close() }
})

function restFailureLine(records, name, code) {
  const from = records.findIndex((record) => record.msg === `CASE ${name}`)
  const rest = records.slice(from + 1)
  const end = rest.findIndex((record) => record.msg?.startsWith('CASE '))
  return rest.slice(0, end).find((record) => record.msg === code)
}

function caseFailureLines(records, name) {
  const from = records.findIndex((record) => record.msg === `CASE ${name}`)
  const rest = records.slice(from + 1)
  const end = rest.findIndex((record) => record.msg?.startsWith('CASE '))
  return rest.slice(0, end).filter((record) => record.msg).map((record) => record.msg)
}

test('a native runner fault keeps redacted cause frames and joins the Hub log and public trace', async () => {
  const collector = await startCollector()
  try {
    const result = await runWithTelemetry(failureHttpScript({ network: true, runner: true }), { endpoint: collector.endpoint })
    assert.equal(result.code, 0, result.stderr)
    const records = jsonLines(result.stdout)
    const { report, runnerLogs, runnerContexts, hubInvokeContexts } = records.find((record) => record.report)
    const [status, contentType, text] = report['native runner escape']
    const body = JSON.parse(text)
    const spans = exportedRequestSpans(collector.bodies('/v1/traces'))
    const hubSpan = spans.find((span) => span['http.route'] === '/runner-native-error')
    const runnerSpan = spans.find((span) => span['http.route'] === '/v1/invoke')
    const event = exportedExceptionEvents(collector.bodies('/v1/traces')).find((item) => item.traceId === runnerSpan?.traceId)
    const hubLog = restFailureLine(records, 'native runner escape', 'INTERNAL_UNEXPECTED')
    assert.deepEqual([status, contentType, body.type, body.title, body.status, body.code], [500, 'application/problem+json', 'urn:conexus:problem:INTERNAL_UNEXPECTED', 'INTERNAL_UNEXPECTED', 500, 'INTERNAL_UNEXPECTED'])
    assert.equal(hubSpan?.traceId, body.traceId)
    assert.equal(hubInvokeContexts[0], body.traceId)
    assert.match(runnerContexts[0]?.traceparent ?? '', new RegExp(`^00-${body.traceId}-[0-9a-f]{16}-01$`))
    assert.equal(runnerSpan?.traceId, body.traceId, 'runner request stays on the public trace')
    assert.equal(hubLog?.trace_id, body.traceId)
    assert.deepEqual(caseFailureLines(records, 'native runner escape'), ['INTERNAL_UNEXPECTED'])
    assert.deepEqual(runnerLogs, [])
    assert.equal(event?.name, 'exception')
    assert.equal(event?.traceId, body.traceId)
    assert.equal(event?.attributes['exception.type'], 'Error')
    assert.match(event?.attributes['exception.stacktrace'], /at /)
    assert.equal('exception.message' in (event?.attributes ?? {}), false)
    assert.doesNotMatch(collector.everything().toString('utf8'), /PRIVATE_RUNNER_CAUSE/)
    assert.doesNotMatch(text, /PRIVATE_RUNNER_CAUSE/)
    const [hostStatus, hostContentType, hostText, hostHeaders] = report['native hosting escape']
    const hostBody = JSON.parse(hostText)
    assert.deepEqual([hostStatus, hostContentType, hostBody.code, hostBody.status], [500, 'application/problem+json', 'INTERNAL_UNEXPECTED', 500])
    assert.equal(hostHeaders['x-content-type-options'], 'nosniff')
    assert.match(hostHeaders['content-security-policy'], /frame-ancestors 'none'/)
    assert.deepEqual(caseFailureLines(records, 'native hosting escape'), ['INTERNAL_UNEXPECTED'])
    const hostLog = restFailureLine(records, 'native hosting escape', 'INTERNAL_UNEXPECTED')
    const hostSpan = spans.find((span) => span['http.route'] === '/__conexus/api/:operation')
    assert.equal(hostSpan?.traceId, hostBody.traceId)
    assert.equal(hostSpan?.['http.response.status_code'], 500)
    assert.equal(hostLog?.trace_id, hostBody.traceId)
    assert.match(runnerContexts[1]?.traceparent ?? '', new RegExp(`^00-${hostBody.traceId}-[0-9a-f]{16}-01$`))
    assert.doesNotMatch(hostText, /PRIVATE_RUNNER_CAUSE/)

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

test('real worker fd 3 pins the strict Result contract without private diagnostics', async (t) => {
  assert.deepEqual(await invokeWorker(t, 'export function handler() { return { count: 1 } }'), { ok: true, result: { count: 1 } })
  assert.deepEqual(await invokeWorker(t, 'export function handler() {}'), { ok: true, result: null })
  assert.deepEqual(await invokeWorker(t, 'export function handler() { throw new Error("PRIVATE_WORKER_MARKER") }'), { ok: false, error: { code: 'HANDLER_FAILED', sqlstate: null } })
  assert.deepEqual(await invokeWorker(t, 'throw new Error("PRIVATE_LOAD_MARKER")'), { ok: false, error: { code: 'HANDLER_LOAD_FAILED', sqlstate: null } })
  assert.deepEqual(await invokeWorker(t, 'export const handler = 1'), { ok: false, error: { code: 'HANDLER_EXPORT_MISSING' } })
  assert.deepEqual(await invokeWorker(t, 'export function handler() { return 1n }'), { ok: false, error: { code: 'HANDLER_OUTPUT_UNSERIALIZABLE' } })
  assert.deepEqual(await invokeWorker(t, 'export function handler() { return "x".repeat(1024) }'), { ok: false, error: { code: 'RESPONSE_TOO_LARGE' } })
})

const { createApplicationRunnerApp } = await import(hubModuleUrl('app-runner/http.js'))
const { createApplicationRunnerClient } = await import(hubModuleUrl('app-runner/module.js'))
test('worker Results cross the real runner and Hub transports without private diagnostics', async (t) => {
  const worker = await invokeWorker(t, 'export function handler() { throw new Error("PRIVATE_CHAIN_MARKER") }')
  assert.deepEqual(worker, { ok: false, error: { code: 'HANDLER_FAILED', sqlstate: null } })
  const directory = await mkdtemp(join(tmpdir(), 'cx-pin-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const socketPath = join(directory, 'runner.sock')
  const runner = createApplicationRunnerApp({ supervisor: { invoke: async () => worker, prepare: async () => ({ ok: true, result: { reset: false, applied: [] } }), release: async () => {} }, log: () => {} })
  t.after(() => runner.close())
  await runner.listen({ path: socketPath })
  const client = createApplicationRunnerClient(socketPath)
  const input = { projectId: '11111111-1111-4111-8111-111111111111', operation: 'find', input: {}, files: [{ path: 'conexus-server/manifest.json', content: 'e30=', sha256: 'a'.repeat(64) }], caller: { accountId: '22222222-2222-4222-8222-222222222222', email: null, displayName: 'Synthetic' } }
  assert.deepEqual(await client.invoke(input), worker)
  const successRunner = createApplicationRunnerApp({ supervisor: { invoke: async () => ({ ok: true, result: { count: 1 } }), prepare: async () => ({ ok: true, result: { reset: false, applied: [] } }), release: async () => {} }, log: () => {} })
  t.after(() => successRunner.close())
  const successSocket = join(directory, 'runner-success.sock')
  await successRunner.listen({ path: successSocket })
  assert.deepEqual(await createApplicationRunnerClient(successSocket).invoke(input), { ok: true, result: { count: 1 } })
})

test('native runner faults and malformed requests cross the real owner socket as table Responses', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'cx-runner-response-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const socketPath = join(directory, 'runner.sock')
  const events = []
  const projectId = '11111111-1111-4111-8111-111111111111'
  const file = { path: 'conexus-server/manifest.json', sha256: 'a'.repeat(64), content: 'e30=' }
  const invoke = { projectId, operation: 'listNotes', input: {}, files: [file], caller: { accountId: '22222222-2222-4222-8222-222222222222', email: null, displayName: 'Synthetic' } }
  const prepare = { projectId, files: [file], onDivergence: 'REFUSE' }
  const runner = createApplicationRunnerApp({
    supervisor: {
      prepare: async () => { throw new Error('PRIVATE_RUNNER_PREPARE_MARKER') },
      invoke: async () => { throw new Error('PRIVATE_RUNNER_INVOKE_MARKER') },
      release: async () => { throw new Error('PRIVATE_RUNNER_RELEASE_MARKER') },
    },
    log: (event) => events.push(event),
  })
  t.after(() => runner.close())
  await runner.listen({ path: socketPath })
  const requestOnSocket = (path, body) => new Promise((resolve, reject) => {
    const outgoing = request({ socketPath, path, method: 'POST', headers: { 'content-type': 'application/json' } }, (incoming) => {
      const chunks = []
      incoming.on('data', (chunk) => chunks.push(chunk))
      incoming.on('end', () => resolve({ status: incoming.statusCode, contentType: incoming.headers['content-type'], text: Buffer.concat(chunks).toString('utf8') }))
    })
    outgoing.on('error', reject)
    outgoing.end(JSON.stringify(body))
  })

  for (const [path, body] of [['/v1/prepare', prepare], ['/v1/invoke', invoke], ['/v1/release', { projectId }]]) {
    const response = await requestOnSocket(path, body)
    const problem = JSON.parse(response.text)
    assert.deepEqual([response.status, response.contentType, problem.type, problem.title, problem.status, problem.code], [500, 'application/problem+json', 'urn:conexus:problem:INTERNAL_UNEXPECTED', 'INTERNAL_UNEXPECTED', 500, 'INTERNAL_UNEXPECTED'], path)
    assert.equal(response.text.includes('PRIVATE_RUNNER_'), false, path)
  }
  const invalid = await requestOnSocket('/v1/prepare', { projectId: 'invalid' })
  assert.deepEqual([invalid.status, invalid.contentType, JSON.parse(invalid.text).code], [400, 'application/problem+json', 'RUNNER_REQUEST_REFUSED'])
  await assert.rejects(() => createApplicationRunnerClient(socketPath).invoke(invoke), (error) => error.id === 'INTERNAL_UNEXPECTED')
  assert.deepEqual(events, [])
})
