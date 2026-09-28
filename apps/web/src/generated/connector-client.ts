// GENERATED from contracts/api/product/openapi.yaml by scripts/generate-r1-connector-contracts.mjs. Do not edit.
export const CONNECTOR_PRODUCT_OAS_DIGEST = "185079b490b7511c0ab74cd210f7cba82f04c6ec63f781ab62bf646454cddb41"
export const CONNECTOR_ROUTE_PROJECTION_DIGEST = "3ef9015fdcacceec3e5c747a50a2404848f7dea6039b3d07093173290049f191"
export type ConnectorConnection = { "connectionId": string; "connectorId": "sankhya"; "label": string; "createdAt": string; "disabledAt"?: string }
export type CreateWorkspaceConnectionInput = { "connectionId": string; "connectorId": "sankhya"; "label": string; "credential": { "clientId": string; "clientSecret": string; "xToken": string } }
export type CheckWorkspaceConnectionOutcome = { "outcome": "OK" | "CREDENTIAL_REFUSED" | "CONNECTOR_UNCONFIGURED" | "PROVIDER_UNAVAILABLE" | "PROVIDER_TIMEOUT" | "PROVIDER_ERROR" }
export type ConnectionBindingEntry = { "kind": "binding"; "bindingId": string; "name": string; "connectionId": string; "connectorId": "sankhya"; "label": string; "boundAt": string } | { "kind": "bindable"; "connectionId": string; "connectorId": "sankhya"; "label": string }
export type BindProjectConnectionInput = { "connectionId": string; "name": string }
export type ConnectionBinding = { "kind": "binding"; "bindingId": string; "name": string; "connectionId": string; "connectorId": "sankhya"; "label": string; "boundAt": string }
const csrf = () => document.cookie.split('; ').find((item) => item.startsWith('__Host-conexus_csrf='))?.split('=').slice(1).join('=')
const request = async (url: string, init: RequestInit = {}) => fetch(url, { ...init, credentials: 'same-origin', headers: { ...(init.headers ?? {}), ...(init.method && init.method !== 'GET' ? { 'x-conexus-csrf': decodeURIComponent(csrf() ?? '') } : {}) } })
export const connectorClient = Object.freeze({
  listWorkspaceConnections: (workspaceId: string) => request(`/api/control/workspaces/${encodeURIComponent(workspaceId)}/connections`),
  createWorkspaceConnection: (workspaceId: string, body: CreateWorkspaceConnectionInput) => request(`/api/control/workspaces/${encodeURIComponent(workspaceId)}/connections`, { method: "POST", headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  checkWorkspaceConnection: (workspaceId: string, connectionId: string) => request(`/api/control/workspaces/${encodeURIComponent(workspaceId)}/connections/${encodeURIComponent(connectionId)}/authentication-check`, { method: "POST" }),
  disableWorkspaceConnection: (workspaceId: string, connectionId: string) => request(`/api/control/workspaces/${encodeURIComponent(workspaceId)}/connections/${encodeURIComponent(connectionId)}`, { method: "DELETE" }),
  listProjectConnectionBindings: (projectId: string) => request(`/api/control/projects/${encodeURIComponent(projectId)}/connection-bindings`),
  bindProjectConnection: (projectId: string, body: BindProjectConnectionInput) => request(`/api/control/projects/${encodeURIComponent(projectId)}/connection-bindings`, { method: "POST", headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  unbindProjectConnection: (projectId: string, bindingId: string) => request(`/api/control/projects/${encodeURIComponent(projectId)}/connection-bindings/${encodeURIComponent(bindingId)}`, { method: "DELETE" }),
})
