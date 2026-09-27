import { z } from 'zod'
import { AdapterFailure } from '../errors.js'
import type { AdapterFailureReason } from '../errors.js'
import type { Adapter, EnvelopeStatus, ProviderAnswer, ProviderCode, RequestTrace } from '../operation.js'
import { AccessToken } from '../token-cache.js'
import type { IssuedToken, Redacted, TokenLease } from '../token-cache.js'
import type { SankhyaCredential } from './credential.js'

// The only file that speaks the Sankhya gateway wire. Nothing here takes a service, entity,
// expression, URL, header or token from a consumer.

/**
 * The gateway origins the Sankhya documentation publishes: production and sandbox.
 * @public Tests import this at runtime from the built module.
 */
export const SANKHYA_GATEWAY_ORIGINS: readonly string[] = Object.freeze(['https://api.sankhya.com.br', 'https://api.sandbox.sankhya.com.br'])

/** The allow-list: read services only. Any other name is refused before a request is built. */
const SANKHYA_SERVICES = Object.freeze(['CRUDServiceProvider.loadRecords'] as const)
type SankhyaService = typeof SANKHYA_SERVICES[number]

type SankhyaEntity = 'CabecalhoNota' | 'ItemNota'
type SankhyaReference = Readonly<{ path: 'Parceiro' | 'Produto'; fields: readonly string[] }>
type SankhyaParameter = Readonly<{ type: 'I' | 'S'; value: string }>

/** One read. The operation fixes the entity, the fields and the expression; a consumer's value reaches only `parameters`. */
export type LoadRecordsQuery = Readonly<{
  rootEntity: SankhyaEntity
  fields: readonly string[]
  references: readonly SankhyaReference[]
  expression: string
  parameters: readonly SankhyaParameter[]
}>

/** A decoded row, keyed by the names the response metadata gives its positional fields. */
export type SankhyaRecord = Readonly<Record<string, string | null>>

export type SankhyaSession = Readonly<{
  loadRecords(query: LoadRecordsQuery): Promise<readonly SankhyaRecord[]>
  callService(service: SankhyaService, query: LoadRecordsQuery): Promise<readonly SankhyaRecord[]>
}>

const RESPONSE_CAP_BYTES = 256 * 1024
const FAILURE_READ_BYTES = 8 * 1024
const FAILURE_READ_MS = 250
const BEARER = /^[A-Za-z0-9\-._~+/]+=*$/
const PROVIDER_CODE = /\b(GTW\d{4}|CORE_E\d{1,8})(?=\W)/
const ENVELOPE_STATUS = /^\d{1,2}$/

/** Refuses anything but an exact published origin; the Hub reads CONEXUS_SANKHYA_GATEWAY_ORIGIN through this. */
export const pinnedGatewayOrigin = (value: string): string => {
  if (!SANKHYA_GATEWAY_ORIGINS.includes(value)) throw new Error('INVALID_CONFIG_CONEXUS_SANKHYA_GATEWAY_ORIGIN')
  return value
}

// Sankhya's return-code table answers an invalid or expired bearer with 403 GTW3403.
const failureOfStatus = (status: number, phase: 'authenticate' | 'service'): AdapterFailureReason | null => {
  if (status >= 200 && status < 300) return null
  if (status === 401 || status === 403 || (phase === 'authenticate' && status === 400)) return phase === 'authenticate' ? 'AUTHENTICATION_REFUSED' : 'TOKEN_REFUSED'
  if (status >= 500) return 'UNAVAILABLE'
  return 'PROVIDER_ERROR'
}

const transportFailure = (signal: AbortSignal): AdapterFailure => new AdapterFailure(signal.aborted ? 'TIMEOUT' : 'UNAVAILABLE')

const recordProviderCode = (text: string, answer: ProviderAnswer): void => {
  const code = PROVIDER_CODE.exec(text)?.[1]
  if (code) answer.providerCode = code as ProviderCode
}

const cappedFailureText = async (response: Response): Promise<string> => {
  const reader = response.body?.getReader()
  if (!reader) return ''
  const stop = setTimeout(() => { reader.cancel().catch(() => undefined) }, FAILURE_READ_MS)
  const chunks: Uint8Array[] = []
  let bytes = 0
  try {
    while (bytes < FAILURE_READ_BYTES) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      bytes += value.byteLength
    }
  } catch {} finally {
    clearTimeout(stop)
  }
  await reader.cancel().catch(() => undefined)
  return Buffer.concat(chunks).subarray(0, FAILURE_READ_BYTES).toString('utf8')
}

type Recording = Readonly<{ answer: ProviderAnswer; annotate: (pending: Promise<void>) => void }>

const send = async (fetchImpl: typeof fetch, url: string, init: RequestInit, signal: AbortSignal, phase: 'authenticate' | 'service', { answer, annotate }: Recording): Promise<string> => {
  let response: Response
  try {
    response = await fetchImpl(url, { ...init, signal, redirect: 'error' })
  } catch {
    throw transportFailure(signal)
  }
  answer.httpStatus = response.status
  const failure = failureOfStatus(response.status, phase)
  if (failure) {
    // The code is read after the failure is thrown, so a slow body never changes the call's result.
    annotate(cappedFailureText(response).then((text) => recordProviderCode(text, answer)))
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
  return Buffer.concat(chunks).toString('utf8')
}

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new AdapterFailure('RESPONSE_REFUSED')
  }
}

const tokenResponse = z.object({
  access_token: z.string().min(1).max(8192).regex(BEARER),
  expires_in: z.number().int().positive().max(7 * 24 * 3600),
})

const oneOrMany = <T extends z.ZodType>(item: T) => z.union([z.array(item), item]).transform((value) => (Array.isArray(value) ? value : [value]) as z.infer<T>[])
const envelope = z.object({
  status: z.string(),
  responseBody: z.object({
    entities: z.object({
      total: z.string().optional(),
      hasMoreResult: z.string().optional(),
      metadata: z.object({ fields: z.object({ field: oneOrMany(z.object({ name: z.string().min(1).max(128) })) }) }).optional(),
      entity: oneOrMany(z.record(z.string(), z.unknown())).optional(),
    }),
  }).optional(),
})

// Positional f0..fN, named through the metadata. A total of '0' is no record; a page that says more
// results exist is refused rather than returned partial.
const decodeRecords = (body: string, answer: ProviderAnswer): readonly SankhyaRecord[] => {
  const parsed = envelope.safeParse(parseJson(body))
  if (!parsed.success) throw new AdapterFailure('RESPONSE_REFUSED')
  const { status } = parsed.data
  if (ENVELOPE_STATUS.test(status)) answer.envelopeStatus = status as EnvelopeStatus
  if (status !== '1') {
    recordProviderCode(body, answer)
    throw new AdapterFailure('PROVIDER_ERROR')
  }
  const entities = parsed.data.responseBody?.entities
  if (!entities) throw new AdapterFailure('RESPONSE_REFUSED')
  if (entities.total === '0') return []
  if (entities.hasMoreResult === 'true' || !entities.metadata) throw new AdapterFailure('RESPONSE_REFUSED')
  const names = entities.metadata.fields.field.map((field) => field.name)
  return (entities.entity ?? []).map((row) => Object.freeze(Object.fromEntries(names.map((name, index) => {
    const value = row[`f${index}`]
    const text = typeof value === 'object' && value !== null && '$' in value ? value.$ : null
    return [name, typeof text === 'string' ? text : null]
  }))))
}

const requestBody = (service: SankhyaService, query: LoadRecordsQuery): string => JSON.stringify({
  serviceName: service,
  requestBody: {
    dataSet: {
      rootEntity: query.rootEntity,
      includePresentationFields: 'N',
      offsetPage: '0',
      criteria: {
        expression: { $: query.expression },
        parameter: query.parameters.map((parameter) => ({ $: parameter.value, type: parameter.type })),
      },
      entity: [
        { path: '', fieldset: { list: query.fields.join(',') } },
        ...query.references.map((reference) => ({ path: reference.path, fieldset: { list: reference.fields.join(',') } })),
      ],
    },
  },
})

/** The adapter factory. The Hub passes the pinned origin; a test passes a local fake's origin directly. */
export const createSankhyaGateway = ({ origin, fetch: fetchImpl = globalThis.fetch }: Readonly<{ origin: string; fetch?: typeof fetch }>): Adapter<SankhyaCredential, SankhyaSession> => Object.freeze({
  async authenticate(credential: Redacted<SankhyaCredential>, signal: AbortSignal, trace: RequestTrace): Promise<IssuedToken> {
    const { clientId, clientSecret, xToken } = credential.reveal()
    if (/[\r\n]/.test(xToken)) throw new AdapterFailure('AUTHENTICATION_REFUSED')
    return trace.request('authenticate', async (answer, annotate) => {
      const parsed = tokenResponse.safeParse(parseJson(await send(fetchImpl, `${origin}/authenticate`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-token': xToken },
        body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' }).toString(),
      }, signal, 'authenticate', { answer, annotate })))
      if (!parsed.success) throw new AdapterFailure('RESPONSE_REFUSED')
      return Object.freeze({ token: new AccessToken(parsed.data.access_token), expiresInSeconds: parsed.data.expires_in })
    })
  },
  open(token: TokenLease, signal: AbortSignal, trace: RequestTrace): SankhyaSession {
    const callService = async (service: SankhyaService, query: LoadRecordsQuery): Promise<readonly SankhyaRecord[]> => {
      if (!SANKHYA_SERVICES.includes(service)) throw new AdapterFailure('SERVICE_REFUSED')
      const bearer = (await token()).bearer()
      return trace.request(service, async (answer, annotate) => decodeRecords(await send(fetchImpl, `${origin}/gateway/v1/mge/service.sbr?serviceName=${encodeURIComponent(service)}&outputType=json`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${bearer}` },
        body: requestBody(service, query),
      }, signal, 'service', { answer, annotate }), answer))
    }
    return Object.freeze({
      callService,
      loadRecords: (query: LoadRecordsQuery) => callService(SANKHYA_SERVICES[0], query),
    })
  },
})
