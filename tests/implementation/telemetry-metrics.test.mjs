import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'

const MiB = 1024 * 1024

const runChild = (script, { execArgv = [], nodeOptions } = {}) => {
  const env = { ...process.env }
  delete env.NODE_OPTIONS
  if (nodeOptions) env.NODE_OPTIONS = nodeOptions
  const result = spawnSync(process.execPath, [...execArgv, '--input-type=module', '-e', script], { env, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  return JSON.parse(result.stdout)
}

// heapUsedRatio divides used heap by the cap V8 applies, read once at start. Dividing the ratio back out
// recovers the cap the Hub chose, bounded by the used heap read just before and just after the call.
const capBehindRatio = (options) => {
  const { ratio, usedBefore, usedAfter, limit } = runChild(`
import { getHeapStatistics } from 'node:v8'
const { heapUsedRatio } = await import(${JSON.stringify(hubModuleUrl('platform/heap.js'))})
const usedBefore = getHeapStatistics().used_heap_size
const ratio = heapUsedRatio()
const usedAfter = getHeapStatistics().used_heap_size
console.log(JSON.stringify({ ratio, usedBefore, usedAfter, limit: getHeapStatistics().heap_size_limit }))
`, options)
  return { lowest: (Math.min(usedBefore, usedAfter) * 0.95) / ratio, highest: (Math.max(usedBefore, usedAfter) * 1.05) / ratio, limit }
}

for (const [name, options, capMiB] of [
  ['the command line flag alone', { execArgv: ['--max-old-space-size=512'] }, 512],
  ['the command line flag over a NODE_OPTIONS flag', { execArgv: ['--max-old-space-size=512'], nodeOptions: '--max-old-space-size=256 --no-warnings' }, 512],
  ['the command line flag over a larger NODE_OPTIONS flag', { execArgv: ['--max-old-space-size=512'], nodeOptions: '--max-old-space-size=1024' }, 512],
  ['the last NODE_OPTIONS flag', { nodeOptions: '--max-old-space-size=300 --max-old-space-size=1024' }, 1024],
  ['the last command line flag, either spelling', { execArgv: ['--max-old-space-size=100', '--max_old_space_size=200'] }, 200],
]) {
  test(`the heap ratio divides by the cap V8 applies: ${name}`, () => {
    const { lowest, highest } = capBehindRatio(options)
    assert.equal(lowest <= capMiB * MiB && capMiB * MiB <= highest, true, `the ratio divides by ${capMiB} MiB (implied between ${lowest / MiB} and ${highest / MiB} MiB)`)
  })
}

test('with no cap set the heap ratio divides by heap_size_limit', () => {
  const { lowest, highest, limit } = capBehindRatio({ nodeOptions: '--no-warnings' })
  assert.equal(lowest <= limit && limit <= highest, true, `the ratio divides by ${limit / MiB} MiB (implied between ${lowest / MiB} and ${highest / MiB} MiB)`)
})

test('a process launched with a NODE_OPTIONS cap and a command line cap runs under the command line cap', () => {
  for (const nodeOptions of ['--max-old-space-size=1024', '--max-old-space-size=256']) {
    const { limit } = capBehindRatio({ execArgv: ['--max-old-space-size=512'], nodeOptions })
    assert.equal(limit > 512 * MiB && limit < 1024 * MiB, true, `V8 applied the 512 MiB cap: heap_size_limit ${limit / MiB} MiB (NODE_OPTIONS ${nodeOptions})`)
  }
})

// startHeapWatch samples heapUsedRatio on a timer. The child replaces the timer with a manual tick and holds
// real heap to move the ratio, under a 64 MiB cap so a few MiB of objects cross 0.8.
test('the heap watch warns once after two samples above 0.8, stays quiet while high, and warns again only after the ratio fell below 0.7', () => {
  const run = runChild(`
const { startHeapWatch } = await import(${JSON.stringify(hubModuleUrl('telemetry/heap-watch.js'))})
const { heapUsedRatio } = await import(${JSON.stringify(hubModuleUrl('platform/heap.js'))})
let tick
globalThis.setInterval = (callback) => { tick = callback; return { unref() {} } }
const warnings = []
startHeapWatch((fields) => warnings.push({ ratioAbove08: fields.ratio > 0.8, rssIsNumber: typeof fields.rss === 'number' }))
let hold = []
const grow = (target) => { while (heapUsedRatio() < target) hold.push(Array.from({ length: 5000 }, (_, i) => ({ i }))) }
const release = () => { hold = []; globalThis.gc() }
const counts = []
const sample = (label) => { tick(); counts.push([label, warnings.length, Number(heapUsedRatio().toFixed(1))]) }
grow(0.85); sample('first high sample')
release(); sample('low')
grow(0.85); sample('single high between lows')
sample('second high in a row')
sample('third high'); sample('fourth high')
release(); grow(0.72); sample('dip into 0.7 to 0.8')
grow(0.85); sample('high after the dip'); sample('high again after the dip')
release(); sample('below 0.7')
grow(0.85); sample('first high after re-arming'); sample('second high after re-arming')
console.log(JSON.stringify({ counts, warnings }))
`, { execArgv: ['--max-old-space-size=64', '--expose-gc'] })
  assert.deepEqual(run.counts.map(([label, warned]) => [label, warned]), [
    ['first high sample', 0],
    ['low', 0],
    ['single high between lows', 0],
    ['second high in a row', 1],
    ['third high', 1],
    ['fourth high', 1],
    ['dip into 0.7 to 0.8', 1],
    ['high after the dip', 1],
    ['high again after the dip', 1],
    ['below 0.7', 1],
    ['first high after re-arming', 1],
    ['second high after re-arming', 2],
  ])
  const dip = run.counts.find(([label]) => label === 'dip into 0.7 to 0.8')
  assert.ok(dip[2] >= 0.7 && dip[2] <= 0.8, `the dip sample sat between 0.7 and 0.8, at ${dip[2]}`)
  assert.deepEqual(run.warnings, Array(2).fill({ ratioAbove08: true, rssIsNumber: true }))
})
