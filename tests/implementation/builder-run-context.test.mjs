import assert from 'node:assert/strict'
import { test } from 'node:test'
import { RequestContext } from '@mastra/core/request-context'
import { hubModuleUrl } from './hub-build.mjs'
import { noAccounts } from './model-accounts-fake.mjs'
import { bindRunContext, readRunContext, RUN_CONTEXT } from './run-context.mjs'

const { requireRunContext } = await import(hubModuleUrl('builder/run-context.js'))
const { createModelRouting } = await import(hubModuleUrl('builder/model-routing.js'))

const invariant = (error) => error.id === 'INTERNAL_UNEXPECTED' ? error.details.invariant : error.id

test('a bound run context reads back whole, and a request no run made reads as none', () => {
  const bound = new RequestContext()
  bindRunContext(bound, RUN_CONTEXT)
  assert.deepEqual(readRunContext(bound), RUN_CONTEXT)
  assert.equal(readRunContext(new RequestContext()), null)
})

test('a context with some keys, or a value that is no id, is a broken invariant and never a missing model', () => {
  const partial = new RequestContext()
  partial.setRaw('conexusBuilderRunId', RUN_CONTEXT.builderRunId)
  const readable = new RequestContext()
  bindRunContext(readable, RUN_CONTEXT)
  readable.setRaw('conexusBuilderRunId', 'run-1')
  for (const context of [partial, readable]) {
    assert.throws(() => readRunContext(context), (error) => invariant(error) === 'RUN_CONTEXT_INVALID')
  }
  assert.throws(() => requireRunContext(new RequestContext()), (error) => invariant(error) === 'RUN_CONTEXT_MISSING')
})

test('a model call without its run, or with a malformed one, fails INTERNAL_UNEXPECTED and not BUILDER_MODEL_NOT_SELECTED', async () => {
  const routing = createModelRouting({
    routes: {}, modelAccounts: noAccounts, conversationModel: async () => null, readDefault: async () => 'anthropic/x', record: async () => {},
  })
  const malformed = new RequestContext()
  bindRunContext(malformed, RUN_CONTEXT)
  malformed.setRaw('conexusBuilderAccountId', 'not-an-account')
  const missing = new RequestContext()
  missing.set('controller', { session: { modelId: 'anthropic/x' } })
  malformed.set('controller', { session: { modelId: 'anthropic/x' } })
  await assert.rejects(routing.resolve({ requestContext: missing }), (error) => invariant(error) === 'RUN_CONTEXT_MISSING')
  await assert.rejects(routing.resolve({ requestContext: malformed }), (error) => invariant(error) === 'RUN_CONTEXT_INVALID')
})
