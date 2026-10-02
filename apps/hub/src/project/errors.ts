export type ProjectErrorCode =
  | 'AUTHORIZATION_DENIED'
  | 'IDEMPOTENCY_CONFLICT'
  | 'OUTCOME_UNKNOWN'
  | 'SOURCE_INPUT_REFUSED'
  | 'REPOSITORY_REFUSED'
  | 'PROJECT_NOT_FOUND'
  | 'PROJECT_NAME_MISMATCH'
  | 'PROJECT_BUSY'
  | 'DELETION_INCOMPLETE'

export class ProjectError extends Error {
  readonly code: ProjectErrorCode
  // The named cause a person can be shown, such as CONEXUS_GIT_FAILED.
  readonly reason: string | null

  constructor(code: ProjectErrorCode, reason: string | null = null) {
    super(reason ? `${code}:${reason}` : code)
    this.name = 'ProjectError'
    this.code = code
    this.reason = reason
  }
}

export const projectError = (code: ProjectErrorCode): ProjectError => new ProjectError(code)
export const projectErrorCode = (error: unknown): ProjectErrorCode | null => error instanceof ProjectError ? error.code : null

// Conexus Git failures are named codes; only the code leaves, and anything else is reported as a
// failure with no name.
const NAMED = /^(CONEXUS_GIT_[A-Z_]+)$/
export const repositoryRefused = (error: unknown): ProjectError =>
  new ProjectError('REPOSITORY_REFUSED', NAMED.exec(error instanceof Error ? error.message : '')?.[1] ?? 'CONEXUS_GIT_FAILED')
