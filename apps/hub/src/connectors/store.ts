import type { QueryResultRow } from 'pg'
import {
  BindingId, BindingName, ConnectionId, ConnectorIdText,
  type AccountId, type ConnectionBinding, type ConnectionBindingEntry, type ConnectorConnection, type Input, type ProjectId, type WorkspaceId,
  type CON02, type CON09,
} from '../../../../packages/contract/dist/index.js'
import type { PostgresPool } from '../platform/db.js'
import { Failure } from '../platform/failure.js'
import type { SecretEnvelope } from '../platform/secrets.js'
import type { BoundConnection, Environment } from './model.js'
import {
  isConnectorBindingConflict, isConnectorConnectionConflict, isConnectorConnectionNotAvailable, isConnectorNotAdmitted, isConnectorProjectNotFound,
  isConnectorWorkspaceNotFound,
} from './model.js'

type ConnectionRow = QueryResultRow & { connection_id: string; connector_id: string; label: string; created_at: Date; disabled_at: Date | null }
type BindingRow = QueryResultRow & { binding_id: string; name: string; connection_id: string; connector_id: string; label: string; bound_at: Date }
type BindingEntryRow = QueryResultRow & BindingRow & { kind: 'binding' | 'bindable' }

const toConnection = (row: ConnectionRow): ConnectorConnection => ({
  connectionId: ConnectionId.parse(row.connection_id),
  connectorId: ConnectorIdText.parse(row.connector_id),
  label: row.label,
  createdAt: row.created_at.toISOString(),
  ...(row.disabled_at ? { disabledAt: row.disabled_at.toISOString() } : {}),
})

const toBinding = (row: BindingRow): ConnectionBinding => ({
  kind: 'binding',
  bindingId: BindingId.parse(row.binding_id),
  name: BindingName.parse(row.name),
  connectionId: ConnectionId.parse(row.connection_id),
  connectorId: ConnectorIdText.parse(row.connector_id),
  label: row.label,
  boundAt: row.bound_at.toISOString(),
})

const toEntry = (row: BindingEntryRow): ConnectionBindingEntry => row.kind === 'binding'
  ? toBinding(row)
  : { kind: 'bindable', connectionId: ConnectionId.parse(row.connection_id), connectorId: ConnectorIdText.parse(row.connector_id), label: row.label }

const administratorRefusal = (error: unknown): never => {
  if (isConnectorNotAdmitted(error)) throw new Failure('INSTALLATION_ADMINISTRATOR_REQUIRED')
  throw error
}

const ownerRefusal = (error: unknown): never => {
  if (isConnectorProjectNotFound(error)) throw new Failure('PROJECT_NOT_FOUND')
  if (isConnectorConnectionNotAvailable(error)) throw new Failure('CONNECTOR_CONNECTION_NOT_AVAILABLE')
  if (isConnectorBindingConflict(error)) throw new Failure('CONNECTOR_BINDING_CONFLICT')
  if (isConnectorNotAdmitted(error)) throw new Failure('CONNECTOR_BINDING_MANAGE_REQUIRED')
  throw error
}

export type ConnectorStore = Readonly<{
  listConnections(input: Readonly<{ accountId: AccountId; workspaceId: WorkspaceId }>): Promise<ConnectorConnection[]>
  createConnection(input: Readonly<{ accountId: AccountId; workspaceId: WorkspaceId; body: Input<typeof CON02>['body'] }>): Promise<Readonly<{ connection: ConnectorConnection; created: boolean }>>
  disableConnection(input: Readonly<{ accountId: AccountId; workspaceId: WorkspaceId; connectionId: ConnectionId }>): Promise<void>
  listProjectBindings(input: Readonly<{ accountId: AccountId; projectId: ProjectId }>): Promise<ConnectionBindingEntry[]>
  bindConnection(input: Readonly<{ accountId: AccountId; projectId: ProjectId; body: Input<typeof CON09>['body'] }>): Promise<ConnectionBinding>
  unbindConnection(input: Readonly<{ accountId: AccountId; projectId: ProjectId; bindingId: BindingId }>): Promise<void>
}>

export type BrokerStore = Readonly<{
  listBindings(input: Readonly<{ projectId: string; environment: Environment }>): Promise<readonly BoundConnection[]>
  readConnectionCredential(connectionId: ConnectionId): Promise<string | null>
}>

export const createBrokerStore = (pool: PostgresPool): BrokerStore => Object.freeze({
  async listBindings({ projectId, environment }) {
    const result = await pool.query<QueryResultRow & { binding_id: string; name: string; connection_id: string; connector_id: string }>(
      'SELECT binding_id, name, connection_id, connector_id FROM connector.list_bound_connections($1, $2)', [projectId, environment])
    return result.rows.map((row) => ({
      bindingId: BindingId.parse(row.binding_id),
      name: BindingName.parse(row.name),
      connectionId: ConnectionId.parse(row.connection_id),
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
  async listConnections({ accountId, workspaceId }) {
    const result = await pool.query<ConnectionRow>(
      'SELECT connection_id, connector_id, label, created_at, disabled_at FROM connector.list_connections($1, $2)', [accountId, workspaceId],
    ).catch(administratorRefusal)
    return result.rows.map(toConnection)
  },
  async createConnection({ accountId, workspaceId, body }) {
    const sealed = await envelope.seal(JSON.stringify(body.credential))
    const digests = envelope.fingerprints(JSON.stringify(body.credential, Object.keys(body.credential).sort()))
    const result = await pool.query<ConnectionRow & { created: boolean }>(
      'SELECT connection_id, connector_id, label, created_at, disabled_at, created FROM connector.create_connection($1, $2, $3, $4, $5, $6, $7)',
      [accountId, body.connectionId, workspaceId, body.connectorId, body.label, sealed, digests],
    ).catch((error: unknown) => {
      if (isConnectorConnectionConflict(error)) throw new Failure('CONNECTOR_CONNECTION_CONFLICT')
      if (isConnectorWorkspaceNotFound(error)) throw new Failure('CONNECTOR_WORKSPACE_NOT_FOUND')
      return administratorRefusal(error)
    })
    const row = result.rows[0]
    if (!row) throw new Failure('INTERNAL_UNEXPECTED', { details: { invariant: 'CONNECTOR_CONNECTION_NOT_READABLE' } })
    return { connection: toConnection(row), created: row.created }
  },
  async disableConnection({ accountId, workspaceId, connectionId }) {
    const result = await pool.query<QueryResultRow & { found: boolean }>(
      'SELECT connector.disable_connection($1, $2, $3) AS found', [accountId, workspaceId, connectionId],
    ).catch(administratorRefusal)
    if (result.rows[0]?.found !== true) throw new Failure('CONNECTOR_CONNECTION_NOT_FOUND')
  },
  async listProjectBindings({ accountId, projectId }) {
    const result = await pool.query<BindingEntryRow>(
      'SELECT kind, binding_id, name, connection_id, connector_id, label, bound_at FROM connector.list_project_bindings($1, $2)', [accountId, projectId],
    ).catch(ownerRefusal)
    return result.rows.map(toEntry)
  },
  async bindConnection({ accountId, projectId, body }) {
    const result = await pool.query<BindingRow>(
      'SELECT binding_id, name, connection_id, connector_id, label, bound_at FROM connector.bind_connection($1, $2, $3, $4)',
      [accountId, projectId, body.connectionId, body.name],
    ).catch(ownerRefusal)
    const row = result.rows[0]
    if (!row) throw new Failure('INTERNAL_UNEXPECTED', { details: { invariant: 'CONNECTOR_BINDING_NOT_READABLE' } })
    return toBinding(row)
  },
  async unbindConnection({ accountId, projectId, bindingId }) {
    const result = await pool.query<QueryResultRow & { found: boolean }>(
      'SELECT connector.unbind_connection($1, $2, $3) AS found', [accountId, projectId, bindingId],
    ).catch(ownerRefusal)
    if (result.rows[0]?.found !== true) throw new Failure('CONNECTOR_BINDING_NOT_FOUND')
  },
})
