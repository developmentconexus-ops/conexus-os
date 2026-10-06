import {
  cancelApplicationInvitation as cancelApplicationInvitationOperation, getApplicationAccess,
  grantApplicationAccess as grantApplicationAccessOperation, revokeApplicationGrant as revokeApplicationGrantOperation,
  type ApplicationAccess, type EmailAddress, type IdempotencyKey, type ProjectId,
} from '@conexus/contract'
import { call, isFailure, query } from '../../app/http'

const noInput = { query: undefined, headers: undefined, body: undefined } as const
const projectParams = (projectId: ProjectId) => ({ projectId })

export const applicationAccessQuery = (projectId: ProjectId) => query(getApplicationAccess, { params: projectParams(projectId), ...noInput })

export const grantApplicationAccess = (projectId: ProjectId, email: EmailAddress, idempotencyKey: IdempotencyKey) =>
  call(grantApplicationAccessOperation, { params: projectParams(projectId), query: undefined, headers: { 'idempotency-key': idempotencyKey }, body: { email } })

export const removeApplicationAccessEntry = (projectId: ProjectId, entry: ApplicationAccess['entries'][number]) =>
  entry.kind === 'grant'
    ? call(revokeApplicationGrantOperation, { params: { ...projectParams(projectId), grantId: entry.grantId }, ...noInput })
    : call(cancelApplicationInvitationOperation, { params: { ...projectParams(projectId), invitationId: entry.invitationId }, ...noInput })

// The viewer isn't a Workspace Owner. Distinct from every other failure: it isn't retryable, it's a
// permission wall the caller renders once and stops.
export function isApplicationAccessForbidden(error: unknown): boolean {
  return isFailure(error, 'APPLICATION_ACCESS_MANAGE_REQUIRED')
}
