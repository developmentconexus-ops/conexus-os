// GENERATED from contracts/api/product/openapi.yaml by scripts/generate-connector-contracts.mjs. Do not edit.
export const CONNECTOR_PRODUCT_OAS_DIGEST = "cfdf521979ae738c3da98ffbef74b2b669ade91a3cf9aa3ca4089235e6faec4b"
export const CONNECTOR_ROUTE_PROJECTION_DIGEST = "3ef9015fdcacceec3e5c747a50a2404848f7dea6039b3d07093173290049f191"
export type ConnectorConnection = { "connectionId": string; "connectorId": "sankhya"; "label": string; "createdAt": string; "disabledAt"?: string }
export type CreateWorkspaceConnectionInput = { "connectionId": string; "connectorId": "sankhya"; "label": string; "credential": { "clientId": string; "clientSecret": string; "xToken": string } }
export type CheckWorkspaceConnectionOutcome = { "outcome": "OK" | "CREDENTIAL_REFUSED" | "CONNECTOR_UNCONFIGURED" | "PROVIDER_UNAVAILABLE" | "PROVIDER_TIMEOUT" | "PROVIDER_ERROR" }
export type ConnectionBindingEntry = { "kind": "binding"; "bindingId": string; "name": string; "connectionId": string; "connectorId": "sankhya"; "label": string; "boundAt": string } | { "kind": "bindable"; "connectionId": string; "connectorId": "sankhya"; "label": string }
export type BindProjectConnectionInput = { "connectionId": string; "name": string }
export type ConnectionBinding = { "kind": "binding"; "bindingId": string; "name": string; "connectionId": string; "connectorId": "sankhya"; "label": string; "boundAt": string }
export const BINDING_NAME_PATTERN = new RegExp("^[a-z][a-z0-9-]{0,39}$")
const request = async (url: string, init: RequestInit = {}) => fetch(url, { ...init, credentials: 'same-origin' })
export const connectorClient = Object.freeze({
  listWorkspaceConnections: (workspaceId: string) => request(`/api/control/workspaces/${encodeURIComponent(workspaceId)}/connections`),
  createWorkspaceConnection: (workspaceId: string, body: CreateWorkspaceConnectionInput) => request(`/api/control/workspaces/${encodeURIComponent(workspaceId)}/connections`, { method: "POST", headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  checkWorkspaceConnection: (workspaceId: string, connectionId: string) => request(`/api/control/workspaces/${encodeURIComponent(workspaceId)}/connections/${encodeURIComponent(connectionId)}/authentication-check`, { method: "POST" }),
  disableWorkspaceConnection: (workspaceId: string, connectionId: string) => request(`/api/control/workspaces/${encodeURIComponent(workspaceId)}/connections/${encodeURIComponent(connectionId)}`, { method: "DELETE" }),
  listProjectConnectionBindings: (projectId: string) => request(`/api/control/projects/${encodeURIComponent(projectId)}/connection-bindings`),
  bindProjectConnection: (projectId: string, body: BindProjectConnectionInput) => request(`/api/control/projects/${encodeURIComponent(projectId)}/connection-bindings`, { method: "POST", headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  unbindProjectConnection: (projectId: string, bindingId: string) => request(`/api/control/projects/${encodeURIComponent(projectId)}/connection-bindings/${encodeURIComponent(bindingId)}`, { method: "DELETE" }),
})
