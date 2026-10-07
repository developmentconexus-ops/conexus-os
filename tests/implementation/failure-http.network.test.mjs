import assert from 'node:assert/strict'
import { test } from 'node:test'
import { jsonLines, runWithTelemetry, startCollector } from './telemetry-harness.mjs'
import { failureHttpScript } from './error-model-http-fixture.mjs'
const SCRIPT = failureHttpScript()

const run = async () => {
  const collector = await startCollector()
  const result = await runWithTelemetry(SCRIPT, { endpoint: collector.endpoint }).finally(() => collector.close())
  assert.equal(result.code, 0, result.stderr)
  const records = jsonLines(result.stdout)
  const { report } = records.find((record) => record.report)
  const logged = (name) => {
    const from = records.findIndex((record) => record.msg === `CASE ${name}`)
    const rest = records.slice(from + 1)
    const to = rest.findIndex((record) => typeof record.msg === 'string' && record.msg.startsWith('CASE '))
    return rest.slice(0, to).filter((record) => !record.report)
  }
  const answer = (name) => {
    const [status, type, body] = report[name]
    return { status, type, body: JSON.parse(body) }
  }
  return { answer, logged, stdout: result.stdout, stderr: result.stderr, onErrorCalls: records.find((record) => record.report).onErrorCalls }
}

test('every route shape answers a failure as problem+json and writes exactly one log line', async () => {
  const { answer, logged } = await run()
  const expected = [
    ['root async Failure', 500, 'INTERNAL_UNEXPECTED', 50],
    ['root sync Failure', 404, 'NOT_FOUND', 30],
    ['plain Error', 500, 'INTERNAL_UNEXPECTED', 50],
    ['scoped route', 404, 'NOT_FOUND', 30],
    ['onRequest hook', 404, 'NOT_FOUND', 30],
    ['unknown route', 404, 'NOT_FOUND', 30],
    ['invalid body', 400, 'REQUEST_VALIDATION_FAILED', 30],
    ['malformed JSON', 400, 'REQUEST_JSON_INVALID', 30],
    ['unsupported media type', 415, 'REQUEST_MEDIA_TYPE_UNSUPPORTED', 30],
    ['mount invalid body', 400, 'REQUEST_VALIDATION_FAILED', 30],
    ['mount plain Error', 500, 'INTERNAL_UNEXPECTED', 50],
  ]
  for (const [name, status, code, level] of expected) {
    const { status: got, type, body } = answer(name)
    assert.equal(got, status, name)
    // Mastra sends a validation hook's body as plain JSON; the body is the same problem.
    assert.equal(type.startsWith(name === 'mount invalid body' ? 'application/json' : 'application/problem+json'), true, `${name}: ${type}`)
    assert.deepEqual({ type: body.type, title: body.title, status: body.status, code: body.code }, { type: `urn:conexus:problem:${code}`, title: code, status, code }, name)
    const lines = logged(name)
    assert.deepEqual(lines.map((line) => [line.msg, line.level]), [[code, level]], `${name}: one line`)
  }
})

test('a fault nobody named answers INTERNAL_UNEXPECTED with a trace id, and its text is in neither the answer nor the log', async () => {
  const { answer, logged, stdout } = await run()
  for (const name of ['plain Error', 'mount plain Error']) {
    const { body } = answer(name)
    assert.match(body.traceId, /^[0-9a-f]{32}$/, name)
    assert.equal(JSON.stringify(body).includes('PLANTED_VENDOR_TEXT'), false, `${name}: the answer carries no vendor text`)
    assert.equal(logged(name)[0]['exception.type'], 'Error', `${name}: the log has the cause's type`)
    assert.equal(JSON.stringify(logged(name)).includes('PLANTED_VENDOR_TEXT'), false, `${name}: the log carries no vendor text`)
  }
  assert.equal(answer('root async Failure').body.traceId.length, 32)
  assert.equal(logged('root async Failure')[0]['failure.details.project'], 'p1')
  assert.equal(answer('root sync Failure').body.traceId, undefined, 'a USER row carries no trace id')
  assert.equal(stdout.includes('HTTP_SERVER_ERROR'), false)
})

test("Mastra's server.onError is not called for the mount's routes, and its own handler-error line is filtered so one line remains", async () => {
  const { onErrorCalls, stdout, stderr } = await run()
  assert.deepEqual(onErrorCalls, [])
  assert.equal(`${stdout}${stderr}`.includes('Error calling handler'), false)
})
