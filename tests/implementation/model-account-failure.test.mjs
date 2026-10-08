import assert from 'node:assert/strict'
import { test } from 'node:test'
import { RequestContext } from '@mastra/core/request-context'
import { hubModuleUrl } from './hub-build.mjs'
import { bindRunContext } from './run-context.mjs'

const { createBuilderModelRouting } = await import(hubModuleUrl('builder/model-routing.js'))
const { Failure, logFailure } = await import(hubModuleUrl('platform/failure.js'))
const run = { builderRunId: '11111111-1111-4111-8111-111111111111', accountId: '22222222-2222-4222-8222-222222222222', conversationId: '33333333-3333-4333-8333-333333333333' }

for (const code of ['DATABASE_BUSY', 'CONFIG_INVALID']) test(`Builder model admission preserves the escaping ${code} object and its native diagnosis`, async () => {
  const cause = Object.assign(new Error('synthetic private vendor text'), { code: '57014' })
  const original = new Failure(code, { cause, details: { sqlstate: '57014' } })
  const requestContext = new RequestContext()
  bindRunContext(requestContext, run)
  requestContext.set('controller', { session: { modelId: 'anthropic/claude-sonnet-5' } })
  const routing = createBuilderModelRouting({
    data: { transaction: async () => { throw original } }, owner: {},
    models: { modelFor: (openRun) => openRun(async () => { throw new Error('must not run') }) },
    conversationModel: async () => null, record: async () => { throw new Error('must not record') },
  })
  await assert.rejects(routing.resolve({ requestContext }), (actual) => {
    assert.equal(actual, original)
    assert.equal(actual.cause, cause)
    const lines = []
    const log = (fields, message) => lines.push({ fields, message })
    logFailure({ error: log, warn: log, info: log }, actual)
    assert.equal(lines.length, 1)
    assert.equal(lines[0].message, code)
    assert.equal(lines[0].fields['failure.details.sqlstate'], '57014')
    assert.match(lines[0].fields['exception.stacktrace'], /Error \(57014\)/)
    assert.doesNotMatch(JSON.stringify(lines), /synthetic private vendor text/)
    return true
  })
})
