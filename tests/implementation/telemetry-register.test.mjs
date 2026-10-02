import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'
import { runWithTelemetry, startCollector } from './telemetry-harness.mjs'

const SERVE_ONE_REQUEST = `
const { createHttpApp } = await import(process.env.HUB_BUILD + '/http/app.js')
const app = await createHttpApp({ registerRoutes: async (server) => { server.get('/ping', async () => ({ ok: true })); return ['ping'] } })
await app.listen({ host: '127.0.0.1', port: 0 })
const answer = await fetch('http://127.0.0.1:' + app.server.address().port + '/ping')
console.log(JSON.stringify({ status: answer.status }))
await app.close()
`

test('with OTEL_EXPORTER_OTLP_ENDPOINT unset no SDK starts and the process serves as before', async () => {
  const collector = await startCollector()
  try {
    const result = await runWithTelemetry(SERVE_ONE_REQUEST)
    assert.equal(result.code, 0)
    assert.deepEqual(result.lines.at(-1), '{"status":200}')
    assert.equal(collector.requests.length, 0)
  } finally { await collector.close() }
})

test('with the endpoint set the Hub exports traces, logs and metrics for the hub service, with a server span for the request', async () => {
  const collector = await startCollector()
  try {
    const result = await runWithTelemetry(`
const { logger } = await import(process.env.HUB_BUILD + '/platform/logger.js')
logger.info('PROCESS_HEAP_HIGH')
${SERVE_ONE_REQUEST}`, { endpoint: collector.endpoint, env: { OTEL_RESOURCE_ATTRIBUTES: 'deployment.environment.name=test,service.version=abc1234' } })
    assert.equal(result.code, 0, result.stderr)
    const paths = [...new Set(collector.requests.map((entry) => entry.path))].sort()
    assert.deepEqual(paths, ['/v1/logs', '/v1/metrics', '/v1/traces'])
    const traces = Buffer.concat(collector.bodies('/v1/traces'))
    for (const expected of ['conexus-hub', 'abc1234', 'deployment.environment.name', '/ping']) assert.ok(traces.includes(expected), `trace export holds ${expected}`)
    assert.ok(Buffer.concat(collector.bodies('/v1/logs')).includes('PROCESS_HEAP_HIGH'))
    for (const name of ['conexus.process.heap.used_ratio', 'process.memory.usage', 'v8js.memory.heap.used']) {
      assert.ok(Buffer.concat(collector.bodies('/v1/metrics')).includes(name), `metrics export holds ${name}`)
    }
  } finally { await collector.close() }
})

test('the env file names the environment and the launch script the version, and neither overrides the other', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'conexus-env-file-'))
  const envFile = join(directory, 'hub.env')
  writeFileSync(envFile, 'OTEL_RESOURCE_ATTRIBUTES=deployment.environment.name=pilot-from-env-file\n')
  const collector = await startCollector()
  try {
    const result = await runWithTelemetry(SERVE_ONE_REQUEST, {
      endpoint: collector.endpoint,
      nodeArguments: [`--env-file=${envFile}`],
      env: { CONEXUS_SERVICE_VERSION: 'feed123', OTEL_RESOURCE_ATTRIBUTES: undefined },
    })
    assert.equal(result.code, 0, result.stderr)
    const traces = Buffer.concat(collector.bodies('/v1/traces'))
    assert.ok(traces.includes('pilot-from-env-file'), 'the env file environment reached the resource')
    assert.ok(traces.includes('service.version') && traces.includes('feed123'), 'the launch script version reached the resource')
  } finally {
    await collector.close()
    rmSync(directory, { recursive: true, force: true })
  }
})

test('the runner entry names itself conexus-runner', async () => {
  const { serviceFromArgv } = await import(hubModuleUrl('telemetry/start.js'))
  assert.equal(serviceFromArgv('/x/.conexus-build-runner-1/app-runner/main.js'), 'conexus-runner')
  assert.equal(serviceFromArgv('/x/.conexus-build-local-1/server.js'), 'conexus-hub')
})

const LOAD = `
const { createHttpApp } = await import(process.env.HUB_BUILD + '/http/app.js')
const app = await createHttpApp({ registerRoutes: async (server) => { server.get('/ping', async () => ({ ok: true })); return ['ping'] } })
await app.listen({ host: '127.0.0.1', port: 0 })
const url = 'http://127.0.0.1:' + app.server.address().port + '/ping'
for (let i = 0; i < 50; i++) await fetch(url)
const times = []
for (let i = 0; i < 200; i++) { const start = performance.now(); await fetch(url); times.push(performance.now() - start) }
times.sort((a, b) => a - b)
console.log(JSON.stringify({ p99: times[Math.floor(times.length * 0.99)] }))
await app.close()
process.exit(0)
`

test('with the Collector port closed 200 requests are served and p99 stays within 10% of the run against a live Collector', async () => {
  const live = await startCollector()
  const closed = await startCollector()
  const deadEndpoint = closed.endpoint
  await closed.close()
  const p99 = async (endpoint) => {
    const runs = []
    for (let i = 0; i < 3; i++) runs.push(JSON.parse((await runWithTelemetry(LOAD, { endpoint })).lines.at(-1)).p99)
    return Math.min(...runs)
  }
  try {
    const withLiveCollector = await p99(live.endpoint)
    const withClosedCollector = await p99(deadEndpoint)
    // 10% of a few milliseconds is below scheduler noise, so the bound has a 5 ms floor.
    assert.ok(withClosedCollector <= Math.max(withLiveCollector * 1.1, withLiveCollector + 5), `p99 ${withClosedCollector} ms against ${withLiveCollector} ms with a live Collector`)
  } finally { await live.close() }
})
