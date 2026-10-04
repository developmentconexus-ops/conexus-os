import { RECIPE_SHA256, TEMPLATE_REF } from '../application-artifact-runtime.js'
import type { CandidateVerdict } from '../candidate-gate.js'
import type { ConexusGit } from '../conexus-git.js'
import type { createRunTiming } from '../run-timing.js'
import { UNRENDERED_FAILURE_CODE } from '../runtime.js'
import type { ApplicationBuildOutcome } from '../runtime.js'
import type { BuilderRunPhase } from '../../generated/builder-run-vocabulary.js'
import { Failure } from '../../platform/failure.js'

/**
 * The last step a stop can prevent. The candidate is recorded before `main` moves, so a restart
 * finds what may be on main; a stopped run is refused and stops here. Answers the admitted
 * revision and its Preview build.
 */
export const admitCandidate = async ({ git, projectId, executionId, base, verdict, cancelled, gatePhases, setPhase, recordCandidate, timing }: Readonly<{
  git: Pick<ConexusGit, 'fastForwardMain'>
  projectId: string
  executionId: string
  base: string
  verdict: Extract<CandidateVerdict, { kind: 'GREEN' | 'UNRENDERED' }>
  cancelled(): boolean
  gatePhases: Promise<void>
  setPhase(phase: BuilderRunPhase): Promise<void>
  recordCandidate(sourceRevision: string): Promise<void>
  timing: ReturnType<typeof createRunTiming>
}>): Promise<Readonly<{ admitted: string; applicationBuild: ApplicationBuildOutcome }>> => {
  const admitted = verdict.revision
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
