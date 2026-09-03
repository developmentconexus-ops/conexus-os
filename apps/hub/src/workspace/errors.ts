export type WorkspaceErrorCode = 'IDEMPOTENCY_CONFLICT' | 'OUTCOME_UNKNOWN'

export class WorkspaceError extends Error {
  readonly code: WorkspaceErrorCode

  constructor(code: WorkspaceErrorCode) {
    super(code)
    this.name = 'WorkspaceError'
    this.code = code
  }
}

export const workspaceError = (code: WorkspaceErrorCode): WorkspaceError => new WorkspaceError(code)

export const workspaceErrorCode = (error: unknown): WorkspaceErrorCode | null => (
  error instanceof WorkspaceError ? error.code : null
)
