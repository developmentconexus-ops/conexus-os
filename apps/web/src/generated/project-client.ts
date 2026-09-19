// GENERATED from contracts/api/product/openapi.yaml by scripts/generate-r1-s3-contracts.mjs. Do not edit.
export const S3_PRODUCT_OAS_DIGEST = "5abe2dbea727b1062093cdbe1ba19d33cd3e739173ddb87bf3591b2adb5d731f"
export const S3_ROUTE_PROJECTION_DIGEST = "9750816573401de3df9bc3fd70007376aa3532242d48a2fbb766feabbacc53f5"
export type ProjectSummary = { "projectId": string; "workspaceId": string; "name": string; "archived": boolean }
export type ProjectRepresentation = { "projectId": string; "workspaceId": string; "name": string; "projectRevision": string; "archived": boolean }
export type CreateProjectInput = { "name": string; "sourceBootstrap": { "mode": "NEW" } | { "mode": "EXISTING_GIT"; "repositoryLocator": string } }
export type CreateProjectResponse = { "projectId": string; "workspaceId": string; "name": string; "projectRevision": string; "archived": boolean }
const csrf = () => document.cookie.split('; ').find((item) => item.startsWith('__Host-conexus_csrf='))?.split('=').slice(1).join('=')
const request = async (url: string, init: RequestInit = {}) => { const method = (init.method ?? 'GET').toUpperCase(); return fetch(url, { ...init, credentials: 'same-origin', headers: { ...(init.headers ?? {}), ...(method === 'POST' ? { 'x-conexus-csrf': decodeURIComponent(csrf() ?? '') } : {}) } }) }
export const projectClient = Object.freeze({
  listProjects: (workspaceId: string) => request("/api/control/workspaces/" + encodeURIComponent(workspaceId) + '/projects'),
  getProject: (projectId: string) => request("/api/control/projects/" + encodeURIComponent(projectId)),
  createProject: (workspaceId: string, body: CreateProjectInput, idempotencyKey: string) => request("/api/control/workspaces/" + encodeURIComponent(workspaceId) + '/projects', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey }, body: JSON.stringify(body) }),
})
