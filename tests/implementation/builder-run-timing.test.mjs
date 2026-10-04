import assert from 'node:assert/strict'
import test from 'node:test'
import { parseRunTimingLine } from '../../scripts/builder-eval/timing.mjs'
import { createRunTiming } from '../../apps/hub/src/builder/run-timing.ts'

const clock = (...times) => () => times.shift()
const idsOf = (builderRunId) => ({ builderRunId, conversationId: 'c', projectId: 'p' })
const named = (builderRunId) => ({ 'builder.run_id': builderRunId, 'builder.conversation_id': 'c', 'builder.project_id': 'p' })

test('each mark ends its stage at the previous mark and the event lists the stages in run order', () => {
  const timing = createRunTiming(clock(1000, 2200, 3100, 6200))
  timing.mark('sandbox')
  timing.mark('seed')
  timing.mark('starter')
  assert.deepEqual(timing.fields(idsOf('run-1')), { ...named('run-1'), 'builder.stage.sandbox_ms': 1200, 'builder.stage.seed_ms': 900, 'builder.stage.starter_ms': 3100 })
})

test('a run that failed early logs only the stages it reached, and the eval parser reads the record back', () => {
  const timing = createRunTiming(clock(0, 500))
  timing.mark('sandbox')
  assert.deepEqual(parseRunTimingLine(JSON.stringify({ msg: 'BUILDER_RUN_TIMING', ...timing.fields(idsOf('run-2')) })), { runId: 'run-2', stages: { sandbox: 500 } })
})

test('a stage marked twice adds up and a clock that steps back never gives a negative time', () => {
  const timing = createRunTiming(clock(1000, 1400, 1300, 1600))
  timing.mark('agent')
  timing.mark('agent')
  timing.mark('pull')
  assert.deepEqual(timing.fields(idsOf('run-3')), { ...named('run-3'), 'builder.stage.agent_ms': 400, 'builder.stage.pull_ms': 300 })
})
