import {
  cancelApplicationInvitation as cancelApplicationInvitationOperation, getApplicationAccess,
  grantApplicationAccess as grantApplicationAccessOperation, revokeApplicationGrant as revokeApplicationGrantOperation,
  type ApplicationAccess, type EmailAddress, type IdempotencyKey, type ProjectId,
} from '@conexus/contract'
import { call, query } from '../../app/http'

const noInput = { query: undefined, headers: undefined, body: undefined } as const
const projectParams = (projectId: ProjectId) => ({ projectId })

export const applicationAccessQuery = (projectId: ProjectId) => query(getApplicationAccess, { params: projectParams(projectId), ...noInput })

// A new invitation answers 201 and a refreshed one 200, with the same entry.
export const grantApplicationAccess = async (projectId: ProjectId, email: EmailAddress, idempotencyKey: IdempotencyKey) =>
  (await call(grantApplicationAccessOperation, { params: projectParams(projectId), query: undefined, headers: { 'idempotency-key': idempotencyKey }, body: { email } })).body

export const removeApplicationAccessEntry = (projectId: ProjectId, entry: ApplicationAccess['entries'][number]) =>
  entry.kind === 'grant'
    ? call(revokeApplicationGrantOperation, { params: { ...projectParams(projectId), grantId: entry.grantId }, ...noInput })
    : call(cancelApplicationInvitationOperation, { params: { ...projectParams(projectId), invitationId: entry.invitationId }, ...noInput })
