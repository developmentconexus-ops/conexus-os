import { Failure, type FailureCode } from './failure.js'

// Conexus Git failures are named codes; only the code is kept, and anything else is a failure with no name.
const GIT_FAILURE_NAME = /^(CONEXUS_GIT_[A-Z_]+)$/

const gitFailureName = (error: unknown): string | null => GIT_FAILURE_NAME.exec(error instanceof Failure ? error.id : error instanceof Error ? error.message : '')?.[1] ?? null

/** The failure row a Conexus Git read answers with, naming the Git failure as its reason; a failure that is another row passes. */
export const gitUnavailableAs = (code: Extract<FailureCode, 'BUILDER_SOURCE_UNAVAILABLE' | 'PROJECT_REPOSITORY_UNAVAILABLE'>) => (error: unknown): never => {
  const name = gitFailureName(error)
  throw error instanceof Failure && name === null ? error : new Failure(code, { cause: error, details: { reason: name ?? 'CONEXUS_GIT_FAILED' } })
}
