import { z } from 'zod';
import { BindingId, ConnectionId, ProjectId, WorkspaceId } from './ids.js';
import { operation } from './operation.js';
const CONNECTOR_ID_PATTERN = /^[a-z][a-z0-9-]{0,39}$/;
const BINDING_NAME_PATTERN = /^[a-z][a-z0-9-]{0,39}$/;
/** The connectors this Hub registers, the one list of them. */
export const ConnectorId = z.enum(['sankhya']).meta({ id: 'ConnectorId' });
/** The stored text of a connector id: the column accepts any value of this shape since migration 0031, and the registry decides which of them this Hub knows. */
export const ConnectorIdText = z.string().regex(CONNECTOR_ID_PATTERN).meta({ id: 'ConnectorIdText' });
export const BindingName = z.string().regex(BINDING_NAME_PATTERN).brand().meta({ id: 'BindingName' });
export const ConnectionLabel = z.string().trim().min(1).max(200);
export const SankhyaCredential = z.strictObject({
    clientId: z.string().min(1).max(200).meta({ writeOnly: true }),
    clientSecret: z.string().min(1).max(500).meta({ writeOnly: true }),
    xToken: z.string().min(1).max(500).meta({ writeOnly: true }),
}).meta({ id: 'SankhyaCredential' });
/** The credential schema of each registered connector. */
export const CONNECTOR_CREDENTIALS = { sankhya: SankhyaCredential };
export const ConnectorConnection = z.object({
    connectionId: ConnectionId,
    connectorId: ConnectorIdText,
    label: ConnectionLabel,
    createdAt: z.iso.datetime(),
    disabledAt: z.iso.datetime().optional(),
}).meta({ id: 'ConnectorConnection' });
export const ConnectionBinding = z.object({
    kind: z.literal('binding'),
    bindingId: BindingId,
    name: BindingName,
    connectionId: ConnectionId,
    connectorId: ConnectorIdText,
    label: ConnectionLabel,
    boundAt: z.iso.datetime(),
}).meta({ id: 'ConnectionBinding' });
export const BindableConnection = z.object({
    kind: z.literal('bindable'),
    connectionId: ConnectionId,
    connectorId: ConnectorIdText,
    label: ConnectionLabel,
}).meta({ id: 'BindableConnection' });
export const ConnectionBindingEntry = z.discriminatedUnion('kind', [ConnectionBinding, BindableConnection]).meta({ id: 'ConnectionBindingEntry' });
export const CONNECTION_CHECK_OUTCOMES = ['OK', 'CREDENTIAL_REFUSED', 'CONNECTOR_UNCONFIGURED', 'PROVIDER_UNAVAILABLE', 'PROVIDER_TIMEOUT', 'PROVIDER_ERROR'];
export const ConnectionCheckOutcome = z.enum(CONNECTION_CHECK_OUTCOMES).meta({ id: 'ConnectionCheckOutcome' });
const workspaceParam = z.object({ workspaceId: WorkspaceId });
const workspaceConnectionParams = z.object({ workspaceId: WorkspaceId, connectionId: ConnectionId });
const projectParam = z.object({ projectId: ProjectId });
const projectBindingParams = z.object({ projectId: ProjectId, bindingId: BindingId });
export const listWorkspaceConnections = operation({
    id: 'listWorkspaceConnections', summary: 'List the Connections of a Workspace without any credential field; installation administrator only.', access: 'session', method: 'GET', path: '/api/control/workspaces/:workspaceId/connections',
    params: workspaceParam, query: null, headers: null, body: null,
    success: { 200: z.object({ entries: z.array(ConnectorConnection) }) },
    effects: [], failures: ['INSTALLATION_ADMINISTRATOR_REQUIRED'], malformed: { workspaceId: 'WORKSPACE_NOT_FOUND' },
});
export const createWorkspaceConnection = operation({
    id: 'createWorkspaceConnection', summary: 'Create a Connection of a Workspace, idempotent on its client-chosen id; installation administrator only.', access: 'session', method: 'POST', path: '/api/control/workspaces/:workspaceId/connections',
    params: workspaceParam, query: null, headers: null,
    body: z.discriminatedUnion('connectorId', [
        z.strictObject({ connectionId: ConnectionId, connectorId: z.literal(ConnectorId.enum.sankhya), label: ConnectionLabel, credential: CONNECTOR_CREDENTIALS.sankhya }),
    ]),
    success: { 201: ConnectorConnection, 200: ConnectorConnection },
    effects: [],
    failures: ['INSTALLATION_ADMINISTRATOR_REQUIRED', 'CONNECTOR_WORKSPACE_NOT_FOUND', 'CONNECTOR_LABEL_REFUSED', 'CONNECTOR_CREDENTIAL_REFUSED', 'CONNECTOR_CONNECTION_CONFLICT'],
    malformed: { workspaceId: 'CONNECTOR_WORKSPACE_NOT_FOUND', label: 'CONNECTOR_LABEL_REFUSED', credential: 'CONNECTOR_CREDENTIAL_REFUSED' },
});
export const checkWorkspaceConnection = operation({
    id: 'checkWorkspaceConnection', summary: 'Check a Connection by running the allow-listed authentication of its Connector; installation administrator only.', access: 'session', method: 'POST', path: '/api/control/workspaces/:workspaceId/connections/:connectionId/authentication-check',
    params: workspaceConnectionParams, query: null, headers: null, body: null,
    success: { 200: z.object({ outcome: ConnectionCheckOutcome }) },
    effects: [], failures: ['INSTALLATION_ADMINISTRATOR_REQUIRED', 'CONNECTOR_CONNECTION_NOT_FOUND', 'CONNECTOR_PLATFORM_FAILED'],
    malformed: { workspaceId: 'CONNECTOR_CONNECTION_NOT_FOUND', connectionId: 'CONNECTOR_CONNECTION_NOT_FOUND' },
});
export const disableWorkspaceConnection = operation({
    id: 'disableWorkspaceConnection', summary: 'Disable a Connection and end its open bindings; installation administrator only.', access: 'session', method: 'DELETE', path: '/api/control/workspaces/:workspaceId/connections/:connectionId',
    params: workspaceConnectionParams, query: null, headers: null, body: null,
    success: { 204: null },
    effects: [], failures: ['INSTALLATION_ADMINISTRATOR_REQUIRED', 'CONNECTOR_CONNECTION_NOT_FOUND'],
    malformed: { workspaceId: 'CONNECTOR_CONNECTION_NOT_FOUND', connectionId: 'CONNECTOR_CONNECTION_NOT_FOUND' },
});
export const listProjectConnectionBindings = operation({
    id: 'listProjectConnectionBindings', summary: 'List the open bindings of a Project and the Connections it could still bind; Workspace Owner only.', access: 'session', method: 'GET', path: '/api/control/projects/:projectId/connection-bindings',
    params: projectParam, query: null, headers: null, body: null,
    success: { 200: z.object({ entries: z.array(ConnectionBindingEntry) }) },
    effects: [], failures: ['PROJECT_NOT_FOUND', 'CONNECTOR_BINDING_MANAGE_REQUIRED'],
    malformed: { projectId: 'PROJECT_NOT_FOUND' },
});
export const bindProjectConnection = operation({
    id: 'bindProjectConnection', summary: 'Bind an enabled Connection of the Workspace to a Project under a Project-local name; Workspace Owner only.', access: 'session', method: 'POST', path: '/api/control/projects/:projectId/connection-bindings',
    params: projectParam, query: null, headers: null,
    body: z.object({ connectionId: ConnectionId, name: BindingName }).strict(),
    success: { 201: ConnectionBinding, 200: ConnectionBinding },
    effects: [],
    failures: ['PROJECT_NOT_FOUND', 'CONNECTOR_BINDING_MANAGE_REQUIRED', 'CONNECTOR_CONNECTION_NOT_AVAILABLE', 'CONNECTOR_BINDING_CONFLICT', 'ACCOUNT_INACTIVE', 'ACCOUNT_NOT_FOUND'],
    malformed: { projectId: 'PROJECT_NOT_FOUND' },
});
export const unbindProjectConnection = operation({
    id: 'unbindProjectConnection', summary: 'End the binding of a Connection to a Project; Workspace Owner only.', access: 'session', method: 'DELETE', path: '/api/control/projects/:projectId/connection-bindings/:bindingId',
    params: projectBindingParams, query: null, headers: null, body: null,
    success: { 204: null },
    effects: [], failures: ['PROJECT_NOT_FOUND', 'CONNECTOR_BINDING_MANAGE_REQUIRED', 'CONNECTOR_BINDING_NOT_FOUND', 'ACCOUNT_INACTIVE', 'ACCOUNT_NOT_FOUND'],
    malformed: { projectId: 'PROJECT_NOT_FOUND', bindingId: 'CONNECTOR_BINDING_NOT_FOUND' },
});
