// GENERATED from contracts/api/product/openapi.yaml by scripts/generate-r1-s1-contracts.mjs. Do not edit.
export const S1_PRODUCT_OAS_DIGEST = "76ab8205639cb4fd3c4b8fc314331695f6137a116288f64440640056480d0748"
export const S1_ROUTE_PROJECTION_DIGEST = "97bb91fade56bec2842b803a11811b36a065cc89e2f1c08635c9ac75605192cc"
export type AccountSummary = { "accountId": string; "displayName": string; "email"?: string }
export type AccessContext = { "account": { "accountId": string; "displayName": string; "email"?: string }; "workspaces": { "workspaceId": string; "name": string }[]; "projects": { "projectId": string; "workspaceId": string; "name": string; "archived": boolean }[] }
export type ProvisionAccountInput = { "displayName": string; "email"?: string }
export type WorkspaceRoster = { "viewerRole": string; "entries": ({ "kind": "member"; "accountId": string; "displayName": string; "email"?: string; "role": string; "since": string } | { "kind": "invitation"; "invitationId": string; "email": string; "role": string; "invitedAt": string; "expiresAt": string })[] }
export type InviteWorkspaceMemberInput = { "email": string; "role": string }
export type WorkspaceInvitation = { "kind": "invitation"; "invitationId": string; "email": string; "role": string; "invitedAt": string; "expiresAt": string }
export type SetWorkspaceMemberRoleInput = { "role": string }
const csrf = () => document.cookie.split('; ').find((item) => item.startsWith('__Host-conexus_csrf='))?.split('=').slice(1).join('=')
const request = async (url: string, init: RequestInit = {}) => fetch(url, { ...init, credentials: 'same-origin', headers: { ...(init.headers ?? {}), ...(init.method && init.method !== 'GET' ? { 'x-conexus-csrf': decodeURIComponent(csrf() ?? '') } : {}) } })
export const iamClient = Object.freeze({
  getAccessContext: () => request("/api/control/access-context"),
  provisionAccount: (body: ProvisionAccountInput, idempotencyKey: string) => request("/api/control/accounts", { method: "POST", headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey }, body: JSON.stringify(body) }),
  endSession: () => request("/api/session", { method: "DELETE" }),
  listWorkspaceMembers: (workspaceId: string) => request(`/api/control/workspaces/${encodeURIComponent(workspaceId)}/members`),
  inviteWorkspaceMember: (workspaceId: string, body: InviteWorkspaceMemberInput) => request(`/api/control/workspaces/${encodeURIComponent(workspaceId)}/invitations`, { method: "POST", headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  setWorkspaceMemberRole: (workspaceId: string, accountId: string, body: SetWorkspaceMemberRoleInput) => request(`/api/control/workspaces/${encodeURIComponent(workspaceId)}/members/${encodeURIComponent(accountId)}`, { method: "PUT", headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  removeWorkspaceRosterEntry: (workspaceId: string, entryKind: 'member' | 'invitation', entryId: string) => request(`/api/control/workspaces/${encodeURIComponent(workspaceId)}/roster/${encodeURIComponent(entryKind)}/${encodeURIComponent(entryId)}`, { method: "DELETE" }),
})
