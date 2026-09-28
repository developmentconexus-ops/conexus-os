import type { RequestContext } from '@mastra/core/request-context'
import { createTool } from '@mastra/core/tools'
import type { FactoryIntegration, IntegrationTools } from '@mastra/factory'
import type { Broker, FetchDescription } from './broker.js'
import type { ConnectorBrief } from './builder-brief.js'
import { BROKER_ERROR_CODES } from './errors.js'
import { CONNECTOR_FETCH_TOOL, FAILURE_PROJECTION, projectRequest, projectResult } from './fetch-projection.js'
import { nativeRequestSchema } from './native.js'
import type { Consumer } from './operation.js'
import { revokeScope, scopeForBuilderRun } from './scope.js'

/** A Builder run's reads: the run revokes the scope when it ends, so the lifetime only bounds a run that never ends. */
export const BUILDER_RUN_TERMS = Object.freeze({ ttlMs: 2 * 60 * 60 * 1000, calls: 50 })

const RUN_CONSUMER_KEY = 'conexusConnectorConsumer'

// Only a consumer this module built reaches the tool, so nothing a request context carries
// from elsewhere becomes one.
const runConsumers = new WeakSet<Consumer>()

const runConsumerOf = (requestContext: RequestContext): Consumer | null => {
  const value = requestContext.getRaw(RUN_CONSUMER_KEY)
  return typeof value === 'object' && value !== null && runConsumers.has(value as Consumer) ? value as Consumer : null
}

export type BuilderConnectorRun = Readonly<{
  /** The Project's connector brief for this run's instructions. */
  brief: string
  /** Gives the run's session the run's consumer, the only way `connector_fetch` finds its scope. */
  bind(requestContext: RequestContext): void
  /** Revokes the run's scope; repeating it changes nothing. */
  end(): void
}>

export const openBuilderRun = async (
  { brief, projectId, builderRunId }: Readonly<{ brief: ConnectorBrief; projectId: string; builderRunId: string }>,
): Promise<BuilderConnectorRun> => {
  const scope = scopeForBuilderRun(projectId, BUILDER_RUN_TERMS)
  const consumer: Consumer = Object.freeze({ kind: 'agent', sessionId: builderRunId, scope })
  runConsumers.add(consumer)
  return Object.freeze({
    brief: await brief(scope),
    bind: (requestContext: RequestContext) => requestContext.setRaw(RUN_CONSUMER_KEY, consumer),
    end: () => revokeScope(scope),
  })
}

const DESCRIPTION = 'Read one of the Connections bound to this Project, while you build, to learn its real data before you write '
  + 'code that depends on it. Send one request in the integrator\'s native format: `connection` is the Project-local name '
  + 'these instructions list, `path` is relative to the Connection\'s own address, and `query` and `body` are optional. '
  + 'Answers `{ ok: true, status, bytes, body }` with the vendor\'s JSON, or `{ ok: false, code }` with one of: '
  + `${BROKER_ERROR_CODES.join(', ')}. Only read services are sent, and each run has a limited number of calls.`

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

/** Contributes `connector_fetch` to a Factory session whose request context carries a Builder run's consumer, and to no other. */
export const createConnectorFetchIntegration = (broker: Broker): FactoryIntegration => Object.freeze({
  id: 'conexus-connectors',
  routes: () => [],
  diagnostics: () => ({}),
  sessionTools: ({ requestContext }: Readonly<{ requestContext: RequestContext }>) => {
    const consumer = runConsumerOf(requestContext)
    // createTool always sets `execute`; its declared type keeps it optional, which exactOptionalPropertyTypes refuses here.
    return consumer ? { [CONNECTOR_FETCH_TOOL]: connectorFetchTool(broker, consumer) as IntegrationTools[string] } : {}
  },
})
