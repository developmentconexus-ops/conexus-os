import { FAILURE_ACTIONS, FAILURE_STATUS, FAILURES, type FailureCode } from './failures.generated.js'
import { Problem } from './problem.js'

/** A public failure reconstructed at a client boundary. It never carries server diagnostics. */
export class ReceivedFailure extends Error {
  readonly code: FailureCode
  readonly status: number | null
  readonly traceId: string | null

  constructor(code: FailureCode, status: number | null, traceId: string | null = null) {
    super(code)
    this.name = 'ReceivedFailure'
    this.code = code
    this.status = status
    this.traceId = traceId
  }
}

const isFailureCode = (value: unknown): value is FailureCode =>
  typeof value === 'string' && Object.hasOwn(FAILURE_STATUS, value)

/** Reads only the closed Problem representation, and requires its status to match the HTTP status. */
export async function readFailure(response: Response): Promise<ReceivedFailure> {
  const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
  if (contentType !== 'application/problem+json') return new ReceivedFailure('HUB_RESPONSE_UNREADABLE', response.status)
  const body: unknown = await response.json().catch(() => null)
  const parsed = Problem.safeParse(body)
  if (response.status < 400 || response.status > 599 || !parsed.success || parsed.data.status !== response.status) {
    return new ReceivedFailure('HUB_RESPONSE_UNREADABLE', response.status)
  }
  const { code, traceId } = parsed.data
  return new ReceivedFailure(code, response.status, traceId ?? null)
}

export const isFailure = (error: unknown, ...codes: readonly FailureCode[]): error is ReceivedFailure =>
  error instanceof ReceivedFailure && (codes.length === 0 || codes.includes(error.code))

const hasAudienceRow = (code: FailureCode): code is keyof typeof FAILURES => {
  return Object.hasOwn(FAILURES, code)
}

const rowOf = (code: FailureCode) => {
  if (!hasAudienceRow(code)) return FAILURES.INTERNAL_UNEXPECTED
  return FAILURES[code]
}

const sentence = (code: FailureCode): string => {
  const row = rowOf(code)
  const action = FAILURE_ACTIONS[row.action]
  return action === null ? row.message : `${row.message} ${action}`
}

/** The short reference for stored run identifiers as well as validated trace identifiers. */
export const shortReference = (id: string): string => `Referência: ${id.slice(0, 8)}.`

export const failureText = (error: unknown): string => {
  const code = error instanceof ReceivedFailure ? error.code : 'HUB_RESPONSE_UNREADABLE'
  const text = sentence(code)
  return error instanceof ReceivedFailure && error.traceId !== null && rowOf(code).category === 'SYSTEM'
    ? `${text} ${shortReference(error.traceId)}`
    : text
}

export const failureCodeText = (code: string | null | undefined): string =>
  sentence(code !== null && code !== undefined && isFailureCode(code) ? code : 'INTERNAL_UNEXPECTED')

export const isRetryable = (error: unknown): boolean =>
  rowOf(error instanceof ReceivedFailure ? error.code : 'HUB_RESPONSE_UNREADABLE').action === 'RETRY_LATER'
