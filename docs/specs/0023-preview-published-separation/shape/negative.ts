import type { AllocationOperations, RegistryPreviewOperations, RunnerOperations } from './operations.js'
import type { PublishedAllocation, PreviewSubject } from './types.js'

export function refused(allocations: AllocationOperations, published: PublishedAllocation, registry: RegistryPreviewOperations, runner: RunnerOperations, invoke: Omit<Parameters<RunnerOperations['invoke']>[0], 'kind'>) {
  // @ts-expect-error Published carries no reset authority.
  allocations.resetPreview(published)
  // @ts-expect-error A request object cannot construct a scoped read admission.
  registry.readPreviewSubject({ scope: { projectId: published.projectId } })
  // @ts-expect-error No invocation may infer an environment from a missing field.
  runner.invoke(invoke)
  // @ts-expect-error Empty Preview carries no partial artifact coordinates.
  const empty: PreviewSubject = { kind: 'EMPTY', digest: 'x' }
  // @ts-expect-error An unparsed string is not a Project identity.
  const invalid: Parameters<RunnerOperations['preparePreview']>[0] & { projectId: typeof published.projectId } = { projectId: 'raw', files: [], onDivergence: 'REFUSE' }
  return { empty, invalid }
}
