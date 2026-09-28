import { SpanType, TracingEventType } from '@mastra/core/observability'
import type { AnySpan, ObservabilityExporter, ObservabilityInstance, TracingEvent } from '@mastra/core/observability'
import { BaseExporter, DefaultObservabilityInstance, SensitiveDataFilter } from '@mastra/observability'
import { AdapterFailure } from './errors.js'
import type { AdapterFailureReason, BrokerErrorCode } from './errors.js'
import type { ProviderAnswer, RequestTrace } from './operation.js'

export type SpanResult = 'OK' | 'UNEXPECTED' | 'STORE_UNAVAILABLE' | BrokerErrorCode | AdapterFailureReason

/** `joined` records a request another call made and this call waited on, and that failed it. */
export type CallTrace = RequestTrace & Readonly<{ joined(name: string, result: SpanResult): void }>

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
    this.#log(`${JSON.stringify({
      span: name, traceId, spanId: id, parentSpanId: parentSpanId ?? null,
      startedAt: startTime.toISOString(), ms: (endTime ?? startTime).getTime() - startTime.getTime(), ...metadata,
    })}\n`)
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
  else span.error({ error: Object.assign(new Error(result), { stack: undefined }), metadata })
}

export const requestTrace = (parent: AnySpan, attemptOf: () => number, signal: AbortSignal): CallTrace => {
  let step = 0
  return Object.freeze({
    joined(name: string, result: SpanResult): void {
      if (signal.aborted) return
      step += 1
      endSpan(parent.createChildSpan({ type: SpanType.GENERIC, name, metadata: { step, attempt: attemptOf(), shared: true } }), result)
    },
    async request<T>(name: string, send: (answer: ProviderAnswer) => Promise<T>, resultOf: (value: T) => SpanResult = () => 'OK'): Promise<T> {
      // Past the deadline the request would never be sent, so it is not recorded as one.
      if (signal.aborted) throw new AdapterFailure('TIMEOUT')
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
      endSpan(span, resultOf(value), answer)
      return value
    },
  })
}
