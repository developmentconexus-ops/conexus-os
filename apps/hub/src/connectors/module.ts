import type { ObservabilityInstance } from '@mastra/core/observability'
import type { ToolsInput } from '@mastra/core/agent'
import type { RequestContext } from '@mastra/core/request-context'
import { MastraStorageExporter } from '@mastra/observability'
import type { FastifyInstance } from 'fastify'
import type { ConnectionCheckOutcome } from '../../../../packages/contract/dist/index.js'
import type { Database } from '../platform/db.js'
import { Failure } from '../platform/failure.js'
import { logLine } from '../platform/logger.js'
import type { EventLog } from '../platform/logger.js'
import type { SecretEnvelope } from '../platform/secrets.js'
import { createBroker, registryOf } from './broker.js'
import type { Broker } from './broker.js'
import { createConnectorBrief } from './builder-brief.js'
import { createConnectorFetchTools, openBuilderRun } from './builder-tool.js'
import type { BuilderConnectorRun } from './builder-tool.js'
import { createToolPayloadProjection } from './fetch-projection.js'
import type { ToolPayloadProjection } from './fetch-projection.js'
import type { BrokerErrorCode } from './errors.js'
import { createHandlerPorts } from './handler-port.js'
import type { HandlerPort } from './handler-port.js'
import { createConnectorObservability } from './record.js'
import type { CheckConnection } from './routes.js'
import { registerConnectorRoutes } from './routes.js'
import { sankhyaDefinition } from './sankhya/definition.js'
import { createSankhyaGateway, pinnedGatewayOrigin } from './sankhya/gateway.js'
import { scopeFromArtifactSource } from './scope.js'
import { createBrokerStore, createConnectorStore, purgeProjectBindings } from './store.js'
import type { ConnectorStore } from './store.js'

export type ConnectorModule = Readonly<{
  registerConnectorRoutes(app: FastifyInstance): ReturnType<typeof registerConnectorRoutes>
  /**
   * One invocation's port, closed over the scope minted here from the artifact source. Null when no
   * socket directory is configured: the handler's calls then answer CONNECTOR_UNCONFIGURED.
   */
  openHandlerPort(source: Readonly<{ via: 'PREVIEW' | 'APPLICATION'; accountId: string; projectId: string }>): Promise<HandlerPort | null>
  /** Empties the socket directory; the Hub runs it once at startup. */
  sweepHandlerPorts(): Promise<void>
  /** One Builder run's access: a scope minted for the run, and the brief of this Project's own bindings. The brief opens
   * no credential and makes no network call. */
  openBuilderRun(input: Readonly<{ projectId: string; accountId: string; builderRunId: string }>): Promise<BuilderConnectorRun>
  /** Contributes `connector_fetch` to the Builder run bound with `openBuilderRun`. */
  builderTools(context: Readonly<{ requestContext: RequestContext }>): ToolsInput
  /** The route-level projection of `connector_fetch` payloads the Builder's session routes serve. */
  toolPayloadProjection: ToolPayloadProjection
  purgeProjectBindings: typeof purgeProjectBindings
  broker: Broker
  observability: ObservabilityInstance
}>

/** What an administrator sees of a refused check. `null` is a code that is no provider outcome, so a fault of the platform. */
const CHECK_OUTCOME: Readonly<Record<BrokerErrorCode, ConnectionCheckOutcome | null>> = Object.freeze({
  CREDENTIAL_REFUSED: 'CREDENTIAL_REFUSED',
  CONNECTOR_UNCONFIGURED: 'CONNECTOR_UNCONFIGURED',
  PROVIDER_TIMEOUT: 'PROVIDER_TIMEOUT',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  PROVIDER_ERROR: 'PROVIDER_ERROR',
  RESPONSE_REFUSED: 'PROVIDER_ERROR',
  INPUT_REFUSED: null,
  NOT_GRANTED: null,
  RESPONSE_TOO_LARGE: null,
  CALL_LIMIT: null,
  SERVICE_REFUSED: null,
  CONNECTOR_PLATFORM_FAILED: null,
})

/**
 * The store's transaction ends with the credential read, so the provider call never holds the administrator's locks.
 * @public The pinned gateway origin refuses a fake one, so the check test builds this with its own broker.
 */
export const createConnectionCheck = ({ store, broker }: Readonly<{ store: ConnectorStore; broker: Pick<Broker, 'checkCredential'> }>): CheckConnection =>
  async ({ accountId, workspaceId, connectionId }) => {
    const { connectorId, sealed } = await store.readCredentialForCheck({ accountId, workspaceId, connectionId })
    const result = await broker.checkCredential(connectorId, sealed)
    if (result.ok) return 'OK'
    const outcome = CHECK_OUTCOME[result.code]
    if (outcome === null) throw new Failure('CONNECTOR_PLATFORM_FAILED', { details: { code: result.code } })
    return outcome
  }

export const createConnectorModule = ({
  database,
  envelope,
  gatewayOrigin,
  socketDirectory,
  log = logLine,
}: Readonly<{
  database: Database
  envelope: SecretEnvelope
  /** The pinned Sankhya gateway origin; absent, every call and check answers CONNECTOR_UNCONFIGURED with no network. */
  gatewayOrigin?: string | undefined
  socketDirectory?: string | undefined
  log?: EventLog
}>): ConnectorModule => {
  const store = createConnectorStore({ database, envelope })
  const brokerStore = createBrokerStore(database)
  const registry = registryOf([
    { definition: sankhyaDefinition, adapter: gatewayOrigin ? createSankhyaGateway({ origin: pinnedGatewayOrigin(gatewayOrigin) }) : null },
  ])
  const observability = createConnectorObservability({
    store: new MastraStorageExporter(),
    log,
    secretFields: [...registry.values()].flatMap(({ definition }) => definition.secretFields),
  })
  const broker = createBroker({ connectors: registry, store: brokerStore, envelope, observability })
  const connectorBrief = createConnectorBrief({ store: brokerStore, observability })
  const ports = socketDirectory ? createHandlerPorts({ directory: socketDirectory, broker }) : null

  // Disable is terminal, so the cached token of that Connection goes with it.
  const administeredStore = Object.freeze({
    ...store,
    async disableConnection(input: Parameters<typeof store.disableConnection>[0]) {
      await store.disableConnection(input)
      broker.forget(input.connectionId)
    },
  })

  return Object.freeze({
    registerConnectorRoutes: (app: FastifyInstance) => registerConnectorRoutes(app, {
      store: administeredStore,
      checkConnection: createConnectionCheck({ store, broker }),
    }),
    openHandlerPort: async (source) => (ports ? ports.open(scopeFromArtifactSource(source)) : null),
    sweepHandlerPorts: async () => { await ports?.sweep() },
    openBuilderRun: ({ projectId, accountId, builderRunId }) => openBuilderRun({ brief: connectorBrief, projectId, accountId, builderRunId, ports }),
    purgeProjectBindings,
    builderTools: createConnectorFetchTools(broker),
    toolPayloadProjection: createToolPayloadProjection(new Map([...registry.values()].map(({ definition }) => [definition.id, new Set(definition.native.services)]))),
    broker,
    observability,
  })
}
