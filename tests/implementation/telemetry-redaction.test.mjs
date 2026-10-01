import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'
import { runWithTelemetry, startCollector } from './telemetry-harness.mjs'

const { redactAttributes } = await import(hubModuleUrl('telemetry/redact.js'))

test('redactAttributes keeps only allowlisted keys and cuts exception.message to 300 characters', () => {
  const kept = redactAttributes({
    'http.request.method': 'GET',
    'http.route': '/x',
    'url.full': 'https://m.test/?key=SECRET',
    'db.query.text': 'SELECT SECRET',
    'db.system.name': 'postgresql',
    'gen_ai.input.messages': 'SECRET prompt',
    'gen_ai.usage.input_tokens': 12,
    'mastra.metadata.unlisted': 'SECRET',
    'mastra.metadata.connector': 'sankhya',
    'network.protocol.version': '1.1',
    'conexus.project_id': 'p1',
    'exception.message': 'm'.repeat(400),
    'brand.new.library.attribute': 'SECRET',
  })
  assert.deepEqual(Object.keys(kept).sort(), [
    'conexus.project_id', 'db.system.name', 'exception.message', 'gen_ai.usage.input_tokens', 'http.request.method',
    'http.route', 'mastra.metadata.connector', 'network.protocol.version',
  ])
  assert.equal(kept['exception.message'].length, 300)
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
