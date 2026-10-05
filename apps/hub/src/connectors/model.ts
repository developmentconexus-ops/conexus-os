import type { BindingId, BindingName, ConnectionId } from '../../../../packages/contract/dist/index.js'

export type ConnectorId = 'sankhya'
export type Environment = 'preview'

/** What the broker reads per call. `connectorId` is the stored text: the registry decides whether it
 * names a registered integrator. */
export type BoundConnection = Readonly<{ bindingId: BindingId; name: BindingName; connectionId: ConnectionId; connectorId: string }>

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

export const isConnectorConnectionConflict = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'message' in error && error.message === 'CONNECTOR_CONNECTION_CONFLICT'

export const isConnectorBindingConflict = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'message' in error && error.message === 'CONNECTOR_BINDING_CONFLICT'
