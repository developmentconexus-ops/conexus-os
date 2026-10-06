import type { ScoreRowData } from '@mastra/core/evals'
import { SpanType } from '@mastra/core/observability'
import type { SpanRecord } from '@mastra/core/storage'
import { z } from 'zod'
import type { BuilderTraceScore, BuilderTraceSpan, BuilderTraceSummary, BuilderTraceUsage } from '@conexus/contract'

// The fields of Mastra's stored span and score records this summary reads, so a plain object with
// those fields maps the same as a stored record.
export type ObservabilitySpanRecord = Readonly<Pick<SpanRecord, 'spanId' | 'parentSpanId' | 'spanType' | 'name' | 'startedAt' | 'endedAt' | 'error' | 'attributes'>>
export type ObservabilityScoreRecord = Readonly<Pick<ScoreRowData, 'scorerId' | 'score' | 'reason'>>

// A model call is one MODEL_GENERATION span; a tool call is one TOOL_CALL span. Client, provider
// and MCP tool spans are their own native mechanisms (docs-observability), not counted here.

const finiteOrNull = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null)

const totalOf = (inputTokens: number | null, outputTokens: number | null): number | null =>
  inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null

type TokenCounts = Record<string, number>

// Only the two attribute keys this summary reads are parsed; a span whose value is another shape reads as absent.
const UsageAttributes = z.object({
  usage: z.object({
    inputTokens: z.number().nullish(),
    outputTokens: z.number().nullish(),
    inputDetails: z.record(z.string(), z.unknown()).optional(),
    outputDetails: z.record(z.string(), z.unknown()).optional(),
  }),
})
const ModelAttributes = z.object({ model: z.string() })

const finiteDetails = (details: Readonly<Record<string, unknown>> | undefined): TokenCounts | undefined => {
  const kept = Object.entries(details ?? {}).filter((entry): entry is [string, number] => finiteOrNull(entry[1]) !== null)
  return kept.length > 0 ? Object.fromEntries(kept) : undefined
}

const addDetails = (left: TokenCounts | undefined, right: TokenCounts | undefined): TokenCounts | undefined => {
  if (!left || !right) return finiteDetails(left ?? right)
  const sum: Record<string, number> = { ...finiteDetails(left) }
  for (const [key, count] of Object.entries(right)) sum[key] = (sum[key] ?? 0) + (finiteOrNull(count) ?? 0)
  return sum
}

/**
 * Mastra's `UsageStats` with the totals made explicit: a total no span reported is null, never
 * zero, and the cache and reasoning breakdowns (`inputDetails`, `outputDetails`) ride along when
 * the provider reported them.
 */
const usageOf = (inputTokens: number | null, outputTokens: number | null, inputDetails: TokenCounts | undefined, outputDetails: TokenCounts | undefined): BuilderTraceUsage =>
  ({
    inputTokens,
    outputTokens,
    totalTokens: totalOf(inputTokens, outputTokens),
    ...(inputDetails ? { inputDetails } : {}),
    ...(outputDetails ? { outputDetails } : {}),
  })

/** Token usage recorded on a MODEL_GENERATION span's attributes, or null when absent or zero-value. */
const spanUsage = (span: ObservabilitySpanRecord): BuilderTraceUsage | null => {
  if (span.spanType !== SpanType.MODEL_GENERATION) return null
  const parsed = UsageAttributes.safeParse(span.attributes)
  if (!parsed.success) return null
  const { usage } = parsed.data
  const inputTokens = finiteOrNull(usage.inputTokens)
  const outputTokens = finiteOrNull(usage.outputTokens)
  if (inputTokens === null && outputTokens === null) return null
  return usageOf(inputTokens, outputTokens, finiteDetails(usage.inputDetails), finiteDetails(usage.outputDetails))
}

const spanModel = (span: ObservabilitySpanRecord): string | null => {
  if (span.spanType !== SpanType.MODEL_GENERATION) return null
  const parsed = ModelAttributes.safeParse(span.attributes)
  return parsed.success ? parsed.data.model : null
}

const summarizeSpan = (span: ObservabilitySpanRecord): BuilderTraceSpan => ({
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

/** Where usage is not reported it is unavailable, never zero (contract.md §8). */
const summarizeRunUsage = (spans: readonly ObservabilitySpanRecord[]): BuilderTraceUsage | null => {
  let inputTokens: number | null = null
  let outputTokens: number | null = null
  let inputDetails: TokenCounts | undefined
  let outputDetails: TokenCounts | undefined
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

const summarizeScore = (score: ObservabilityScoreRecord): BuilderTraceScore => ({
  scorer: score.scorerId,
  score: score.score,
  reason: score.reason ?? null,
})

export const buildTraceSummary = ({ traceId, spans, scores }: Readonly<{
  traceId: string
  spans: readonly ObservabilitySpanRecord[]
  scores: readonly ObservabilityScoreRecord[]
}>): BuilderTraceSummary => ({
  available: true,
  traceId,
  spans: spans.map(summarizeSpan),
  usage: summarizeRunUsage(spans),
  modelCalls: spans.filter((span) => span.spanType === SpanType.MODEL_GENERATION).length,
  toolCalls: spans.filter((span) => span.spanType === SpanType.TOOL_CALL).length,
  scores: scores.map(summarizeScore),
})

export const UNAVAILABLE_TRACE_SUMMARY: BuilderTraceSummary = Object.freeze({
  available: false, traceId: null, spans: [], usage: null, modelCalls: 0, toolCalls: 0, scores: [],
})
