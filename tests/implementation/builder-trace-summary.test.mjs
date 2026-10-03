import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'

const built = hubModuleUrl
const { buildTraceSummary, UNAVAILABLE_TRACE_SUMMARY } = await import(built('builder/trace-summary.js'))

const summarize = (spans, scores = []) => buildTraceSummary({ traceId: 'trace-1', spans, scores })
const spanOf = (span) => summarize([span]).spans[0]

const agentRun = {
  spanId: 'span-root', parentSpanId: null, spanType: 'agent_run', name: 'agent run',
  startedAt: new Date('2026-09-23T10:00:00.000Z'), endedAt: new Date('2026-09-23T10:00:05.000Z'), error: null, attributes: null,
}
const modelGeneration = {
  spanId: 'span-model-1', parentSpanId: 'span-root', spanType: 'model_generation', name: 'gpt call',
  startedAt: new Date('2026-09-23T10:00:00.100Z'), endedAt: new Date('2026-09-23T10:00:01.100Z'), error: null,
  attributes: { model: 'anthropic/claude', usage: { inputTokens: 120, outputTokens: 30 } },
}
const modelGenerationNoUsage = {
  spanId: 'span-model-2', parentSpanId: 'span-root', spanType: 'model_generation', name: 'second call',
  startedAt: new Date('2026-09-23T10:00:01.200Z'), endedAt: null, error: null, attributes: { model: 'anthropic/claude' },
}
const toolCall = {
  spanId: 'span-tool-1', parentSpanId: 'span-model-1', spanType: 'tool_call', name: 'write_file',
  startedAt: new Date('2026-09-23T10:00:00.500Z'), endedAt: new Date('2026-09-23T10:00:00.600Z'), error: new Error('boom'), attributes: null,
}

test('a span is projected to identity, timing and error, and reads model/usage only off model_generation spans', () => {
  assert.deepEqual(spanOf(agentRun), {
    spanId: 'span-root', parentSpanId: null, spanType: 'agent_run', name: 'agent run',
    startedAt: '2026-09-23T10:00:00.000Z', durationMs: 5000, error: false, model: null, usage: null,
  })
  assert.deepEqual(spanOf(modelGeneration), {
    spanId: 'span-model-1', parentSpanId: 'span-root', spanType: 'model_generation', name: 'gpt call',
    startedAt: '2026-09-23T10:00:00.100Z', durationMs: 1000, error: false, model: 'anthropic/claude',
    usage: { inputTokens: 120, outputTokens: 30, totalTokens: 150 },
  })
  assert.deepEqual(spanOf(toolCall), {
    spanId: 'span-tool-1', parentSpanId: 'span-model-1', spanType: 'tool_call', name: 'write_file',
    startedAt: '2026-09-23T10:00:00.500Z', durationMs: 100, error: true, model: null, usage: null,
  })
  // No endedAt: duration and usage stay unavailable (null), never a fabricated zero.
  assert.deepEqual(spanOf(modelGenerationNoUsage).durationMs, null)
  assert.equal(spanOf(modelGenerationNoUsage).usage, null)
})

test('the run usage sums token counts across model_generation spans and stays null when none carried usage', () => {
  assert.deepEqual(summarize([agentRun, modelGeneration, modelGenerationNoUsage, toolCall]).usage, {
    inputTokens: 120, outputTokens: 30, totalTokens: 150,
  })
  assert.equal(summarize([agentRun, toolCall]).usage, null)
  assert.equal(summarize([]).usage, null)
})

test('a stored score row maps a stored score row to {scorer, score, reason}, null reason when absent', () => {
  assert.deepEqual(summarize([], [
    { scorerId: 'mastracode-outcome', score: 0.97, reason: 'Build: No build/typecheck ran [N/A]' },
    { scorerId: 'mastracode-efficiency', score: 1 },
  ]).scores, [
    { scorer: 'mastracode-outcome', score: 0.97, reason: 'Build: No build/typecheck ran [N/A]' },
    { scorer: 'mastracode-efficiency', score: 1, reason: null },
  ])
})

test('buildTraceSummary assembles the full literal response shape: spans, run totals, and scores', () => {
  const summary = buildTraceSummary({
    traceId: 'trace-1',
    spans: [agentRun, modelGeneration, modelGenerationNoUsage, toolCall],
    scores: [{ scorerId: 'mastracode-outcome', score: 0.97, reason: 'ok' }],
  })
  assert.deepEqual(summary, {
    available: true,
    traceId: 'trace-1',
    spans: [
      { spanId: 'span-root', parentSpanId: null, spanType: 'agent_run', name: 'agent run', startedAt: '2026-09-23T10:00:00.000Z', durationMs: 5000, error: false, model: null, usage: null },
      { spanId: 'span-model-1', parentSpanId: 'span-root', spanType: 'model_generation', name: 'gpt call', startedAt: '2026-09-23T10:00:00.100Z', durationMs: 1000, error: false, model: 'anthropic/claude', usage: { inputTokens: 120, outputTokens: 30, totalTokens: 150 } },
      { spanId: 'span-model-2', parentSpanId: 'span-root', spanType: 'model_generation', name: 'second call', startedAt: '2026-09-23T10:00:01.200Z', durationMs: null, error: false, model: 'anthropic/claude', usage: null },
      { spanId: 'span-tool-1', parentSpanId: 'span-model-1', spanType: 'tool_call', name: 'write_file', startedAt: '2026-09-23T10:00:00.500Z', durationMs: 100, error: true, model: null, usage: null },
    ],
    usage: { inputTokens: 120, outputTokens: 30, totalTokens: 150 },
    modelCalls: 2,
    toolCalls: 1,
    scores: [{ scorer: 'mastracode-outcome', score: 0.97, reason: 'ok' }],
  })
})

test('buildTraceSummary with no spans reports zero counts and null usage, not a fabricated trace', () => {
  assert.deepEqual(buildTraceSummary({ traceId: 'trace-empty', spans: [], scores: [] }), {
    available: true, traceId: 'trace-empty', spans: [], usage: null, modelCalls: 0, toolCalls: 0, scores: [],
  })
})

test('UNAVAILABLE_TRACE_SUMMARY is the exact shape the route returns when no trace exists', () => {
  assert.deepEqual(UNAVAILABLE_TRACE_SUMMARY, {
    available: false, traceId: null, spans: [], usage: null, modelCalls: 0, toolCalls: 0, scores: [],
  })
})

test('usage keeps Mastra UsageStats cache and reasoning breakdown per span and summed over the run', () => {
  const cached = {
    ...modelGeneration, spanId: 'span-cached',
    attributes: { model: 'anthropic/claude', usage: { inputTokens: 1000, outputTokens: 200, inputDetails: { text: 100, cacheRead: 800, cacheWrite: 100 }, outputDetails: { text: 150, reasoning: 50 } } },
  }
  const second = {
    ...modelGeneration, spanId: 'span-second',
    attributes: { model: 'anthropic/claude', usage: { inputTokens: 500, outputTokens: 40, inputDetails: { cacheRead: 450 }, outputDetails: { reasoning: 10, bogus: 'x' } } },
  }
  assert.deepEqual(spanOf(cached).usage, {
    inputTokens: 1000, outputTokens: 200, totalTokens: 1200,
    inputDetails: { text: 100, cacheRead: 800, cacheWrite: 100 }, outputDetails: { text: 150, reasoning: 50 },
  })
  assert.deepEqual(summarize([cached, second, modelGeneration]).usage, {
    inputTokens: 1620, outputTokens: 270, totalTokens: 1890,
    inputDetails: { text: 100, cacheRead: 1250, cacheWrite: 100 }, outputDetails: { text: 150, reasoning: 60 },
  })
})
