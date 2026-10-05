import { z } from 'zod';
import { fieldFailures } from './field-failures.js';
import { BindingId, ConnectionId, ProjectId, WorkspaceId } from './ids.js';
import { operation } from './operation.js';
const CONNECTOR_ID_PATTERN = /^[a-z][a-z0-9-]{0,39}$/;
const BINDING_NAME_PATTERN = /^[a-z][a-z0-9-]{0,39}$/;
/** The connectors this Hub registers, the one list of them. */
export const ConnectorId = z.enum(['sankhya']).meta({ id: 'ConnectorId' });
/** The stored text of a connector id: the column accepts any value of this shape since migration 0031, and the registry decides which of them this Hub knows. */
export const ConnectorIdText = z.string().regex(CONNECTOR_ID_PATTERN).meta({ id: 'ConnectorIdText' });
export const BindingName = z.string().regex(BINDING_NAME_PATTERN).brand().meta({ id: 'BindingName' });
export const ConnectionLabel = z.string().trim().min(1).max(200).register(fieldFailures, { failureCode: 'CONNECTOR_LABEL_REFUSED' });
export const SankhyaCredential = z.strictObject({
    clientId: z.string().min(1).max(200).meta({ writeOnly: true }),
    clientSecret: z.string().min(1).max(500).meta({ writeOnly: true }),
    xToken: z.string().min(1).max(500).meta({ writeOnly: true }),
}).meta({ id: 'SankhyaCredential' }).register(fieldFailures, { failureCode: 'CONNECTOR_CREDENTIAL_REFUSED' });
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
export const CON01 = operation({
    id: 'CON-01', access: 'session', method: 'GET', path: '/api/control/workspaces/:workspaceId/connections',
    params: workspaceParam, query: null, headers: null, body: null,
    success: { 200: z.object({ entries: z.array(ConnectorConnection) }) },
    effects: [], failures: ['INSTALLATION_ADMINISTRATOR_REQUIRED'], malformed: { workspaceId: 'WORKSPACE_NOT_FOUND' },
});
export const CON02 = operation({
    id: 'CON-02', access: 'session', method: 'POST', path: '/api/control/workspaces/:workspaceId/connections',
    params: workspaceParam, query: null, headers: null,
    body: z.discriminatedUnion('connectorId', [
        z.strictObject({ connectionId: ConnectionId, connectorId: z.literal(ConnectorId.enum.sankhya), label: ConnectionLabel, credential: CONNECTOR_CREDENTIALS.sankhya }),
    ]),
    success: { 201: ConnectorConnection, 200: ConnectorConnection },
    effects: [],
    failures: ['INSTALLATION_ADMINISTRATOR_REQUIRED', 'CONNECTOR_WORKSPACE_NOT_FOUND', 'CONNECTOR_LABEL_REFUSED', 'CONNECTOR_CREDENTIAL_REFUSED', 'CONNECTOR_CONNECTION_CONFLICT'],
    malformed: { workspaceId: 'CONNECTOR_WORKSPACE_NOT_FOUND' },
});
export const CON03 = operation({
    id: 'CON-03', access: 'session', method: 'POST', path: '/api/control/workspaces/:workspaceId/connections/:connectionId/authentication-check',
    params: workspaceConnectionParams, query: null, headers: null, body: null,
    success: { 200: z.object({ outcome: ConnectionCheckOutcome }) },
    effects: [], failures: ['INSTALLATION_ADMINISTRATOR_REQUIRED', 'CONNECTOR_CONNECTION_NOT_FOUND', 'CONNECTOR_PLATFORM_FAILED'],
    malformed: { workspaceId: 'CONNECTOR_CONNECTION_NOT_FOUND', connectionId: 'CONNECTOR_CONNECTION_NOT_FOUND' },
});
export const CON04 = operation({
    id: 'CON-04', access: 'session', method: 'DELETE', path: '/api/control/workspaces/:workspaceId/connections/:connectionId',
    params: workspaceConnectionParams, query: null, headers: null, body: null,
    success: { 204: null },
    effects: [], failures: ['INSTALLATION_ADMINISTRATOR_REQUIRED', 'CONNECTOR_CONNECTION_NOT_FOUND'],
    malformed: { workspaceId: 'CONNECTOR_CONNECTION_NOT_FOUND', connectionId: 'CONNECTOR_CONNECTION_NOT_FOUND' },
});
export const CON08 = operation({
    id: 'CON-08', access: 'session', method: 'GET', path: '/api/control/projects/:projectId/connection-bindings',
    params: projectParam, query: null, headers: null, body: null,
    success: { 200: z.object({ entries: z.array(ConnectionBindingEntry) }) },
    effects: [], failures: ['PROJECT_NOT_FOUND', 'CONNECTOR_BINDING_MANAGE_REQUIRED'],
    malformed: { projectId: 'PROJECT_NOT_FOUND' },
});
export const CON09 = operation({
    id: 'CON-09', access: 'session', method: 'POST', path: '/api/control/projects/:projectId/connection-bindings',
    params: projectParam, query: null, headers: null,
    body: z.object({ connectionId: ConnectionId, name: BindingName }).strict(),
    success: { 201: ConnectionBinding, 200: ConnectionBinding },
    effects: [],
    failures: ['PROJECT_NOT_FOUND', 'CONNECTOR_BINDING_MANAGE_REQUIRED', 'CONNECTOR_CONNECTION_NOT_AVAILABLE', 'CONNECTOR_BINDING_CONFLICT', 'ACCOUNT_INACTIVE', 'ACCOUNT_NOT_FOUND'],
    malformed: { projectId: 'PROJECT_NOT_FOUND' },
});
export const CON10 = operation({
    id: 'CON-10', access: 'session', method: 'DELETE', path: '/api/control/projects/:projectId/connection-bindings/:bindingId',
    params: projectBindingParams, query: null, headers: null, body: null,
    success: { 204: null },
    effects: [], failures: ['PROJECT_NOT_FOUND', 'CONNECTOR_BINDING_MANAGE_REQUIRED', 'CONNECTOR_BINDING_NOT_FOUND', 'ACCOUNT_INACTIVE', 'ACCOUNT_NOT_FOUND'],
    malformed: { projectId: 'PROJECT_NOT_FOUND', bindingId: 'CONNECTOR_BINDING_NOT_FOUND' },
});
