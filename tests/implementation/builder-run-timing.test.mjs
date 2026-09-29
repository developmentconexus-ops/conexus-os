import assert from 'node:assert/strict'
import test from 'node:test'
import { parseRunTimingLine } from '../../scripts/builder-eval/timing.mjs'
import { createRunTiming } from '../../apps/hub/src/builder/run-timing.ts'

const clock = (...times) => () => times.shift()

test('each mark ends its stage at the previous mark and the line lists the stages in run order', () => {
  const timing = createRunTiming(clock(1000, 2200, 3100, 6200))
  timing.mark('sandbox')
  timing.mark('seed')
  timing.mark('starter')
  assert.equal(timing.line('run-1'), 'BUILDER_RUN_TIMING:run-1:sandbox=1200:seed=900:starter=3100')
})

test('a run that failed early logs only the stages it reached, and the eval parser reads the line back', () => {
  const timing = createRunTiming(clock(0, 500))
  timing.mark('sandbox')
  assert.deepEqual(parseRunTimingLine(timing.line('run-2')), { runId: 'run-2', stages: { sandbox: 500 } })
})

test('a stage marked twice adds up and a clock that steps back never gives a negative time', () => {
  const timing = createRunTiming(clock(1000, 1400, 1300, 1600))
  timing.mark('agent')
  timing.mark('agent')
  timing.mark('pull')
  assert.equal(timing.line('run-3'), 'BUILDER_RUN_TIMING:run-3:agent=400:pull=300')
})
