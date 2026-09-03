// GENERATED from contracts/api/product/openapi.yaml by scripts/generate-r1-s2-contracts.mjs. Do not edit.
export const S2_PRODUCT_OAS_DIGEST = "67d141e946e933c8a031d456f9d51ed44389053e5b2c50979b10c927dae07cd3"
export const S2_ROUTE_PROJECTION_DIGEST = "0986286b2672b071e5e4309b0d78bed2bb2466a8c0c3324bbea9df90b71c211e"
export type WorkspaceSummary = { "workspaceId": string; "name": string }
export type CreateWorkspaceInput = { "name": string }
export type CreateWorkspaceResponse = { "workspaceId": string; "name": string; "creatorAccountId": string; "initialAccessEstablished": true }
const csrf = () => document.cookie.split('; ').find((item) => item.startsWith('__Host-conexus_csrf='))?.split('=').slice(1).join('=')
const request = async (url: string, init: RequestInit = {}) => { const method = (init.method ?? 'GET').toUpperCase(); return fetch(url, { ...init, credentials: 'same-origin', headers: { ...(init.headers ?? {}), ...(method === 'POST' ? { 'x-conexus-csrf': decodeURIComponent(csrf() ?? '') } : {}) } }) }
export const workspaceClient = Object.freeze({
  createWorkspace: (body: CreateWorkspaceInput, idempotencyKey: string) => request("/api/control/workspaces", { method: "POST", headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey }, body: JSON.stringify(body) }),
  getWorkspace: (workspaceId: string) => request("/api/control/workspaces/" + encodeURIComponent(workspaceId)),
})
