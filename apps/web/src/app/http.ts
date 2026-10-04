// The one way the hand-written clients reach the Hub. The Hub refuses a write without the CSRF
// token it set in its cookie, echoed in a header, so the cookie is read here and nowhere else.
// A refusal is read here too (see failure.ts), and a 401 drops what the page learned while signed in.

import { HubFailure, readFailure } from './failure.ts'
import { clearAuthorityCache } from './query-client'

/** The Hub's CSRF token, empty before the Hub has set it. */
const csrfToken = (): string =>
  decodeURIComponent(document.cookie.split('; ').find((item) => item.startsWith('__Host-conexus_csrf='))?.split('=').slice(1).join('=') ?? '')

/** `fetch` with the Hub session cookie, and the CSRF header on anything but a read. */
export const hubFetch = (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
  const method = (init.method ?? 'GET').toUpperCase()
  const headers = new Headers(init.headers)
  if (method !== 'GET' && method !== 'HEAD') headers.set('x-conexus-csrf', csrfToken())
  return fetch(input, { ...init, credentials: 'same-origin', headers })
}

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
