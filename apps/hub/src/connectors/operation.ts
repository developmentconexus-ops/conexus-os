import type { z } from 'zod'
import type { ConnectorId, OperationId } from './model.js'
import type { ConsumerScope } from './scope.js'
import type { IssuedToken, Redacted, TokenLease } from './token-cache.js'

type Effect = 'read' | 'write'

/**
 * A plain function with its own contract. `createTool` wraps one for agents; it does not define it.
 * `summary` is product language: no service, entity or field name.
 */
export type Operation<I, O, S> = Readonly<{
  id: OperationId
  effect: Effect
  summary: string
  input: z.ZodType<I>
  output: z.ZodType<O>
  run(input: I, session: S): Promise<O>
}>

/** Not yet implemented: Sankhya's Definition declares no events. */
type ConnectorEvent<P> = Readonly<{ id: string; payload: z.ZodType<P> }>

/**
 * What one provider request answered, as the adapter learns it. Value-free by construction: the
 * adapter sets a field only from a number or a strict pattern, never from provider text.
 */
export type ProviderAnswer = { httpStatus?: number; envelopeStatus?: string; providerCode?: string }

/** Records the provider requests of one call: `request` runs `send` as one request, in order. */
export type RequestTrace = Readonly<{
  request<T>(name: string, send: (answer: ProviderAnswer) => Promise<T>): Promise<T>
}>

export type Adapter<Cred, S> = Readonly<{
  authenticate(credential: Redacted<Cred>, signal: AbortSignal, trace: RequestTrace): Promise<IssuedToken>
  /** The session asks `token` only after it has admitted the service, so a refused service never reaches the network. */
  open(token: TokenLease, signal: AbortSignal, trace: RequestTrace): S
}>

export type ConnectorDefinition<Cred, S> = Readonly<{
  id: ConnectorId
  credential: z.ZodType<Cred>
  // biome-ignore lint/suspicious/noExplicitAny: each operation keeps its own input and output types
  operations: readonly Operation<any, any, S>[]
  // biome-ignore lint/suspicious/noExplicitAny: design only, no event exists yet
  events: readonly ConnectorEvent<any>[]
  builderSkill: string
  /** The field names that carry this Connector's credential or token; the call record's filter redacts them wherever they appear. */
  secretFields: readonly string[]
}>

/** Who asks. Only the scope selects the grant; the kind labels the call's record, the reference is never recorded. */
export type Consumer =
  | Readonly<{ kind: 'handler'; invocationId: string; scope: ConsumerScope }>
  | Readonly<{ kind: 'agent'; sessionId: string; scope: ConsumerScope }>
  | Readonly<{ kind: 'integrator'; jobId: string; scope: ConsumerScope }>
