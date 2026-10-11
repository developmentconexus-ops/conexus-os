import type { ProjectId } from '@conexus/contract'
import type { CompiledApplication } from './application-artifact-runtime.js'
import type { PrepareAnswer, PrepareRefusal } from '../app-runner/public.js'
import type { CandidateOperationPorts } from './run-operation.js'
import { Failure } from '../platform/failure.js'
import type { RegistryModule } from '../registry/public.js'

export type { ServedLaunch } from '../registry/public.js'
export type BuilderRegistry = Pick<RegistryModule, 'seal' | 'retain' | 'readLaunch'>

// The application runner, as the Builder needs it: converge a Project's Preview schema on a built
// artifact's migrations before that artifact is offered as a Preview, and run one candidate
// operation for `conexus_run_operation`.
export type ApplicationServerPort = Readonly<{
  invoke: CandidateOperationPorts['invoke']
  prepare(input: Readonly<{ projectId: ProjectId; files: readonly Readonly<{ path: string; sha256: string; content: string }>[] }>): Promise<PrepareAnswer>
}>

const SERVER_ROOT = 'conexus-server/'

function refusalDetail(refusal: PrepareRefusal): string | undefined {
  switch (refusal.code) {
    case 'APPLICATION_MIGRATION_FAILED': {
      const facts = [refusal.migration, refusal.sqlstate === null ? null : `SQLSTATE ${refusal.sqlstate}`].filter((fact) => fact !== null)
      return facts.length > 0 ? facts.join(', ') : undefined
    }
    case 'APPLICATION_MIGRATION_HISTORY_DIVERGED':
      return refusal.migration
    case 'MANIFEST_REFUSED':
    case 'SERVER_TREE_REFUSED':
      return undefined
    default: {
      const exhaustive: never = refusal
      return exhaustive
    }
  }
}

/** A Preview the runner refused, with the migration and SQLSTATE the next turn reads. */
export class PrepareRefused extends Failure {
  readonly detail: string | undefined

  constructor(refusal: PrepareRefusal) {
    super(refusal.code, { cause: refusal })
    this.detail = refusalDetail(refusal)
  }
}

/**
 * Applies the artifact's migrations through the runner when the artifact carries a server tree.
 * Answers whether the Preview data was reset; a failed migration refuses the candidate's Preview and
 * names the migration and its SQLSTATE for the Builder. A Project with an application refuses an
 * edited applied migration instead of losing its data.
 */
export const prepareApplicationServer = async (
  server: ApplicationServerPort | undefined,
  compiled: CompiledApplication,
): Promise<Readonly<{ reset: boolean }> | null> => {
  const files = compiled.files.filter((file) => file.path.startsWith(SERVER_ROOT))
  if (files.length === 0) return null
  if (!server) throw new Failure('APPLICATION_RUNNER_UNAVAILABLE')
  const prepared = await server.prepare({
    projectId: compiled.projectId,
    files: files.map((file) => ({ path: file.path, sha256: file.sha256, content: Buffer.from(file.bytes).toString('base64') })),
  })
  if (!prepared.ok) throw new PrepareRefused(prepared.error)
  return { reset: prepared.result.reset }
}
