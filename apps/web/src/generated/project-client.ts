// GENERATED from contracts/api/product/openapi.yaml by scripts/generate-r1-s3-contracts.mjs. Do not edit.
export const S3_PRODUCT_OAS_DIGEST = "83246dfb0db9e618f99f9bf19926964b7eed8e572155ee90993074567feebb6c"
export const S3_ROUTE_PROJECTION_DIGEST = "03ea40d35942361fa1ef53b9a5febf705d7147db06f23b6450710ec7e293843c"
export type ProjectSummary = { "projectId": string; "workspaceId": string; "name": string; "archived": boolean }
export type ProjectRepresentation = { "projectId": string; "workspaceId": string; "name": string; "projectRevision": string; "archived": boolean; "deleting": boolean }
export type CreateProjectInput = { "name": string; "sourceBootstrap": { "mode": "NEW" } | { "mode": "EXISTING_GIT"; "repositoryLocator": string } }
export type CreateProjectResponse = { "projectId": string; "workspaceId": string; "name": string; "projectRevision": string; "archived": boolean }
const csrf = () => document.cookie.split('; ').find((item) => item.startsWith('__Host-conexus_csrf='))?.split('=').slice(1).join('=')
const request = async (url: string, init: RequestInit = {}) => { const method = (init.method ?? 'GET').toUpperCase(); return fetch(url, { ...init, credentials: 'same-origin', headers: { ...(init.headers ?? {}), ...(method === 'POST' || method === 'DELETE' ? { 'x-conexus-csrf': decodeURIComponent(csrf() ?? '') } : {}) } }) }
export const projectClient = Object.freeze({
  listProjects: (workspaceId: string) => request("/api/control/workspaces/" + encodeURIComponent(workspaceId) + '/projects'),
  getProject: (projectId: string) => request("/api/control/projects/" + encodeURIComponent(projectId)),
  createProject: (workspaceId: string, body: CreateProjectInput, idempotencyKey: string) => request("/api/control/workspaces/" + encodeURIComponent(workspaceId) + '/projects', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey }, body: JSON.stringify(body) }),
  deleteProject: (projectId: string, confirmName: string) => request("/api/control/projects/" + encodeURIComponent(projectId) + '?confirmName=' + encodeURIComponent(confirmName), { method: 'DELETE' }),
})
