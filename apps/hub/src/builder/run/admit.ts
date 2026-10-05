import { ArtifactDigest, ArtifactRevisionId, SourceRevision as SourceRevisionSchema, type AccountId, type BuilderRunId, type ProjectId, type SourceRevision } from '../../../../../packages/contract/dist/index.js'
import { RECIPE_SHA256, TEMPLATE_REF } from '../application-artifact-runtime.js'
import { prepareApplicationServer, prepareBuilderRunApplicationArtifact } from '../application-build.js'
import type { ApplicationServerPort, BuilderApplicationArtifacts } from '../application-build.js'
import type { CandidateVerdict } from '../candidate-gate.js'
import type { ConexusGit } from '../conexus-git.js'
import type { createRunTiming } from '../run-timing.js'
import { UNRENDERED_FAILURE_CODE } from '../runtime.js'
import type { ApplicationBuildOutcome } from '../runtime.js'
import type { BuilderStore, TakenOverRun } from '../store.js'
import type { BuilderRunPhase } from '../../generated/builder-run-vocabulary.js'
import { Failure, type FailureCode, toFailure } from '../../platform/failure.js'
import { FAILURES } from '../../platform/failures.generated.js'
import type { DiagnosticAppender, RunNote } from './ports.js'

/**
 * The last step a stop can prevent. The candidate is recorded before `main` moves, so a restart
 * finds what may be on main; a stopped run is refused and stops here. Answers the admitted
 * revision and its Preview build.
 */
export const admitCandidate = async ({ git, projectId, executionId, base, verdict, cancelled, gatePhases, setPhase, recordCandidate, timing }: Readonly<{
  git: Pick<ConexusGit, 'fastForwardMain'>
  projectId: ProjectId
  executionId: BuilderRunId
  base: string
  verdict: Extract<CandidateVerdict, { kind: 'GREEN' | 'UNRENDERED' }>
  cancelled(): boolean
  gatePhases: Promise<void>
  setPhase(phase: BuilderRunPhase): Promise<void>
  recordCandidate(sourceRevision: SourceRevision): Promise<void>
  timing: ReturnType<typeof createRunTiming>
}>): Promise<Readonly<{ admitted: SourceRevision; applicationBuild: ApplicationBuildOutcome }>> => {
  const admitted = SourceRevisionSchema.parse(verdict.revision)
  await gatePhases
  await setPhase('SOURCE_ADMISSION')
  if (cancelled()) throw new Failure('BUILDER_RUN_CANCELLED')
  await recordCandidate(admitted)
  if (cancelled()) throw new Failure('BUILDER_RUN_CANCELLED')
  // The compare-and-swap and the moment of admission: `main` moves from exactly the run's base.
  await git.fastForwardMain(projectId, { base, candidate: admitted })
  timing.mark('admission')
  // C-033 as it is: a page that did not render is admitted without a Preview.
  const applicationBuild: ApplicationBuildOutcome = verdict.kind === 'UNRENDERED'
    ? { kind: 'UNRENDERED', code: UNRENDERED_FAILURE_CODE, detail: verdict.detail }
    : { kind: 'BUILT', compiledApplication: {
      projectId, executionId, sourceRevision: admitted,
      templateRef: TEMPLATE_REF, recipeSha256: RECIPE_SHA256, files: verdict.build.files,
    }, ...(verdict.build.thumbnail ? { thumbnail: verdict.build.thumbnail } : {}), ...(verdict.build.bootProblems ? { bootProblems: verdict.build.bootProblems } : {}) }
  return { admitted, applicationBuild }
}

type AdmittedRun = Readonly<{ accountId: AccountId; projectId: ProjectId; conversationId: string; builderRunId: BuilderRunId }>

const THUMBNAIL_LIMIT_BYTES = 512_000

/**
 * The source is on `main`, so a stop arriving now is too late: the run records it and settles
 * admitted, with its Preview, or with the build failure and the last good Preview kept.
 */
export const settleAdmittedSource = async ({ store, applicationArtifacts, applicationServer, appendDiagnostic, finalizing }: Readonly<{
  store: Pick<BuilderStore, 'advanceBuilderRunSource' | 'settleBuilderRunBuild'>
  applicationArtifacts: BuilderApplicationArtifacts
  applicationServer: ApplicationServerPort | undefined
  appendDiagnostic: DiagnosticAppender
  /** The database refuses a phase once a stop is requested; an admitted run still settles. */
  finalizing(): Promise<void>
}>, run: AdmittedRun, admitted: SourceRevision, applicationBuild: ApplicationBuildOutcome): Promise<void> => {
  await store.advanceBuilderRunSource({ builderRunId: run.builderRunId, sourceRevision: admitted })
  const note = (code: string, outcome: RunNote['outcome'], detail?: string): Promise<void> => appendDiagnostic({
    projectId: run.projectId, conversationId: run.conversationId, builderRunId: run.builderRunId, code, outcome, sourceRevision: admitted,
    ...(detail ? { detail } : {}),
  }).catch(() => undefined)
  // Only a build the source broke asks the agent for a fix; a platform fault asking the same
  // teaches it to delete correct code until the fault goes away.
  const buildFailed = (code: FailureCode, detail?: string): Promise<void> =>
    note(code, FAILURES[code].category === 'USER' ? 'BUILD_FAILED' : 'PLATFORM_FAILED', detail)
  // C-033: a page that did not render is admitted as a build failure, and the last good Preview stays.
  if (applicationBuild.kind === 'UNRENDERED') {
    await finalizing()
    await store.settleBuilderRunBuild({ kind: 'FAILED', builderRunId: run.builderRunId, sourceRevision: admitted, failureCode: applicationBuild.code })
    await buildFailed(applicationBuild.code, applicationBuild.detail)
    return
  }
  try {
    const artifact = await prepareBuilderRunApplicationArtifact({ applicationArtifacts }, {
      accountId: run.accountId, projectId: run.projectId, builderRunId: run.builderRunId,
      sourceRevision: admitted,
      compiledApplication: applicationBuild.compiledApplication,
    })
    const server = await prepareApplicationServer(applicationServer, applicationBuild.compiledApplication)
    if (server?.reset) await note('APPLICATION_PREVIEW_DATA_RESET', 'PREVIEW_DATA_RESET')
    // The registry admits a thumbnail only for a run that is still working, so it is retained before the settlement.
    const thumbnail = applicationBuild.thumbnail
    if (thumbnail && applicationArtifacts.retainApplicationThumbnail && thumbnail.bytes.byteLength > 0 && thumbnail.bytes.byteLength <= THUMBNAIL_LIMIT_BYTES) {
      // A thumbnail that is not retained never fails the settlement.
      await applicationArtifacts.retainApplicationThumbnail({
        accountId: run.accountId,
        projectId: run.projectId,
        executionId: applicationBuild.compiledApplication.executionId,
        sourceRevision: admitted,
        artifactRevisionId: artifact.artifactRevisionId,
        mediaType: thumbnail.mediaType,
        bytes: thumbnail.bytes,
      }).catch(() => undefined)
    }
    await finalizing()
    await store.settleBuilderRunBuild({ kind: 'BUILT', builderRunId: run.builderRunId, sourceRevision: admitted,
      artifactRevisionId: ArtifactRevisionId.parse(artifact.artifactRevisionId), artifactDigest: ArtifactDigest.parse(artifact.artifactDigest) })
    if (applicationBuild.bootProblems) await note('APPLICATION_BOOT_PROBLEMS', 'BOOT_PROBLEMS', applicationBuild.bootProblems)
  } catch (error) {
    const code = toFailure(error).id
    if (code === 'BUILDER_RUN_CANCELLED') throw error
    await finalizing()
    await store.settleBuilderRunBuild({ kind: 'FAILED', builderRunId: run.builderRunId, sourceRevision: admitted, failureCode: code }).catch(() => undefined)
    await buildFailed(code, error instanceof Error && typeof error.cause === 'string' ? error.cause : undefined)
    throw error
  }
}

/**
 * Settles a run a sweep took over with a candidate, whatever phase it stopped in; the candidate may
 * be on `main`. When the run already recorded its advance, or `main`'s history holds the candidate,
 * the run is admitted with the last good Preview kept; both writes converge when repeated. A
 * candidate `main` lacks fails the run.
 */
export const settleTakenOverCandidate = async ({ store, git }: Readonly<{
  store: Pick<BuilderStore, 'advanceBuilderRunSource' | 'settleBuilderRunBuild' | 'failBuilderRun'>
  git: Pick<ConexusGit, 'mainContains'>
}>, run: TakenOverRun & Readonly<{ candidateRevision: SourceRevision }>): Promise<void> => {
  const candidate = run.candidateRevision
  if (run.resultSourceRevision !== candidate && !await git.mainContains(run.projectId, candidate)) {
    await store.failBuilderRun({ builderRunId: run.builderRunId, failureCode: 'BUILDER_SOURCE_ADMISSION_FAILED' })
    return
  }
  await store.advanceBuilderRunSource({ builderRunId: run.builderRunId, sourceRevision: candidate })
  await store.settleBuilderRunBuild({ kind: 'FAILED', builderRunId: run.builderRunId, sourceRevision: candidate, failureCode: 'BUILDER_PREVIEW_NOT_BUILT' })
}
