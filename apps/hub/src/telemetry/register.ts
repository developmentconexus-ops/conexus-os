import { register } from 'node:module'
import { startHeapWatch } from './heap-watch.js'
import { serviceFromArgv, startTelemetry } from './start.js'

// The new HTTP and database attribute names are what the allowlist (redact.ts) admits.
// biome-ignore lint/style/noProcessEnv: debt: owning wave
process.env.OTEL_SEMCONV_STABILITY_OPT_IN ??= 'http,database'
register('@opentelemetry/instrumentation/hook.mjs', import.meta.url)
// biome-ignore lint/style/noProcessEnv: debt: owning wave
if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) startTelemetry({ service: serviceFromArgv(process.argv[1]) })
// pino must load after the SDK has enabled its instrumentations.
const { logger } = await import('../platform/logger.js')
startHeapWatch((fields, message) => logger.warn(fields, message))
