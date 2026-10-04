// A refusal is read here too (see failure.ts), and a 401 drops what the page learned while signed in.

import { HubFailure, readFailure } from './failure.ts'
import { clearAuthorityCache } from './query-client'

export const hubFetch = (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> =>
  fetch(input, { ...init, credentials: 'same-origin' })

/** Reads a refused response into a failure; a 401 also drops what the page learned while signed in. */
async function hubFailure(response: Response): Promise<HubFailure> {
  if (response.status === 401) clearAuthorityCache()
  return readFailure(response)
}

type HubExpected = 'ok' | number | readonly number[]

const accepted = (response: Response, expected: HubExpected): boolean =>
  expected === 'ok' ? response.ok : Array.isArray(expected) ? expected.includes(response.status) : response.status === expected

/** Awaits a request and returns the response when it is one of the expected answers; otherwise throws the failure. */
export async function hubCall(request: Promise<Response>, expected: HubExpected = 'ok'): Promise<Response> {
  const response = await request.catch(() => { throw new HubFailure('HUB_UNREACHABLE', null) })
  if (accepted(response, expected)) return response
  throw await hubFailure(response)
}

export { failureText, isFailure, isRetryable } from './failure.ts'
