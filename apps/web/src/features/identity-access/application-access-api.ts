import type {
  ApplicationAccess,
  ApplicationInvitation,
  GrantApplicationAccessInput,
} from '../../generated/iam-client'
import { iamClient } from '../../generated/iam-client'
import { clearAuthorityCache } from '../../app/query-client'

export const applicationAccessQueryKey = (projectId: string) =>
  ['identity-access', 'application-access', projectId] as const

export type AccessEntry = ApplicationAccess['entries'][number]
export type GrantEntry = Extract<AccessEntry, { kind: 'grant' }>
export type InvitationEntry = Extract<AccessEntry, { kind: 'invitation' }>

export class ApplicationAccessRequestError extends Error {
  constructor(readonly status: number | null) {
    super(
      status === null
        ? 'Application access request did not complete'
        : `Application access request failed with ${status}`,
    )
  }
}

function reject(response: Response): never {
  if (response.status === 401) clearAuthorityCache()
  throw new ApplicationAccessRequestError(response.status)
}

async function send(call: () => Promise<Response>, expected: number): Promise<Response> {
  let response: Response
  try {
    response = await call()
  } catch {
    throw new ApplicationAccessRequestError(null)
  }
  if (response.status !== expected) reject(response)
  return response
}

export async function getApplicationAccess(projectId: string): Promise<ApplicationAccess> {
  const response = await send(() => iamClient.listApplicationAccess(projectId), 200)
  return response.json() as Promise<ApplicationAccess>
}

export async function grantApplicationAccess(
  projectId: string,
  input: GrantApplicationAccessInput,
): Promise<ApplicationInvitation> {
  const response = await send(() => iamClient.grantApplicationAccess(projectId, input), 200)
  return response.json() as Promise<ApplicationInvitation>
}

export async function revokeApplicationAccessEntry(
  projectId: string,
  entryKind: 'grant' | 'invitation',
  entryId: string,
): Promise<void> {
  await send(() => iamClient.revokeApplicationAccessEntry(projectId, entryKind, entryId), 204)
}

// The viewer isn't a Workspace Owner. Distinct from every other failure: it isn't retryable, it's a
// permission wall the caller renders once and stops.
export function isApplicationAccessForbidden(error: unknown): boolean {
  return error instanceof ApplicationAccessRequestError && error.status === 403
}

export function applicationAccessMessage(error: unknown): string {
  if (!(error instanceof ApplicationAccessRequestError)) return 'A alteração não foi confirmada.'
  if (error.status === 403) return 'Só Owners do Workspace decidem quem usa este aplicativo.'
  if (error.status === 422) return 'Informe um email válido.'
  if (error.status === 404) return 'Esta pessoa ou convite não está mais na lista.'
  return 'A alteração não foi confirmada.'
}
