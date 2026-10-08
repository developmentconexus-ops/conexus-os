import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'
const { createModelAccountModule, DEFAULT_THINKING_LEVEL } = await import(hubModuleUrl('model-account/module.js'))
const { createSecretEnvelope } = await import(hubModuleUrl('platform/secrets.js'))

test('the concrete personal owner is frozen, exposes its complete lifecycle and does not open a provider at construction', async () => {
  const data = new Proxy({}, { get: (_target, key) => () => { throw new Error(`unexpected database call ${String(key)}`) } })
  const models = await createModelAccountModule({ data, envelope: createSecretEnvelope('41'.repeat(32)), defaultThinkingLevel: DEFAULT_THINKING_LEVEL, googleAiPro: null })
  assert.deepEqual(Object.keys(models).sort(), ['checkBeforeRun', 'close', 'jobs', 'list', 'modelFor', 'offers', 'readDefault', 'registerRoutes'])
  assert.equal(Object.isFrozen(models), true)
  assert.deepEqual(models.jobs, [])
  assert.equal(DEFAULT_THINKING_LEVEL, 'medium')
  await models.close()
  await models.close()
})
