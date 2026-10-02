import type { z } from 'zod'
import type { BrokerErrorCode } from './errors.js'
import type { ConnectorId } from './model.js'
import type { ConsumerScope } from './scope.js'
import type { IssuedToken, Redacted } from './token-cache.js'

/** Not yet implemented: Sankhya's Definition declares no events. */
type ConnectorEvent<P> = Readonly<{ id: string; payload: z.ZodType<P> }>

/** No provider text becomes a field here: a detailed error code comes only from content capture (C-029). */
export type ProviderAnswer = { httpStatus?: number; bytes?: number }

export type RequestTrace = Readonly<{
  request<T>(name: string, send: (answer: ProviderAnswer) => Promise<T>, resultOf?: (value: T) => 'OK' | BrokerErrorCode): Promise<T>
}>

export type Adapter<Cred> = Readonly<{
  /** The pinned origin, normalized with `new URL(x).origin`: the executor compares it to a resolved URL's origin. */
  origin: string
  authenticate(credential: Redacted<Cred>, signal: AbortSignal, trace: RequestTrace): Promise<IssuedToken>
}>

/** An integrator's native protocol: pure, no network, no token. */
export type NativeProtocol = Readonly<{
  /** The read services `admit` can name: the tripwire's allow-list. */
  services: readonly string[]
  /** The read rule. `url` is already resolved against the pinned origin and origin-checked; `body` is a plain copy of the exact bytes that will be sent. */
  admit(read: Readonly<{ method: string; url: URL; body: unknown }>):
    /** `service`: the rule's own constant for records, never caller text. */
    | Readonly<{ ok: true; service: string }>
    | Readonly<{ ok: false; code: 'SERVICE_REFUSED' | 'INPUT_REFUSED'; issues?: readonly string[] }>
  answer(body: unknown): Readonly<{ kind: 'success' }> | Readonly<{ kind: 'vendor-error'; vendorStatus: string }> | Readonly<{ kind: 'unreadable' }>
  /** One request in flight per token (Sankhya). */
  oneRequestPerToken: boolean
}>

export type ConnectorDefinition<Cred> = Readonly<{
  id: ConnectorId
  credential: z.ZodType<Cred>
  // biome-ignore lint/suspicious/noExplicitAny: design only, no event exists yet
  events: readonly ConnectorEvent<any>[]
  secretFields: readonly string[]
  native: NativeProtocol
}>

export type Consumer =
  | Readonly<{ kind: 'handler'; invocationId: string; scope: ConsumerScope }>
  | Readonly<{ kind: 'agent'; sessionId: string; scope: ConsumerScope }>
  | Readonly<{ kind: 'integrator'; jobId: string; scope: ConsumerScope }>
