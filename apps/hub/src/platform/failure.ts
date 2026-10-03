import { ErrorDomain, MastraError } from '@mastra/core/error'
import type { Attributes } from '@opentelemetry/api'
import type { FastifyBaseLogger } from 'fastify'
import { FAILURES, type FailureCode } from './failures.generated.js'
import { recordFailure } from './logger.js'

export type { FailureCode }

/**
 * Details reach telemetry with the span, so they hold only our own identifiers: ids, counts, a
 * name. Never a secret, a person's text or a vendor's text.
 */
type FailureDetails = Readonly<Record<string, string | number | boolean>>

/** A row of `contracts/technical/failures.json`, thrown. The code is Mastra's `id`; the message is the code. */
export class Failure extends MastraError {
  declare readonly id: FailureCode

  constructor(code: FailureCode, options: Readonly<{ cause?: unknown; details?: FailureDetails }> = {}) {
    super({ id: code, domain: ErrorDomain.MASTRA_SERVER, category: FAILURES[code].category, text: code, ...(options.details ? { details: { ...options.details } } : {}) }, options.cause)
    // Mastra wraps a cause that is not an Error in one that holds its JSON; the cause is kept as it was given.
    if (options.cause !== undefined && !(options.cause instanceof Error)) Object.defineProperty(this, 'cause', { value: options.cause, configurable: true, writable: true })
  }
}

export const failureRow = (failure: Failure) => FAILURES[failure.id]

const isFailureCode = (value: string): value is FailureCode => Object.hasOwn(FAILURES, value)

/** A function in our own database that ended with `RAISE EXCEPTION 'A_ROW_CODE'`: the one vendor error that already names a row. */
const raisedRow = (error: unknown): FailureCode | undefined =>
  error instanceof Error && 'code' in error && error.code === 'P0001' && isFailureCode(error.message) ? error.message : undefined

/**
 * A `Failure` as it is, a database RAISE of a row's code as that row with the original as its
 * cause; anything else is a fault nobody named, with the original as its cause.
 */
export const toFailure = (error: unknown): Failure => {
  if (error instanceof Failure) return error
  return new Failure(raisedRow(error) ?? 'INTERNAL_UNEXPECTED', { cause: error })
}

const LEVEL_BY_CATEGORY = { SYSTEM: 'error', THIRD_PARTY: 'warn', USER: 'info' } as const

/** The one log line of a failure, written where it leaves the process. The level follows the row's category. */
export const logFailure = (log: Pick<FastifyBaseLogger, 'error' | 'warn' | 'info'>, failure: Failure, fields: Attributes = {}): void => {
  const details = Object.fromEntries(Object.entries(failure.details ?? {}).map(([key, value]) => [`failure.details.${key}`, value]))
  recordFailure(log, failure.id, failure.cause ?? failure, { ...fields, ...details, 'failure.category': failure.category }, LEVEL_BY_CATEGORY[failureRow(failure).category])
}
