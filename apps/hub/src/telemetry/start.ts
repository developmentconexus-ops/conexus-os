import type { IncomingMessage } from 'node:http'
import { FastifyOtelInstrumentation } from '@fastify/otel'
import type { Attributes } from '@opentelemetry/api'
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-proto'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http'
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg'
import { PinoInstrumentation } from '@opentelemetry/instrumentation-pino'
import { RuntimeNodeInstrumentation } from '@opentelemetry/instrumentation-runtime-node'
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici'
import { logs, metrics, NodeSDK, resources, tracing } from '@opentelemetry/sdk-node'
import { registerProcessMetrics } from './metrics.js'
import { redactingLogs, redactingSpans } from './redact.js'

const EXPORT_INTERVAL_MS = 15_000
const FLUSH_DEADLINE_MS = 2_000

export const serviceFromArgv = (entry: string | undefined): 'conexus-hub' | 'conexus-runner' =>
  entry?.replaceAll('\\', '/').endsWith('/app-runner/main.js') ? 'conexus-runner' : 'conexus-hub'

const STATIC_ASSET = /^\/(assets\/|favicon)|\.(js|css|map|svg|png|ico|woff2?)(\?|$)/

const INBOUND_CONTEXT = ['traceparent', 'tracestate', 'baggage'] as const

// The instrumentation calls this before it extracts the inbound context. Only the Hub and the worker
// reach the unix socket listeners (runner, handler port); a TCP request comes from outside, so its
// context is dropped and its server span starts a new trace (spec 0007, AC-28).
const distrustTcpTraceContext = (request: IncomingMessage): Attributes => {
  if (request.socket.remoteAddress !== undefined) for (const header of INBOUND_CONTEXT) delete request.headers[header]
  return {}
}

// The launch script owns the version and the env file owns OTEL_RESOURCE_ATTRIBUTES, so neither overrides the other.
const versionResource = (): resources.Resource | undefined => {
  const version = process.env.CONEXUS_SERVICE_VERSION
  return version ? resources.defaultResource().merge(resources.resourceFromAttributes({ 'service.version': version })) : undefined
}

export const startTelemetry = ({ service }: Readonly<{ service: 'conexus-hub' | 'conexus-runner' }>): NodeSDK => {
  const resource = versionResource()
  const sdk = new NodeSDK({
    serviceName: service,
    ...(resource ? { resource } : {}),
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
        startIncomingSpanHook: distrustTcpTraceContext,
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
