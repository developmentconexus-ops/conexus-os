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
