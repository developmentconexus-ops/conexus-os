import { Failure, type FailureCode } from './failure.js'

// Conexus Git failures are named codes; only the code is kept, and anything else is a failure with no name.
const GIT_FAILURE_NAME = /^(CONEXUS_GIT_[A-Z_]+)$/

const gitFailureName = (error: unknown): string => GIT_FAILURE_NAME.exec(error instanceof Error ? error.message : '')?.[1] ?? 'CONEXUS_GIT_FAILED'

/** The failure row a Conexus Git read answers with, naming the Git failure as its reason; a failure that is already a row passes. */
export const gitUnavailableAs = (code: Extract<FailureCode, 'BUILDER_SOURCE_UNAVAILABLE' | 'PROJECT_REPOSITORY_UNAVAILABLE'>) => (error: unknown): never => {
  throw error instanceof Failure ? error : new Failure(code, { cause: error, details: { reason: gitFailureName(error) } })
}
