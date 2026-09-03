// GENERATED from contracts/api/product/openapi.yaml by scripts/generate-r1-s3-contracts.mjs. Do not edit.
export const S3_PRODUCT_OAS_DIGEST = "67d141e946e933c8a031d456f9d51ed44389053e5b2c50979b10c927dae07cd3"
export const S3_ROUTE_PROJECTION_DIGEST = "1b568887e36cfa37576905de38eb751d6d190738976ae1b10c4bd8d4048ec9aa"
export type ProjectSummary = { "projectId": string; "workspaceId": string; "name": string; "archived": boolean }
export type ProjectRepresentation = { "projectId": string; "workspaceId": string; "name": string; "projectRevision": string; "archived": boolean }
export type CreateProjectInput = { "name": string; "sourceBootstrap": { "mode": "NEW" } | { "mode": "EXISTING_GIT"; "repositoryLocator": string } }
export type CreateProjectResponse = { "projectId": string; "workspaceId": string; "name": string; "projectRevision": string; "archived": boolean }
export type RunInceptionInput = { "intent": string; "priorCandidateBaselineDigest"?: string; "reviewFeedback"?: string }
export type RunInceptionResponse = { "candidateBaselineDigest": string; "sourceRevision": string; "sourceText": string; "applicationRuntimeProfile": "MANAGED" | "DEDICATED" }
export type ApprovedBaseline = { "baselineDigest": string; "sourceRevision": string; "sourceText": string; "applicationRuntimeProfile": "MANAGED" | "DEDICATED" }
export type ApproveBaselineInput = { "candidateBaselineDigest": string }
export type ProjectBaselineCandidate = { "candidateBaselineDigest": string; "sourceRevision": string; "sourceText": string; "applicationRuntimeProfile": "MANAGED" | "DEDICATED" }
export type AskBaselineCandidateInput = { "question": string; "reviewContext"?: { "projectionAnchor": string; "selectedText"?: string } }
export type AskBaselineCandidateResponse = { "candidateBaselineDigest": string; "answer": string; "provenanceRefs": string[] }
const csrf = () => document.cookie.split('; ').find((item) => item.startsWith('__Host-conexus_csrf='))?.split('=').slice(1).join('=')
const request = async (url: string, init: RequestInit = {}) => { const method = (init.method ?? 'GET').toUpperCase(); return fetch(url, { ...init, credentials: 'same-origin', headers: { ...(init.headers ?? {}), ...(method === 'POST' ? { 'x-conexus-csrf': decodeURIComponent(csrf() ?? '') } : {}) } }) }
export const projectClient = Object.freeze({
  listProjects: (workspaceId: string) => request("/api/control/workspaces/" + encodeURIComponent(workspaceId) + '/projects'),
  getProject: (projectId: string) => request("/api/control/projects/" + encodeURIComponent(projectId)),
  createProject: (workspaceId: string, body: CreateProjectInput, idempotencyKey: string) => request("/api/control/workspaces/" + encodeURIComponent(workspaceId) + '/projects', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey }, body: JSON.stringify(body) }),
  runInception: (projectId: string, body: RunInceptionInput, idempotencyKey: string) => request("/api/control/projects/" + encodeURIComponent(projectId) + '/inception-investigations', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey }, body: JSON.stringify(body) }),
  getApprovedBaseline: (projectId: string) => request("/api/control/projects/" + encodeURIComponent(projectId) + '/baseline'),
  approveBaseline: (projectId: string, body: ApproveBaselineInput) => request("/api/control/projects/" + encodeURIComponent(projectId) + '/baseline/decisions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  getBaselineCandidate: (projectId: string, candidateBaselineDigest: string) => request("/api/control/projects/" + encodeURIComponent(projectId) + '/baseline-candidates/' + encodeURIComponent(candidateBaselineDigest)),
  askAboutBaselineCandidate: (projectId: string, candidateBaselineDigest: string, body: AskBaselineCandidateInput) => request("/api/control/projects/" + encodeURIComponent(projectId) + '/baseline-candidates/' + encodeURIComponent(candidateBaselineDigest) + '/assistant/queries', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
})
