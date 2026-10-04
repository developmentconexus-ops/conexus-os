import type {
  InviteWorkspaceMemberInput,
  WorkspaceInvitation,
  WorkspaceRoster,
} from '../../generated/iam-client'
import { iamClient } from '../../generated/iam-client'
import { hubCall } from '../../app/http'

export const workspaceRosterQueryKey = (workspaceId: string) =>
  ['identity-access', 'workspace-roster', workspaceId] as const

type RosterEntry = WorkspaceRoster['entries'][number]
export type MemberEntry = Extract<RosterEntry, { kind: 'member' }>
export type InvitationEntry = Extract<RosterEntry, { kind: 'invitation' }>

export async function getWorkspaceRoster(workspaceId: string): Promise<WorkspaceRoster> {
  const response = await hubCall(iamClient.listWorkspaceMembers(workspaceId), 200)
  // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
  return response.json() as Promise<WorkspaceRoster>
}

export async function inviteWorkspaceMember(
  workspaceId: string,
  input: InviteWorkspaceMemberInput,
): Promise<WorkspaceInvitation> {
  const response = await hubCall(iamClient.inviteWorkspaceMember(workspaceId, input), 200)
  // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
  return response.json() as Promise<WorkspaceInvitation>
}

export async function setWorkspaceMemberRole(
  workspaceId: string,
  accountId: string,
  role: string,
): Promise<void> {
  await hubCall(iamClient.setWorkspaceMemberRole(workspaceId, accountId, { role }), 204)
}

export async function removeWorkspaceMember(workspaceId: string, accountId: string): Promise<void> {
  await hubCall(iamClient.removeWorkspaceRosterEntry(workspaceId, 'member', accountId), 204)
}

export async function cancelWorkspaceInvitation(
  workspaceId: string,
  invitationId: string,
): Promise<void> {
  await hubCall(iamClient.removeWorkspaceRosterEntry(workspaceId, 'invitation', invitationId), 204)
}
