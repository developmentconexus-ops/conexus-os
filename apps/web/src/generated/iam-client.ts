// GENERATED from contracts/api/product/openapi.yaml by scripts/generate-r1-s1-contracts.mjs. Do not edit.
export const S1_PRODUCT_OAS_DIGEST = "67d141e946e933c8a031d456f9d51ed44389053e5b2c50979b10c927dae07cd3"
export const S1_ROUTE_PROJECTION_DIGEST = "ad108bb4c4797547e07fbe6496ef442268aa06d7d30e40a65c5592910a2d2e9b"
export type AccountSummary = { "accountId": string; "displayName": string; "email"?: string }
export type AccessContext = { "account": { "accountId": string; "displayName": string; "email"?: string }; "workspaces": { "workspaceId": string; "name": string }[]; "projects": { "projectId": string; "workspaceId": string; "name": string; "archived": boolean }[] }
export type ProvisionAccountInput = { "externalSubject": string; "displayName": string; "email"?: string } | { "displayName": string; "email"?: string }
const csrf = () => document.cookie.split('; ').find((item) => item.startsWith('__Host-conexus_csrf='))?.split('=').slice(1).join('=')
const request = async (url: string, init: RequestInit = {}) => fetch(url, { ...init, credentials: 'same-origin', headers: { ...(init.headers ?? {}), ...(init.method && init.method !== 'GET' ? { 'x-conexus-csrf': decodeURIComponent(csrf() ?? '') } : {}) } })
export const iamClient = Object.freeze({
  getAccessContext: () => request("/api/control/access-context"),
  provisionAccount: (body: ProvisionAccountInput, idempotencyKey: string) => request("/api/control/accounts", { method: "POST", headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey }, body: JSON.stringify(body) }),
  endSession: () => request("/api/session", { method: "DELETE" }),
})
