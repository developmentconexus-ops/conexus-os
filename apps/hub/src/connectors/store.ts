import type { QueryResultRow } from 'pg'
import type { AccountId } from '../identity-access/current-session.js'
import type { PostgresPool } from '../platform/postgres.js'
import type { SecretEnvelope } from '../platform/secrets.js'
import type { CapabilityKind, Connection, ConnectionId, ConnectorId, Environment, GrantId, OpenGrant, OperationId, ProjectGrantEntry } from './model.js'
import { connectionId as toConnectionId, grantId as toGrantId, operationId as toOperationId } from './model.js'

type ConnectionRow = QueryResultRow & {
  connection_id: string
  connector_id: ConnectorId
  label: string
  created_at: Date
  disabled_at: Date | null
}

const toConnection = (row: ConnectionRow): Connection => ({
  connectionId: toConnectionId(row.connection_id),
  connectorId: row.connector_id,
  label: row.label,
  createdAt: row.created_at,
  disabledAt: row.disabled_at,
})

type GrantRow = QueryResultRow & {
  kind: 'grant' | 'grantable'
  grant_id: string | null
  connection_id: string
  connector_id: ConnectorId
  capability_id: string
  granted_at: Date | null
}

const toGrantEntry = (row: GrantRow): ProjectGrantEntry =>
  row.kind === 'grant'
    ? {
        kind: 'grant',
        grantId: toGrantId(row.grant_id ?? ''),
        connectionId: toConnectionId(row.connection_id),
        connectorId: row.connector_id,
        capabilityId: toOperationId(row.capability_id),
        grantedAt: row.granted_at ?? new Date(0),
      }
    : {
        kind: 'grantable',
        connectionId: toConnectionId(row.connection_id),
        connectorId: row.connector_id,
        capabilityId: toOperationId(row.capability_id),
      }

/** Every method's authority error is one of `isConnectorNotAdmitted`, `isConnectorProjectNotFound`,
 * `isConnectorConnectionNotAvailable` or `isConnectorConnectionConflict` (`model.js`). The store never
 * returns a credential field, in either direction: the caller can only ever supply one. */
export type ConnectorStore = Readonly<{
  listConnections(input: Readonly<{ actor: AccountId; workspaceId: string }>): Promise<readonly Connection[]>
  /** `credential`'s fields are sealed together as one JSON envelope; the store never inspects them.
   * `created` is false when an earlier request with this id and these same fields made the row. */
  createConnection(input: Readonly<{
    actor: AccountId; connectionId: ConnectionId; workspaceId: string; connectorId: ConnectorId
    label: string; credential: Readonly<Record<string, string>>
  }>): Promise<Readonly<{ connection: Connection; created: boolean }>>
  disableConnection(input: Readonly<{ actor: AccountId; workspaceId: string; connectionId: ConnectionId }>): Promise<boolean>
  listProjectGrants(input: Readonly<{ actor: AccountId; projectId: string; operationIds: readonly OperationId[] }>): Promise<readonly ProjectGrantEntry[]>
  grantCapability(input: Readonly<{ actor: AccountId; projectId: string; connectionId: ConnectionId; operationId: OperationId }>): Promise<OpenGrant>
  revokeGrant(input: Readonly<{ actor: AccountId; projectId: string; grantId: GrantId }>): Promise<boolean>
}>

/** The broker's three reads. Only the sealed envelope leaves PostgreSQL. */
export type BrokerStore = Readonly<{
  /** An open grant on an enabled Connection of a Project that is not archived, or null. */
  resolveGrant(input: Readonly<{ projectId: string; environment: Environment; capabilityKind: CapabilityKind; capabilityId: OperationId }>): Promise<Readonly<{ grantId: GrantId; connectionId: ConnectionId }> | null>
  /** The sealed credential of an enabled Connection, or null. */
  readConnectionCredential(connectionId: ConnectionId): Promise<string | null>
  listGrantedCapabilities(input: Readonly<{ projectId: string; environment: Environment }>): Promise<readonly Readonly<{ capabilityKind: CapabilityKind; capabilityId: OperationId }>[]>
}>

export const createBrokerStore = (pool: PostgresPool): BrokerStore => Object.freeze({
  async resolveGrant({ projectId, environment, capabilityKind, capabilityId }) {
    const result = await pool.query<QueryResultRow & { grant_id: string; connection_id: string }>(
      'SELECT grant_id, connection_id FROM connector.resolve_grant($1, $2, $3, $4)', [projectId, environment, capabilityKind, capabilityId])
    const row = result.rows[0]
    return row ? { grantId: toGrantId(row.grant_id), connectionId: toConnectionId(row.connection_id) } : null
  },
  async readConnectionCredential(connectionId) {
    const result = await pool.query<QueryResultRow & { sealed: string | null }>(
      'SELECT connector.read_connection_credential($1) AS sealed', [connectionId])
    return result.rows[0]?.sealed ?? null
  },
  async listGrantedCapabilities({ projectId, environment }) {
    const result = await pool.query<QueryResultRow & { capability_kind: CapabilityKind; capability_id: string }>(
      'SELECT capability_kind, capability_id FROM connector.list_granted_capabilities($1, $2)', [projectId, environment])
    return result.rows.map((row) => ({ capabilityKind: row.capability_kind, capabilityId: toOperationId(row.capability_id) }))
  },
})

export const createConnectorStore = ({ pool, envelope }: Readonly<{ pool: PostgresPool; envelope: SecretEnvelope }>): ConnectorStore => Object.freeze({
  async listConnections({ actor, workspaceId }) {
    const result = await pool.query<ConnectionRow>(
      'SELECT connection_id, connector_id, label, created_at, disabled_at FROM connector.list_connections($1, $2)',
      [actor, workspaceId])
    return result.rows.map(toConnection)
  },
  async createConnection({ actor, connectionId, workspaceId, connectorId, label, credential }) {
    const sealed = await envelope.seal(JSON.stringify(credential))
    // Sorted keys, so a retry that sends the same fields in another order has the same digest.
    const digests = envelope.fingerprints(JSON.stringify(credential, Object.keys(credential).sort()))
    const result = await pool.query<ConnectionRow & { created: boolean }>(
      'SELECT connection_id, connector_id, label, created_at, disabled_at, created FROM connector.create_connection($1, $2, $3, $4, $5, $6, $7)',
      [actor, connectionId, workspaceId, connectorId, label, sealed, digests])
    const row = result.rows[0]
    if (!row) throw new Error('CONNECTOR_CONNECTION_NOT_READABLE')
    return { connection: toConnection(row), created: row.created }
  },
  async disableConnection({ actor, workspaceId, connectionId }) {
    const result = await pool.query<QueryResultRow & { found: boolean }>(
      'SELECT connector.disable_connection($1, $2, $3) AS found', [actor, workspaceId, connectionId])
    return result.rows[0]?.found === true
  },
  async listProjectGrants({ actor, projectId, operationIds }) {
    const result = await pool.query<GrantRow>(
      'SELECT kind, grant_id, connection_id, connector_id, capability_id, granted_at FROM connector.list_project_grants($1, $2, $3)',
      [actor, projectId, operationIds])
    return result.rows.map(toGrantEntry)
  },
  async grantCapability({ actor, projectId, connectionId, operationId }) {
    const result = await pool.query<QueryResultRow & { grant_id: string; connection_id: string; connector_id: ConnectorId; capability_id: string; granted_at: Date }>(
      'SELECT grant_id, connection_id, connector_id, capability_id, granted_at FROM connector.grant_capability($1, $2, $3, $4)',
      [actor, projectId, connectionId, operationId])
    const row = result.rows[0]
    if (!row) throw new Error('CONNECTOR_GRANT_NOT_READABLE')
    return {
      kind: 'grant',
      grantId: toGrantId(row.grant_id),
      connectionId: toConnectionId(row.connection_id),
      connectorId: row.connector_id,
      capabilityId: toOperationId(row.capability_id),
      grantedAt: row.granted_at,
    }
  },
  async revokeGrant({ actor, projectId, grantId }) {
    const result = await pool.query<QueryResultRow & { found: boolean }>(
      'SELECT connector.revoke_grant($1, $2, $3) AS found', [actor, projectId, grantId])
    return result.rows[0]?.found === true
  },
})
