// GENERATED from contracts/api/product/openapi.yaml by scripts/generate-iam-contracts.mjs. Do not edit.
export const IAM_PRODUCT_OAS_DIGEST = "ee4a506205e3cd08549d3cdbebf5a25c1162c8a5cf10cd76abb6d99d044aa1e4"
export const IAM_ROUTE_PROJECTION_DIGEST = "8f01e91fcf7730f1b8f56abc9a4d9274f87d74e5e8480a590ee35d90ad39c74d"
export type AccountSummary = { "accountId": string; "displayName": string; "email"?: string }
export type AccessContext = { "account": { "accountId": string; "displayName": string; "email"?: string }; "workspaces": { "workspaceId": string; "name": string }[]; "projects": { "projectId": string; "workspaceId": string; "name": string; "archived": boolean }[] }
export type ProvisionAccountInput = { "displayName": string; "email"?: string }
export type WorkspaceRoster = { "viewerRole": "owner" | "member"; "entries": ({ "kind": "member"; "accountId": string; "displayName": string; "email"?: string; "role": "owner" | "member"; "since": string } | { "kind": "invitation"; "invitationId": string; "email": string; "role": "owner" | "member"; "invitedAt": string; "expiresAt": string; "state": "PENDING" | "EXPIRED" })[] }
export type InviteWorkspaceMemberInput = { "email": string; "role": "owner" | "member" }
export type WorkspaceInvitation = { "kind": "invitation"; "invitationId": string; "email": string; "role": "owner" | "member"; "invitedAt": string; "expiresAt": string; "state": "PENDING" | "EXPIRED" }
export type SetWorkspaceMemberRoleInput = { "role": "owner" | "member" }
export type ApplicationAccess = { "address"?: string; "entries": ({ "kind": "grant"; "grantId": string; "accountId": string; "displayName": string; "email"?: string; "grantedAt": string } | { "kind": "invitation"; "invitationId": string; "email": string; "invitedAt": string; "expiresAt": string; "state": "PENDING" | "EXPIRED" })[] }
export type GrantApplicationAccessInput = { "email": string }
export type GrantedApplicationAccess = { "kind": "grant"; "grantId": string; "accountId": string; "displayName": string; "email"?: string; "grantedAt": string } | { "kind": "invitation"; "invitationId": string; "email": string; "invitedAt": string; "expiresAt": string; "state": "PENDING" | "EXPIRED" }
const csrf = () => document.cookie.split('; ').find((item) => item.startsWith('__Host-conexus_csrf='))?.split('=').slice(1).join('=')
const request = async (url: string, init: RequestInit = {}) => fetch(url, { ...init, credentials: 'same-origin', headers: { ...(init.headers ?? {}), ...(init.method && init.method !== 'GET' ? { 'x-conexus-csrf': decodeURIComponent(csrf() ?? '') } : {}) } })
export const iamClient = Object.freeze({
  getAccessContext: () => request("/api/control/access-context"),
  provisionAccount: (body: ProvisionAccountInput, idempotencyKey: string) => request("/api/control/accounts", { method: "POST", headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey }, body: JSON.stringify(body) }),
  endSession: () => request("/api/session", { method: "DELETE" }),
  listWorkspaceMembers: (workspaceId: string) => request(`/api/control/workspaces/${encodeURIComponent(workspaceId)}/members`),
  inviteWorkspaceMember: (workspaceId: string, body: InviteWorkspaceMemberInput) => request(`/api/control/workspaces/${encodeURIComponent(workspaceId)}/invitations`, { method: "POST", headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  setWorkspaceMemberRole: (workspaceId: string, accountId: string, body: SetWorkspaceMemberRoleInput) => request(`/api/control/workspaces/${encodeURIComponent(workspaceId)}/members/${encodeURIComponent(accountId)}`, { method: "PUT", headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  listApplicationAccess: (projectId: string) => request(`/api/control/projects/${encodeURIComponent(projectId)}/application-access`),
  grantApplicationAccess: (projectId: string, body: GrantApplicationAccessInput) => request(`/api/control/projects/${encodeURIComponent(projectId)}/application-access`, { method: "POST", headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  revokeApplicationAccessEntry: (projectId: string, entryKind: 'grant' | 'invitation', entryId: string) => request(`/api/control/projects/${encodeURIComponent(projectId)}/application-access/${encodeURIComponent(entryKind)}/${encodeURIComponent(entryId)}`, { method: "DELETE" }),
  removeWorkspaceRosterEntry: (workspaceId: string, entryKind: 'member' | 'invitation', entryId: string) => request(`/api/control/workspaces/${encodeURIComponent(workspaceId)}/roster/${encodeURIComponent(entryKind)}/${encodeURIComponent(entryId)}`, { method: "DELETE" }),
})
