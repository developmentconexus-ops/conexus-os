import { type ProjectId, type ProjectCard, type SourceRevision } from '@conexus/contract'
import type { Admitted, ApplicationScope, Checked, ProjectScope, SystemScope, WorkspaceScope } from '../../../../apps/hub/src/identity-access/admission.js'
import { sql } from '../../../../apps/hub/src/platform/db.js'
import type { RegistryModule } from '../../../../apps/hub/src/registry/module.js'
import type { BuilderRegistry } from '../../../../apps/hub/src/builder/application-build.js'

export type RegistryPort = Pick<RegistryModule, 'seal' | 'retain' | 'readLaunch'>
export type OpenProjectProof = Checked<ApplicationScope> | Admitted<ProjectScope, 'read'> | Admitted<ProjectScope>
export type ProjectLocks = Readonly<{
  requireCreatedProject(proof: Admitted<WorkspaceScope<'project.create'>>, projectId: ProjectId): Promise<void>
  lockPresentProject(proof: Admitted<SystemScope<'builder-executor'>>, projectId: ProjectId): Promise<boolean>
  isOpenProject(proof: OpenProjectProof): Promise<boolean>
}>

export type ProjectActivity = Readonly<{
  projectId: ProjectId
  latestRun: Extract<ProjectCard, { state: 'live' }>['latestRun']
  createdAt: Date | null
  hasPreview: Extract<ProjectCard, { state: 'live' }>['hasPreview']
}>
export type BuilderReads = Readonly<{
  readProjectActivity(proof: Admitted<WorkspaceScope<'workspace.read'>, 'read'>, projectIds: readonly ProjectId[]): Promise<readonly ProjectActivity[]>
  hasOpenProjectRun(proof: Admitted<ProjectScope<'project.delete'>> | Admitted<SystemScope<'project-purge'>>, projectId: ProjectId): Promise<boolean>
}>

// A representative statement built by the actual query owner; an archive or deletion refuses it.
export function openProjectStatement(proof: OpenProjectProof) {
  return sql`SELECT 1 AS present FROM project.project AS stored
    WHERE stored.project_id = ${proof.scope.projectId} AND NOT stored.archived
      AND NOT EXISTS (SELECT 1 FROM project.project_deletion AS deletion WHERE deletion.project_id = stored.project_id)`
}

export function sourceOf(owner: RegistryPort, input: Parameters<BuilderRegistry['seal']>[0], run: Parameters<RegistryPort['seal']>[1]): SourceRevision {
  return owner.seal(input, run).sourceRevision
}
