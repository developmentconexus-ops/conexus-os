import type { ScoreRowData } from '@mastra/core/evals'
import { type InputTokenDetails, type OutputTokenDetails, SpanType, type UsageStats } from '@mastra/core/observability'
import type { SpanRecord } from '@mastra/core/storage'
import type { BuilderTraceScore, BuilderTraceSpan, BuilderTraceSummary, BuilderTraceUsage } from './routes.js'

// The fields of Mastra's stored span and score records this summary reads, so a plain object with
// those fields maps the same as a stored record.
export type ObservabilitySpanRecord = Readonly<Pick<SpanRecord, 'spanId' | 'parentSpanId' | 'spanType' | 'name' | 'startedAt' | 'endedAt' | 'error' | 'attributes'>>
export type ObservabilityScoreRecord = Readonly<Pick<ScoreRowData, 'scorerId' | 'score' | 'reason'>>

// A model call is one MODEL_GENERATION span; a tool call is one TOOL_CALL span. Client, provider
// and MCP tool spans are their own native mechanisms (docs-observability), not counted here.

const finiteOrNull = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null)

const totalOf = (inputTokens: number | null, outputTokens: number | null): number | null =>
  inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null

type TokenDetails = InputTokenDetails | OutputTokenDetails

const finiteDetails = <Details extends TokenDetails>(details: Details | undefined): Details | undefined => {
  const kept = Object.entries(details ?? {}).filter(([, count]) => finiteOrNull(count) !== null)
  return kept.length > 0 ? (Object.freeze(Object.fromEntries(kept)) as unknown as Details) : undefined
}

const addDetails = <Details extends TokenDetails>(left: Details | undefined, right: Details | undefined): Details | undefined => {
  if (!left || !right) return left ?? right
  const sum: Record<string, number> = { ...left }
  for (const [key, count] of Object.entries(right)) sum[key] = (sum[key] ?? 0) + (count as number)
  return Object.freeze(sum) as unknown as Details
}

/**
 * Mastra's `UsageStats` with the totals made explicit: a total no span reported is null, never
 * zero, and the cache and reasoning breakdowns (`inputDetails`, `outputDetails`) ride along when
 * the provider reported them.
 */
const usageOf = (inputTokens: number | null, outputTokens: number | null, inputDetails: InputTokenDetails | undefined, outputDetails: OutputTokenDetails | undefined): BuilderTraceUsage =>
  Object.freeze({
    inputTokens,
    outputTokens,
    totalTokens: totalOf(inputTokens, outputTokens),
    ...(inputDetails ? { inputDetails } : {}),
    ...(outputDetails ? { outputDetails } : {}),
  })

/** Token usage recorded on a MODEL_GENERATION span's attributes, or null when absent or zero-value. */
const spanUsage = (span: ObservabilitySpanRecord): BuilderTraceUsage | null => {
  if (span.spanType !== SpanType.MODEL_GENERATION) return null
  const usage = (span.attributes as Readonly<{ usage?: UsageStats }> | null | undefined)?.usage
  if (!usage) return null
  const inputTokens = finiteOrNull(usage.inputTokens)
  const outputTokens = finiteOrNull(usage.outputTokens)
  if (inputTokens === null && outputTokens === null) return null
  return usageOf(inputTokens, outputTokens, finiteDetails(usage.inputDetails), finiteDetails(usage.outputDetails))
}

const spanModel = (span: ObservabilitySpanRecord): string | null => {
  if (span.spanType !== SpanType.MODEL_GENERATION) return null
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
  let inputDetails: InputTokenDetails | undefined
  let outputDetails: OutputTokenDetails | undefined
  let sawUsage = false
  for (const span of spans) {
    const usage = spanUsage(span)
    if (!usage) continue
    sawUsage = true
    if (usage.inputTokens !== null) inputTokens = (inputTokens ?? 0) + usage.inputTokens
    if (usage.outputTokens !== null) outputTokens = (outputTokens ?? 0) + usage.outputTokens
    inputDetails = addDetails(inputDetails, usage.inputDetails)
    outputDetails = addDetails(outputDetails, usage.outputDetails)
  }
  return sawUsage ? usageOf(inputTokens, outputTokens, inputDetails, outputDetails) : null
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
  modelCalls: spans.filter((span) => span.spanType === SpanType.MODEL_GENERATION).length,
  toolCalls: spans.filter((span) => span.spanType === SpanType.TOOL_CALL).length,
  scores: Object.freeze(scores.map(summarizeScore)),
})

export const UNAVAILABLE_TRACE_SUMMARY: BuilderTraceSummary = Object.freeze({
  available: false, traceId: null, spans: Object.freeze([]), usage: null, modelCalls: 0, toolCalls: 0, scores: Object.freeze([]),
})
