import type { BindingId, BindingName, ConnectionId } from '../../../../packages/contract/dist/index.js'

export type ConnectorId = 'sankhya'
export type Environment = 'preview'

/** What the broker reads per call. `connectorId` is the stored text: the registry decides whether it
 * names a registered integrator. */
export type BoundConnection = Readonly<{ bindingId: BindingId; name: BindingName; connectionId: ConnectionId; connectorId: string }>
