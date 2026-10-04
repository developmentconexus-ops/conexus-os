import type {
  ApplicationAccess,
  GrantApplicationAccessInput,
  GrantedApplicationAccess,
} from '../../generated/iam-client'
import { iamClient } from '../../generated/iam-client'
import { hubCall, isFailure } from '../../app/http'

export const applicationAccessQueryKey = (projectId: string) =>
  ['identity-access', 'application-access', projectId] as const

type AccessEntry = ApplicationAccess['entries'][number]
export type GrantEntry = Extract<AccessEntry, { kind: 'grant' }>
export type InvitationEntry = Extract<AccessEntry, { kind: 'invitation' }>

export async function getApplicationAccess(projectId: string): Promise<ApplicationAccess> {
  const response = await hubCall(iamClient.listApplicationAccess(projectId), 200)
  // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
  return response.json() as Promise<ApplicationAccess>
}

export async function grantApplicationAccess(
  projectId: string,
  input: GrantApplicationAccessInput,
): Promise<GrantedApplicationAccess> {
  const response = await hubCall(iamClient.grantApplicationAccess(projectId, input), 200)
  // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
  return response.json() as Promise<GrantedApplicationAccess>
}

export async function revokeApplicationAccessEntry(
  projectId: string,
  entryKind: 'grant' | 'invitation',
  entryId: string,
): Promise<void> {
  await hubCall(iamClient.revokeApplicationAccessEntry(projectId, entryKind, entryId), 204)
}

// The viewer isn't a Workspace Owner. Distinct from every other failure: it isn't retryable, it's a
// permission wall the caller renders once and stops.
export function isApplicationAccessForbidden(error: unknown): boolean {
  return isFailure(error, 'APPLICATION_ACCESS_MANAGE_REQUIRED')
}
