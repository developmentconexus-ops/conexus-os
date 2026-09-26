import { z } from 'zod'
import { AdapterFailure } from '../errors.js'
import type { AdapterFailureReason } from '../errors.js'
import type { Adapter, ServiceTrace } from '../operation.js'
import { AccessToken } from '../token-cache.js'
import type { IssuedToken, Redacted, TokenLease } from '../token-cache.js'
import type { SankhyaCredential } from './credential.js'

// The only file that speaks the Sankhya gateway wire. Nothing here takes a service, entity,
// expression, URL, header or token from a consumer.

/** The gateway origins the Sankhya documentation publishes: production and sandbox. */
export const SANKHYA_GATEWAY_ORIGINS: readonly string[] = Object.freeze(['https://api.sankhya.com.br', 'https://api.sandbox.sankhya.com.br'])

/** The allow-list: read services only. Any other name is refused before a request is built. */
export const SANKHYA_SERVICES = Object.freeze(['CRUDServiceProvider.loadRecords'] as const)
export type SankhyaService = typeof SANKHYA_SERVICES[number]

export type SankhyaEntity = 'CabecalhoNota' | 'ItemNota'
export type SankhyaReference = Readonly<{ path: 'Parceiro' | 'Produto'; fields: readonly string[] }>
export type SankhyaParameter = Readonly<{ type: 'I' | 'S'; value: string }>

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
const BEARER = /^[A-Za-z0-9\-._~+/]+=*$/

/** Refuses anything but an exact published origin; the Hub reads CONEXUS_SANKHYA_GATEWAY_ORIGIN through this. */
export const pinnedGatewayOrigin = (value: string): string => {
  if (!SANKHYA_GATEWAY_ORIGINS.includes(value)) throw new Error('INVALID_CONFIG_CONEXUS_SANKHYA_GATEWAY_ORIGIN')
  return value
}

// One classification for every HTTP status the gateway answers. Whether a refused token surfaces as
// HTTP 401 or inside the response envelope is unverified; only the status is checked here.
const failureOfStatus = (status: number, phase: 'authenticate' | 'service'): AdapterFailureReason | null => {
  if (status >= 200 && status < 300) return null
  if (status === 401 || status === 403 || (phase === 'authenticate' && status === 400)) return phase === 'authenticate' ? 'AUTHENTICATION_REFUSED' : 'TOKEN_REFUSED'
  if (status >= 500) return 'UNAVAILABLE'
  return 'PROVIDER_ERROR'
}

const transportFailure = (signal: AbortSignal): AdapterFailure => new AdapterFailure(signal.aborted ? 'TIMEOUT' : 'UNAVAILABLE')

const send = async (fetchImpl: typeof fetch, url: string, init: RequestInit, signal: AbortSignal, phase: 'authenticate' | 'service'): Promise<unknown> => {
  let response: Response
  try {
    response = await fetchImpl(url, { ...init, signal, redirect: 'error' })
  } catch {
    throw transportFailure(signal)
  }
  const failure = failureOfStatus(response.status, phase)
  if (failure) {
    // The provider's body and status text never leave this file, not even into an error.
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
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
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
const decodeRecords = (body: unknown): readonly SankhyaRecord[] => {
  const parsed = envelope.safeParse(body)
  if (!parsed.success) throw new AdapterFailure('RESPONSE_REFUSED')
  if (parsed.data.status !== '1') throw new AdapterFailure('PROVIDER_ERROR')
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
  async authenticate(credential: Redacted<SankhyaCredential>, signal: AbortSignal): Promise<IssuedToken> {
    const { clientId, clientSecret, xToken } = credential.reveal()
    if (/[\r\n]/.test(xToken)) throw new AdapterFailure('AUTHENTICATION_REFUSED')
    const body = await send(fetchImpl, `${origin}/authenticate`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-token': xToken },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' }).toString(),
    }, signal, 'authenticate')
    const parsed = tokenResponse.safeParse(body)
    if (!parsed.success) throw new AdapterFailure('RESPONSE_REFUSED')
    return Object.freeze({ token: new AccessToken(parsed.data.access_token), expiresInSeconds: parsed.data.expires_in })
  },
  open(token: TokenLease, signal: AbortSignal, trace: ServiceTrace): SankhyaSession {
    const callService = async (service: SankhyaService, query: LoadRecordsQuery): Promise<readonly SankhyaRecord[]> => {
      if (!SANKHYA_SERVICES.includes(service)) throw new AdapterFailure('SERVICE_REFUSED')
      const bearer = (await token()).bearer()
      trace.called(service)
      const body = await send(fetchImpl, `${origin}/gateway/v1/mge/service.sbr?serviceName=${encodeURIComponent(service)}&outputType=json`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${bearer}` },
        body: requestBody(service, query),
      }, signal, 'service')
      return decodeRecords(body)
    }
    return Object.freeze({
      callService,
      loadRecords: (query: LoadRecordsQuery) => callService(SANKHYA_SERVICES[0], query),
    })
  },
})
