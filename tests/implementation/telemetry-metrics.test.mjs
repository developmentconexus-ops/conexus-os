import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'

const { createHeapWatch } = await import(hubModuleUrl('telemetry/heap-watch.js'))

test('the heap watch fires once after two samples above 0.8, stays quiet while high, and fires again only after the ratio fell below 0.7', () => {
  const fired = []
  const sample = createHeapWatch((ratio) => fired.push(ratio))
  for (const ratio of [0.5, 0.81]) sample(ratio)
  assert.deepEqual(fired, [], 'one sample above is not enough')
  sample(0.82)
  assert.deepEqual(fired, [0.82])
  for (const ratio of [0.9, 0.95, 0.75, 0.85, 0.86]) sample(ratio)
  assert.deepEqual(fired, [0.82], 'a dip to 0.75 does not re-arm it')
  sample(0.69)
  for (const ratio of [0.81, 0.83]) sample(ratio)
  assert.deepEqual(fired, [0.82, 0.83])
})

test('a single high sample between lows never fires', () => {
  const fired = []
  const sample = createHeapWatch((ratio) => fired.push(ratio))
  for (const ratio of [0.9, 0.5, 0.9, 0.5, 0.9]) sample(ratio)
  assert.deepEqual(fired, [])
})
