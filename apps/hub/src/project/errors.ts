export type ProjectErrorCode =
  | 'AUTHORIZATION_DENIED'
  | 'IDEMPOTENCY_CONFLICT'
  | 'OUTCOME_UNKNOWN'
  | 'RECOVERY_REFUSED'
  | 'SOURCE_INPUT_REFUSED'
  | 'SOURCE_CONFLICT'
  | 'SOURCE_DEPENDENCY_REFUSED'

export class ProjectError extends Error {
  readonly code: ProjectErrorCode

  constructor(code: ProjectErrorCode) {
    super(code)
    this.name = 'ProjectError'
    this.code = code
  }
}

export const projectError = (code: ProjectErrorCode): ProjectError => new ProjectError(code)
export const projectErrorCode = (error: unknown): ProjectErrorCode | null => error instanceof ProjectError ? error.code : null
