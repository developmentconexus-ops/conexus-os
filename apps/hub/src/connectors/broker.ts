import { SpanType } from '@mastra/core/observability'
import type { AnySpan, ObservabilityInstance } from '@mastra/core/observability'
import type { SecretEnvelope } from '../platform/secrets.js'
import { AdapterFailure, brokerCodeOf, refused } from './errors.js'
import type { BrokerErrorCode, BrokerResult } from './errors.js'
import type { BoundConnection, ConnectionId, ConnectorId } from './model.js'
import type { Adapter, ConnectorDefinition, Consumer, Operation, RequestTrace } from './operation.js'
import { endSpan, requestTrace } from './record.js'
import type { SpanResult } from './record.js'
import type { ConsumerScope } from './scope.js'
import { isMintedScope } from './scope.js'
import type { BrokerStore } from './store.js'
import { createTokenCache, Redacted } from './token-cache.js'
import type { IssuedToken, TokenCache, TokenLease } from './token-cache.js'

// biome-ignore lint/suspicious/noExplicitAny: the registry holds every Connector's own credential and session types
type AnyDefinition = ConnectorDefinition<any, any>
// biome-ignore lint/suspicious/noExplicitAny: paired with its definition's types at registration
type AnyAdapter = Adapter<any, any>
// biome-ignore lint/suspicious/noExplicitAny: each operation keeps its own input and output types
type AnyOperation = Operation<any, any, any>

/** A Definition and its adapter; `adapter` is null when server configuration pins no destination. */
export type RegisteredConnector = Readonly<{ definition: AnyDefinition; adapter: AnyAdapter | null }>

type Entry = Readonly<{ operation: AnyOperation; connector: RegisteredConnector }>

export type Broker = Readonly<{
  /** Never throws. */
  call(consumer: Consumer, operationId: string, input: unknown): Promise<BrokerResult<unknown>>
  granted(scope: ConsumerScope): Promise<readonly Operation<unknown, unknown, unknown>[]>
  /** The allow-listed authentication alone, with no cache: whether the Connection's credential authenticates now. Never throws. */
  checkCredential(connectorId: ConnectorId, connectionId: ConnectionId): Promise<BrokerResult<null>>
  forget(connectionId: ConnectionId): void
}>

const DEFAULT_DEADLINE_MS = 4000

/** The one binding through which a Project reaches an integrator's operations: exactly one open
 * binding of that integrator. Zero or several reach nothing, so the operation path never picks a
 * Connection the Owner did not single out. Q-6 deletes it with the operation path. */
export const operationBinding = (bindings: readonly BoundConnection[], connectorId: string): BoundConnection | null => {
  const matching = bindings.filter((binding) => binding.connectorId === connectorId)
  return matching.length === 1 ? matching[0] ?? null : null
}

/** A refusal decided by the broker itself, carried out of a closure the token cache runs. */
class BrokerRefusal extends Error {
  readonly code: BrokerErrorCode
  constructor(code: BrokerErrorCode) {
    super(code)
    this.code = code
  }
}

const ISSUE_LIMIT = 10

const RECORDED_CONSUMER_KINDS = {
  handler: true,
  agent: true,
  integrator: true,
} satisfies Record<Consumer['kind'], true>

// Schema paths only: an unrecognized key is the caller's own text, so it comes back as a placeholder.
const inputIssues = (issues: readonly Readonly<{ path: readonly PropertyKey[]; code: string }>[]): readonly string[] =>
  [...new Set(issues.slice(0, ISSUE_LIMIT).map((issue) => {
    const path = `/${issue.path.map(String).join('/')}`
    return (issue.code === 'unrecognized_keys' ? `${path === '/' ? '' : path}/<unrecognized>` : path).slice(0, 200)
  }))]

const untilDeadline = <T>(signal: AbortSignal, work: Promise<T>): Promise<T> => {
  if (signal.aborted) return Promise.reject(new AdapterFailure('TIMEOUT'))
  let onAbort = (): void => undefined
  const deadline = new Promise<never>((_, reject) => {
    onAbort = () => reject(new AdapterFailure('TIMEOUT'))
    signal.addEventListener('abort', onAbort, { once: true })
  })
  return Promise.race([work, deadline]).finally(() => signal.removeEventListener('abort', onAbort))
}

const resultOf = (error: unknown): SpanResult => {
  if (error instanceof AdapterFailure) return error.reason
  return error instanceof BrokerRefusal ? error.code : 'UNEXPECTED'
}

const codeOf = (error: unknown, signal: AbortSignal): BrokerErrorCode => {
  if (error instanceof BrokerRefusal) return error.code
  if (error instanceof AdapterFailure) return brokerCodeOf(error.reason)
  // An operation's own mapping failed on what the provider returned, unless the deadline ended it.
  return signal.aborted ? 'PROVIDER_TIMEOUT' : 'RESPONSE_REFUSED'
}

export const createBroker = ({
  connectors,
  store,
  envelope,
  observability,
  tokens = createTokenCache(),
  deadlineMs = DEFAULT_DEADLINE_MS,
}: Readonly<{
  connectors: readonly RegisteredConnector[]
  store: BrokerStore
  envelope: SecretEnvelope
  observability: ObservabilityInstance
  tokens?: TokenCache
  deadlineMs?: number
}>): Broker => {
  const operations = new Map<string, Entry>()
  for (const connector of connectors) {
    for (const operation of connector.definition.operations) {
      if (operations.has(operation.id)) throw new Error(`CONNECTOR_OPERATION_DUPLICATE:${operation.id}`)
      operations.set(operation.id, Object.freeze({ operation, connector }))
    }
  }
  const adapterOf = (connectorId: ConnectorId): RegisteredConnector | undefined => connectors.find((connector) => connector.definition.id === connectorId)

  // Only this function opens the credential envelope.
  const authenticate = async (connector: RegisteredConnector, adapter: AnyAdapter, connectionId: ConnectionId, signal: AbortSignal, trace: RequestTrace): Promise<IssuedToken> => {
    let sealed: string | null
    try {
      sealed = await store.readConnectionCredential(connectionId)
    } catch {
      throw new BrokerRefusal('PROVIDER_UNAVAILABLE')
    }
    if (sealed === null) throw new BrokerRefusal('NOT_GRANTED')
    let plain: unknown
    try {
      plain = JSON.parse(await envelope.open(sealed))
    } catch {
      throw new BrokerRefusal('CREDENTIAL_REFUSED')
    }
    const credential = connector.definition.credential.safeParse(plain)
    if (!credential.success) throw new BrokerRefusal('CREDENTIAL_REFUSED')
    return adapter.authenticate(new Redacted(credential.data), signal, trace)
  }

  const execute = async ({ operation, connector }: Entry, consumer: Consumer, input: unknown, span: AnySpan): Promise<BrokerResult<unknown>> => {
    if (operation.effect === 'write') return refused('EFFECT_REFUSED')
    const parsed = operation.input.safeParse(input)
    if (!parsed.success) return refused('INPUT_REFUSED', inputIssues(parsed.error.issues))
    if (!isMintedScope(consumer?.scope)) return refused('NOT_GRANTED')
    let bindings: readonly BoundConnection[]
    try {
      bindings = await store.listBindings({ projectId: consumer.scope.projectId, environment: consumer.scope.environment })
    } catch {
      return refused('PROVIDER_UNAVAILABLE')
    }
    const binding = operationBinding(bindings, connector.definition.id)
    if (!binding) return refused('NOT_GRANTED')
    const { adapter } = connector
    if (!adapter) return refused('CONNECTOR_UNCONFIGURED')
    const connectionId = binding.connectionId
    const signal = AbortSignal.timeout(deadlineMs)
    let attempt = 0
    let issued = 0
    const trace = requestTrace(span, () => attempt, signal)
    // A lease that fails while this call issued nothing failed on another call's authentication.
    const recordJoined = (lease: TokenLease): TokenLease => async () => {
      const before = issued
      try {
        return await lease()
      } catch (error) {
        if (issued === before) trace.joined('authenticate', resultOf(error))
        throw error
      }
    }
    let value: unknown
    try {
      value = await untilDeadline(signal, tokens.withToken(
        connectionId,
        () => {
          issued += 1
          return authenticate(connector, adapter, connectionId, signal, trace)
        },
        (lease) => {
          attempt += 1
          return operation.run(parsed.data, adapter.open(recordJoined(lease), signal, trace))
        },
      ))
    } catch (error) {
      return refused(codeOf(error, signal))
    }
    const output = operation.output.safeParse(value)
    if (!output.success) return refused('RESPONSE_REFUSED')
    return Object.freeze({ ok: true, value: output.data })
  }

  return Object.freeze({
    async call(consumer: Consumer, operationId: string, input: unknown): Promise<BrokerResult<unknown>> {
      const entry = typeof operationId === 'string' ? operations.get(operationId) : undefined
      const span = observability.startSpan({ type: SpanType.GENERIC, name: 'connector.call', metadata: {
        consumer: typeof consumer?.kind === 'string' && Object.hasOwn(RECORDED_CONSUMER_KINDS, consumer.kind) ? consumer.kind : 'other',
        projectId: isMintedScope(consumer?.scope) ? consumer.scope.projectId : null,
        operation: entry?.operation.id ?? null,
      } })
      let result: BrokerResult<unknown>
      try {
        result = entry ? await execute(entry, consumer, input, span) : refused('OPERATION_UNKNOWN')
      } catch {
        result = refused('PROVIDER_UNAVAILABLE')
      }
      endSpan(span, result.ok ? 'OK' : result.code)
      return result
    },
    async granted(scope: ConsumerScope): Promise<readonly Operation<unknown, unknown, unknown>[]> {
      if (!isMintedScope(scope)) return []
      const bindings = await store.listBindings({ projectId: scope.projectId, environment: scope.environment })
      return connectors.flatMap((connector) => (operationBinding(bindings, connector.definition.id) ? connector.definition.operations : []))
    },
    async checkCredential(connectorId: ConnectorId, connectionId: ConnectionId): Promise<BrokerResult<null>> {
      const connector = adapterOf(connectorId)
      const adapter = connector?.adapter
      const span = observability.startSpan({ type: SpanType.GENERIC, name: 'connector.check', metadata: {
        connector: connector ? connectorId : 'unknown',
      } })
      let result: BrokerResult<null>
      if (!connector || !adapter) {
        result = refused('CONNECTOR_UNCONFIGURED')
      } else {
        const signal = AbortSignal.timeout(deadlineMs)
        try {
          await untilDeadline(signal, authenticate(connector, adapter, connectionId, signal, requestTrace(span, () => 1, signal)))
          result = Object.freeze({ ok: true, value: null })
        } catch (error) {
          result = refused(codeOf(error, signal))
        }
      }
      endSpan(span, result.ok ? 'OK' : result.code)
      return result
    },
    forget: (connectionId: ConnectionId) => tokens.forget(connectionId),
  })
}
