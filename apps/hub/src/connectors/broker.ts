import { SpanType } from '@mastra/core/observability'
import type { AnySpan, ObservabilityInstance } from '@mastra/core/observability'
import type { SecretEnvelope } from '../platform/secrets.js'
import { AdapterFailure, brokerCodeOf, refused } from './errors.js'
import type { BrokerErrorCode, BrokerResult } from './errors.js'
import type { BoundConnection, ConnectionId, ConnectorId } from './model.js'
import { DEFAULT_NATIVE_LIMITS, parseNativeRequest, pinnedUrl, sendNative } from './native.js'
import type { FetchResult, NativeLimits, ParsedNativeRequest } from './native.js'
import type { Adapter, ConnectorDefinition, Consumer, ProviderAnswer, RequestTrace } from './integrator.js'
import { endSpan, requestTrace } from './record.js'
import type { SpanResult } from './record.js'
import { isMintedScope, spendCall } from './scope.js'
import type { ConsumerScope } from './scope.js'
import type { BrokerStore } from './store.js'
import { createTokenCache, inLane, Redacted } from './token-cache.js'
import type { AccessToken, IssuedToken, TokenCache } from './token-cache.js'

type AnyDefinition = ConnectorDefinition<unknown>
type AnyAdapter = Adapter<unknown>

/** A Definition and its adapter; `adapter` is null when server configuration pins no destination. */
export type RegisteredConnector = Readonly<{ definition: AnyDefinition; adapter: AnyAdapter | null }>

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
  // Anything else failed on what the provider returned, unless the deadline ended it.
  return signal.aborted ? 'PROVIDER_TIMEOUT' : 'RESPONSE_REFUSED'
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: debt: owning wave
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

  /** The admitted request on the Connection's token, under one deadline for authentication and request. */
  const sendOnToken = async ({ connector, adapter, connectionId, service, method, url, body }: NativeTarget, span: AnySpan, signal: AbortSignal): Promise<FetchResult> => {
    const protocol = connector.definition.native
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
  const admitFetch = async (consumer: Consumer, request: unknown, at: number, signal?: AbortSignal): Promise<Admission> => {
    const parsed = parseNativeRequest(request, nativeLimits)
    if (!parsed.ok) return { ok: false, refusal: refused('INPUT_REFUSED', parsed.issues), binding: null, connector: null }
    const { connection, method, path, query, body } = parsed.request
    const scope = consumer?.scope
    if (!isMintedScope(scope, at)) return { ok: false, refusal: refused('NOT_GRANTED'), binding: null, connector: null }
    let bindings: readonly BoundConnection[]
    try {
      const lookup = store.listBindings({ projectId: scope.projectId, environment: scope.environment })
      bindings = await (signal ? untilDeadline(signal, lookup) : lookup)
    } catch {
      return { ok: false, refusal: refused(signal?.aborted ? 'PROVIDER_TIMEOUT' : 'PROVIDER_UNAVAILABLE'), binding: null, connector: null }
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

  const executeFetch = async (consumer: Consumer, request: unknown, at: number, span: AnySpan, signal: AbortSignal): Promise<FetchResult> => {
    const admission = await admitFetch(consumer, request, at, signal)
    if (admission.binding) {
      span.update({ metadata: { connection: admission.binding.name, connector: admission.ok ? admission.target.connector.definition.id : admission.connector?.definition.id ?? null } })
    }
    if (!admission.ok) return admission.refusal
    if (signal.aborted) return refused('PROVIDER_TIMEOUT')
    if (!spendCall(admission.scope)) return refused('CALL_LIMIT')
    return sendOnToken(admission.target, span, signal)
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
      // One deadline from entry, over the binding lookup, authentication and the vendor request alike.
      const signal = AbortSignal.timeout(Math.min(nativeLimits.deadlineMs, options.deadlineMs ?? Infinity))
      const span = observability.startSpan({ type: SpanType.GENERIC, name: 'connector.fetch', metadata: {
        consumer: recordedKind(consumer),
        projectId: isMintedScope(consumer?.scope, at) ? consumer.scope.projectId : null,
        connection: null,
        connector: null,
      } })
      let result: FetchResult
      try {
        result = await executeFetch(consumer, request, at, span, signal)
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
