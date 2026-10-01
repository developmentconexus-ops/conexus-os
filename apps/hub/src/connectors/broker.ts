import { SpanType } from '@mastra/core/observability'
import type { AnySpan, ObservabilityInstance } from '@mastra/core/observability'
import type { SecretEnvelope } from '../platform/secrets.js'
import { AdapterFailure, brokerCodeOf, inputIssues, refused } from './errors.js'
import type { BrokerErrorCode, BrokerResult } from './errors.js'
import type { BoundConnection, ConnectionId, ConnectorId } from './model.js'
import { DEFAULT_NATIVE_LIMITS, parseNativeRequest, pinnedUrl, sendNative } from './native.js'
import type { FetchResult, NativeLimits, ParsedNativeRequest } from './native.js'
import type { Adapter, ConnectorDefinition, Consumer, Operation, ProviderAnswer, RequestTrace } from './operation.js'
import { endSpan, requestTrace } from './record.js'
import type { SpanResult } from './record.js'
import { isMintedScope, spendCall } from './scope.js'
import type { ConsumerScope } from './scope.js'
import type { BrokerStore } from './store.js'
import { createTokenCache, inLane, Redacted } from './token-cache.js'
import type { AccessToken, IssuedToken, TokenCache, TokenLease } from './token-cache.js'

// biome-ignore lint/suspicious/noExplicitAny: the registry holds every Connector's own credential and session types
type AnyDefinition = ConnectorDefinition<any, any>
// biome-ignore lint/suspicious/noExplicitAny: paired with its definition's types at registration
type AnyAdapter = Adapter<any, any>
// biome-ignore lint/suspicious/noExplicitAny: each operation keeps its own input and output types
type AnyOperation = Operation<any, any, any>

/** A Definition and its adapter; `adapter` is null when server configuration pins no destination. */
export type RegisteredConnector = Readonly<{ definition: AnyDefinition; adapter: AnyAdapter | null }>

type Entry = Readonly<{ operation: AnyOperation; connector: RegisteredConnector }>

type NativeTarget = Readonly<{
  connector: RegisteredConnector; adapter: AnyAdapter; connectionId: ConnectionId
  service: string; method: string; url: URL; body: ParsedNativeRequest['body']
}>

type Admission =
  | Readonly<{ ok: true; scope: ConsumerScope; binding: BoundConnection; target: NativeTarget }>
  | Readonly<{ ok: false; refusal: FetchResult; binding: BoundConnection | null; connector: RegisteredConnector | null }>

/** What a request would reach, for a display that must carry no value: `service` is the read rule's own constant, never caller text. */
export type FetchDescription = Readonly<{ integrator: ConnectorId | null; service: string | null }>

const UNDESCRIBED: FetchDescription = Object.freeze({ integrator: null, service: null })

/** `deadlineMs` can only shorten the native deadline: a consumer with less time left than that asks for the time it has. */
type FetchOptions = Readonly<{ deadlineMs?: number }>

export type Broker = Readonly<{
  /** Never throws. */
  call(consumer: Consumer, operationId: string, input: unknown): Promise<BrokerResult<unknown>>
  /** A native request through one of the consumer's Project bindings. `request` is untrusted JSON; `consumer` is built by Hub code
   * with a Hub-minted scope. Never throws. */
  fetch(consumer: Consumer, request: unknown, options?: FetchOptions): Promise<FetchResult>
  /** The integrator and service `fetch` would send the request to, with no network and no call spent. Never throws. */
  describe(consumer: Consumer, request: unknown): Promise<FetchDescription>
  /** The allow-listed authentication alone, with no cache: whether the Connection's credential authenticates now. Never throws. */
  checkCredential(connectorId: ConnectorId, connectionId: ConnectionId): Promise<BrokerResult<null>>
  forget(connectionId: ConnectionId): void
}>

const DEFAULT_DEADLINE_MS = 4000

const operationBinding = (bindings: readonly BoundConnection[], connectorId: string): BoundConnection | null => {
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

const RECORDED_CONSUMER_KINDS = {
  handler: true,
  agent: true,
  integrator: true,
} satisfies Record<Consumer['kind'], true>

const untilDeadline = <T>(signal: AbortSignal, work: Promise<T>): Promise<T> => {
  if (signal.aborted) return Promise.reject(new AdapterFailure('TIMEOUT'))
  let onAbort = (): void => undefined
  const deadline = new Promise<never>((_, reject) => {
    onAbort = () => reject(new AdapterFailure('TIMEOUT'))
    signal.addEventListener('abort', onAbort, { once: true })
  })
  return Promise.race([work, deadline]).finally(() => signal.removeEventListener('abort', onAbort))
}

const fetchResultOf = (result: FetchResult): 'OK' | BrokerErrorCode => (result.ok ? 'OK' : result.code)

const recordedKind = (consumer: Consumer): string =>
  typeof consumer?.kind === 'string' && Object.hasOwn(RECORDED_CONSUMER_KINDS, consumer.kind) ? consumer.kind : 'other'

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
  nativeLimits = DEFAULT_NATIVE_LIMITS,
  now = () => Date.now(),
}: Readonly<{
  connectors: readonly RegisteredConnector[]
  store: BrokerStore
  envelope: SecretEnvelope
  observability: ObservabilityInstance
  tokens?: TokenCache
  deadlineMs?: number
  nativeLimits?: NativeLimits
  now?: () => number
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

  /** The admitted request on the Connection's token, under one deadline for authentication and request. */
  const sendOnToken = async ({ connector, adapter, connectionId, service, method, url, body }: NativeTarget, span: AnySpan, options: FetchOptions): Promise<FetchResult> => {
    const protocol = connector.definition.native
    const signal = AbortSignal.timeout(Math.min(nativeLimits.deadlineMs, options.deadlineMs ?? Infinity))
    let attempt = 0
    let issued = 0
    let answered: ProviderAnswer = {}
    const trace = requestTrace(span, () => attempt, signal)
    try {
      return await untilDeadline(signal, tokens.withToken(
        connectionId,
        () => {
          issued += 1
          return authenticate(connector, adapter, connectionId, signal, trace)
        },
        async (lease) => {
          attempt += 1
          const before = issued
          let token: AccessToken
          try {
            token = await lease()
          } catch (error) {
            // A lease that fails while this call issued nothing failed on another call's authentication.
            if (issued === before) trace.joined('authenticate', resultOf(error))
            throw error
          }
          const request = () => trace.request(service, (answer) => {
            answered = answer
            return sendNative({ method, url, body, token, signal, responseBytes: nativeLimits.responseBytes, protocol }, answer)
          }, fetchResultOf)
          return protocol.oneRequestPerToken ? inLane(token, request) : request()
        },
      ))
    } catch (error) {
      const code = codeOf(error, signal)
      // A token refused twice is the vendor's answer to the service request, so its status is the consumer's to see.
      const status = error instanceof AdapterFailure && error.reason === 'TOKEN_REFUSED' ? answered.httpStatus : undefined
      return status === undefined ? refused(code) : Object.freeze({ ok: false, code, status })
    }
  }

  /** The request admitted for one of the consumer's bindings, or its refusal: no network, no budget spent. */
  const admitFetch = async (consumer: Consumer, request: unknown, at: number): Promise<Admission> => {
    const parsed = parseNativeRequest(request, nativeLimits)
    if (!parsed.ok) return { ok: false, refusal: refused('INPUT_REFUSED', parsed.issues), binding: null, connector: null }
    const { connection, method, path, query, body } = parsed.request
    const scope = consumer?.scope
    if (!isMintedScope(scope, at)) return { ok: false, refusal: refused('NOT_GRANTED'), binding: null, connector: null }
    let bindings: readonly BoundConnection[]
    try {
      bindings = await store.listBindings({ projectId: scope.projectId, environment: scope.environment })
    } catch {
      return { ok: false, refusal: refused('PROVIDER_UNAVAILABLE'), binding: null, connector: null }
    }
    const binding = bindings.find((candidate) => candidate.name === connection)
    if (!binding) return { ok: false, refusal: refused('NOT_GRANTED'), binding: null, connector: null }
    const connector = connectors.find((candidate) => candidate.definition.id === binding.connectorId) ?? null
    const adapter = connector?.adapter
    if (!connector || !adapter) return { ok: false, refusal: refused('CONNECTOR_UNCONFIGURED'), binding, connector }
    const url = pinnedUrl(path, query, adapter.origin)
    if (!url) return { ok: false, refusal: refused('INPUT_REFUSED', ['/path']), binding, connector }
    const admitted = connector.definition.native.admit({ method, url, body: body?.plain })
    if (!admitted.ok) return { ok: false, refusal: refused(admitted.code, admitted.issues), binding, connector }
    return { ok: true, scope, binding, target: { connector, adapter, connectionId: binding.connectionId, service: admitted.service, method, url, body } }
  }

  const executeFetch = async (consumer: Consumer, request: unknown, at: number, span: AnySpan, options: FetchOptions): Promise<FetchResult> => {
    const admission = await admitFetch(consumer, request, at)
    if (admission.binding) {
      span.update({ metadata: { connection: admission.binding.name, connector: admission.ok ? admission.target.connector.definition.id : admission.connector?.definition.id ?? null } })
    }
    if (!admission.ok) return admission.refusal
    if (!spendCall(admission.scope)) return refused('CALL_LIMIT')
    return sendOnToken(admission.target, span, options)
  }

  return Object.freeze({
    async describe(consumer: Consumer, request: unknown): Promise<FetchDescription> {
      try {
        const admission = await admitFetch(consumer, request, now())
        return admission.ok
          ? Object.freeze({ integrator: admission.target.connector.definition.id, service: admission.target.service })
          : Object.freeze({ integrator: admission.connector?.definition.id ?? null, service: null })
      } catch {
        return UNDESCRIBED
      }
    },
    async fetch(consumer: Consumer, request: unknown, options: FetchOptions = {}): Promise<FetchResult> {
      const at = now()
      const span = observability.startSpan({ type: SpanType.GENERIC, name: 'connector.fetch', metadata: {
        consumer: recordedKind(consumer),
        projectId: isMintedScope(consumer?.scope, at) ? consumer.scope.projectId : null,
        connection: null,
        connector: null,
      } })
      let result: FetchResult
      try {
        result = await executeFetch(consumer, request, at, span, options)
      } catch {
        result = refused('PROVIDER_UNAVAILABLE')
      }
      endSpan(span, result.ok ? 'OK' : result.code)
      return result
    },
    async call(consumer: Consumer, operationId: string, input: unknown): Promise<BrokerResult<unknown>> {
      const entry = typeof operationId === 'string' ? operations.get(operationId) : undefined
      const span = observability.startSpan({ type: SpanType.GENERIC, name: 'connector.call', metadata: {
        consumer: recordedKind(consumer),
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
