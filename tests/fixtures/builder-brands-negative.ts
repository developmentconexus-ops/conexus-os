import type { ExecutionId, ProjectId, SourceRevision } from '@conexus/contract'
import { candidateSnapshot, mirrorSnapshot } from '../../apps/hub/src/builder/conexus-git.js'

declare const execution: ExecutionId
declare const project: ProjectId
declare const revision: SourceRevision

candidateSnapshot(execution, revision)
// @ts-expect-error A Project id cannot stand in for the run's execution id.
candidateSnapshot(project, revision)
// @ts-expect-error A plain string is not a run identity.
candidateSnapshot('not-checked', revision)
// @ts-expect-error A plain string is not a source revision.
candidateSnapshot(execution, 'a'.repeat(40))
// @ts-expect-error A Project id cannot stand in for the conversation id.
mirrorSnapshot(project, revision)
