import { Failure, type FailureCode, toFailure } from '../platform/failure.js'

const FASTIFY_FAILURES: ReadonlyMap<string, FailureCode> = new Map([
  ['FST_ERR_VALIDATION', 'REQUEST_VALIDATION_FAILED'],
  ['FST_ERR_CTP_BODY_TOO_LARGE', 'REQUEST_BODY_TOO_LARGE'],
  ['FST_ERR_CTP_INVALID_JSON_BODY', 'REQUEST_JSON_INVALID'],
  ['FST_ERR_CTP_INVALID_MEDIA_TYPE', 'REQUEST_MEDIA_TYPE_UNSUPPORTED'],
])

export function failureFromFastify(error: unknown): Failure {
  if (error instanceof Failure) return error
  if (typeof error !== 'object' || error === null || !('code' in error) || typeof error.code !== 'string') return toFailure(error)
  const code = FASTIFY_FAILURES.get(error.code)
  return code ? new Failure(code, { cause: error }) : toFailure(error)
}
