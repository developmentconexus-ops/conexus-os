import { AccountId as AccountIdSchema } from '../../../../packages/contract/dist/index.js'
import type { AccountId as ContractAccountId } from '../../../../packages/contract/dist/index.js'
import { Failure } from '../platform/failure.js'
import { digest, parseOpaqueToken } from '../platform/opaque-token.js'
import type { OpaqueToken } from '../platform/opaque-token.js'

export type AccountId = ContractAccountId
export type WorkspaceId = string & { readonly __brand: 'WorkspaceId' }
export type InvitationId = string & { readonly __brand: 'InvitationId' }
export type EmailAddress = string & { readonly __brand: 'EmailAddress' }

export type AccountSummary = Readonly<{ accountId: AccountId; displayName: string; email?: string }>
// `issuer` and `subject` are the provider identity this session was established from.
// No route reads them to decide authority.
export type CurrentSession = Readonly<{ account: AccountSummary; issuer: string; subject: string }>
export type HubSessionDigest = Buffer & { readonly __brand: 'HubSessionDigest' }
export type BootstrapToken = string & { readonly __brand: 'BootstrapToken' }
export type HubSession = CurrentSession & Readonly<{ digest: HubSessionDigest }>

const isHubSessionDigest = (value: Buffer): value is HubSessionDigest => value.length === 32
const isBootstrapToken = (value: unknown): value is BootstrapToken => parseOpaqueToken(value) !== null

export const hubSessionDigest = (token: OpaqueToken): HubSessionDigest => {
  const hashed = digest(token)
  if (!isHubSessionDigest(hashed)) throw new Failure('INTERNAL_UNEXPECTED', { details: { invariant: 'HUB_SESSION_DIGEST_SHAPE' } })
  return hashed
}

export const bootstrapToken = (value: unknown): BootstrapToken | null => isBootstrapToken(value) ? value : null

export const accountId = (value: string): AccountId => AccountIdSchema.parse(value)
// biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
export const workspaceId = (value: string): WorkspaceId => value as WorkspaceId
// biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
export const invitationId = (value: string): InvitationId => value as InvitationId

const EMAIL = /^[^@\s]+@[^@\s]+$/

export const parseEmailAddress = (value: unknown): EmailAddress | null => {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
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
