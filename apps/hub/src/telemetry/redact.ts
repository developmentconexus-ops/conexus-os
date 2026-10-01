import { metrics } from '@opentelemetry/api'
import type { core, logs, tracing } from '@opentelemetry/sdk-node'

const EXACT: ReadonlySet<string> = new Set([
  'http.request.method', 'http.response.status_code', 'http.route', 'url.path', 'url.scheme',
  'server.address', 'server.port', 'user_agent.original',
  'db.system.name', 'db.operation.name', 'db.collection.name', 'db.namespace', 'db.response.status_code',
  'gen_ai.operation.name', 'gen_ai.provider.name', 'gen_ai.request.model', 'gen_ai.response.model',
  'gen_ai.response.finish_reasons', 'gen_ai.agent.name', 'gen_ai.tool.name', 'gen_ai.tool.type',
  'mastra.span.type', 'mastra.tags',
  'mastra.metadata.conexusBuilderProjectId', 'mastra.metadata.conexusBuilderRunId', 'mastra.metadata.result',
  'mastra.metadata.consumer', 'mastra.metadata.connector', 'mastra.metadata.step', 'mastra.metadata.attempt',
  'mastra.metadata.shared',
  'error.type', 'exception.type', 'exception.stacktrace',
  'trace_id', 'span_id', 'level', 'event', 'code',
])
const PREFIXES = ['network.', 'gen_ai.usage.', 'conexus.'] as const

// A stack begins with the error's message; only its frame lines leave.
const framesOf = (stack: string): string | undefined => {
  const frames = stack.split('\n').filter((line) => /^\s+at /.test(line))
  return frames.length > 0 ? frames.join('\n') : undefined
}

const CODE = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+(?=$|[:\s])/

/** @public Tests import this at runtime from the built module. A log body leaves as its leading code, never as its text. */
export const logBodyCode = (body: unknown): string | undefined => {
  if (body === undefined) return undefined
  return (typeof body === 'string' ? CODE.exec(body)?.[0] : undefined) ?? 'UNCODED_LOG'
}

const allowed = (key: string): boolean => EXACT.has(key) || PREFIXES.some((prefix) => key.startsWith(prefix))

/** @public Tests import this at runtime from the built module. Only allowlisted keys leave the process; everything else, known or new, is dropped. */
export const redactAttributes = <V>(attributes: Readonly<Record<string, V | undefined>>): Record<string, V | undefined> => {
  const kept: Record<string, V | undefined> = {}
  for (const [key, value] of Object.entries(attributes)) {
    if (!allowed(key)) continue
    if (key === 'exception.stacktrace' && typeof value === 'string') {
      const frames = framesOf(value)
      if (frames !== undefined) kept[key] = frames as V
    } else kept[key] = value
  }
  return kept
}

const countDropped = (before: Readonly<Record<string, unknown>>, after: Readonly<Record<string, unknown>>): void => {
  const counter = metrics.getMeter('conexus-telemetry').createCounter('conexus.telemetry.attributes_dropped')
  for (const key of Object.keys(before)) if (!(key in after)) counter.add(1, { key })
}

const redacted = <V>(attributes: Readonly<Record<string, V | undefined>>): Record<string, V | undefined> => {
  const kept = redactAttributes(attributes)
  countDropped(attributes, kept)
  return kept
}

const redactedSpan = (span: tracing.ReadableSpan): tracing.ReadableSpan =>
  Object.create(span, {
    attributes: { value: redacted(span.attributes) },
    events: { value: span.events.map((event) => ({ ...event, attributes: redacted(event.attributes ?? {}) })) },
    links: { value: span.links.map((link) => ({ ...link, attributes: redacted(link.attributes ?? {}) })) },
    status: { value: { code: span.status.code } },
  })

export const redactingSpans = (exporter: tracing.SpanExporter): tracing.SpanExporter => ({
  export: (spans: tracing.ReadableSpan[], done: (result: core.ExportResult) => void) =>
    exporter.export(spans.map(redactedSpan), done),
  shutdown: () => exporter.shutdown(),
  ...(exporter.forceFlush ? { forceFlush: () => exporter.forceFlush?.() ?? Promise.resolve() } : {}),
})

export const redactingLogs = (exporter: logs.LogRecordExporter): logs.LogRecordExporter => ({
  export: (records: logs.ReadableLogRecord[], done: (result: core.ExportResult) => void) =>
    exporter.export(records.map((record) => Object.create(record, {
      attributes: { value: redacted(record.attributes) },
      body: { value: logBodyCode(record.body) },
    })), done),
  shutdown: () => exporter.shutdown(),
  forceFlush: () => exporter.forceFlush(),
})
