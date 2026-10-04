// GENERATED from contracts/api/product/openapi.yaml by scripts/generate-project-contracts.mjs. Do not edit.
export const PROJECT_PRODUCT_OAS_DIGEST = "f4b9c6939bbe81986098965a89ef7d158f12ba703999d0e37a31111d6d2b55c8"
export const PROJECT_ROUTE_PROJECTION_DIGEST = "03ea40d35942361fa1ef53b9a5febf705d7147db06f23b6450710ec7e293843c"
export type ProjectSummary = { "projectId": string; "workspaceId": string; "name": string; "archived": boolean }
export type ProjectRepresentation = { "projectId": string; "workspaceId": string; "name": string; "projectRevision": string; "archived": boolean; "deleting": boolean }
export type CreateProjectInput = { "name": string; "sourceBootstrap": { "mode": "NEW" } | { "mode": "EXISTING_GIT"; "repositoryLocator": string } }
export type CreateProjectResponse = { "projectId": string; "workspaceId": string; "name": string; "projectRevision": string; "archived": boolean }
const request = async (url: string, init: RequestInit = {}) => fetch(url, { ...init, credentials: 'same-origin' })
export const projectClient = Object.freeze({
  listProjects: (workspaceId: string) => request("/api/control/workspaces/" + encodeURIComponent(workspaceId) + '/projects'),
  getProject: (projectId: string) => request("/api/control/projects/" + encodeURIComponent(projectId)),
  createProject: (workspaceId: string, body: CreateProjectInput, idempotencyKey: string) => request("/api/control/workspaces/" + encodeURIComponent(workspaceId) + '/projects', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey }, body: JSON.stringify(body) }),
  deleteProject: (projectId: string, confirmName: string) => request("/api/control/projects/" + encodeURIComponent(projectId) + '?confirmName=' + encodeURIComponent(confirmName), { method: 'DELETE' }),
})
