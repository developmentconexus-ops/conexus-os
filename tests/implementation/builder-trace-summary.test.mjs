import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'

const built = hubModuleUrl
const { buildTraceSummary, summarizeRunUsage, summarizeScore, summarizeSpan, UNAVAILABLE_TRACE_SUMMARY } = await import(built('builder/trace-summary.js'))

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

test('summarizeSpan projects identity, timing and error, and reads model/usage only off model_generation spans', () => {
  assert.deepEqual(summarizeSpan(agentRun), {
    spanId: 'span-root', parentSpanId: null, spanType: 'agent_run', name: 'agent run',
    startedAt: '2026-09-23T10:00:00.000Z', durationMs: 5000, error: false, model: null, usage: null,
  })
  assert.deepEqual(summarizeSpan(modelGeneration), {
    spanId: 'span-model-1', parentSpanId: 'span-root', spanType: 'model_generation', name: 'gpt call',
    startedAt: '2026-09-23T10:00:00.100Z', durationMs: 1000, error: false, model: 'anthropic/claude',
    usage: { inputTokens: 120, outputTokens: 30, totalTokens: 150 },
  })
  assert.deepEqual(summarizeSpan(toolCall), {
    spanId: 'span-tool-1', parentSpanId: 'span-model-1', spanType: 'tool_call', name: 'write_file',
    startedAt: '2026-09-23T10:00:00.500Z', durationMs: 100, error: true, model: null, usage: null,
  })
  // No endedAt: duration and usage stay unavailable (null), never a fabricated zero.
  assert.deepEqual(summarizeSpan(modelGenerationNoUsage).durationMs, null)
  assert.equal(summarizeSpan(modelGenerationNoUsage).usage, null)
})

test('summarizeRunUsage sums token counts across model_generation spans and stays null when none carried usage', () => {
  assert.deepEqual(summarizeRunUsage([agentRun, modelGeneration, modelGenerationNoUsage, toolCall]), {
    inputTokens: 120, outputTokens: 30, totalTokens: 150,
  })
  assert.equal(summarizeRunUsage([agentRun, toolCall]), null)
  assert.equal(summarizeRunUsage([]), null)
})

test('summarizeScore maps a stored score row to {scorer, score, reason}, null reason when absent', () => {
  assert.deepEqual(summarizeScore({ scorerId: 'mastracode-outcome', score: 0.97, reason: 'Build: No build/typecheck ran [N/A]' }), {
    scorer: 'mastracode-outcome', score: 0.97, reason: 'Build: No build/typecheck ran [N/A]',
  })
  assert.deepEqual(summarizeScore({ scorerId: 'mastracode-efficiency', score: 1 }), {
    scorer: 'mastracode-efficiency', score: 1, reason: null,
  })
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
