// Ids and shapes shared by the store and the routes. The broker's own types (Consumer, BrokerResult,
// the token cache) live in broker.ts and token-cache.ts; this module only administers Connections and Grants.

export type ConnectorId = 'sankhya'
export type ConnectionId = string & { readonly __brand: 'ConnectionId' }
export type GrantId = string & { readonly __brand: 'GrantId' }
/** '<connector>.<subject>.<verb>', e.g. 'sankhya.purchase-order.read'. Never validated as a shape
 * here: the set of admitted ids is the granting Connector Definition's, not this schema's. */
export type OperationId = string & { readonly __brand: 'OperationId' }
export type Environment = 'preview'
export type CapabilityKind = 'operation'

export const connectionId = (value: string): ConnectionId => value as ConnectionId
export const grantId = (value: string): GrantId => value as GrantId
export const operationId = (value: string): OperationId => value as OperationId

export type Connection = Readonly<{
  connectionId: ConnectionId
  connectorId: ConnectorId
  label: string
  createdAt: Date
  disabledAt: Date | null
}>

export type OpenGrant = Readonly<{
  kind: 'grant'
  grantId: GrantId
  connectionId: ConnectionId
  connectorId: ConnectorId
  capabilityId: OperationId
  grantedAt: Date
}>

export type GrantableCapability = Readonly<{
  kind: 'grantable'
  connectionId: ConnectionId
  connectorId: ConnectorId
  capabilityId: OperationId
}>

export type ProjectGrantEntry = OpenGrant | GrantableCapability

/** Every refusal a caller sees is one of these two shapes: not told the Project or Connection
 * exists, or not an administrator/Owner. The store never throws anything else it has a name for. */
export const isConnectorNotAdmitted = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === '42501' &&
  'message' in error && error.message === 'NOT_ADMITTED'

export const isConnectorProjectNotFound = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === 'P0002' &&
  'message' in error && error.message === 'CONNECTOR_PROJECT_NOT_FOUND'

export const isConnectorConnectionNotAvailable = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === 'P0002' &&
  'message' in error && error.message === 'CONNECTOR_CONNECTION_NOT_AVAILABLE'

// A retry that differs from the stored row, or a second open Connection of the same Connector in one
// Workspace (the partial unique index connection_open_key).
export const isConnectorConnectionConflict = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (
    ('message' in error && error.message === 'CONNECTOR_CONNECTION_CONFLICT') ||
    ('code' in error && error.code === '23505' && 'constraint' in error && error.constraint === 'connection_open_key'))
