import { FastifyOtelInstrumentation } from '@fastify/otel'
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-proto'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http'
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg'
import { PinoInstrumentation } from '@opentelemetry/instrumentation-pino'
import { RuntimeNodeInstrumentation } from '@opentelemetry/instrumentation-runtime-node'
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici'
import { logs, metrics, NodeSDK, tracing } from '@opentelemetry/sdk-node'
import { registerProcessMetrics } from './metrics.js'
import { redactingLogs, redactingSpans } from './redact.js'

const EXPORT_INTERVAL_MS = 15_000
const FLUSH_DEADLINE_MS = 2_000

export const serviceFromArgv = (entry: string | undefined): 'conexus-hub' | 'conexus-runner' =>
  entry?.replaceAll('\\', '/').endsWith('/app-runner/main.js') ? 'conexus-runner' : 'conexus-hub'

const STATIC_ASSET = /^\/(assets\/|favicon)|\.(js|css|map|svg|png|ico|woff2?)(\?|$)/

export const startTelemetry = ({ service }: Readonly<{ service: 'conexus-hub' | 'conexus-runner' }>): NodeSDK => {
  const sdk = new NodeSDK({
    serviceName: service,
    spanProcessors: [new tracing.BatchSpanProcessor(redactingSpans(new OTLPTraceExporter()))],
    logRecordProcessors: [new logs.BatchLogRecordProcessor({ exporter: redactingLogs(new OTLPLogExporter()) })],
    metricReaders: [new metrics.PeriodicExportingMetricReader({ exporter: new OTLPMetricExporter(), exportIntervalMillis: EXPORT_INTERVAL_MS })],
    sampler: new tracing.ParentBasedSampler({ root: new tracing.AlwaysOnSampler() }),
    instrumentations: [
      new HttpInstrumentation({
        ignoreIncomingRequestHook: (request) => {
          const url = request.url ?? ''
          return url.startsWith('/v1/health') || STATIC_ASSET.test(url)
        },
      }),
      new UndiciInstrumentation(),
      new PgInstrumentation(),
      new RuntimeNodeInstrumentation(),
      new PinoInstrumentation(),
      new FastifyOtelInstrumentation({ registerOnInitialization: true }),
    ],
  })
  sdk.start()
  registerProcessMetrics()
  const flush = (): void => {
    void Promise.race([sdk.shutdown(), new Promise((resolve) => setTimeout(resolve, FLUSH_DEADLINE_MS).unref())])
  }
  process.once('SIGTERM', flush)
  process.once('beforeExit', () => {
    flush()
    // An unreachable Collector leaves retry timers that would keep an idle process alive.
    setTimeout(() => process.exit(), FLUSH_DEADLINE_MS).unref()
  })
  return sdk
}
