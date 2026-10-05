// GENERATED from contracts/api/product/openapi.yaml by scripts/generate-workspace-contracts.mjs. Do not edit.
export const WORKSPACE_PRODUCT_OAS_DIGEST = "f4b9c6939bbe81986098965a89ef7d158f12ba703999d0e37a31111d6d2b55c8"
export const WORKSPACE_ROUTE_PROJECTION_DIGEST = "0986286b2672b071e5e4309b0d78bed2bb2466a8c0c3324bbea9df90b71c211e"
export type WorkspaceSummary = { "workspaceId": string; "name": string }
export type CreateWorkspaceInput = { "name": string }
export type CreateWorkspaceResponse = { "workspaceId": string; "name": string; "creatorAccountId": string; "initialAccessEstablished": true }
const request = async (url: string, init: RequestInit = {}) => fetch(url, { ...init, credentials: 'same-origin' })
export const workspaceClient = Object.freeze({
  createWorkspace: (body: CreateWorkspaceInput, idempotencyKey: string) => request("/api/control/workspaces", { method: "POST", headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey }, body: JSON.stringify(body) }),
  getWorkspace: (workspaceId: string) => request("/api/control/workspaces/" + encodeURIComponent(workspaceId)),
})
