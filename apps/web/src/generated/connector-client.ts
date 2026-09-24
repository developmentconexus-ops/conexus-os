// GENERATED from contracts/api/product/openapi.yaml by scripts/generate-r1-connector-contracts.mjs. Do not edit.
export const CONNECTOR_PRODUCT_OAS_DIGEST = "56d1cf98889f289c0dc07c81142163ec449f1eb5c411df2cc4c26903076e0b6c"
export const CONNECTOR_ROUTE_PROJECTION_DIGEST = "3409f43526855255c7de0f8f94369489c412c1637be5794587ca2dda3b97a5b3"
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
