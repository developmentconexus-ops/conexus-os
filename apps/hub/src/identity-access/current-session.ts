import type { FastifyRequest } from 'fastify'

export type AccountId = string & { readonly __brand: 'AccountId' }
export type WorkspaceId = string & { readonly __brand: 'WorkspaceId' }
export type InvitationId = string & { readonly __brand: 'InvitationId' }
export type EmailAddress = string & { readonly __brand: 'EmailAddress' }

export type AccountSummary = Readonly<{ accountId: AccountId; displayName: string; email?: string }>
// `issuer` and `subject` are the provider identity this session was established from.
// Preview entry binds its cookie to them. No route reads them to decide authority.
export type CurrentSession = Readonly<{ account: AccountSummary; issuer: string; subject: string }>
export type ResolveCurrentSession = (request: FastifyRequest, requireCsrf?: boolean) => Promise<CurrentSession | null>

export const accountId = (value: string): AccountId => value as AccountId
export const workspaceId = (value: string): WorkspaceId => value as WorkspaceId
export const invitationId = (value: string): InvitationId => value as InvitationId

const EMAIL = /^[^@\s]+@[^@\s]+$/

export const parseEmailAddress = (value: unknown): EmailAddress | null => {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  return EMAIL.test(normalized) ? (normalized as EmailAddress) : null
}

const refusal = (error: unknown): string | null => {
  if (typeof error !== 'object' || error === null || !('code' in error) || error.code !== '42501') return null
  return 'message' in error && typeof error.message === 'string' ? error.message : ''
}

// Every refused effect in `iam` raises SQLSTATE 42501. The message separates the two
// meanings: the caller may not do this at all, or the Workspace would be left ownerless.
export const isNotAdmitted = (error: unknown): boolean => {
  const message = refusal(error)
  return message !== null && message !== 'LAST_OWNER'
}

export const isLastOwner = (error: unknown): boolean => refusal(error) === 'LAST_OWNER'
