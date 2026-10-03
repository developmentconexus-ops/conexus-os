import { MastraStorageExporter, Observability } from '@mastra/observability'
import type { ObservabilityInstance, SpanOutputProcessor } from '@mastra/core/observability'
import { SpanType } from '@mastra/core/observability'
import { BUILDER_TRACE_REQUEST_CONTEXT_KEYS } from './runtime.js'

const BUILDER_OBSERVABILITY_FLUSH_TIMEOUT_MS = 5_000

type BuilderObservabilityLifecycle = Readonly<{
  flush(): Promise<void>
  close(): Promise<void>
}>

export const createBuilderObservabilityLifecycle = (
  observability: Pick<Observability, 'flush' | 'shutdown'>,
  flushTimeoutMs = BUILDER_OBSERVABILITY_FLUSH_TIMEOUT_MS,
): BuilderObservabilityLifecycle => {
  let queued: Promise<void> = Promise.resolve()
  let closing = false
  let closePromise: Promise<void> | undefined
  const reportFailure = (): void => {
    process.emitWarning('BUILDER_PREPARATION_FAILED', { code: 'BUILDER_PREPARATION_FAILED' })
  }
  const enqueue = (operation: () => Promise<void>): Promise<void> => {
    const result = queued.then(operation, operation)
    queued = result.catch(() => undefined)
    return result
  }
  const waitBounded = (operation: Promise<void>): Promise<'completed' | 'failed' | 'timed-out'> => new Promise((resolve) => {
    const timeout = setTimeout(() => resolve('timed-out'), flushTimeoutMs)
    void operation.then(
      () => { clearTimeout(timeout); resolve('completed') },
      () => { clearTimeout(timeout); resolve('failed') },
    )
  })
  return Object.freeze({
    flush: async () => {
      if (closing) return
      const current = enqueue(() => observability.flush())
      const result = await waitBounded(current)
      if (result !== 'completed') reportFailure()
    },
    close: () => {
      closePromise ??= (async () => {
        closing = true
        try {
          await queued
        } catch {
          reportFailure()
        }
        try {
          await observability.shutdown()
        } catch {
          reportFailure()
        }
      })()
      return closePromise
    },
  })
}

const compactProcessorRunPayloads: SpanOutputProcessor = {
  name: 'builder-compact-processor-run-payloads',
  process: (span) => {
    if (span && span.type === SpanType.PROCESSOR_RUN) {
      if (Array.isArray(span.input)) span.input = { messageCount: span.input.length }
      if (Array.isArray(span.output)) span.output = { messageCount: span.output.length }
    }
    return span
  },
  // biome-ignore lint/suspicious/noEmptyBlockStatements: debt: owning wave
  shutdown: async () => {},
}

export const createBuilderObservability = (serviceName: string, connectorObservability?: ObservabilityInstance): Observability => {
  const observability = new Observability({
    sensitiveDataFilter: true,
    configs: {
      default: {
        serviceName,
        requestContextKeys: [...BUILDER_TRACE_REQUEST_CONTEXT_KEYS],
        exporters: [new MastraStorageExporter()],
        spanOutputProcessors: [compactProcessorRunPayloads],
        serializationOptions: { maxStringLength: 32_768 },
        // The Postgres store keeps spans but has no log table; the Hub's logs go through its pino logger.
        logging: { enabled: false },
      },
    },
  })
  if (connectorObservability) observability.registerInstance('connectors', connectorObservability)
  return observability
}
