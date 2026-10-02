export type ConnectorId = 'sankhya'
export type ConnectionId = string & { readonly __brand: 'ConnectionId' }
export type BindingId = string & { readonly __brand: 'BindingId' }
/** A Project-local name such as 'erp'; the only way a consumer names a Connection. */
export type BindingName = string & { readonly __brand: 'BindingName' }
export type Environment = 'preview'

export const connectionId = (value: string): ConnectionId => value as ConnectionId
export const bindingId = (value: string): BindingId => value as BindingId
export const bindingName = (value: string): BindingName => value as BindingName

export type Connection = Readonly<{
  connectionId: ConnectionId
  connectorId: ConnectorId
  label: string
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
  boundAt: Date
}>

type BindableConnection = Readonly<{
  kind: 'bindable'
  connectionId: ConnectionId
  connectorId: ConnectorId
  label: string
}>

export type ProjectBindingEntry = ProjectBinding | BindableConnection

/** What the broker reads per call. `connectorId` is the stored text: the registry decides whether it
 * names a registered integrator. */
export type BoundConnection = Readonly<{ bindingId: BindingId; name: BindingName; connectionId: ConnectionId; connectorId: string }>

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
