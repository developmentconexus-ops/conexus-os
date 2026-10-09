import type { ProjectId } from '@conexus/contract'
import type { Admitted, ProjectScope, WorkspaceScope } from '../../../../apps/hub/src/identity-access/public.js'
import type { RegistryModule } from '../../../../apps/hub/src/registry/public.js'
import type { ApplicationRunnerClient } from '../../../../apps/hub/src/app-runner/module.js'
import type { Allocation, PreviewAllocation, PreviewSubject } from './types.js'

export type RegistryPreviewOperations = Readonly<{
  retainAsPreview: RegistryModule['retainAsPreview']
  readPreviewSubject(proof: Admitted<ProjectScope<'project.read'>, 'read'>): Promise<PreviewSubject>
  readPreviewPresence(proof: Admitted<WorkspaceScope<'workspace.read'>, 'read'>, projectIds: readonly ProjectId[]): Promise<readonly ProjectId[]>
}>
type ForProject<T> = Omit<T, 'projectId'> & Readonly<{ projectId: ProjectId }>
export type PreviewPrepareInput = ForProject<Parameters<ApplicationRunnerClient['prepare']>[0]>
export type EnvironmentInvokeInput = ForProject<Parameters<ApplicationRunnerClient['invoke']>[0]> & Readonly<{ kind: Allocation['kind'] }>
export type RunnerOperations = Readonly<{
  preparePreview(input: PreviewPrepareInput): ReturnType<ApplicationRunnerClient['prepare']>
  invoke(input: EnvironmentInvokeInput): ReturnType<ApplicationRunnerClient['invoke']>
  disposePreview(input: ForProject<Parameters<ApplicationRunnerClient['release']>[0]>): ReturnType<ApplicationRunnerClient['release']>
}>
export type AllocationOperations = Readonly<{
  resetPreview(allocation: PreviewAllocation): Promise<void>
}>
