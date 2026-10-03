import type { RequestContext } from '@mastra/core/request-context'
import { createTool } from '@mastra/core/tools'
import type { ToolsInput } from '@mastra/core/agent'
import type { Broker, FetchDescription } from './broker.js'
import type { ConnectorBrief } from './builder-brief.js'
import type { HandlerPort, HandlerPorts } from './handler-port.js'
import { BROKER_ERROR_CODES } from './errors.js'
import { CONNECTOR_FETCH_TOOL, FAILURE_PROJECTION, projectRequest, projectResult } from './fetch-projection.js'
import { nativeRequestSchema } from './native.js'
import type { Consumer } from './integrator.js'
import { revokeScope, scopeForBuilderRun } from './scope.js'

/** A Builder run's reads: the run revokes the scope when it ends, so the lifetime only bounds a run that never ends. */
const BUILDER_RUN_TERMS = Object.freeze({ ttlMs: 2 * 60 * 60 * 1000, calls: 50 })

const RUN_CONSUMER_KEY = 'conexusConnectorConsumer'

// Only a consumer this module built reaches the tool, so nothing a request context carries
// from elsewhere becomes one.
const runConsumers = new WeakSet<Consumer>()

const runConsumerOf = (requestContext: RequestContext): Consumer | null => {
  const value = requestContext.getRaw(RUN_CONSUMER_KEY)
  return typeof value === 'object' && value !== null && runConsumers.has(value as Consumer) ? value as Consumer : null
}

export type BuilderConnectorRun = Readonly<{
  brief: string
  /** Gives the run's session the run's consumer, the only way `connector_fetch` finds its scope. */
  bind(requestContext: RequestContext): void
  /**
   * One handler invocation's port on the run's own scope, so an operation the Builder runs spends
   * the run's calls and ends with it; null when the Hub serves no handler port.
   */
  openHandlerPort(): Promise<HandlerPort | null>
  /** Revokes the run's scope; repeating it changes nothing. */
  end(): void
}>

export const openBuilderRun = async (
  { brief, projectId, builderRunId, ports = null }: Readonly<{ brief: ConnectorBrief; projectId: string; builderRunId: string; ports?: HandlerPorts | null }>,
): Promise<BuilderConnectorRun> => {
  const scope = scopeForBuilderRun(projectId, BUILDER_RUN_TERMS)
  const consumer: Consumer = Object.freeze({ kind: 'agent', sessionId: builderRunId, scope })
  runConsumers.add(consumer)
  return Object.freeze({
    brief: await brief(scope),
    bind: (requestContext: RequestContext) => requestContext.setRaw(RUN_CONSUMER_KEY, consumer),
    openHandlerPort: async () => (ports ? ports.open(scope) : null),
    end: () => revokeScope(scope),
  })
}

const DESCRIPTION = 'Read one of the Conexões bound to this Project, while you build, to learn its real data before you write '
  + 'code that depends on it. Send one request in the integrator\'s native format: `connection` is the Project-local name '
  + 'these instructions list, `path` is relative to the Conexão\'s own address, and `query` and `body` are optional. '
  + 'Answers `{ ok: true, status, bytes, body }` with the vendor\'s JSON, or `{ ok: false, code }` with one of: '
  + `${BROKER_ERROR_CODES.join(', ')}. Only read services are sent, and each run has ${BUILDER_RUN_TERMS.calls} calls in all, `
  + 'so answer several questions with one read where you can.'

const connectorFetchTool = (broker: Broker, consumer: Consumer) => {
  // The display and transcript targets project the same input: one binding lookup serves both.
  const descriptions = new WeakMap<object, Promise<FetchDescription>>()
  const describe = (input: unknown): Promise<FetchDescription> => {
    if (typeof input !== 'object' || input === null) return broker.describe(consumer, input)
    const known = descriptions.get(input)
    if (known) return known
    const description = broker.describe(consumer, input)
    descriptions.set(input, description)
    return description
  }
  const input = async ({ input: request }: Readonly<{ input?: unknown }>) => projectRequest(request, await describe(request))
  const output = ({ output: result }: Readonly<{ output?: unknown }>) => projectResult(result)
  const error = () => FAILURE_PROJECTION
  return createTool({
    id: CONNECTOR_FETCH_TOOL,
    description: DESCRIPTION,
    inputSchema: nativeRequestSchema,
    execute: (request) => broker.fetch(consumer, request),
    // No toModelOutput: Mastra stores its value in the message's metadata, which the thread's
    // messages route serves. The model receives the result as it is.
    transform: {
      display: { input, inputDelta: () => undefined, output, error },
      transcript: { input, output, error },
    },
  })
}

/** Contributes `connector_fetch` to a Builder run whose request context carries the run's consumer, and to no other. */
export const createConnectorFetchTools = (broker: Broker) => ({ requestContext }: Readonly<{ requestContext: RequestContext }>): ToolsInput => {
  const consumer = runConsumerOf(requestContext)
  return consumer ? { [CONNECTOR_FETCH_TOOL]: connectorFetchTool(broker, consumer) } : {}
}
