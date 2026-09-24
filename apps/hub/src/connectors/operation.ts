import type { z } from 'zod'
import type { ConnectorId, OperationId } from './model.js'
import type { ConsumerScope } from './scope.js'
import type { IssuedToken, Redacted, TokenLease } from './token-cache.js'

export type Effect = 'read' | 'write'

/**
 * A plain function with its own contract. `createTool` wraps one for agents (Q4.9); it does not
 * define it. `summary` is product language: no service, entity or field name.
 */
export type Operation<I, O, S> = Readonly<{
  id: OperationId
  effect: Effect
  summary: string
  input: z.ZodType<I>
  output: z.ZodType<O>
  run(input: I, session: S): Promise<O>
}>

/** Design only (design.md section 10): Sankhya declares none. */
export type ConnectorEvent<P> = Readonly<{ id: string; payload: z.ZodType<P> }>

/** Records each provider service a session called, by its constant name, for the audit line. */
export type ServiceTrace = Readonly<{ called(service: string): void }>

export type Adapter<Cred, S> = Readonly<{
  authenticate(credential: Redacted<Cred>, signal: AbortSignal): Promise<IssuedToken>
  /** The session asks `token` only after it has admitted the service, so a refused service never reaches the network. */
  open(token: TokenLease, signal: AbortSignal, trace: ServiceTrace): S
}>

export type ConnectorDefinition<Cred, S> = Readonly<{
  id: ConnectorId
  credential: z.ZodType<Cred>
  // biome-ignore lint/suspicious/noExplicitAny: each operation keeps its own input and output types
  operations: readonly Operation<any, any, S>[]
  // biome-ignore lint/suspicious/noExplicitAny: design only, no event exists yet
  events: readonly ConnectorEvent<any>[]
  builderSkill: string
}>

/** Who asks. Only the scope selects the grant; the kind and reference label the audit line. */
export type Consumer =
  | Readonly<{ kind: 'handler'; invocationId: string; scope: ConsumerScope }>
  | Readonly<{ kind: 'agent'; sessionId: string; scope: ConsumerScope }>
  | Readonly<{ kind: 'integrator'; jobId: string; scope: ConsumerScope }>
