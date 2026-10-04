import assert from 'node:assert/strict'
import test from 'node:test'
import { hubTimingFromLog, parseRunTimingLine, timingBlock } from '../../scripts/builder-eval/timing.mjs'
import { resumedBuilderTrace } from './builder-eval-fixtures.mjs'

test('the timing block splits a resumed run into phases, model and tool time, and checks', () => {
  const block = timingBlock({
    spans: resumedBuilderTrace(),
    run: { createdAt: '2026-01-01T00:00:00.000Z', finishedAt: '2026-01-01T00:07:10.000Z' },
    hubStages: { sandbox: 4000, admission: 21000 },
  })
  assert.deepEqual(block, {
    phases: {
      queueAndPreparationMs: 5000, firstChunkMs: 8000, firstTextMs: 12000,
      agentMs: 295_000, personWaitMs: 100_000, afterAgentMs: 30_000,
      cards: [{ tool: 'ask_user', atMs: 15_000 }, { tool: 'submit_plan', atMs: 390_000 }],
      hubStages: { sandbox: 4000, admission: 21000 },
    },
    model: {
      steps: 5, modelMs: 111_000, toolMs: 184_000, taskOnlySteps: 0, taskOnlyMs: 0,
      firstToolCallMs: { median: 10_000, p90: 15_000 },
      inputTokens: 6200, cachedInputTokens: 2000, outputTokens: 1020, firstStepInputTokens: 1000,
    },
    tools: {
      byTool: {
        ask_user: { calls: 1, ms: 45_000 },
        mastra_workspace_read_file: { calls: 1, ms: 5000 },
        conexus_run_operation: { calls: 2, ms: 24_000 },
        mastra_workspace_edit_file: { calls: 1, ms: 1000 },
        conexus_check: { calls: 2, ms: 18_000 },
        submit_plan: { calls: 1, ms: 10_000 },
      },
      stepsWithSeveralCalls: 3,
      parallelLowerBoundMs: 87_000,
    },
    checks: {
      runs: [
        { ok: false, stepMs: { generate: 30, typecheck: 7000 }, firstFailingCode: 'TS2304' },
        { ok: true, stepMs: { generate: 30, typecheck: 7000 }, firstFailingCode: null },
      ],
      redUntilGreen: 1,
    },
    flow: {
      planFile: { written: false, legacy: false, beforeFirstAppFile: false },
      approval: { via: 'submit_plan' },
      appFilesBeforeApproval: 1,
      appFilesChanged: 1,
    },
  })
})

test('a run the driver has not seen finish has no after-agent time', () => {
  const block = timingBlock({ spans: resumedBuilderTrace(), run: { createdAt: '2026-01-01T00:00:00.000Z', finishedAt: null } })
  assert.equal(block.phases.afterAgentMs, null)
  assert.equal(block.phases.hubStages, null)
})

const timingRecord = (run, stages) => JSON.stringify({ level: 30, msg: 'BUILDER_RUN_TIMING', run, ...stages })

test('the Hub timing record parses into milliseconds per stage and ignores other records', () => {
  const stages = { sandbox: 1200, seed: 900, starter: 3100, session: 400, agent: 250_000, pull: 800, admission: 21_000, compile: 9000, publish: 1500 }
  assert.deepEqual(parseRunTimingLine(timingRecord('run-7', stages)), { runId: 'run-7', stages })
  assert.deepEqual(parseRunTimingLine(timingRecord('run-8', { sandbox: 5, bogus: 9, seed: 'x' })), { runId: 'run-8', stages: { sandbox: 5 } })
  assert.equal(parseRunTimingLine(JSON.stringify({ msg: 'BUILDER_CHECK', run: 'run-7' })), null)
  assert.equal(parseRunTimingLine('not json {'), null)
})

test('the Hub log yields the last timing record of the asked run', () => {
  const log = [timingRecord('run-1', { sandbox: 1 }), JSON.stringify({ msg: 'BUILDER_CHECK', run: 'run-2' }), timingRecord('run-2', { sandbox: 2 }), timingRecord('run-2', { sandbox: 3 })].join('\n')
  assert.deepEqual(hubTimingFromLog(log, 'run-2'), { sandbox: 3 })
  assert.equal(hubTimingFromLog(log, 'run-9'), null)
})
