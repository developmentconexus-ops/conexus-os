export type ConnectorId = 'sankhya'
export type ConnectionId = string & { readonly __brand: 'ConnectionId' }
export type BindingId = string & { readonly __brand: 'BindingId' }
/** A Project-local name such as 'erp'; the only way a consumer names a Connection. */
export type BindingName = string & { readonly __brand: 'BindingName' }
/** '<connector>.<subject>.<verb>', e.g. 'sankhya.purchase-order.read'. Never validated as a shape
 * here: the set of admitted ids is the Connector Definition's, not this schema's. */
export type OperationId = string & { readonly __brand: 'OperationId' }
export type Environment = 'preview'
/** Which system a Connection reaches: the company's live one or its test one. Fixed at creation. */
const DESTINATIONS = ['production', 'sandbox'] as const
export type Destination = typeof DESTINATIONS[number]
export const isDestination = (value: unknown): value is Destination => DESTINATIONS.some((destination) => destination === value)

export const connectionId = (value: string): ConnectionId => value as ConnectionId
export const bindingId = (value: string): BindingId => value as BindingId
export const bindingName = (value: string): BindingName => value as BindingName
export const operationId = (value: string): OperationId => value as OperationId

export type Connection = Readonly<{
  connectionId: ConnectionId
  connectorId: ConnectorId
  label: string
  destination: Destination
  createdAt: Date
  disabledAt: Date | null
}>

export type ProjectBinding = Readonly<{
  kind: 'binding'
  bindingId: BindingId
  name: BindingName
  connectionId: ConnectionId
  connectorId: ConnectorId
  label: string
  destination: Destination
  boundAt: Date
}>

type BindableConnection = Readonly<{
  kind: 'bindable'
  connectionId: ConnectionId
  connectorId: ConnectorId
  label: string
  destination: Destination
}>

export type ProjectBindingEntry = ProjectBinding | BindableConnection

/** What the broker reads per call. `connectorId` is the stored text: the registry decides whether it
 * names a registered integrator. */
export type BoundConnection = Readonly<{ bindingId: BindingId; name: BindingName; connectionId: ConnectionId; connectorId: string; destination: Destination }>

/** Every refusal a caller sees is one of these shapes: not told the Project or Connection exists,
 * not an administrator/Owner, or a conflict. The store never throws anything else it has a name for. */
export const isConnectorNotAdmitted = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === '42501' &&
  'message' in error && error.message === 'NOT_ADMITTED'

export const isConnectorProjectNotFound = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === 'P0002' &&
  'message' in error && error.message === 'CONNECTOR_PROJECT_NOT_FOUND'

export const isConnectorWorkspaceNotFound = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === 'P0002' &&
  'message' in error && error.message === 'CONNECTOR_WORKSPACE_NOT_FOUND'

export const isConnectorConnectionNotAvailable = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === 'P0002' &&
  'message' in error && error.message === 'CONNECTOR_CONNECTION_NOT_AVAILABLE'

// A retry with this Connection id whose fields differ from the stored row.
export const isConnectorConnectionConflict = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'message' in error && error.message === 'CONNECTOR_CONNECTION_CONFLICT'

// The Connection already bound under another name, or the name already bound to another Connection.
export const isConnectorBindingConflict = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'message' in error && error.message === 'CONNECTOR_BINDING_CONFLICT'
