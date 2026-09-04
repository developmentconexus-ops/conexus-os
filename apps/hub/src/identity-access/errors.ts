export type IdentityAccessErrorCode =
  | 'ACCOUNT_CONFLICT'
  | 'ACCOUNT_INACTIVE'
  | 'BOOTSTRAP_SEALED'
  | 'IDENTITY_NOT_ELIGIBLE'
  | 'IDEMPOTENCY_CONFLICT'
  | 'OIDC_IDENTITY_MISSING'
  | 'OUTCOME_UNKNOWN'

export class IdentityAccessError extends Error {
  readonly code: IdentityAccessErrorCode

  constructor(code: IdentityAccessErrorCode) {
    super(code)
    this.name = 'IdentityAccessError'
    this.code = code
  }
}

export const identityAccessError = (code: IdentityAccessErrorCode): IdentityAccessError => new IdentityAccessError(code)

export const identityAccessErrorCode = (error: unknown): IdentityAccessErrorCode | null => (
  error instanceof IdentityAccessError ? error.code : null
)

export const translatePostgresError = (error: unknown): never => {
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
    throw identityAccessError('ACCOUNT_CONFLICT')
  }
  throw error
}
