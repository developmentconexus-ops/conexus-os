export type ProjectErrorCode =
  | 'AUTHORIZATION_DENIED'
  | 'IDEMPOTENCY_CONFLICT'
  | 'OUTCOME_UNKNOWN'
  | 'SOURCE_INPUT_REFUSED'
  | 'REPOSITORY_REFUSED'

export class ProjectError extends Error {
  readonly code: ProjectErrorCode
  // The named cause a person can be shown, such as FACTORY_INSTALLATION_ORGANIZATION_REQUIRED.
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

// Factory and GitHub failures are named codes, some followed by a sentence for the operator; only
// the code leaves, and anything else is reported as a failure with no name.
const NAMED = /^((?:FACTORY|BUILDER)_[A-Z_]+(?::\d{3})?)(?::\s|$)/
export const repositoryRefused = (error: unknown): ProjectError =>
  new ProjectError('REPOSITORY_REFUSED', NAMED.exec(error instanceof Error ? error.message : '')?.[1] ?? 'FACTORY_REPOSITORY_FAILED')
