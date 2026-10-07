import type { AccountId, WorkspaceId, ProjectId, ArtifactRevisionId } from '@conexus/contract'
import type { AccountScope, Admitted, CommandGate, ProjectCard, ProjectListRow, ProjectDetail, ProjectScope, ReadGate, WorkspaceScope } from './types.js'
export type Database = Readonly<{
  read<T>(accountId: AccountId, fn: (gate: ReadGate) => Promise<T>): Promise<T>
  transaction<T>(accountId: AccountId, fn: (gate: CommandGate) => Promise<T>): Promise<T>
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
