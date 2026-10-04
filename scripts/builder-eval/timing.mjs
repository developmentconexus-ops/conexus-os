// Where one Builder run's time went (study 25 section 6): the phases the person waits through, the
// model against the tools, the checks until green. Every function is pure: spans and the run row
// go in, one block of integer milliseconds comes out, so the block is comparable across arms.
import { flowOf } from './flow.mjs'
import { mainAgentRuns, mainAgentScope, traceMetrics } from './scorers.mjs'
import { ASK_USER_TOOL, SUBMIT_PLAN_TOOL } from './tool-names.mjs'
import { SpanType } from '@mastra/core/observability'

const CARD_TOOLS = new Set([ASK_USER_TOOL, SUBMIT_PLAN_TOOL])
const TASK_TOOLS = new Set(['task_write', 'task_update', 'task_complete', 'task_check'])
// A model step shorter than this is a bookkeeping span, not a model call.
const MIN_STEP_MS = 50

const ms = (date) => new Date(date).getTime()
const durationOf = (span) => ms(span.endedAt) - ms(span.startedAt)
const sum = (values) => values.reduce((total, value) => total + value, 0)

const percentile = (sorted, fraction) => (sorted.length === 0 ? null : sorted[Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)])

/** Hub stage names of the BUILDER_RUN_TIMING event (apps/hub/src/builder/run-timing.ts). */
const HUB_STAGES = Object.freeze(['sandbox', 'seed', 'starter', 'session', 'agent', 'pull', 'admission', 'compile', 'publish'])

/**
 * Pure. One Hub log record (a JSON line) of the `BUILDER_RUN_TIMING` event: `run` and one integer
 * millisecond field per stage. Null for any other line. A stage the run never reached is absent.
 * @returns {{ runId: string, stages: Record<string, number> } | null}
 */
export function parseRunTimingLine(line) {
  const start = line.indexOf('{')
  if (start === -1) return null
  let record
  try { record = JSON.parse(line.slice(start)) } catch { return null }
  if (record?.msg !== 'BUILDER_RUN_TIMING' || typeof record.run !== 'string') return null
  const stages = {}
  for (const name of HUB_STAGES) if (Number.isInteger(record[name]) && record[name] >= 0) stages[name] = record[name]
  return { runId: record.run, stages }
}

/** Pure. The last timing line the Hub logged for one run, from the text of its log; null when none. */
export function hubTimingFromLog(logText, builderRunId) {
  const found = logText.split('\n').map(parseRunTimingLine).filter((timing) => timing?.runId === builderRunId)
  return found.at(-1)?.stages ?? null
}

const checkRunOf = (call) => {
  const report = call.output?.report ?? call.output
  if (!report || typeof report.ok !== 'boolean') return null
  const steps = report.steps ?? []
  const failing = steps.find((step) => step.status === 'failed')
  return {
    ok: report.ok,
    stepMs: Object.fromEntries(steps.filter((step) => typeof step.durationMs === 'number').map((step) => [step.step, step.durationMs])),
    firstFailingCode: failing ? (failing.problems?.[0]?.code ?? failing.step) : null,
  }
}

/**
 * Pure. The timing block of one Builder run.
 * @param {Readonly<{ spans: readonly object[], run: Readonly<{ createdAt: string, finishedAt: string | null }>, hubStages?: Record<string, number> | null }>} input
 *   `run.finishedAt` is the row's, or when the driver has only the API, the moment it saw the run settle.
 */
export function timingBlock({ spans, run, hubStages = null }) {
  const created = ms(run.createdAt)
  const agentRuns = mainAgentRuns(spans).sort((a, b) => ms(a.startedAt) - ms(b.startedAt))
  const scope = mainAgentScope(spans)
  const firstStart = ms(agentRuns[0].startedAt)
  const lastEnd = Math.max(...agentRuns.map((agent) => ms(agent.endedAt)))
  const agentMs = sum(agentRuns.map(durationOf))
  const chunks = scope.filter((span) => span.spanType === SpanType.MODEL_CHUNK).sort((a, b) => ms(a.startedAt) - ms(b.startedAt))
  const firstText = chunks.find((chunk) => /text/.test(chunk.name ?? ''))

  const calls = scope.filter((span) => span.spanType === SpanType.TOOL_CALL)
  const callsOfStep = new Map()
  for (const call of calls) callsOfStep.set(call.parentSpanId, [...(callsOfStep.get(call.parentSpanId) ?? []), call])
  const steps = scope.filter((span) => span.spanType === SpanType.MODEL_STEP && durationOf(span) > MIN_STEP_MS).sort((a, b) => ms(a.startedAt) - ms(b.startedAt))
  const stepFacts = steps.map((step) => {
    const own = callsOfStep.get(step.spanId) ?? []
    const window = own.length === 0 ? 0 : Math.max(...own.map((call) => ms(call.endedAt))) - Math.min(...own.map((call) => ms(call.startedAt)))
    return {
      step, own, toolMs: window, modelMs: durationOf(step) - window,
      firstToolMs: own.length === 0 ? null : Math.min(...own.map((call) => ms(call.startedAt))) - ms(step.startedAt),
      taskOnly: own.length > 0 && own.every((call) => TASK_TOOLS.has(call.entityName)),
      longestCallMs: own.length === 0 ? 0 : Math.max(...own.map(durationOf)),
    }
  })
  const firstToolMs = stepFacts.map((fact) => fact.firstToolMs).filter((value) => value !== null).sort((a, b) => a - b)

  const byTool = {}
  for (const call of calls) {
    const entry = byTool[call.entityName] ?? { calls: 0, ms: 0 }
    entry.calls += 1
    entry.ms += durationOf(call)
    byTool[call.entityName] = entry
  }
  const checkRuns = calls.filter((call) => call.entityName === 'conexus_check').sort((a, b) => ms(a.startedAt) - ms(b.startedAt)).map(checkRunOf).filter(Boolean)
  const firstGreen = checkRuns.findIndex((check) => check.ok)
  const tokens = traceMetrics(spans)

  return {
    phases: {
      queueAndPreparationMs: firstStart - created,
      firstChunkMs: chunks[0] ? ms(chunks[0].startedAt) - created : null,
      firstTextMs: firstText ? ms(firstText.startedAt) - created : null,
      agentMs,
      personWaitMs: lastEnd - firstStart - agentMs,
      afterAgentMs: run.finishedAt ? ms(run.finishedAt) - lastEnd : null,
      cards: calls.filter((call) => CARD_TOOLS.has(call.entityName)).sort((a, b) => ms(a.startedAt) - ms(b.startedAt))
        .map((call) => ({ tool: call.entityName, atMs: ms(call.startedAt) - created })),
      hubStages,
    },
    model: {
      steps: stepFacts.length,
      modelMs: sum(stepFacts.map((fact) => fact.modelMs)),
      toolMs: sum(stepFacts.map((fact) => fact.toolMs)),
      taskOnlySteps: stepFacts.filter((fact) => fact.taskOnly).length,
      taskOnlyMs: sum(stepFacts.filter((fact) => fact.taskOnly).map((fact) => durationOf(fact.step))),
      firstToolCallMs: { median: percentile(firstToolMs, 0.5), p90: percentile(firstToolMs, 0.9) },
      inputTokens: tokens.inputTokens,
      cachedInputTokens: tokens.cachedInputTokens,
      outputTokens: tokens.outputTokens,
      firstStepInputTokens: steps[0]?.attributes?.usage?.inputTokens ?? null,
    },
    tools: {
      byTool,
      stepsWithSeveralCalls: stepFacts.filter((fact) => fact.own.length > 1).length,
      parallelLowerBoundMs: sum(stepFacts.map((fact) => fact.longestCallMs)),
    },
    checks: { runs: checkRuns, redUntilGreen: firstGreen === -1 ? checkRuns.length : firstGreen },
    flow: flowOf([...calls].sort((a, b) => ms(a.startedAt) - ms(b.startedAt))),
  }
}
