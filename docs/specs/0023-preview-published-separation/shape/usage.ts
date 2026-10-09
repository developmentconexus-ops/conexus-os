import { ProjectId } from '@conexus/contract'
import { allocate, PreviewSubject } from './types.js'
import type { AllocationOperations, RunnerOperations } from './operations.js'

export function prepareBuilder(runner: RunnerOperations, input: Parameters<RunnerOperations['preparePreview']>[0]) {
  return runner.preparePreview(input)
}
export function resetOnlyPreview(operations: AllocationOperations) {
  const allocation = allocate({ projectId: ProjectId.parse('30000000-0000-8000-8000-000000000005'), kind: 'PREVIEW' })
  return operations.resetPreview(allocation)
}
export function projectWirePreview(subject: PreviewSubject) {
  return subject.kind === 'EMPTY'
    ? { lastPreviewSourceRevision: null, lastPreviewArtifactRevisionId: null, lastPreviewArtifactDigest: null }
    : { lastPreviewSourceRevision: subject.sourceRevision, lastPreviewArtifactRevisionId: subject.artifactRevisionId, lastPreviewArtifactDigest: subject.digest }
}
