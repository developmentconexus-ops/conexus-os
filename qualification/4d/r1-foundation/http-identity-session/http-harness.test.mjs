import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createHttpHarness, generatedRoutes } from './http-harness.mjs'

let harness
before(async () => { harness = await createHttpHarness() })
after(async () => { await harness.close() })

test('R1F-P05 generated route census is exact and the root validator is installed once', () => {
  assert.deepEqual(harness.routeCensus(), generatedRoutes.map(route => route.generatedId).sort())
  assert.equal(harness.validatorCompilerInstallCount(), 1)
  assert.deepEqual(harness.exposedSurfaceKeys(), ['route'])
})

test('R1F-P05 validation is strict and never coerces, defaults or removes input', async () => {
  const valid = await harness.inject({ method: 'POST', url: '/fixture/echo', payload: { count: 3, label: 'three' } })
  assert.equal(valid.statusCode, 200)
  assert.deepEqual(valid.json(), { count: 3, label: 'three' })

  const coerced = await harness.inject({ method: 'POST', url: '/fixture/echo', payload: { count: '3', label: 'three' } })
  assert.equal(coerced.statusCode, 400)

  const defaulted = await harness.inject({ method: 'POST', url: '/fixture/echo', payload: { count: 3 } })
  assert.equal(defaulted.statusCode, 400)

  const removed = await harness.inject({ method: 'POST', url: '/fixture/echo', payload: { count: 3, label: 'three', admin: true } })
  assert.equal(removed.statusCode, 400)
})

test('R1F-P05 feature surface cannot install a fallback compiler or ungenerated route', () => {
  assert.throws(() => harness.registerFeature(surface => surface.setValidatorCompiler(() => () => true)), /setValidatorCompiler/)
  assert.throws(() => harness.registerFeature(surface => surface.route({
    generatedId: 'FORGED', method: 'POST', url: '/forged', schema: {},
  }, async () => ({}))), /UNGENERATED_ROUTE/)
  assert.equal(harness.validatorCompilerInstallCount(), 1)
})
