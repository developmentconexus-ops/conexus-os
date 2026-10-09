import { Failure, type FailureCode } from '../platform/failure.js'

/** The failure row a Conexus Git read answers with, naming the Git failure as its reason; any other fault is not a Git cause and passes on unnamed. */
export function gitUnavailableAs(code: Extract<FailureCode, 'BUILDER_SOURCE_UNAVAILABLE' | 'PROJECT_REPOSITORY_UNAVAILABLE'>): (error: unknown) => never {
  return (error: unknown): never => {
    if (error instanceof Failure && error.id.startsWith('CONEXUS_GIT_')) throw new Failure(code, { cause: error, details: { reason: error.id } })
    throw error
  }
}
