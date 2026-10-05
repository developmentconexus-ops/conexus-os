import type { QueryResultRow } from 'pg'
import type { AccountId } from '../identity-access/current-session.js'
import type { PostgresPool } from '../platform/db.js'
import type { SecretEnvelope } from '../platform/secrets.js'
import type { BindingId, BindingName, BoundConnection, Connection, ConnectionId, ConnectorId, Environment, ProjectBinding, ProjectBindingEntry } from './model.js'
import { bindingId as toBindingId, bindingName as toBindingName, connectionId as toConnectionId } from './model.js'
import { Failure } from '../platform/failure.js'

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

type BindingRow = QueryResultRow & { binding_id: string; name: string; connection_id: string; connector_id: ConnectorId; label: string; bound_at: Date }

type BindingEntryRow = QueryResultRow & (
  | Readonly<{ kind: 'binding' } & BindingRow>
  | Readonly<{ kind: 'bindable'; binding_id: null; name: null; connection_id: string; connector_id: ConnectorId; label: string; bound_at: null }>
)

const toProjectBinding = (row: BindingRow): ProjectBinding => ({
  kind: 'binding',
  bindingId: toBindingId(row.binding_id),
  name: toBindingName(row.name),
  connectionId: toConnectionId(row.connection_id),
  connectorId: row.connector_id,
  label: row.label,
  boundAt: row.bound_at,
})

const toBindingEntry = (row: BindingEntryRow): ProjectBindingEntry =>
  row.kind === 'binding'
    ? toProjectBinding(row)
    : { kind: 'bindable', connectionId: toConnectionId(row.connection_id), connectorId: row.connector_id, label: row.label }

/** Every method's authority error is one of `isConnectorNotAdmitted`, `isConnectorProjectNotFound`,
 * `isConnectorConnectionNotAvailable`, `isConnectorConnectionConflict` or `isConnectorBindingConflict`
 * (`model.js`). The store never returns a credential field, in either direction: the caller can only
 * ever supply one. */
export type ConnectorStore = Readonly<{
  listConnections(input: Readonly<{ actor: AccountId; workspaceId: string }>): Promise<readonly Connection[]>
  /** `credential`'s fields are sealed together as one JSON envelope; the store never inspects them.
   * `created` is false when an earlier request with this id and these same fields made the row. */
  createConnection(input: Readonly<{
    actor: AccountId; connectionId: ConnectionId; workspaceId: string; connectorId: ConnectorId
    label: string; credential: Readonly<Record<string, string>>
  }>): Promise<Readonly<{ connection: Connection; created: boolean }>>
  disableConnection(input: Readonly<{ actor: AccountId; workspaceId: string; connectionId: ConnectionId }>): Promise<boolean>
  listProjectBindings(input: Readonly<{ actor: AccountId; projectId: string }>): Promise<readonly ProjectBindingEntry[]>
  /** The same Connection under the same name answers the open binding; the store never rebinds. */
  bindConnection(input: Readonly<{ actor: AccountId; projectId: string; connectionId: ConnectionId; name: BindingName }>): Promise<ProjectBinding>
  unbindConnection(input: Readonly<{ actor: AccountId; projectId: string; bindingId: BindingId }>): Promise<boolean>
}>

/** The broker's two reads. Only the sealed envelope leaves PostgreSQL. */
export type BrokerStore = Readonly<{
  /** The Project's open bindings on enabled Connections, for a Project that is not archived. */
  listBindings(input: Readonly<{ projectId: string; environment: Environment }>): Promise<readonly BoundConnection[]>
  /** The sealed credential of an enabled Connection, or null. */
  readConnectionCredential(connectionId: ConnectionId): Promise<string | null>
}>

export const createBrokerStore = (pool: PostgresPool): BrokerStore => Object.freeze({
  async listBindings({ projectId, environment }) {
    const result = await pool.query<QueryResultRow & { binding_id: string; name: string; connection_id: string; connector_id: string }>(
      'SELECT binding_id, name, connection_id, connector_id FROM connector.list_bound_connections($1, $2)', [projectId, environment])
    return result.rows.map((row) => ({
      bindingId: toBindingId(row.binding_id),
      name: toBindingName(row.name),
      connectionId: toConnectionId(row.connection_id),
      connectorId: row.connector_id,
    }))
  },
  async readConnectionCredential(connectionId) {
    const result = await pool.query<QueryResultRow & { sealed: string | null }>(
      'SELECT connector.read_connection_credential($1) AS sealed', [connectionId])
    return result.rows[0]?.sealed ?? null
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
    if (!row) throw new Failure('INTERNAL_UNEXPECTED', { details: { invariant: 'CONNECTOR_CONNECTION_NOT_READABLE' } })
    return { connection: toConnection(row), created: row.created }
  },
  async disableConnection({ actor, workspaceId, connectionId }) {
    const result = await pool.query<QueryResultRow & { found: boolean }>(
      'SELECT connector.disable_connection($1, $2, $3) AS found', [actor, workspaceId, connectionId])
    return result.rows[0]?.found === true
  },
  async listProjectBindings({ actor, projectId }) {
    const result = await pool.query<BindingEntryRow>(
      'SELECT kind, binding_id, name, connection_id, connector_id, label, bound_at FROM connector.list_project_bindings($1, $2)',
      [actor, projectId])
    return result.rows.map(toBindingEntry)
  },
  async bindConnection({ actor, projectId, connectionId, name }) {
    const result = await pool.query<BindingRow>(
      'SELECT binding_id, name, connection_id, connector_id, label, bound_at FROM connector.bind_connection($1, $2, $3, $4)',
      [actor, projectId, connectionId, name])
    const row = result.rows[0]
    if (!row) throw new Failure('INTERNAL_UNEXPECTED', { details: { invariant: 'CONNECTOR_BINDING_NOT_READABLE' } })
    return toProjectBinding(row)
  },
  async unbindConnection({ actor, projectId, bindingId }) {
    const result = await pool.query<QueryResultRow & { found: boolean }>(
      'SELECT connector.unbind_connection($1, $2, $3) AS found', [actor, projectId, bindingId])
    return result.rows[0]?.found === true
  },
})
