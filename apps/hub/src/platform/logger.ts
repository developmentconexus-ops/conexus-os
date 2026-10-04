import { type Attributes, trace, SpanStatusCode } from '@opentelemetry/api'
import type { FastifyBaseLogger } from 'fastify'
import pino from 'pino'
import type { EventCode } from './log-events.generated.js'

// biome-ignore lint/style/noProcessEnv: debt: owning wave
export const logger: FastifyBaseLogger = pino({ level: process.env.LOG_LEVEL ?? 'info' })

/** What an event line may carry: scalars only, so no object, error text or secret rides along. */
export type EventFields = Readonly<Record<string, string | number | boolean>>

/** Where an event is written: the code is the record's message, the fields its attributes. */
export type EventLog = (code: EventCode, fields?: EventFields) => void

/** One line for something that happened and is not a failure. A failure goes through `logFailure`. */
export const logLine = (code: EventCode, fields: EventFields = {}, level: 'info' | 'warn' | 'error' = 'info'): void => {
  logger[level](fields, code)
}

const errorFields = (error: unknown): Attributes => {
  const type = error instanceof Error ? error.name : typeof error
  return {
    'error.type': type,
    'exception.type': type,
    'exception.message': error instanceof Error ? error.message : String(error),
    ...(error instanceof Error && error.stack ? { 'exception.stacktrace': error.stack } : {}),
  }
}

/**
 * Logs a failure with its type, message and stack at the level given, and records it on the
 * active span. Only an `error` level marks the span as failed.
 */
export const recordFailure = (
  log: Pick<FastifyBaseLogger, 'error' | 'warn' | 'info'>,
  message: string,
  error: unknown,
  fields: Attributes = {},
  level: 'error' | 'warn' | 'info' = 'error',
): void => {
  log[level]({ ...fields, ...errorFields(error) }, message)
  const span = trace.getActiveSpan()
  span?.recordException(error instanceof Error ? error : new Error(String(error)))
  if (level === 'error') span?.setStatus({ code: SpanStatusCode.ERROR })
}
