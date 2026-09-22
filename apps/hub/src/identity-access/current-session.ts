export type AccountId = string & { readonly __brand: 'AccountId' }
export type WorkspaceId = string & { readonly __brand: 'WorkspaceId' }
export type InvitationId = string & { readonly __brand: 'InvitationId' }
export type EmailAddress = string & { readonly __brand: 'EmailAddress' }

export type AccountSummary = Readonly<{ accountId: AccountId; displayName: string; email?: string }>
// `issuer` and `subject` are the provider identity this session was established from.
// Preview entry binds its cookie to them. No route reads them to decide authority.
export type CurrentSession = Readonly<{ account: AccountSummary; issuer: string; subject: string }>
// What a session is read from: the Hub's own requests, and a Factory route's request.
export type SessionRequest = Readonly<{ cookies: Readonly<Record<string, string | undefined>>; headers: Readonly<Record<string, string | string[] | undefined>> }>
export type ResolveCurrentSession = (request: SessionRequest, requireCsrf?: boolean) => Promise<CurrentSession | null>

export const accountId = (value: string): AccountId => value as AccountId
export const workspaceId = (value: string): WorkspaceId => value as WorkspaceId
export const invitationId = (value: string): InvitationId => value as InvitationId

const EMAIL = /^[^@\s]+@[^@\s]+$/

export const parseEmailAddress = (value: unknown): EmailAddress | null => {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  return EMAIL.test(normalized) ? (normalized as EmailAddress) : null
}

const refusalWithCode = (error: unknown, code: string): string | null => {
  if (typeof error !== 'object' || error === null || !('code' in error) || error.code !== code) return null
  return 'message' in error && typeof error.message === 'string' ? error.message : ''
}

const refusal = (error: unknown): string | null => refusalWithCode(error, '42501')

// Every refused effect in `iam` raises SQLSTATE 42501. The message separates the meanings: the
// caller may not do this at all, or the effect would leave a Workspace without an owner or the
// installation without an administrator.
const LAST_HOLDER_REFUSALS: ReadonlySet<string> = new Set(['LAST_OWNER', 'LAST_INSTALLATION_ADMINISTRATOR'])

export const isNotAdmitted = (error: unknown): boolean => {
  const message = refusal(error)
  return message !== null && !LAST_HOLDER_REFUSALS.has(message)
}

export const isLastOwner = (error: unknown): boolean => refusal(error) === 'LAST_OWNER'

export const isLastInstallationAdministrator = (error: unknown): boolean =>
  refusal(error) === 'LAST_INSTALLATION_ADMINISTRATOR'

export const isAccountNotFound = (error: unknown): boolean => refusalWithCode(error, 'P0002') === 'ACCOUNT_NOT_FOUND'

export const isAccountEmailAmbiguous = (error: unknown): boolean => refusalWithCode(error, 'P0003') === 'ACCOUNT_EMAIL_AMBIGUOUS'
