// What a refusal is on the page: one failure with a code, and the words the failure table gives it.
// The Hub names the code in its problem body; nothing else about a refusal is read.

import { FAILURE_ACTIONS, FAILURES, type FailureCode } from '../generated/failures.ts'

/** A refusal the Hub, or the road to it, gave. Its words come from the failure table, never from here. */
export class HubFailure extends Error {
  readonly code: FailureCode
  readonly status: number | null

  constructor(code: FailureCode, status: number | null) {
    super(code)
    this.code = code
    this.status = status
  }
}

const isFailureCode = (value: unknown): value is FailureCode => typeof value === 'string' && Object.hasOwn(FAILURES, value)

/**
 * Reads a refused response's problem body. A body with no code is not the Hub's; a code the table
 * has no words for is a failure the person has no sentence for, which the table calls unexpected.
 */
export async function readFailure(response: Response): Promise<HubFailure> {
  const body: unknown = await response.json().catch(() => null)
  const code = typeof body === 'object' && body !== null && 'code' in body ? body.code : undefined
  if (isFailureCode(code)) return new HubFailure(code, response.status)
  return new HubFailure(typeof code === 'string' ? 'INTERNAL_UNEXPECTED' : 'HUB_RESPONSE_UNREADABLE', response.status)
}

/** Whether an error is the Hub's failure with one of these codes, or any code when none is named. */
export const isFailure = (error: unknown, ...codes: readonly FailureCode[]): boolean =>
  error instanceof HubFailure && (codes.length === 0 || codes.includes(error.code))

/** The sentence a person reads: the row's message and, when the row has one, what to do. */
export function failureText(error: unknown): string {
  const row = FAILURES[error instanceof HubFailure ? error.code : 'HUB_RESPONSE_UNREADABLE']
  const action = FAILURE_ACTIONS[row.action]
  return action === null ? row.message : `${row.message} ${action}`
}

/** Whether the row tells the person to try again later: only a failure outside the Conexus code can. */
export const isRetryable = (error: unknown): boolean =>
  FAILURES[error instanceof HubFailure ? error.code : 'HUB_RESPONSE_UNREADABLE'].action === 'RETRY_LATER'
