import assert from 'node:assert/strict'
import { test } from 'node:test'
import { jsonLines, runWithTelemetry, startCollector } from './telemetry-harness.mjs'

const APP = `
const { createHttpApp } = await import(process.env.HUB_BUILD + '/http/app.js')
const { logger } = await import(process.env.HUB_BUILD + '/platform/logger.js')
const { Failure } = await import(process.env.HUB_BUILD + '/platform/failure.js')
const app = await createHttpApp({ registerRoutes: async (server) => {
  server.get('/boom', async () => { throw new Error('cause: PLANTED_CAUSE_TEXT') })
  server.get('/bad', async () => { throw new Failure('REQUEST_VALIDATION_FAILED') })
  server.get('/inside', async () => { logger.info('inside-a-request'); return {} })
  return ['boom', 'bad', 'inside']
} })
await app.listen({ host: '127.0.0.1', port: 0 })
const base = 'http://127.0.0.1:' + app.server.address().port
const boom = await fetch(base + '/boom')
const bad = await fetch(base + '/bad')
await fetch(base + '/inside')
console.log(JSON.stringify({ report: { boom: [boom.status, await boom.json()], bad: [bad.status, await bad.json()] } }))
await app.close()
`

test('a 5xx logs its code and the type of its cause, never its text, with the trace id and marks the span; a user failure is logged at info and leaves the span unmarked', async () => {
  const collector = await startCollector()
  try {
    const result = await runWithTelemetry(APP, { endpoint: collector.endpoint })
    assert.equal(result.code, 0, result.stderr)
    const records = jsonLines(result.stdout)
    const { report } = records.find((record) => record.report)
    assert.deepEqual(report.boom, [500, { type: 'urn:conexus:problem:INTERNAL_UNEXPECTED', title: 'INTERNAL_UNEXPECTED', status: 500, code: 'INTERNAL_UNEXPECTED', traceId: report.boom[1].traceId }])
    assert.deepEqual(report.bad, [400, { type: 'urn:conexus:problem:REQUEST_VALIDATION_FAILED', title: 'REQUEST_VALIDATION_FAILED', status: 400, code: 'REQUEST_VALIDATION_FAILED' }])
    const failure = records.find((record) => record.msg === 'INTERNAL_UNEXPECTED')
    assert.ok(failure, 'the 5xx was logged')
    assert.equal(failure.level, 50)
    assert.equal(failure['exception.type'], 'Error')
    assert.equal(failure['exception.message'], undefined)
    assert.equal(failure['exception.stacktrace'], undefined)
    assert.equal(JSON.stringify(failure).includes('PLANTED_CAUSE_TEXT'), false, 'the cause text is not in the line')
    assert.match(failure.trace_id, /^[0-9a-f]{32}$/)
    assert.equal(report.boom[1].traceId, failure.trace_id, 'the answer names the trace its log line is in')
    assert.match(failure.span_id, /^[0-9a-f]{16}$/)
    assert.equal(records.filter((record) => record.msg === 'INTERNAL_UNEXPECTED').length, 1, 'the user failure logs under its own code')
    const inside = records.find((record) => record.msg === 'inside-a-request')
    assert.match(inside.trace_id, /^[0-9a-f]{32}$/, 'every record written inside a span carries trace_id')
    const logs = Buffer.concat(collector.bodies('/v1/logs'))
    assert.ok(logs.includes('INTERNAL_UNEXPECTED'))
    assert.equal(logs.includes('PLANTED_CAUSE_TEXT'), false, 'the cause stays on stdout and out of the OTLP log export')
    assert.ok(logs.includes(Buffer.from(failure.trace_id, 'hex')), 'the OTLP log record carries the same trace id')
    assert.ok(Buffer.concat(collector.bodies('/v1/traces')).includes(Buffer.from(failure.trace_id, 'hex')), 'and the trace holds it')
  } finally { await collector.close() }
})

test('request logging is off: a served request writes no record of its own', async () => {
  const result = await runWithTelemetry(APP)
  assert.equal(jsonLines(result.stdout).filter((record) => record.req || record.res || record.msg === 'incoming request').length, 0)
})

const HOST_FAILURE = `
const { createHttpApp } = await import(process.env.HUB_BUILD + '/http/app.js')
const { registerApplicationHostRoutes } = await import(process.env.HUB_BUILD + '/mar/application-host-routes.js')
const PROJECT = '11111111-1111-4111-8111-111111111111'
const HOST = 'caderno.conexus.localhost:3445'
const app = await createHttpApp({ staticRoot: null, registerRoutes: (server) => registerApplicationHostRoutes(server, {
  exactHubOrigin: 'https://hub.conexus.localhost:3443',
  application: { port: 3445, domain: 'conexus.localhost' },
  sessions: {
    applicationBySlug: async () => PROJECT,
    applicationAuthority: async () => ({ kind: 'SIGNED_IN', caller: { accountId: '44444444-4444-4444-8444-444444444444', email: 'a@example.test', displayName: 'A' } }),
    redeem: async () => null,
    signOut: async () => {},
  },
  reader: {
    served: async () => ({ artifactRevisionId: '33333333-3333-4333-8333-333333333333', files: [{ path: 'conexus-server/manifest.json', mediaType: 'application/json' }, { path: 'conexus-server/listDeals.ts', mediaType: 'text/plain' }] }),
    readServedFile: async () => ({ kind: 'NOT_FOUND' }),
  },
  invokeApplication: async () => { throw new Error('runner socket refused: PLANTED_RUNNER_CAUSE') },
}) })
const answer = await app.inject({ method: 'POST', url: '/__conexus/api/listDeals', cookies: { '__Host-conexus_app': 't'.repeat(43) }, payload: {},
  headers: { host: HOST, 'content-type': 'application/json', origin: 'https://' + HOST } })
console.log(JSON.stringify({ answer: [answer.statusCode, answer.json()] }))
await app.close()
`

test('the application host logs the type of a failed invoke cause with project and operation, then answers 503 with its row', async () => {
  const collector = await startCollector()
  try {
    const result = await runWithTelemetry(HOST_FAILURE, { endpoint: collector.endpoint })
    assert.equal(result.code, 0, result.stderr)
    const records = jsonLines(result.stdout)
    const [status, body] = records.find((record) => record.answer).answer
    assert.deepEqual([status, body.code], [503, 'APPLICATION_RUNNER_UNAVAILABLE'])
    const failure = records.find((record) => record.msg === 'APPLICATION_RUNNER_UNAVAILABLE')
    assert.equal(failure['exception.type'], 'Error')
    assert.equal(JSON.stringify(failure).includes('PLANTED_RUNNER_CAUSE'), false)
    assert.equal(failure['failure.details.project'], '11111111-1111-4111-8111-111111111111')
    assert.equal(failure['failure.details.operation'], 'listDeals')
    assert.match(failure.trace_id, /^[0-9a-f]{32}$/)
    assert.ok(Buffer.concat(collector.bodies('/v1/traces')).includes(Buffer.from(failure.trace_id, 'hex')))
    assert.ok(Buffer.concat(collector.bodies('/v1/traces')).includes('exception'), 'the exception is recorded on the span')
    assert.equal(collector.everything().includes('PLANTED_RUNNER_CAUSE'), false, 'the cause text leaves nowhere')
  } finally { await collector.close() }
})
