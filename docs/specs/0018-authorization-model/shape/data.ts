import type { AccountId, WorkspaceId, ProjectId, ArtifactRevisionId, ModelAccountId } from '@conexus/contract'
import type { AccountScope, Admitted, CommandGate, ProjectCard, ProjectListRow, ProjectDetail, ProjectScope, ReadGate, RunScope, WorkspaceScope } from './types.js'
export type Database = Readonly<{
  read<T>(accountId: AccountId, fn: (gate: ReadGate) => Promise<T>): Promise<T>
  transaction<T>(accountId: AccountId, fn: (gate: CommandGate) => Promise<T>): Promise<T>
  system<T>(job: import('../../../../apps/hub/src/platform/db.js').JobName, fn: (gate: CommandGate) => Promise<T>): Promise<T>
}>
export declare function listProjects(proof: Admitted<WorkspaceScope<'workspace.read'>, 'read'>): Promise<readonly ProjectListRow[]>
export declare function readProject(proof: Admitted<ProjectScope<'project.read'>, 'read'>): Promise<ProjectDetail>
export declare function readThumbnail(proof: Admitted<ProjectScope<'project.read'>, 'read'>): Promise<Readonly<{ artifactRevisionId: ArtifactRevisionId; bytes: Uint8Array }> | null>
export declare function listWorkspaces(proof: Admitted<AccountScope, 'read'>): Promise<readonly Readonly<{ workspaceId: WorkspaceId; name: string }>[]>
export declare function beginDeletion(proof: Admitted<ProjectScope<'project.delete'>>, confirmName: string): Promise<void>
export type DeletionPorts = Readonly<{
  releaseApplicationData(projectId: ProjectId, lost: AbortSignal): Promise<void>
  killSandboxes(projectId: ProjectId, lost: AbortSignal): Promise<void>
  deleteRepository(projectId: ProjectId, lost: AbortSignal): Promise<void>
}>

export declare function readProjectCards(proof: Admitted<WorkspaceScope<'workspace.read'>, 'read'>): Promise<readonly ProjectCard[]>

export declare function readModelStanding(proof: Admitted<AccountScope, 'read'>): Promise<Awaited<ReturnType<import('../../../../apps/hub/src/builder/model-account/accounts.js').ModelAccounts['standing']>>>
export declare function readRunCredential(proof: Admitted<RunScope>, modelAccountId: ModelAccountId): Promise<Readonly<{ modelAccountId: ModelAccountId; sealed: string }> | null>
