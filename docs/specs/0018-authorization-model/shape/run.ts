import type { BuilderRunId, ProjectId } from '@conexus/contract'
import type { FailureCode } from '../../../../apps/hub/src/platform/failure.js'
import type { Admitted, RunOwner, SystemScope } from './types.js'

// Private run-lifecycle implementation types, not another admission proof or engine.
export type TerminalEnding =
  | Readonly<{ state: 'FAILED'; failureCode: FailureCode }>
  | Readonly<{ state: 'INTERRUPTED'; failureCode: import('../../../../apps/hub/src/builder/run-lifecycle.js').InterruptionCode }>

declare function closeHeldRun(
  proof: Admitted<SystemScope<'builder-executor'>>,
  input: Readonly<{ builderRunId: BuilderRunId; projectId: ProjectId; owner: RunOwner; ending: TerminalEnding }>,
): Promise<void>

// Same public operations; ownerId stays in the existing run-lifecycle closure.
// Their private System path checks the held open run and exact owner, without human admission.
export type RunLifecycle = Pick<import('../../../../apps/hub/src/builder/run-lifecycle.js').RunSteps, 'failBuilderRun' | 'interruptBuilderRun'>

// Existing registry retain operation, used only to reconcile an already-admitted candidate.
// It validates exact held owner/open run and persisted source identity under the same locks.
export type RetainCandidate = (
  proof: Admitted<SystemScope<'builder-executor'>>,
  input: Readonly<{ builderRunId: BuilderRunId; projectId: ProjectId; owner: RunOwner; sealed: import('../../../../apps/hub/src/platform/sealed-application.js').SealedApplication }>,
) => Promise<Readonly<{ artifactRevisionId: import('@conexus/contract').ArtifactRevisionId; digest: import('@conexus/contract').ArtifactDigest }>>

// The actual Builder port owner is application-build.ts:17-21. Keep its seal member,
// replace retain with the target operation, and bind readLaunch to this nominal owner.
export type BuilderRegistry = Omit<import('../../../../apps/hub/src/builder/application-build.js').BuilderRegistry, 'retain' | 'readLaunch'> & Readonly<{
  retain: RetainCandidate
  readLaunch(proof: Admitted<import('./types.js').ProjectScope<'project.build'>>): ReturnType<import('../../../../apps/hub/src/builder/application-build.js').BuilderRegistry['readLaunch']>
}>
