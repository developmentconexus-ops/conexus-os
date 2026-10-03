import { z } from 'zod'
import { AdapterFailure, inputIssues, transportFailure } from './errors.js'
import type { BrokerErrorCode } from './errors.js'
import type { NativeProtocol, ProviderAnswer } from './integrator.js'
import type { AccessToken } from './token-cache.js'

export type NativeRequest = Readonly<{
  /** A Project-local binding name. */
  connection: string
  /** The integrator's read rule decides which methods read. */
  method: string
  path: string
  query?: Readonly<Record<string, string>> | undefined
  body?: unknown
}>

export type FetchResult =
  /** The vendor's parsed JSON, bearer redacted, and the size of the answer as read. A 2xx answer that does not parse, or is over
   * `responseBytes`, is a refusal with no vendor byte. */
  | Readonly<{ ok: true; status: number; bytes: number; body: unknown }>
  | Readonly<{
      ok: false
      code: BrokerErrorCode
      /** INPUT_REFUSED only: schema paths, never caller text. */
      issues?: readonly string[]
      /** The vendor's HTTP status, when it answered the service request. */
      status?: number
      /** A vendor error inside a 2xx answer: the vendor's own status (Sankhya's envelope status). */
      vendorStatus?: string
      /** That vendor error answer, bearer redacted; only for a 2xx vendor error. */
      body?: unknown
    }>

export type NativeLimits = Readonly<{ deadlineMs: number; responseBytes: number; requestBytes: number }>

export const DEFAULT_NATIVE_LIMITS: NativeLimits = Object.freeze({ deadlineMs: 10_000, responseBytes: 256 * 1024, requestBytes: 64 * 1024 })

/** The body serialized once: `sent` is what goes on the wire, `plain` the copy the read rule inspects. */
type NativeBody = Readonly<{ sent: string; plain: unknown }>

export type ParsedNativeRequest = Readonly<{
  connection: string
  method: string
  path: string
  query: Readonly<Record<string, string>>
  body: NativeBody | null
}>

const QUERY_KEYS = 32

export const nativeRequestSchema = z.strictObject({
  connection: z.string().min(1).max(40),
  method: z.string().min(1).max(16),
  path: z.string().min(1).max(2048),
  query: z.record(z.string().min(1).max(128), z.string().max(4096))
    .refine((query) => Object.keys(query).length <= QUERY_KEYS, { message: 'too many query keys' }).optional(),
  body: z.unknown().optional(),
}) satisfies z.ZodType<NativeRequest>

const serialized = (body: unknown): string | undefined => {
  try {
    return JSON.stringify(body)
  } catch {
    return undefined
  }
}

export const parseNativeRequest = (value: unknown, limits: NativeLimits): Readonly<{ ok: true; request: ParsedNativeRequest }> | Readonly<{ ok: false; issues: readonly string[] }> => {
  const parsed = nativeRequestSchema.safeParse(value)
  if (!parsed.success) return { ok: false, issues: inputIssues(parsed.error.issues) }
  const { connection, method, path, query = {}, body } = parsed.data
  let payload: NativeBody | null = null
  if (body !== undefined) {
    const sent = serialized(body)
    if (sent === undefined || Buffer.byteLength(sent) > limits.requestBytes) return { ok: false, issues: ['/body'] }
    payload = Object.freeze({ sent, plain: JSON.parse(sent) })
  }
  return { ok: true, request: Object.freeze({ connection, method, path, query: Object.freeze({ ...query }), body: payload }) }
}

/**
 * The URL a request may reach, or null. (a) A request names a path, never a scheme or host, so an
 * absolute URL is refused on its own, even one to the pinned origin. (b) URL resolution reads a
 * backslash as a slash, strips leading spaces and control characters, and removes every tab and
 * newline, so `\\host`, `/\host`, ` //host` and `/\t/host` all reach another host: only the resolved
 * URL's origin is the host guard.
 */
export const pinnedUrl = (path: string, query: Readonly<Record<string, string>>, origin: string): URL | null => {
  if (URL.canParse(path) || !URL.canParse(path, origin)) return null
  const url = new URL(path, origin)
  if (url.origin !== origin || url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '') return null
  for (const [key, value] of Object.entries(query)) url.searchParams.append(key, value)
  return url
}

const REDACTED = '[redacted]'

// A parsed body is redacted value by value, so no JSON escape of the bearer survives.
const redacted = (value: unknown, bearer: string): unknown => {
  if (typeof value === 'string') return value.replaceAll(bearer, REDACTED)
  if (Array.isArray(value)) return value.map((item) => redacted(item, bearer))
  if (typeof value !== 'object' || value === null) return value
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key.replaceAll(bearer, REDACTED), redacted(item, bearer)]))
}

/** The whole answer, or null once it passes `limit`. */
const readWithin = async (response: Response, limit: number, signal: AbortSignal): Promise<Buffer | null> => {
  const reader = response.body?.getReader()
  if (!reader) return Buffer.alloc(0)
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return Buffer.concat(chunks, size)
      if (size + value.byteLength > limit) {
        await reader.cancel().catch(() => undefined)
        return null
      }
      chunks.push(value)
      size += value.byteLength
    }
  } catch {
    throw transportFailure(signal)
  }
}

const failed = (code: BrokerErrorCode, status: number, vendor?: Readonly<{ vendorStatus: string; body: unknown }>): FetchResult =>
  Object.freeze(vendor ? { ok: false, code, status, vendorStatus: vendor.vendorStatus, body: vendor.body } : { ok: false, code, status })

/**
 * One request to the admitted URL, with exactly the Hub's own headers, and its answer read. A
 * redirect is never followed. A refused token throws `TOKEN_REFUSED`, so the token cache reissues
 * once; a transport failure or the deadline throws too. Every other answer is a result.
 */
export const sendNative = async (
  { method, url, body, token, signal, responseBytes, protocol }: Readonly<{
    method: string; url: URL; body: NativeBody | null; token: AccessToken; signal: AbortSignal; responseBytes: number; protocol: NativeProtocol
  }>,
  answer: ProviderAnswer,
): Promise<FetchResult> => {
  const bearer = token.bearer()
  const headers: Record<string, string> = { accept: 'application/json', authorization: `Bearer ${bearer}` }
  if (body) headers['content-type'] = 'application/json'
  let response: Response
  try {
    response = await fetch(url, { method, headers, signal, redirect: 'manual', ...(body ? { body: body.sent } : {}) })
  } catch {
    throw transportFailure(signal)
  }
  const { status } = response
  answer.httpStatus = status
  if (status < 200 || status >= 300) {
    // A non-2xx body is never read: it can only reach the consumer through a status.
    await response.body?.cancel().catch(() => undefined)
    if (status === 401 || status === 403) throw new AdapterFailure('TOKEN_REFUSED')
    return failed(status === 429 || status >= 500 ? 'PROVIDER_UNAVAILABLE' : 'PROVIDER_ERROR', status)
  }
  const bytes = await readWithin(response, responseBytes, signal)
  if (!bytes) return failed('RESPONSE_TOO_LARGE', status)
  answer.bytes = bytes.byteLength
  let vendorBody: unknown
  try {
    vendorBody = redacted(JSON.parse(bytes.toString('utf8')), bearer)
  } catch {
    return failed('RESPONSE_REFUSED', status)
  }
  const verdict = protocol.answer(vendorBody)
  if (verdict.kind !== 'unreadable' && verdict.envelopeStatus) answer.envelopeStatus = verdict.envelopeStatus
  switch (verdict.kind) {
    case 'success': return Object.freeze({ ok: true, status, bytes: bytes.byteLength, body: vendorBody })
    case 'vendor-error': return failed('PROVIDER_ERROR', status, { vendorStatus: verdict.vendorStatus, body: vendorBody })
    case 'unreadable': return failed('RESPONSE_REFUSED', status)
  }
}
