// What a refusal is on the page: one failure with a code, and the words the failure table gives it.
// The Hub names the code in its problem body; nothing else about a refusal is read.

import { FAILURE_ACTIONS, FAILURE_STATUS, FAILURES, Problem, type FailureCode } from '@conexus/contract'

/** A refusal the Hub, or the road to it, gave. Its words come from the failure table, never from here. */
export class HubFailure extends Error {
  readonly code: FailureCode
  readonly status: number | null
  readonly traceId: string | null

  constructor(code: FailureCode, status: number | null, traceId: string | null = null) {
    super(code)
    this.code = code
    this.status = status
    this.traceId = traceId
  }
}

const isFailureCode = (value: unknown): value is FailureCode => typeof value === 'string' && Object.hasOwn(FAILURE_STATUS, value)

/**
 * Reads a refused response's problem body. A body with no code is not the Hub's; a code the table
 * has no words for is a failure the person has no sentence for, which the table calls unexpected.
 */
export async function readFailure(response: Response): Promise<HubFailure> {
  const body: unknown = await response.json().catch(() => null)
  const parsed = Problem.safeParse(body)
  if (!parsed.success) return new HubFailure('HUB_RESPONSE_UNREADABLE', response.status)
  const { code, traceId } = parsed.data
  return new HubFailure(code, response.status, traceId ?? null)
}

/** Whether an error is the Hub's failure with one of these codes, or any code when none is named. */
export const isFailure = (error: unknown, ...codes: readonly FailureCode[]): boolean =>
  error instanceof HubFailure && (codes.length === 0 || codes.includes(error.code))

const hasRow = (code: FailureCode): code is keyof typeof FAILURES => Object.hasOwn(FAILURES, code)

/** The table's row for a code; the operator's codes have none, and answer with the unexpected failure's. */
const rowOf = (code: FailureCode) => FAILURES[hasRow(code) ? code : 'INTERNAL_UNEXPECTED']

const sentence = (code: FailureCode): string => {
  const row = rowOf(code)
  const action = FAILURE_ACTIONS[row.action]
  return action === null ? row.message : `${row.message} ${action}`
}

/** The short reference a person can quote: the first 8 characters of an id. */
export const shortReference = (id: string): string => `Referência: ${id.slice(0, 8)}.`

/** The sentence a person reads: the row's message, what to do when the row has one, and the trace's short reference when the Hub sent one. */
export const failureText = (error: unknown): string => {
  const text = sentence(error instanceof HubFailure ? error.code : 'HUB_RESPONSE_UNREADABLE')
  return error instanceof HubFailure && error.traceId !== null ? `${text} ${shortReference(error.traceId)}` : text
}

/** The same for a code the Hub stored, such as a settled run's `failureCode`; a code the table does not have is the unexpected failure. */
export const failureCodeText = (code: string | null | undefined): string => sentence(code !== null && code !== undefined && isFailureCode(code) ? code : 'INTERNAL_UNEXPECTED')

/** Whether the row tells the person to try again later: only a failure outside the Conexus code can. */
export const isRetryable = (error: unknown): boolean =>
  rowOf(error instanceof HubFailure ? error.code : 'HUB_RESPONSE_UNREADABLE').action === 'RETRY_LATER'
