import type {
  InviteWorkspaceMemberInput,
  WorkspaceInvitation,
  WorkspaceRoster,
} from '../../generated/iam-client'
import { iamClient } from '../../generated/iam-client'
import { IdentityAccessRequestError } from './api'
import { clearAuthorityCache } from '../../app/query-client'

export const workspaceRosterQueryKey = (workspaceId: string) =>
  ['identity-access', 'workspace-roster', workspaceId] as const

export type RosterEntry = WorkspaceRoster['entries'][number]
export type MemberEntry = Extract<RosterEntry, { kind: 'member' }>
export type InvitationEntry = Extract<RosterEntry, { kind: 'invitation' }>

function reject(response: Response): never {
  if (response.status === 401) clearAuthorityCache()
  throw new IdentityAccessRequestError(response.status)
}

async function send(call: () => Promise<Response>, expected: number): Promise<Response> {
  let response: Response
  try {
    response = await call()
  } catch {
    throw new IdentityAccessRequestError(null)
  }
  if (response.status !== expected) reject(response)
  return response
}

export async function getWorkspaceRoster(workspaceId: string): Promise<WorkspaceRoster> {
  const response = await send(() => iamClient.listWorkspaceMembers(workspaceId), 200)
  return response.json() as Promise<WorkspaceRoster>
}

export async function inviteWorkspaceMember(
  workspaceId: string,
  input: InviteWorkspaceMemberInput,
): Promise<WorkspaceInvitation> {
  const response = await send(() => iamClient.inviteWorkspaceMember(workspaceId, input), 200)
  return response.json() as Promise<WorkspaceInvitation>
}

export async function setWorkspaceMemberRole(
  workspaceId: string,
  accountId: string,
  role: string,
): Promise<void> {
  await send(() => iamClient.setWorkspaceMemberRole(workspaceId, accountId, { role }), 204)
}

export async function removeWorkspaceMember(workspaceId: string, accountId: string): Promise<void> {
  await send(() => iamClient.removeWorkspaceRosterEntry(workspaceId, 'member', accountId), 204)
}

export async function cancelWorkspaceInvitation(
  workspaceId: string,
  invitationId: string,
): Promise<void> {
  await send(() => iamClient.removeWorkspaceRosterEntry(workspaceId, 'invitation', invitationId), 204)
}

export function membershipMessage(error: unknown): string {
  if (!(error instanceof IdentityAccessRequestError)) return 'A alteração não foi confirmada.'
  if (error.status === 403) return 'A autoridade atual não permite administrar os membros deste Workspace.'
  if (error.status === 409) return 'O Workspace ficaria sem nenhuma pessoa responsável. Defina outra antes.'
  if (error.status === 422) return 'Informe um email válido e um papel válido.'
  if (error.status === 404) return 'Este item não existe mais no Workspace.'
  return 'A alteração não foi confirmada.'
}
