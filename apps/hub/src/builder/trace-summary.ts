import type { BuilderTraceScore, BuilderTraceSpan, BuilderTraceSummary, BuilderTraceUsage } from './routes.js'

// A structural subset of Mastra's stored span/score records: independent of the SDK's exact
// class hierarchy, so the mapping below is testable with plain objects.
export type ObservabilitySpanRecord = Readonly<{
  spanId: string
  parentSpanId?: string | null | undefined
  spanType: string
  name: string
  startedAt: Date
  endedAt?: Date | null | undefined
  error?: unknown
  attributes?: Readonly<Record<string, unknown>> | null | undefined
}>
export type ObservabilityScoreRecord = Readonly<{ scorerId: string; score: number; reason?: string | null | undefined }>

// Mastra span-type strings (@mastra/core/observability SpanType). A model call is one
// MODEL_GENERATION span; a tool call is one TOOL_CALL span. Client/provider/MCP tool spans are
// their own distinct native mechanisms (docs-observability), not counted here.
const MODEL_GENERATION_SPAN_TYPE = 'model_generation'
const TOOL_CALL_SPAN_TYPE = 'tool_call'

const finiteOrNull = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null)

const totalOf = (inputTokens: number | null, outputTokens: number | null): number | null =>
  inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null

/** Token usage recorded on a MODEL_GENERATION span's attributes, or null when absent or zero-value. */
const spanUsage = (span: ObservabilitySpanRecord): BuilderTraceUsage | null => {
  if (span.spanType !== MODEL_GENERATION_SPAN_TYPE) return null
  const usage = (span.attributes as Readonly<{ usage?: Readonly<{ inputTokens?: unknown; outputTokens?: unknown }> }> | null | undefined)?.usage
  if (!usage) return null
  const inputTokens = finiteOrNull(usage.inputTokens)
  const outputTokens = finiteOrNull(usage.outputTokens)
  if (inputTokens === null && outputTokens === null) return null
  return Object.freeze({ inputTokens, outputTokens, totalTokens: totalOf(inputTokens, outputTokens) })
}

const spanModel = (span: ObservabilitySpanRecord): string | null => {
  if (span.spanType !== MODEL_GENERATION_SPAN_TYPE) return null
  const model = (span.attributes as Readonly<{ model?: unknown }> | null | undefined)?.model
  return typeof model === 'string' ? model : null
}

/** @public Tests import this at runtime from the built module. */
export const summarizeSpan = (span: ObservabilitySpanRecord): BuilderTraceSpan => Object.freeze({
  spanId: span.spanId,
  parentSpanId: span.parentSpanId ?? null,
  spanType: span.spanType,
  name: span.name,
  startedAt: span.startedAt.toISOString(),
  durationMs: span.endedAt ? Math.max(0, span.endedAt.getTime() - span.startedAt.getTime()) : null,
  error: Boolean(span.error),
  model: spanModel(span),
  usage: spanUsage(span),
})

/**
 * Where usage is not reported it is unavailable, never zero (contract.md §8).
 * @public Tests import this at runtime from the built module.
 */
export const summarizeRunUsage = (spans: readonly ObservabilitySpanRecord[]): BuilderTraceUsage | null => {
  let inputTokens: number | null = null
  let outputTokens: number | null = null
  let sawUsage = false
  for (const span of spans) {
    const usage = spanUsage(span)
    if (!usage) continue
    sawUsage = true
    if (usage.inputTokens !== null) inputTokens = (inputTokens ?? 0) + usage.inputTokens
    if (usage.outputTokens !== null) outputTokens = (outputTokens ?? 0) + usage.outputTokens
  }
  return sawUsage ? Object.freeze({ inputTokens, outputTokens, totalTokens: totalOf(inputTokens, outputTokens) }) : null
}

/** @public Tests import this at runtime from the built module. */
export const summarizeScore = (score: ObservabilityScoreRecord): BuilderTraceScore => Object.freeze({
  scorer: score.scorerId,
  score: score.score,
  reason: score.reason ?? null,
})

export const buildTraceSummary = ({ traceId, spans, scores }: Readonly<{
  traceId: string
  spans: readonly ObservabilitySpanRecord[]
  scores: readonly ObservabilityScoreRecord[]
}>): BuilderTraceSummary => Object.freeze({
  available: true,
  traceId,
  spans: Object.freeze(spans.map(summarizeSpan)),
  usage: summarizeRunUsage(spans),
  modelCalls: spans.filter((span) => span.spanType === MODEL_GENERATION_SPAN_TYPE).length,
  toolCalls: spans.filter((span) => span.spanType === TOOL_CALL_SPAN_TYPE).length,
  scores: Object.freeze(scores.map(summarizeScore)),
})

export const UNAVAILABLE_TRACE_SUMMARY: BuilderTraceSummary = Object.freeze({
  available: false, traceId: null, spans: Object.freeze([]), usage: null, modelCalls: 0, toolCalls: 0, scores: Object.freeze([]),
})
