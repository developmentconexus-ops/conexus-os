import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
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

const { oldSpaceCapBytes } = await import(hubModuleUrl('telemetry/heap-watch.js'))

test('the old-space cap is the command line flag over NODE_OPTIONS, the last within each, and null with none', () => {
  assert.equal(oldSpaceCapBytes(['--max-old-space-size=512'], undefined), 512 * 1024 * 1024)
  assert.equal(oldSpaceCapBytes(['--max-old-space-size=512'], '--max-old-space-size=256 --no-warnings'), 512 * 1024 * 1024)
  assert.equal(oldSpaceCapBytes(['--max-old-space-size=512'], '--max-old-space-size=1024'), 512 * 1024 * 1024)
  assert.equal(oldSpaceCapBytes(['--import', 'x.js'], '--max-old-space-size=300 --max-old-space-size=1024'), 1024 * 1024 * 1024)
  assert.equal(oldSpaceCapBytes(['--max-old-space-size=100', '--max_old_space_size=200'], undefined), 200 * 1024 * 1024)
  assert.equal(oldSpaceCapBytes(['--import', 'x.js'], '--no-warnings'), null)
})

test('a process launched with a NODE_OPTIONS cap and a command line cap divides by the cap V8 applies', () => {
  const MiB = 1024 * 1024
  for (const nodeOptions of ['--max-old-space-size=1024', '--max-old-space-size=256']) {
    const result = spawnSync(process.execPath, ['--max-old-space-size=512', '--input-type=module', '-e', `
const { getHeapStatistics } = await import('node:v8')
const { oldSpaceCapBytes } = await import(${JSON.stringify(hubModuleUrl('telemetry/heap-watch.js'))})
console.log(JSON.stringify({ cap: oldSpaceCapBytes(process.execArgv, process.env.NODE_OPTIONS), limit: getHeapStatistics().heap_size_limit }))
`], { env: { ...process.env, NODE_OPTIONS: nodeOptions }, encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    const { cap, limit } = JSON.parse(result.stdout)
    assert.equal(cap, 512 * MiB, `with NODE_OPTIONS ${nodeOptions}`)
    assert.ok(limit > 512 * MiB && limit < 1024 * MiB, `V8 applied the 512 MiB cap: heap_size_limit ${limit / MiB} MiB`)
  }
})
