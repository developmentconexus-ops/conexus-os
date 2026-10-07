import type { ApplicationFilePath, ArtifactDigest, ArtifactRevisionId, BuilderRunId, MediaType, ProjectId, SourceRevision } from '@conexus/contract'
import type { Admitted, ProjectScope, RunOwner, SystemScope } from '../identity-access/admission.js'
import type { CompiledApplication, CompiledApplicationThumbnail } from './application-artifact-runtime.js'
import type { PrepareResult } from '../app-runner/server-manifest.js'
import type { CandidateOperationPorts } from './run-operation.js'
import { Failure } from '../platform/failure.js'
import type { SealedApplication } from '../platform/sealed-application.js'

export type ServedLaunch = Readonly<{
  sourceRevision: SourceRevision
  artifactRevisionId: ArtifactRevisionId
  digest: ArtifactDigest
  entryPath: 'index.html'
  files: ReadonlyArray<Readonly<{ path: ApplicationFilePath; mediaType: MediaType }>>
}>

/** The registry owner's part in a Builder run, as the Builder declares it. The sealed build is the platform's nominal type, so the Builder can pass back only what `seal` made. */
export type BuilderRegistry = Readonly<{
  seal: (outcome: Readonly<{ compiledApplication: CompiledApplication; thumbnail: CompiledApplicationThumbnail | null }>, run: Readonly<{ projectId: ProjectId; builderRunId: BuilderRunId; sourceRevision: SourceRevision }>) => SealedApplication
  retain: (proof: Admitted<SystemScope<'builder-executor'>>, input: Readonly<{ builderRunId: BuilderRunId; projectId: ProjectId; owner: RunOwner; sealed: SealedApplication }>) => Promise<Readonly<{ artifactRevisionId: ArtifactRevisionId; digest: ArtifactDigest }>>
  readLaunch: (proof: Admitted<ProjectScope<'project.build'>>) => Promise<ServedLaunch | null>
}>

// The application runner, as the Builder needs it: converge a Project's Preview schema on a built
// artifact's migrations before that artifact is offered as a Preview, and run one candidate
// operation for `conexus_run_operation`.
export type ApplicationServerPort = Readonly<{
  invoke: CandidateOperationPorts['invoke']
  prepare(input: Readonly<{ projectId: ProjectId; files: readonly Readonly<{ path: string; sha256: string; content: string }>[] }>): Promise<PrepareResult>
}>

const SERVER_ROOT = 'conexus-server/'

/**
 * Applies the artifact's migrations through the runner when the artifact carries a server tree.
 * Answers whether the Preview data was reset; a failed migration refuses the candidate's Preview and
 * carries the database's own diagnostic for the Builder. A Project with an application refuses an
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
  if (prepared.state === 'MIGRATION_FAILED') throw new Failure('APPLICATION_MIGRATION_FAILED', { cause: prepared.detail })
  if (prepared.state === 'MIGRATION_HISTORY_DIVERGED') throw new Failure('APPLICATION_MIGRATION_HISTORY_DIVERGED', { cause: prepared.detail })
  return { reset: prepared.reset }
}
