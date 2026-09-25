// GENERATED from contracts/api/product/openapi.yaml by scripts/generate-r1-s1-contracts.mjs. Do not edit.
export const S1_PRODUCT_OAS_DIGEST = "56d1cf98889f289c0dc07c81142163ec449f1eb5c411df2cc4c26903076e0b6c"
export const S1_ROUTE_PROJECTION_DIGEST = "514234bc2cad559510d788cd5427fa9560143abc9424efbc1e8eca435db37fc1"
export type AccountSummary = { "accountId": string; "displayName": string; "email"?: string }
export type AccessContext = { "account": { "accountId": string; "displayName": string; "email"?: string }; "workspaces": { "workspaceId": string; "name": string }[]; "projects": { "projectId": string; "workspaceId": string; "name": string; "archived": boolean }[] }
export type ProvisionAccountInput = { "displayName": string; "email"?: string }
export type WorkspaceRoster = { "viewerRole": string; "entries": ({ "kind": "member"; "accountId": string; "displayName": string; "email"?: string; "role": string; "since": string } | { "kind": "invitation"; "invitationId": string; "email": string; "role": string; "invitedAt": string; "expiresAt": string })[] }
export type InviteWorkspaceMemberInput = { "email": string; "role": string }
export type WorkspaceInvitation = { "kind": "invitation"; "invitationId": string; "email": string; "role": string; "invitedAt": string; "expiresAt": string }
export type SetWorkspaceMemberRoleInput = { "role": string }
export type ApplicationAccess = { "address"?: string; "entries": ({ "kind": "grant"; "grantId": string; "accountId": string; "displayName": string; "email"?: string; "grantedAt": string } | { "kind": "invitation"; "invitationId": string; "email": string; "invitedAt": string; "expiresAt": string })[] }
export type GrantApplicationAccessInput = { "email": string }
export type GrantedApplicationAccess = { "kind": "grant"; "grantId": string; "accountId": string; "displayName": string; "email"?: string; "grantedAt": string } | { "kind": "invitation"; "invitationId": string; "email": string; "invitedAt": string; "expiresAt": string }
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
