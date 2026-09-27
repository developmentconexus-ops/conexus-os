import { SpanType, TracingEventType } from '@mastra/core/observability'
import type { AnySpan, ObservabilityExporter, ObservabilityInstance, TracingEvent } from '@mastra/core/observability'
import { BaseExporter, DefaultObservabilityInstance, SensitiveDataFilter } from '@mastra/observability'
import { AdapterFailure } from './errors.js'
import type { AdapterFailureReason, BrokerErrorCode } from './errors.js'
import type { ProviderAnswer, RequestTrace } from './operation.js'

// The Connector record: one Mastra span per call and one child span per provider request. A span is
// handed only closed codes, numbers, ids and constant names: never an input, output, body, token or
// credential. The filters are the second line of defense, not the first.

/** A closed code, so no provider text can become a span's error message. */
type SpanResult = 'OK' | 'UNEXPECTED' | 'STORE_UNAVAILABLE' | BrokerErrorCode | AdapterFailureReason

/** One JSON line per ended span, derived from the exported span, so the log and the stored trace are one record. */
class SpanLineExporter extends BaseExporter {
  override name = 'connector-span-line'
  readonly #log: (line: string) => void

  constructor(log: (line: string) => void) {
    super()
    this.#log = log
  }

  protected override async _exportTracingEvent(event: TracingEvent): Promise<void> {
    if (event.type !== TracingEventType.SPAN_ENDED) return
    const { name, traceId, id, parentSpanId, startTime, endTime, metadata } = event.exportedSpan
    try {
      this.#log(`${JSON.stringify({
        span: name, traceId, spanId: id, parentSpanId: parentSpanId ?? null,
        startedAt: startTime.toISOString(), ms: (endTime ?? startTime).getTime() - startTime.getTime(), ...metadata,
      })}\n`)
    } catch { /* a log write failure never fails a call */ }
  }
}

export const createConnectorObservability = ({ store, log, secretFields }: Readonly<{
  store: ObservabilityExporter
  log: (line: string) => void
  secretFields: readonly string[]
}>): ObservabilityInstance => new DefaultObservabilityInstance({
  name: 'connectors',
  serviceName: 'conexus-connectors',
  exporters: [store, new SpanLineExporter(log)],
  // A custom field list replaces Mastra's defaults, so both filters run.
  spanOutputProcessors: [new SensitiveDataFilter(), new SensitiveDataFilter({ sensitiveFields: [...secretFields] })],
})

/** Ends a span with its result; any result but OK is recorded as the span's error. */
export const endSpan = (span: AnySpan, result: SpanResult, answer: ProviderAnswer = {}): void => {
  const metadata = { ...answer, result }
  if (result === 'OK') span.end({ metadata })
  else span.error({ error: new Error(result), metadata })
}

export const requestTrace = (parent: AnySpan, attemptOf: () => number): RequestTrace => {
  let step = 0
  return Object.freeze({
    async request<T>(name: string, send: (answer: ProviderAnswer) => Promise<T>): Promise<T> {
      step += 1
      const span = parent.createChildSpan({ type: SpanType.GENERIC, name, metadata: { step, attempt: attemptOf() } })
      const answer: ProviderAnswer = {}
      let value: T
      try {
        value = await send(answer)
      } catch (error) {
        endSpan(span, error instanceof AdapterFailure ? error.reason : 'UNEXPECTED', answer)
        throw error
      }
      endSpan(span, 'OK', answer)
      return value
    },
  })
}
