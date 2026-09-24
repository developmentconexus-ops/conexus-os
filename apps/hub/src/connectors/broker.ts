import type { SecretEnvelope } from '../platform/secrets.js'
import { AdapterFailure, brokerCodeOf, refused } from './errors.js'
import type { BrokerErrorCode, BrokerResult } from './errors.js'
import type { ConnectionId, ConnectorId, OperationId } from './model.js'
import type { Adapter, ConnectorDefinition, Consumer, Operation } from './operation.js'
import type { ConsumerScope } from './scope.js'
import { isMintedScope } from './scope.js'
import type { BrokerStore } from './store.js'
import { createTokenCache, Redacted } from './token-cache.js'
import type { IssuedToken, TokenCache } from './token-cache.js'

// biome-ignore lint/suspicious/noExplicitAny: the registry holds every Connector's own credential and session types
type AnyDefinition = ConnectorDefinition<any, any>
// biome-ignore lint/suspicious/noExplicitAny: paired with its definition's types at registration
type AnyAdapter = Adapter<any, any>
// biome-ignore lint/suspicious/noExplicitAny: each operation keeps its own input and output types
type AnyOperation = Operation<any, any, any>

/** A Definition and its adapter; `adapter` is null when server configuration pins no destination. */
export type RegisteredConnector = Readonly<{ definition: AnyDefinition; adapter: AnyAdapter | null }>

/** Receives one value-free JSON line per call: never an input, output, token or credential. */
export type AuditSink = (line: string) => void

export type Broker = Readonly<{
  /** Never throws. */
  call(consumer: Consumer, operationId: string, input: unknown): Promise<BrokerResult<unknown>>
  granted(scope: ConsumerScope): Promise<readonly Operation<unknown, unknown, unknown>[]>
  /** The allow-listed authentication alone, with no cache: whether the Connection's credential authenticates now. Never throws. */
  checkCredential(connectorId: ConnectorId, connectionId: ConnectionId): Promise<BrokerResult<null>>
  forget(connectionId: ConnectionId): void
}>

export const DEFAULT_DEADLINE_MS = 4000

/** A refusal decided by the broker itself, carried out of a closure the token cache runs. */
class BrokerRefusal extends Error {
  readonly code: BrokerErrorCode
  constructor(code: BrokerErrorCode) {
    super(code)
    this.code = code
  }
}

const ISSUE_LIMIT = 10

const inputIssues = (issues: readonly Readonly<{ path: readonly PropertyKey[]; code: string; keys?: readonly string[] }>[]): readonly string[] =>
  issues.slice(0, ISSUE_LIMIT).flatMap((issue) => {
    const path = `/${issue.path.map(String).join('/')}`
    const paths = issue.code === 'unrecognized_keys' && issue.keys ? issue.keys.map((key) => `${path === '/' ? '' : path}/${key}`) : [path]
    return paths.map((entry) => entry.slice(0, 200))
  }).slice(0, ISSUE_LIMIT)

const untilDeadline = <T>(signal: AbortSignal, work: Promise<T>): Promise<T> => {
  if (signal.aborted) return Promise.reject(new AdapterFailure('TIMEOUT'))
  let onAbort = (): void => undefined
  const deadline = new Promise<never>((_, reject) => {
    onAbort = () => reject(new AdapterFailure('TIMEOUT'))
    signal.addEventListener('abort', onAbort, { once: true })
  })
  return Promise.race([work, deadline]).finally(() => signal.removeEventListener('abort', onAbort))
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
  audit,
  tokens = createTokenCache(),
  deadlineMs = DEFAULT_DEADLINE_MS,
  clock = () => performance.now(),
}: Readonly<{
  connectors: readonly RegisteredConnector[]
  store: BrokerStore
  envelope: SecretEnvelope
  audit: AuditSink
  tokens?: TokenCache
  deadlineMs?: number
  clock?: () => number
}>): Broker => {
  const operations = new Map<string, Readonly<{ operation: AnyOperation; connector: RegisteredConnector }>>()
  for (const connector of connectors) {
    for (const operation of connector.definition.operations) {
      if (operations.has(operation.id)) throw new Error(`CONNECTOR_OPERATION_DUPLICATE:${operation.id}`)
      operations.set(operation.id, Object.freeze({ operation, connector }))
    }
  }
  const adapterOf = (connectorId: ConnectorId): RegisteredConnector | undefined => connectors.find((connector) => connector.definition.id === connectorId)

  // Reads, opens and parses the credential, then authenticates. Only this function opens the envelope.
  const authenticate = async (connector: RegisteredConnector, adapter: AnyAdapter, connectionId: ConnectionId, signal: AbortSignal): Promise<IssuedToken> => {
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
    return adapter.authenticate(new Redacted(credential.data), signal)
  }

  const line = (fields: Readonly<Record<string, unknown>>): void => {
    try { audit(`${JSON.stringify(fields)}\n`) } catch { /* an audit sink failure never fails the call */ }
  }

  const attempt = async (consumer: Consumer, operationId: string, input: unknown, services: string[], known: { operation: OperationId | null }): Promise<BrokerResult<unknown>> => {
    const entry = typeof operationId === 'string' ? operations.get(operationId) : undefined
    if (!entry) return refused('OPERATION_UNKNOWN')
    const { operation, connector } = entry
    known.operation = operation.id
    if (operation.effect === 'write') return refused('EFFECT_REFUSED')
    const parsed = operation.input.safeParse(input)
    if (!parsed.success) return refused('INPUT_REFUSED', inputIssues(parsed.error.issues))
    if (!isMintedScope(consumer?.scope)) return refused('NOT_GRANTED')
    let grant: Awaited<ReturnType<BrokerStore['resolveGrant']>>
    try {
      grant = await store.resolveGrant({ projectId: consumer.scope.projectId, environment: consumer.scope.environment, capabilityKind: 'operation', capabilityId: operation.id })
    } catch {
      return refused('PROVIDER_UNAVAILABLE')
    }
    if (!grant) return refused('NOT_GRANTED')
    const { adapter } = connector
    if (!adapter) return refused('CONNECTOR_UNCONFIGURED')
    const connectionId = grant.connectionId
    const signal = AbortSignal.timeout(deadlineMs)
    const trace = Object.freeze({ called: (service: string) => { services.push(service) } })
    let value: unknown
    try {
      value = await untilDeadline(signal, tokens.withToken(
        connectionId,
        () => authenticate(connector, adapter, connectionId, signal),
        (lease) => operation.run(parsed.data, adapter.open(lease, signal, trace)),
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
      const started = clock()
      const services: string[] = []
      const known: { operation: OperationId | null } = { operation: null }
      let result: BrokerResult<unknown>
      try {
        result = await attempt(consumer, operationId, input, services, known)
      } catch {
        result = refused('PROVIDER_UNAVAILABLE')
      }
      line({
        event: 'connector.call',
        consumer: typeof consumer?.kind === 'string' ? consumer.kind : null,
        projectId: isMintedScope(consumer?.scope) ? consumer.scope.projectId : null,
        operation: known.operation,
        services,
        result: result.ok ? 'OK' : result.code,
        ms: Math.round(clock() - started),
      })
      return result
    },
    async granted(scope: ConsumerScope): Promise<readonly Operation<unknown, unknown, unknown>[]> {
      if (!isMintedScope(scope)) return []
      const capabilities = await store.listGrantedCapabilities({ projectId: scope.projectId, environment: scope.environment })
      return capabilities.flatMap((capability) => {
        const entry = capability.capabilityKind === 'operation' ? operations.get(capability.capabilityId) : undefined
        return entry ? [entry.operation] : []
      })
    },
    async checkCredential(connectorId: ConnectorId, connectionId: ConnectionId): Promise<BrokerResult<null>> {
      const started = clock()
      let result: BrokerResult<null>
      const connector = adapterOf(connectorId)
      const adapter = connector?.adapter
      if (!connector || !adapter) {
        result = refused('CONNECTOR_UNCONFIGURED')
      } else {
        const signal = AbortSignal.timeout(deadlineMs)
        try {
          await untilDeadline(signal, authenticate(connector, adapter, connectionId, signal))
          result = Object.freeze({ ok: true, value: null })
        } catch (error) {
          result = refused(codeOf(error, signal))
        }
      }
      line({ event: 'connector.check', connector: connectorId, result: result.ok ? 'OK' : result.code, ms: Math.round(clock() - started) })
      return result
    },
    forget: (connectionId: ConnectionId) => tokens.forget(connectionId),
  })
}
