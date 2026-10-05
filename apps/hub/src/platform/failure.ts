import { ErrorDomain, MastraError } from '@mastra/core/error'
import { type Attributes, SpanStatusCode, trace } from '@opentelemetry/api'
import type { FastifyBaseLogger } from 'fastify'
import { FAILURES, type FailureCode } from './failures.generated.js'

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

/**
 * The one log line of a failure, written where it leaves the process. The level follows the row's
 * category. It holds the code, the category, the cause's type and our own ids: never the cause's
 * message or stack, which may carry a person's or a vendor's text.
 */
const SYSTEM_CODE = /^(?:[A-Z][A-Z0-9_]+|[0-9][0-9A-Z]{4})$/
const MAX_FRAMES = 12

/**
 * Where a failure came from: the frame lines of each error in its cause chain, each headed by the
 * error's type and its system code (`ECONNREFUSED`, or a SQLSTATE such as `42501`). A message can carry a URL, a host or vendor
 * text, so no message is written.
 */
const stackOf = (error: unknown): string | undefined => {
  const lines: string[] = []
  let current: unknown = error
  for (let depth = 0; current instanceof Error && depth < 5; depth += 1) {
    const code: unknown = 'code' in current ? current.code : undefined
    lines.push(`${depth === 0 ? '' : 'caused by '}${current.name}${typeof code === 'string' && SYSTEM_CODE.test(code) ? ` (${code})` : ''}`)
    lines.push(...(current.stack ?? '').split('\n').filter((line) => /^\s+at /.test(line) && !line.includes('(node:internal/')).slice(0, MAX_FRAMES))
    current = current.cause
  }
  return lines.length > 0 ? lines.join('\n') : undefined
}

export const logFailure = (log: Pick<FastifyBaseLogger, 'error' | 'warn' | 'info'>, failure: Failure, fields: Attributes = {}): void => {
  const details = Object.fromEntries(Object.entries(failure.details ?? {}).map(([key, value]) => [`failure.details.${key}`, value]))
  const cause = failure.cause ?? failure
  const type = cause instanceof Error ? cause.name : typeof cause
  const level = LEVEL_BY_CATEGORY[failureRow(failure).category]
  const stack = level === 'error' ? stackOf(cause) : undefined
  log[level]({ ...fields, ...details, 'failure.category': failure.category, 'error.type': type, 'exception.type': type, ...(stack ? { 'exception.stacktrace': stack } : {}) }, failure.id)
  const span = trace.getActiveSpan()
  span?.recordException(Object.assign(new Error(failure.id), { name: type }))
  if (level === 'error') span?.setStatus({ code: SpanStatusCode.ERROR })
}
