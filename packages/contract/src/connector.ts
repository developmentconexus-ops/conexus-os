import { z } from 'zod'
import { BindingId, ConnectionId, ProjectId, WorkspaceId } from './ids.js'
import { operation } from './operation.js'

const CONNECTOR_ID_PATTERN = /^[a-z][a-z0-9-]{0,39}$/

/** The stored text of a connector id: the column accepts any value of this shape since migration 0031. */
export const ConnectorIdText = z.string().regex(CONNECTOR_ID_PATTERN).meta({ id: 'ConnectorIdText' })
export const BindingName = z.string().regex(CONNECTOR_ID_PATTERN).meta({ id: 'BindingName' })
export type BindingName = z.output<typeof BindingName>

export const ConnectionLabel = z.string().trim().min(1).max(200).meta({ failureCode: 'CONNECTOR_LABEL_REFUSED' })

export const SankhyaCredential = z.strictObject({
  clientId: z.string().min(1).max(200).meta({ writeOnly: true }),
  clientSecret: z.string().min(1).max(500).meta({ writeOnly: true }),
  xToken: z.string().min(1).max(500).meta({ writeOnly: true }),
}).meta({ id: 'SankhyaCredential', failureCode: 'CONNECTOR_CREDENTIAL_REFUSED' })
export type SankhyaCredential = z.output<typeof SankhyaCredential>

export const ConnectorConnection = z.object({
  connectionId: ConnectionId,
  connectorId: ConnectorIdText,
  label: z.string().min(1),
  createdAt: z.iso.datetime(),
  disabledAt: z.iso.datetime().optional(),
}).meta({ id: 'ConnectorConnection' })
export type ConnectorConnection = z.output<typeof ConnectorConnection>

export const ConnectionBinding = z.object({
  kind: z.literal('binding'),
  bindingId: BindingId,
  name: BindingName,
  connectionId: ConnectionId,
  connectorId: ConnectorIdText,
  label: z.string().min(1),
  boundAt: z.iso.datetime(),
}).meta({ id: 'ConnectionBinding' })
export type ConnectionBinding = z.output<typeof ConnectionBinding>

export const BindableConnection = z.object({
  kind: z.literal('bindable'),
  connectionId: ConnectionId,
  connectorId: ConnectorIdText,
  label: z.string().min(1),
}).meta({ id: 'BindableConnection' })

export const ConnectionBindingEntry = z.union([ConnectionBinding, BindableConnection]).meta({ id: 'ConnectionBindingEntry' })
export type ConnectionBindingEntry = z.output<typeof ConnectionBindingEntry>

export const CONNECTION_CHECK_OUTCOMES = ['OK', 'CREDENTIAL_REFUSED', 'CONNECTOR_UNCONFIGURED', 'PROVIDER_UNAVAILABLE', 'PROVIDER_TIMEOUT', 'PROVIDER_ERROR'] as const
export const ConnectionCheckOutcome = z.enum(CONNECTION_CHECK_OUTCOMES).meta({ id: 'ConnectionCheckOutcome' })
export type ConnectionCheckOutcome = z.output<typeof ConnectionCheckOutcome>

const workspaceParam = z.object({ workspaceId: WorkspaceId })
const workspaceConnectionParams = z.object({ workspaceId: WorkspaceId, connectionId: ConnectionId })
const projectParam = z.object({ projectId: ProjectId })
const projectBindingParams = z.object({ projectId: ProjectId, bindingId: BindingId })

export const CON01 = operation({
  id: 'CON-01', access: 'session', method: 'GET', path: '/api/control/workspaces/:workspaceId/connections',
  params: workspaceParam, query: null, headers: null, body: null,
  success: { 200: z.object({ entries: z.array(ConnectorConnection) }) },
  effects: [], failures: ['INSTALLATION_ADMINISTRATOR_REQUIRED'], malformed: { workspaceId: 'WORKSPACE_NOT_FOUND' },
})

export const CON02 = operation({
  id: 'CON-02', access: 'session', method: 'POST', path: '/api/control/workspaces/:workspaceId/connections',
  params: workspaceParam, query: null, headers: null,
  body: z.object({ connectionId: ConnectionId, connectorId: z.enum(['sankhya']), label: ConnectionLabel, credential: SankhyaCredential }).strict(),
  success: { 201: ConnectorConnection, 200: ConnectorConnection },
  effects: [],
  failures: ['INSTALLATION_ADMINISTRATOR_REQUIRED', 'CONNECTOR_WORKSPACE_NOT_FOUND', 'CONNECTOR_LABEL_REFUSED', 'CONNECTOR_CREDENTIAL_REFUSED', 'CONNECTOR_CONNECTION_CONFLICT'],
  malformed: { workspaceId: 'CONNECTOR_WORKSPACE_NOT_FOUND' },
})

export const CON03 = operation({
  id: 'CON-03', access: 'session', method: 'POST', path: '/api/control/workspaces/:workspaceId/connections/:connectionId/authentication-check',
  params: workspaceConnectionParams, query: null, headers: null, body: null,
  success: { 200: z.object({ outcome: ConnectionCheckOutcome }) },
  effects: [], failures: ['INSTALLATION_ADMINISTRATOR_REQUIRED', 'CONNECTOR_CONNECTION_NOT_FOUND'],
  malformed: { workspaceId: 'CONNECTOR_CONNECTION_NOT_FOUND', connectionId: 'CONNECTOR_CONNECTION_NOT_FOUND' },
})

export const CON04 = operation({
  id: 'CON-04', access: 'session', method: 'DELETE', path: '/api/control/workspaces/:workspaceId/connections/:connectionId',
  params: workspaceConnectionParams, query: null, headers: null, body: null,
  success: { 204: null },
  effects: [], failures: ['INSTALLATION_ADMINISTRATOR_REQUIRED', 'CONNECTOR_CONNECTION_NOT_FOUND'],
  malformed: { workspaceId: 'CONNECTOR_CONNECTION_NOT_FOUND', connectionId: 'CONNECTOR_CONNECTION_NOT_FOUND' },
})

export const CON08 = operation({
  id: 'CON-08', access: 'session', method: 'GET', path: '/api/control/projects/:projectId/connection-bindings',
  params: projectParam, query: null, headers: null, body: null,
  success: { 200: z.object({ entries: z.array(ConnectionBindingEntry) }) },
  effects: [], failures: ['PROJECT_NOT_FOUND', 'CONNECTOR_BINDING_MANAGE_REQUIRED'],
  malformed: { projectId: 'PROJECT_NOT_FOUND' },
})

export const CON09 = operation({
  id: 'CON-09', access: 'session', method: 'POST', path: '/api/control/projects/:projectId/connection-bindings',
  params: projectParam, query: null, headers: null,
  body: z.object({ connectionId: ConnectionId, name: BindingName }).strict(),
  success: { 200: ConnectionBinding },
  effects: [],
  failures: ['PROJECT_NOT_FOUND', 'CONNECTOR_BINDING_MANAGE_REQUIRED', 'CONNECTOR_CONNECTION_NOT_AVAILABLE', 'CONNECTOR_BINDING_CONFLICT', 'ACCOUNT_INACTIVE', 'ACCOUNT_NOT_FOUND'],
  malformed: { projectId: 'PROJECT_NOT_FOUND' },
})

export const CON10 = operation({
  id: 'CON-10', access: 'session', method: 'DELETE', path: '/api/control/projects/:projectId/connection-bindings/:bindingId',
  params: projectBindingParams, query: null, headers: null, body: null,
  success: { 204: null },
  effects: [], failures: ['PROJECT_NOT_FOUND', 'CONNECTOR_BINDING_MANAGE_REQUIRED', 'CONNECTOR_BINDING_NOT_FOUND', 'ACCOUNT_INACTIVE', 'ACCOUNT_NOT_FOUND'],
  malformed: { projectId: 'PROJECT_NOT_FOUND', bindingId: 'CONNECTOR_BINDING_NOT_FOUND' },
})
