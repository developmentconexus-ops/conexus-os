import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'
import { runWithTelemetry, startCollector } from './telemetry-harness.mjs'

const { logBodyCode, redactAttributes } = await import(hubModuleUrl('telemetry/redact.js'))

test('redactAttributes keeps only allowlisted keys, drops exception.message and keeps only the frames of a stack', () => {
  const kept = redactAttributes({
    'http.request.method': 'GET',
    'http.route': '/x',
    'url.path': '/__conexus/api/PLANTED_PATH_SECRET',
    'user_agent.original': 'PLANTED_AGENT_SECRET/1.0',
    'url.full': 'https://m.test/?key=SECRET',
    'db.query.text': 'SELECT SECRET',
    'db.system.name': 'postgresql',
    'gen_ai.input.messages': 'SECRET prompt',
    'gen_ai.usage.input_tokens': 12,
    'mastra.metadata.unlisted': 'SECRET',
    'mastra.metadata.connector': 'sankhya',
    'network.protocol.version': '1.1',
    'conexus.project_id': 'p1',
    'exception.message': 'SECRET message',
    'exception.stacktrace': 'Error: SECRET first line\nSECRET second line\n    at run (file:///hub/a.js:1:2)\n    at main (file:///hub/b.js:3:4)',
    'brand.new.library.attribute': 'SECRET',
  })
  assert.deepEqual(kept, {
    'conexus.project_id': 'p1',
    'db.system.name': 'postgresql',
    'exception.stacktrace': '    at run (file:///hub/a.js:1:2)\n    at main (file:///hub/b.js:3:4)',
    'gen_ai.usage.input_tokens': 12,
    'http.request.method': 'GET',
    'http.route': '/x',
    'mastra.metadata.connector': 'sankhya',
    'network.protocol.version': '1.1',
  })
  assert.deepEqual(redactAttributes({ 'exception.stacktrace': 'SECRET without frames' }), {})
})

test('a log body leaves as its leading code, or UNCODED_LOG when it has none', () => {
  assert.equal(logBodyCode('HTTP_SERVER_ERROR'), 'HTTP_SERVER_ERROR')
  assert.equal(logBodyCode('BUILDER_RETENTION_PRUNED:builder.runs:12'), 'BUILDER_RETENTION_PRUNED')
  assert.equal(logBodyCode('BUILDER_RUN_FAILED SECRET cause'), 'BUILDER_RUN_FAILED')
  assert.equal(logBodyCode('PLANTED_CUSTOMER_NAME_123456789'), 'UNCODED_LOG')
  assert.equal(logBodyCode('PLANTED_CUSTOMER_NAME_123456789:detail'), 'UNCODED_LOG')
  assert.equal(logBodyCode('builder stream recorder stopped: SECRET'), 'UNCODED_LOG')
  assert.equal(logBodyCode('ACME failed'), 'UNCODED_LOG')
  assert.equal(logBodyCode('HTTP_SERVER_ERROR-SECRET'), 'UNCODED_LOG')
  assert.equal(logBodyCode('{"event":"prepare_failed"}'), 'UNCODED_LOG')
  assert.equal(logBodyCode(undefined), undefined)
})

const PLANT = {
  prompt: 'PLANTED_PROMPT_7f3a',
  toolArgs: 'PLANTED_TOOL_ARGS_91bc',
  toolResult: 'PLANTED_TOOL_RESULT_c204',
  handlerInput: 'PLANTED_HANDLER_INPUT_5d8e',
  handlerOutput: 'PLANTED_HANDLER_OUTPUT_aa17',
  sql: 'PLANTED_SQL_TEXT_3c9d',
  urlQuery: 'PLANTED_URL_KEY_e5f0',
  customer: 'PLANTED_CUSTOMER_NAME_b812',
  logField: 'PLANTED_LOG_FIELD_66d1',
  tailOfLongMessage: 'PLANTED_TAIL_OF_LONG_MESSAGE_0e4a',
}

test('an app invoke, a Builder run, a model request with ?key= and a failing handler export none of the planted strings', async () => {
  const collector = await startCollector()
  try {
    const result = await runWithTelemetry(`
import { trace, SpanStatusCode } from '@opentelemetry/api'
import { createServer } from 'node:http'
const P = JSON.parse(process.env.PLANT)
const { logger } = await import(process.env.HUB_BUILD + '/platform/logger.js')
const tracer = trace.getTracer('planted')
const model = createServer((_, reply) => reply.end('{}'))
await new Promise((done) => model.listen(0, '127.0.0.1', done))
tracer.startActiveSpan('conexus.builder.run', (run) => {
  run.setAttributes({
    'gen_ai.input.messages': P.prompt, 'gen_ai.output.messages': P.prompt, 'gen_ai.system_instructions': P.prompt,
    'gen_ai.tool.call.arguments': P.toolArgs, 'gen_ai.tool.call.result': P.toolResult, 'gen_ai.tool.definitions': P.toolArgs,
    'mastra.agent_run.input': P.prompt, 'mastra.tool_call.output': P.toolResult, 'mastra.metadata.secretNote': P.prompt,
    'conexus.project_id': 'project-1', 'gen_ai.usage.input_tokens': 5,
  })
  run.addEvent('prompt-sent', { 'gen_ai.input.messages': P.prompt, 'conexus.step': 'plan' })
  run.end()
})
tracer.startActiveSpan('conexus.app.handler', (span) => {
  span.setAttributes({ 'handler.input': P.handlerInput, 'handler.output': P.handlerOutput, 'handler.stdout': P.customer, 'db.query.text': 'SELECT ' + P.sql, 'conexus.operation': 'listDeals' })
  span.recordException(new Error('ERR ' + 'x'.repeat(300) + P.tailOfLongMessage))
  span.setStatus({ code: SpanStatusCode.ERROR, message: P.customer })
  span.end()
})
await fetch('http://127.0.0.1:' + model.address().port + '/v1/models?key=' + P.urlQuery)
logger.error({ handlerInput: P.handlerInput, 'handler.output': P.handlerOutput, 'exception.message': 'ERR ' + 'x'.repeat(300) + P.tailOfLongMessage, code: 'HANDLER_FAILED' }, 'handler failed')
model.close()
await trace.getTracerProvider().getDelegate().forceFlush()
`, { endpoint: collector.endpoint, env: { PLANT: JSON.stringify(PLANT) } })
    assert.equal(result.code, 0, result.stderr)
    const exported = collector.everything()
    assert.ok(exported.includes('conexus.app.handler'), 'the spans themselves were exported')
    assert.ok(exported.includes('HANDLER_FAILED'), 'allowlisted log fields were exported')
    assert.ok(exported.includes('planted'), 'the span structure was exported')
    for (const [name, value] of Object.entries(PLANT)) {
      assert.equal(exported.includes(value), false, `${name} was exported`)
    }
    assert.equal(exported.includes('SELECT'), false, 'no SQL text was exported')
    assert.equal(exported.includes('key='), false, 'no URL query was exported')
    assert.ok(Buffer.concat(collector.bodies('/v1/metrics')).includes('conexus.telemetry.attributes_dropped'), 'drops are counted by key')
  } finally { await collector.close() }
})

const LOG_PLANT = {
  lineText: 'PLANTED_LOG_LINE_TEXT_4b7e',
  uncodedText: 'PLANTED_UNCODED_TEXT_19ad',
  errorMessage: 'PLANTED_ERROR_MESSAGE_d03c',
  pinoMessage: 'PLANTED_PINO_MESSAGE_8f21',
  upperLine: 'PLANTED_CUSTOMER_NAME_123456789',
}

test('log lines and logged errors export their codes, types and frames, and none of the planted text', async () => {
  const collector = await startCollector()
  try {
    const result = await runWithTelemetry(`
const P = JSON.parse(process.env.PLANT)
const { logLine, logger, recordFailure } = await import(process.env.HUB_BUILD + '/platform/logger.js')
logLine('BUILDER_RUN_FAILED:run-1:' + P.lineText + '\\n')
logLine('runner said ' + P.uncodedText, 'warn')
logLine(P.upperLine)
logger.info({ code: 'PLAIN_CODE_FIELD' }, 'PROCESS_HEAP_HIGH ' + P.pinoMessage)
recordFailure(logger, 'PROJECT_DELETION_INCOMPLETE', new Error('provider echoed ' + P.errorMessage), { 'conexus.project_id': 'project-1' })
`, { endpoint: collector.endpoint, env: { PLANT: JSON.stringify(LOG_PLANT) } })
    assert.equal(result.code, 0, result.stderr)
    const stdout = result.stdout
    for (const value of Object.values(LOG_PLANT)) assert.ok(stdout.includes(value), `${value} stays on stdout`)
    const logs = Buffer.concat(collector.bodies('/v1/logs'))
    for (const expected of ['BUILDER_RUN_FAILED', 'UNCODED_LOG', 'PROCESS_HEAP_HIGH', 'PLAIN_CODE_FIELD', 'PROJECT_DELETION_INCOMPLETE', 'project-1', 'exception.type', 'exception.stacktrace', '    at ']) {
      assert.ok(logs.includes(expected), `the log export holds ${JSON.stringify(expected)}`)
    }
    const exported = collector.everything()
    for (const [name, value] of Object.entries(LOG_PLANT)) assert.equal(exported.includes(value), false, `${name} was exported`)
    assert.equal(exported.includes('exception.message'), false, 'no error message key was exported')
  } finally { await collector.close() }
})

test('a request path and a user agent chosen by the caller never leave the process', async () => {
  const collector = await startCollector()
  try {
    const result = await runWithTelemetry(`
import { createServer, request } from 'node:http'
const server = createServer((_, reply) => reply.end('ok'))
await new Promise((done) => server.listen(0, '127.0.0.1', done))
await new Promise((done, fail) => {
  const call = request({ host: '127.0.0.1', port: server.address().port, path: '/__conexus/api/PLANTED_PATH_SECRET_77?token=PLANTED_QUERY_SECRET_78', headers: { 'user-agent': 'PLANTED_AGENT_SECRET_79/1.0' } }, (reply) => { reply.resume(); reply.on('end', done) })
  call.on('error', fail)
  call.end()
})
server.close()
const { trace } = await import('@opentelemetry/api')
await trace.getTracerProvider().getDelegate().forceFlush()
`, { endpoint: collector.endpoint })
    assert.equal(result.code, 0, result.stderr)
    const exported = collector.everything()
    assert.ok(exported.includes('http.request.method'), 'the HTTP spans were exported')
    for (const planted of ['PLANTED_PATH_SECRET_77', 'PLANTED_QUERY_SECRET_78', 'PLANTED_AGENT_SECRET_79']) assert.equal(exported.includes(planted), false, `${planted} was exported`)
  } finally { await collector.close() }
})
