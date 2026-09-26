// GENERATED from contracts/api/product/openapi.yaml by scripts/generate-r1-connector-contracts.mjs. Do not edit.
export const CONNECTOR_PRODUCT_OAS_DIGEST = "3522567e87503fd7ed2e81109b5a34fbf3009ada666adb20a96adb1bd9eb339d"
export const CONNECTOR_ROUTE_PROJECTION_DIGEST = "6415a22b7da12ca6f419f7c634968974c46dbd23ced1f81243ca3252e41088d9"
export type ConnectorConnection = { "connectionId": string; "connectorId": "sankhya"; "label": string; "createdAt": string; "disabledAt"?: string }
export type CreateWorkspaceConnectionInput = { "connectionId": string; "connectorId": "sankhya"; "label": string; "credential": { "clientId": string; "clientSecret": string; "xToken": string } }
export type CheckWorkspaceConnectionOutcome = { "outcome": "OK" | "CREDENTIAL_REFUSED" | "CONNECTOR_UNCONFIGURED" | "PROVIDER_UNAVAILABLE" | "PROVIDER_TIMEOUT" | "PROVIDER_ERROR" }
export type ConnectorGrantEntry = { "kind": "grant"; "grantId": string; "connectionId": string; "connectorId": "sankhya"; "capabilityId": string; "grantedAt": string } | { "kind": "grantable"; "connectionId": string; "connectorId": "sankhya"; "capabilityId": string }
export type GrantProjectConnectorOperationInput = { "connectionId": string; "operationId": string }
export type ConnectorOpenGrant = { "kind": "grant"; "grantId": string; "connectionId": string; "connectorId": "sankhya"; "capabilityId": string; "grantedAt": string }
const csrf = () => document.cookie.split('; ').find((item) => item.startsWith('__Host-conexus_csrf='))?.split('=').slice(1).join('=')
const request = async (url: string, init: RequestInit = {}) => fetch(url, { ...init, credentials: 'same-origin', headers: { ...(init.headers ?? {}), ...(init.method && init.method !== 'GET' ? { 'x-conexus-csrf': decodeURIComponent(csrf() ?? '') } : {}) } })
export const connectorClient = Object.freeze({
  listWorkspaceConnections: (workspaceId: string) => request(`/api/control/workspaces/${encodeURIComponent(workspaceId)}/connections`),
  createWorkspaceConnection: (workspaceId: string, body: CreateWorkspaceConnectionInput) => request(`/api/control/workspaces/${encodeURIComponent(workspaceId)}/connections`, { method: "POST", headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  checkWorkspaceConnection: (workspaceId: string, connectionId: string) => request(`/api/control/workspaces/${encodeURIComponent(workspaceId)}/connections/${encodeURIComponent(connectionId)}/authentication-check`, { method: "POST" }),
  disableWorkspaceConnection: (workspaceId: string, connectionId: string) => request(`/api/control/workspaces/${encodeURIComponent(workspaceId)}/connections/${encodeURIComponent(connectionId)}`, { method: "DELETE" }),
  listProjectConnectorGrants: (projectId: string) => request(`/api/control/projects/${encodeURIComponent(projectId)}/connector-grants`),
  grantProjectConnectorOperation: (projectId: string, body: GrantProjectConnectorOperationInput) => request(`/api/control/projects/${encodeURIComponent(projectId)}/connector-grants`, { method: "POST", headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  revokeProjectConnectorGrant: (projectId: string, grantId: string) => request(`/api/control/projects/${encodeURIComponent(projectId)}/connector-grants/${encodeURIComponent(grantId)}`, { method: "DELETE" }),
})
