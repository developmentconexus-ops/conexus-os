import { z } from 'zod'
import { AdapterFailure, transportFailure } from '../errors.js'
import type { AdapterFailureReason } from '../errors.js'
import type { Adapter, EnvelopeStatus, NativeProtocol, ProviderAnswer, RequestTrace } from '../integrator.js'
import { AccessToken } from '../token-cache.js'
import type { IssuedToken, Redacted } from '../token-cache.js'
import type { SankhyaCredential } from './credential.js'
import { isOneReadStatement } from './read-only-sql.js'

/** The gateway origins the Sankhya documentation publishes: production and sandbox. */
const SANKHYA_GATEWAY_ORIGINS: readonly string[] = Object.freeze(['https://api.sankhya.com.br', 'https://api.sandbox.sankhya.com.br'])

const LOAD_RECORDS = 'CRUDServiceProvider.loadRecords'

const sqlConsult = z.strictObject({ sql: z.string() })

/**
 * The allow-list: read services only, each with the rule for its native `requestBody`, which answers
 * the refused schema path or null. Any other name is refused before a request is built.
 */
const READ_SERVICES: ReadonlyMap<string, (requestBody: unknown) => string | null> = new Map([
  [LOAD_RECORDS, () => null],
  ['DbExplorerSP.executeQuery', (requestBody: unknown) => {
    const consult = sqlConsult.safeParse(requestBody)
    if (!consult.success) return '/body/requestBody'
    return isOneReadStatement(consult.data.sql) ? null : '/body/requestBody/sql'
  }],
])
const SANKHYA_SERVICES = Object.freeze([...READ_SERVICES.keys()])

const SERVICE_PATH = '/gateway/v1/mge/service.sbr'

const RESPONSE_CAP_BYTES = 256 * 1024
const BEARER = /^[A-Za-z0-9\-._~+/]+=*$/
const RECORDED_ENVELOPE_STATUSES: ReadonlySet<string> = new Set(['0', '1', '2', '3', '4'])
const isRecordedEnvelopeStatus = (status: string): status is EnvelopeStatus => RECORDED_ENVELOPE_STATUSES.has(status)

/** Refuses anything but an exact published origin; the Hub reads CONEXUS_SANKHYA_GATEWAY_ORIGIN through this. */
export const pinnedGatewayOrigin = (value: string): string => {
  if (!SANKHYA_GATEWAY_ORIGINS.includes(value)) throw new Error('INVALID_CONFIG_CONEXUS_SANKHYA_GATEWAY_ORIGIN')
  return value
}

const failureOfStatus = (status: number): AdapterFailureReason | null => {
  if (status >= 200 && status < 300) return null
  if (status === 400 || status === 401 || status === 403) return 'AUTHENTICATION_REFUSED'
  if (status >= 500) return 'UNAVAILABLE'
  return 'PROVIDER_ERROR'
}

const send = async (fetchImpl: typeof fetch, url: string, init: RequestInit, signal: AbortSignal, answer: ProviderAnswer): Promise<unknown> => {
  let response: Response
  try {
    response = await fetchImpl(url, { ...init, signal, redirect: 'error' })
  } catch {
    throw transportFailure(signal)
  }
  answer.httpStatus = response.status
  const failure = failureOfStatus(response.status)
  if (failure) {
    // The provider's body and status text never leave this file, not even into an error or a record.
    await response.body?.cancel().catch(() => undefined)
    throw new AdapterFailure(failure)
  }
  const chunks: Uint8Array[] = []
  let bytes = 0
  try {
    const reader = response.body?.getReader()
    for (;;) {
      if (!reader) break
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > RESPONSE_CAP_BYTES) {
        await reader.cancel().catch(() => undefined)
        throw new AdapterFailure('RESPONSE_REFUSED')
      }
      chunks.push(value)
    }
  } catch (error) {
    if (error instanceof AdapterFailure) throw error
    throw transportFailure(signal)
  }
  try {
    // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  } catch {
    throw new AdapterFailure('RESPONSE_REFUSED')
  }
}

const tokenResponse = z.object({
  access_token: z.string().min(1).max(8192).regex(BEARER),
  expires_in: z.number().int().positive().max(7 * 24 * 3600),
})

const jsonObject = z.record(z.string(), z.unknown())
const envelope = z.object({ status: z.string() })

const SERVICE_REFUSED = Object.freeze({ ok: false, code: 'SERVICE_REFUSED' } as const)
const inputRefused = (issue: string) => Object.freeze({ ok: false, code: 'INPUT_REFUSED', issues: Object.freeze([issue]) } as const)

/**
 * The native read rule: POST to the gateway's service route, one service on the allow-list in the
 * query, `outputType=json`, and a JSON object body naming that same service, whose `requestBody` that
 * service's rule admits. It has no loadRecords expression filter: C-030 puts the read boundary at the
 * vendor's principal, and this is the service-level tripwire.
 */
export const sankhyaNativeProtocol: NativeProtocol = Object.freeze({
  services: SANKHYA_SERVICES,
  admit({ method, url, body }: Readonly<{ method: string; url: URL; body: unknown }>) {
    const named = url.searchParams.getAll('serviceName')
    const allowed = named.length === 1 ? [...READ_SERVICES].find(([name]) => name === named[0]) : undefined
    if (method !== 'POST' || url.pathname !== SERVICE_PATH || !allowed) return SERVICE_REFUSED
    const [service, admitBody] = allowed
    if ([...url.searchParams.keys()].some((key) => key !== 'serviceName' && key !== 'outputType')) return inputRefused('/query')
    const output = url.searchParams.getAll('outputType')
    if (output.length !== 1 || output[0] !== 'json') return inputRefused('/query/outputType')
    const request = jsonObject.safeParse(body)
    if (!request.success) return inputRefused('/body')
    if (request.data.serviceName !== service) return SERVICE_REFUSED
    const issue = admitBody(request.data.requestBody)
    if (issue) return inputRefused(issue)
    return Object.freeze({ ok: true, service })
  },
  answer(body: unknown) {
    const parsed = envelope.safeParse(body)
    if (!parsed.success) return Object.freeze({ kind: 'unreadable' })
    const { status } = parsed.data
    const envelopeStatus = isRecordedEnvelopeStatus(status) ? status : 'other'
    return status === '1' ? Object.freeze({ kind: 'success', envelopeStatus }) : Object.freeze({ kind: 'vendor-error', vendorStatus: status, envelopeStatus })
  },
  oneRequestPerToken: true,
})

/** The adapter factory. The Hub passes the pinned origin; a test passes a local fake's origin directly. */
export const createSankhyaGateway = ({ origin, fetch: fetchImpl = globalThis.fetch }: Readonly<{ origin: string; fetch?: typeof fetch }>): Adapter<SankhyaCredential> => Object.freeze({
  origin: new URL(origin).origin,
  async authenticate(credential: Redacted<SankhyaCredential>, signal: AbortSignal, trace: RequestTrace): Promise<IssuedToken> {
    const { clientId, clientSecret, xToken } = credential.reveal()
    if (/[\r\n]/.test(xToken)) throw new AdapterFailure('AUTHENTICATION_REFUSED')
    return trace.request('authenticate', async (answer) => {
      const parsed = tokenResponse.safeParse(await send(fetchImpl, `${origin}/authenticate`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-token': xToken },
        body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' }).toString(),
      }, signal, answer))
      if (!parsed.success) throw new AdapterFailure('RESPONSE_REFUSED')
      return Object.freeze({ token: new AccessToken(parsed.data.access_token), expiresInSeconds: parsed.data.expires_in })
    })
  },
})
