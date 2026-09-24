import type { FastifyInstance } from 'fastify'
import type { AccountId, ResolveCurrentSession } from '../identity-access/current-session.js'
import type { PostgresPool } from '../platform/postgres.js'
import type { SecretEnvelope } from '../platform/secrets.js'
import type { ConnectorOwnerId } from '../generated/connector-routes.js'
import type { CheckConnection } from './routes.js'
import { registerConnectorRoutes } from './routes.js'
import { sankhyaCredentialSchema, SANKHYA_OPERATION_IDS } from './sankhya/definition.js'
import { createConnectorStore } from './store.js'

export type ConnectorModule = Readonly<{
  registerConnectorRoutes(app: FastifyInstance): Promise<readonly ConnectorOwnerId[]>
}>

/** No network call: unit B replaces this with the real allow-listed authentication (design.md
 * section 6, gate G0). Every outcome in the wire's closed set is reachable here except OK. */
const uncheckedConnection: CheckConnection = async () => 'CONNECTOR_UNCONFIGURED'

export const createConnectorModule = ({
  pool,
  envelope,
  origin,
  resolveCurrentSession,
  isInstallationAdministrator,
  checkConnection = uncheckedConnection,
}: Readonly<{
  /** The `hub_iam_runtime` pool the Hub already opens: the Connector functions are executable by it,
   * exactly as Q3's application-access functions are (no new login role, no new pilot secret). */
  pool: PostgresPool
  envelope: SecretEnvelope
  origin: string
  resolveCurrentSession: ResolveCurrentSession
  isInstallationAdministrator(account: AccountId): Promise<boolean>
  checkConnection?: CheckConnection
}>): ConnectorModule => {
  const store = createConnectorStore({ pool, envelope })
  return Object.freeze({
    registerConnectorRoutes: (app: FastifyInstance) => registerConnectorRoutes(app, {
      store,
      resolveCurrentSession,
      isInstallationAdministrator,
      checkConnection,
      credentialSchemas: { sankhya: sankhyaCredentialSchema },
      admittedOperationIds: new Set(SANKHYA_OPERATION_IDS),
      config: { origin },
    }),
  })
}
