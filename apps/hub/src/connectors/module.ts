import type { ObservabilityInstance } from '@mastra/core/observability'
import type { ToolsInput } from '@mastra/core/agent'
import type { RequestContext } from '@mastra/core/request-context'
import { MastraStorageExporter } from '@mastra/observability'
import type { FastifyInstance } from 'fastify'
import type { AccountId, ResolveCurrentSession } from '../identity-access/current-session.js'
import type { PostgresPool } from '../platform/postgres.js'
import type { SecretEnvelope } from '../platform/secrets.js'
import type { ConnectorOwnerId } from '../generated/connector-routes.js'
import { createBroker } from './broker.js'
import type { Broker, RegisteredConnector } from './broker.js'
import { createConnectorBrief } from './builder-brief.js'
import { createConnectorFetchTools, openBuilderRun } from './builder-tool.js'
import type { BuilderConnectorRun } from './builder-tool.js'
import { createToolPayloadProjection } from './fetch-projection.js'
import type { ToolPayloadProjection } from './fetch-projection.js'
import type { BrokerErrorCode } from './errors.js'
import { createHandlerPorts } from './handler-port.js'
import type { HandlerPort } from './handler-port.js'
import { createConnectorObservability } from './record.js'
import type { CheckConnection, CheckConnectionOutcome } from './routes.js'
import { registerConnectorRoutes } from './routes.js'
import { sankhyaDefinition } from './sankhya/definition.js'
import { createSankhyaGateway, pinnedGatewayOrigin } from './sankhya/gateway.js'
import { scopeFromArtifactSource } from './scope.js'
import { createBrokerStore, createConnectorStore } from './store.js'

export type ConnectorModule = Readonly<{
  registerConnectorRoutes(app: FastifyInstance): Promise<readonly ConnectorOwnerId[]>
  /**
   * One invocation's port, closed over the scope minted here from the artifact source. Null when no
   * socket directory is configured: the handler's calls then answer CONNECTOR_UNCONFIGURED.
   */
  openHandlerPort(source: Readonly<{ via: 'PREVIEW' | 'APPLICATION'; projectId: string }>): Promise<HandlerPort | null>
  /** Empties the socket directory; the Hub runs it once at startup. */
  sweepHandlerPorts(): Promise<void>
  /** One Builder run's access: a scope minted for the run, and the brief of this Project's own bindings. The brief opens
   * no credential and makes no network call. */
  openBuilderRun(input: Readonly<{ projectId: string; builderRunId: string }>): Promise<BuilderConnectorRun>
  /** Contributes `connector_fetch` to the Builder run bound with `openBuilderRun`. */
  builderTools(context: Readonly<{ requestContext: RequestContext }>): ToolsInput
  /** The route-level projection of `connector_fetch` payloads the Builder's session routes serve. */
  toolPayloadProjection: ToolPayloadProjection
  broker: Broker
  observability: ObservabilityInstance
}>

const CHECK_OUTCOME: Readonly<Partial<Record<BrokerErrorCode, CheckConnectionOutcome | 'NOT_FOUND'>>> = Object.freeze({
  CREDENTIAL_REFUSED: 'CREDENTIAL_REFUSED',
  CONNECTOR_UNCONFIGURED: 'CONNECTOR_UNCONFIGURED',
  PROVIDER_TIMEOUT: 'PROVIDER_TIMEOUT',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  PROVIDER_ERROR: 'PROVIDER_ERROR',
  RESPONSE_REFUSED: 'PROVIDER_ERROR',
  // The Connection was disabled between the listing and the credential read.
  NOT_GRANTED: 'NOT_FOUND',
})

export const createConnectorModule = ({
  pool,
  envelope,
  origin,
  resolveCurrentSession,
  isInstallationAdministrator,
  gatewayOrigin,
  socketDirectory,
  log = (line) => { process.stderr.write(line) },
}: Readonly<{
  /** The `hub_iam_runtime` pool the Hub already opens: the Connector functions are executable by it,
   * exactly as the application-access functions are (no new login role, no new pilot secret). */
  pool: PostgresPool
  envelope: SecretEnvelope
  origin: string
  resolveCurrentSession: ResolveCurrentSession
  isInstallationAdministrator(account: AccountId): Promise<boolean>
  /** The pinned Sankhya gateway origin; absent, every call and check answers CONNECTOR_UNCONFIGURED with no network. */
  gatewayOrigin?: string | undefined
  socketDirectory?: string | undefined
  log?: (line: string) => void
}>): ConnectorModule => {
  const store = createConnectorStore({ pool, envelope })
  const brokerStore = createBrokerStore(pool)
  const registeredConnectors: readonly RegisteredConnector[] = [
    { definition: sankhyaDefinition, adapter: gatewayOrigin ? createSankhyaGateway({ origin: pinnedGatewayOrigin(gatewayOrigin) }) : null },
  ]
  const observability = createConnectorObservability({
    store: new MastraStorageExporter(),
    log,
    secretFields: registeredConnectors.flatMap(({ definition }) => definition.secretFields),
  })
  const broker = createBroker({ connectors: registeredConnectors, store: brokerStore, envelope, observability })
  const connectorBrief = createConnectorBrief({ connectors: registeredConnectors, store: brokerStore, observability })
  const ports = socketDirectory ? createHandlerPorts({ directory: socketDirectory, broker }) : null

  const checkConnection: CheckConnection = async ({ actor, workspaceId, connectionId }) => {
    const connection = (await store.listConnections({ actor, workspaceId }))
      .find((candidate) => candidate.connectionId === connectionId && candidate.disabledAt === null)
    if (!connection) return 'NOT_FOUND'
    if (!gatewayOrigin) return 'CONNECTOR_UNCONFIGURED'
    const result = await broker.checkCredential(connection.connectorId, connection.connectionId)
    return result.ok ? 'OK' : CHECK_OUTCOME[result.code] ?? 'PROVIDER_UNAVAILABLE'
  }

  // Disable is terminal, so the cached token of that Connection goes with it.
  const administeredStore = Object.freeze({
    ...store,
    async disableConnection(input: Parameters<typeof store.disableConnection>[0]) {
      const found = await store.disableConnection(input)
      if (found) broker.forget(input.connectionId)
      return found
    },
  })

  return Object.freeze({
    registerConnectorRoutes: (app: FastifyInstance) => registerConnectorRoutes(app, {
      store: administeredStore,
      resolveCurrentSession,
      isInstallationAdministrator,
      checkConnection,
      credentialSchemas: { sankhya: sankhyaDefinition.credential },
      config: { origin },
    }),
    openHandlerPort: async (source) => (ports ? ports.open(scopeFromArtifactSource(source)) : null),
    sweepHandlerPorts: async () => { await ports?.sweep() },
    openBuilderRun: ({ projectId, builderRunId }) => openBuilderRun({ brief: connectorBrief, projectId, builderRunId }),
    builderTools: createConnectorFetchTools(broker),
    toolPayloadProjection: createToolPayloadProjection(new Map(registeredConnectors.map(({ definition }) => [definition.id, new Set(definition.native.services)]))),
    broker,
    observability,
  })
}
