import {
  WorkspaceId, cancelWorkspaceInvitation as cancelWorkspaceInvitationOperation, getWorkspaceRoster,
  inviteWorkspaceMember as inviteWorkspaceMemberOperation, removeWorkspaceMember as removeWorkspaceMemberOperation,
  setWorkspaceMemberRole as setWorkspaceMemberRoleOperation,
  type AccountId, type EmailAddress, type IdempotencyKey, type InvitationId, type WorkspaceInvitationEntry, type WorkspaceMemberEntry, type WorkspaceRole,
} from '@conexus/contract'
import { call, query } from '../../app/http'
import { routeParam } from '../../app/route-params'

export type MemberEntry = WorkspaceMemberEntry
export type InvitationEntry = WorkspaceInvitationEntry

const noInput = { query: undefined, headers: undefined, body: undefined } as const
const workspaceParams = (workspaceId: string) => ({ workspaceId: routeParam(WorkspaceId, workspaceId) })

export const workspaceRosterQuery = (workspaceId: string) => query(getWorkspaceRoster, { params: workspaceParams(workspaceId), ...noInput })

export const inviteWorkspaceMember = (workspaceId: string, email: EmailAddress, role: WorkspaceRole, idempotencyKey: IdempotencyKey) =>
  call(inviteWorkspaceMemberOperation, { params: workspaceParams(workspaceId), query: undefined, headers: { 'idempotency-key': idempotencyKey }, body: { email, role } })

export const setWorkspaceMemberRole = (workspaceId: string, accountId: AccountId, role: WorkspaceRole) =>
  call(setWorkspaceMemberRoleOperation, { params: { ...workspaceParams(workspaceId), accountId }, query: undefined, headers: undefined, body: { role } })

export const removeWorkspaceMember = (workspaceId: string, accountId: AccountId) =>
  call(removeWorkspaceMemberOperation, { params: { ...workspaceParams(workspaceId), accountId }, ...noInput })

export const cancelWorkspaceInvitation = (workspaceId: string, invitationId: InvitationId) =>
  call(cancelWorkspaceInvitationOperation, { params: { ...workspaceParams(workspaceId), invitationId }, ...noInput })
