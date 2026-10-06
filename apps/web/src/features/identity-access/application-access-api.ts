import {
  ProjectId, cancelApplicationInvitation as cancelApplicationInvitationOperation, getApplicationAccess,
  grantApplicationAccess as grantApplicationAccessOperation, revokeApplicationGrant as revokeApplicationGrantOperation,
  type ApplicationGrantEntry, type ApplicationInvitationEntry, type EmailAddress, type IdempotencyKey,
} from '@conexus/contract'
import { call, isFailure, query } from '../../app/http'
import { routeParam } from '../../app/route-params'

export type GrantEntry = ApplicationGrantEntry
export type InvitationEntry = ApplicationInvitationEntry
export type AccessEntry = GrantEntry | InvitationEntry

const noInput = { query: undefined, headers: undefined, body: undefined } as const
const projectParams = (projectId: string) => ({ projectId: routeParam(ProjectId, projectId) })

export const applicationAccessQuery = (projectId: string) => query(getApplicationAccess, { params: projectParams(projectId), ...noInput })

export const grantApplicationAccess = (projectId: string, email: EmailAddress, idempotencyKey: IdempotencyKey) =>
  call(grantApplicationAccessOperation, { params: projectParams(projectId), query: undefined, headers: { 'idempotency-key': idempotencyKey }, body: { email } })

export const removeApplicationAccessEntry = (projectId: string, entry: AccessEntry) =>
  entry.kind === 'grant'
    ? call(revokeApplicationGrantOperation, { params: { ...projectParams(projectId), grantId: entry.grantId }, ...noInput })
    : call(cancelApplicationInvitationOperation, { params: { ...projectParams(projectId), invitationId: entry.invitationId }, ...noInput })

// The viewer isn't a Workspace Owner. Distinct from every other failure: it isn't retryable, it's a
// permission wall the caller renders once and stops.
export function isApplicationAccessForbidden(error: unknown): boolean {
  return isFailure(error, 'APPLICATION_ACCESS_MANAGE_REQUIRED')
}
