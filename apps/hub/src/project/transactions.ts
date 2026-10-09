import { z } from 'zod'
import type { ProjectId } from '@conexus/contract'
import type { Admitted, ApplicationScope, Checked, ProjectScope, SystemScope, WorkspaceScope } from '../identity-access/public.js'
import { sql, type Mode, type Sql } from '../platform/db.js'

const Present = z.object({ present: z.literal(1) })
type OpenProjectAdmission = Admitted<ProjectScope<'connections.bind' | 'project.read'>, Mode>
type OpenProjectProof = Checked<ApplicationScope> | OpenProjectAdmission

export async function requireCreatedProject({ tx, scope }: Admitted<WorkspaceScope<'project.create'>>, projectId: ProjectId): Promise<void> {
  await tx.one(Present, sql`SELECT 1 AS present FROM project.project
    WHERE project_id = ${projectId} AND workspace_id = ${scope.workspaceId}`, 'PROJECT_NOT_FOUND')
}

export async function lockPresentProject({ tx }: Admitted<SystemScope<'builder-executor'>>, projectId: ProjectId): Promise<boolean> {
  return await tx.maybe(Present, sql`SELECT 1 AS present FROM project.project WHERE project_id = ${projectId} FOR SHARE`) !== null
}

// A checked application has no Project lock: compose this in the consumer's statement snapshot.
export function openProjectCondition({ scope }: OpenProjectProof): Sql {
  return sql`EXISTS (SELECT 1 FROM project.project AS stored
    WHERE stored.project_id = ${scope.projectId} AND NOT stored.archived
      AND NOT EXISTS (SELECT 1 FROM project.project_deletion AS deletion WHERE deletion.project_id = stored.project_id))`
}

export async function isOpenProject(proof: OpenProjectAdmission): Promise<boolean> {
  return await proof.tx.maybe(Present, sql`SELECT 1 AS present WHERE ${openProjectCondition(proof)}`) !== null
}
