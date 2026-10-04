import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runWithTelemetry, startCollector } from './telemetry-harness.mjs'

const FORGED_TRACE = '4bf92f3577b34da6a3ce929d0e0e4736'
const FORGED_PARENT = '00f067aa0ba902b7'

// Raw requests, so no client instrumentation in the child adds or replaces the forged headers.
const SERVE = `
import { trace } from '@opentelemetry/api'
import { connect } from 'node:net'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const { createHttpApp } = await import(process.env.HUB_BUILD + '/http/app.js')
const { routes } = await import(process.env.HUB_BUILD + '/http/access.js')
const policy = { listener: 'hub', hubOrigin: 'https://hub.test', resolveHubSession: async () => null }
const seen = async (server) => { routes(server).navigation({ url: '/seen', handler: async () => ({ traceId: trace.getActiveSpan()?.spanContext().traceId }) }); return ['seen'] }
const raw = (target) => new Promise((resolve, reject) => {
  const socket = connect(target)
  let answer = ''
  socket.on('data', (chunk) => { answer += chunk })
  socket.on('end', () => resolve(JSON.parse(answer.slice(answer.indexOf('\\r\\n\\r\\n') + 4))))
  socket.on('error', reject)
  socket.end('GET /seen HTTP/1.1\\r\\nHost: hub.test\\r\\ntraceparent: 00-${FORGED_TRACE}-${FORGED_PARENT}-01\\r\\ntracestate: forged=1\\r\\nbaggage: forged=1\\r\\nConnection: close\\r\\n\\r\\n')
})
const directory = mkdtempSync(join(tmpdir(), 'conexus-trust-'))
const app = await createHttpApp({ policy, registerRoutes: seen })
const socketPath = join(directory, 'runner.sock')
if (process.env.LISTENER === 'unix') await app.listen({ path: socketPath })
else await app.listen({ host: '127.0.0.1', port: 0 })
const answer = await raw(process.env.LISTENER === 'unix' ? { path: socketPath } : { host: '127.0.0.1', port: app.server.address().port })
console.log(JSON.stringify(answer))
await app.close()
rmSync(directory, { recursive: true, force: true })
`

const serve = async (listener) => {
  const collector = await startCollector()
  try {
    const result = await runWithTelemetry(SERVE, { endpoint: collector.endpoint, env: { LISTENER: listener } })
    assert.equal(result.code, 0, result.stderr)
    return { traceId: JSON.parse(result.lines.at(-1)).traceId, exported: collector.everything(), traces: Buffer.concat(collector.bodies('/v1/traces')) }
  } finally { await collector.close() }
}

test('a TCP request with a forged traceparent, tracestate and baggage gets a new trace with no parent or link to them', async () => {
  const { traceId, exported, traces } = await serve('tcp')
  assert.match(traceId, /^[0-9a-f]{32}$/)
  assert.notEqual(traceId, FORGED_TRACE)
  assert.ok(traces.includes(Buffer.from(traceId, 'hex')), 'the new trace was exported')
  assert.equal(exported.includes(Buffer.from(FORGED_TRACE, 'hex')), false, 'the forged trace id was not exported')
  assert.equal(exported.includes(Buffer.from(FORGED_PARENT, 'hex')), false, 'no span names the forged span as parent or link')
  assert.equal(exported.includes('forged=1'), false, 'no inbound tracestate or baggage was exported')
})

test('a request over a unix socket continues the inbound trace under the inbound span', async () => {
  const { traceId, traces } = await serve('unix')
  assert.equal(traceId, FORGED_TRACE)
  assert.ok(traces.includes(Buffer.from(FORGED_PARENT, 'hex')), 'the server span names the inbound span as parent')
})
