// The one way the hand-written clients reach the Hub. The Hub refuses a write without the CSRF
// token it set in its cookie, echoed in a header, so the cookie is read here and nowhere else.

/** The Hub's CSRF token, empty before the Hub has set it. */
export const csrfToken = (): string =>
  decodeURIComponent(document.cookie.split('; ').find((item) => item.startsWith('__Host-conexus_csrf='))?.split('=').slice(1).join('=') ?? '')

/** `fetch` with the Hub session cookie, and the CSRF header on anything but a read. */
export const hubFetch = (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
  const method = (init.method ?? 'GET').toUpperCase()
  const headers = new Headers(init.headers)
  if (method !== 'GET' && method !== 'HEAD') headers.set('x-conexus-csrf', csrfToken())
  return fetch(input, { ...init, credentials: 'same-origin', headers })
}
