import {
  cancelWorkspaceInvitation as cancelWorkspaceInvitationOperation, getWorkspaceRoster,
  inviteWorkspaceMember as inviteWorkspaceMemberOperation, removeWorkspaceMember as removeWorkspaceMemberOperation,
  setWorkspaceMemberRole as setWorkspaceMemberRoleOperation,
  type AccountId, type EmailAddress, type IdempotencyKey, type InvitationId, type WorkspaceId, type WorkspaceRole,
} from '@conexus/contract'
import { call, query } from '../../app/http'

const noInput = { query: undefined, headers: undefined, body: undefined } as const
const workspaceParams = (workspaceId: WorkspaceId) => ({ workspaceId })

export const workspaceRosterQuery = (workspaceId: WorkspaceId) => query(getWorkspaceRoster, { params: workspaceParams(workspaceId), ...noInput })

export const inviteWorkspaceMember = (workspaceId: WorkspaceId, email: EmailAddress, role: WorkspaceRole, idempotencyKey: IdempotencyKey) =>
  call(inviteWorkspaceMemberOperation, { params: workspaceParams(workspaceId), query: undefined, headers: { 'idempotency-key': idempotencyKey }, body: { email, role } })

export const setWorkspaceMemberRole = (workspaceId: WorkspaceId, accountId: AccountId, role: WorkspaceRole) =>
  call(setWorkspaceMemberRoleOperation, { params: { ...workspaceParams(workspaceId), accountId }, query: undefined, headers: undefined, body: { role } })

export const removeWorkspaceMember = (workspaceId: WorkspaceId, accountId: AccountId) =>
  call(removeWorkspaceMemberOperation, { params: { ...workspaceParams(workspaceId), accountId }, ...noInput })

export const cancelWorkspaceInvitation = (workspaceId: WorkspaceId, invitationId: InvitationId) =>
  call(cancelWorkspaceInvitationOperation, { params: { ...workspaceParams(workspaceId), invitationId }, ...noInput })
