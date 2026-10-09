import type { ProjectId } from '@conexus/contract'
import type { Admitted, SystemScope, WorkspaceScope } from '../identity-access/public.js'
import { sql } from '../platform/db.js'

/** The Builder's write on the Project's creation transaction: the proof is its check. */
export const builderProjectPorts = {
  /** Makes the working state and repository markers of a Project that was just inserted into the proof's workspace, each once. */
  register: async ({ tx, scope }: Admitted<WorkspaceScope<'project.create'>>, projectId: ProjectId) => {
    await tx.run(sql`
      INSERT INTO builder.project_working_state (project_id)
      SELECT project.project_id FROM project.project AS project WHERE project.project_id = ${projectId} AND project.workspace_id = ${scope.workspaceId}
      ON CONFLICT (project_id) DO NOTHING`)
    await tx.run(sql`
      INSERT INTO builder.project_repository (project_id)
      SELECT project.project_id FROM project.project AS project WHERE project.project_id = ${projectId} AND project.workspace_id = ${scope.workspaceId}
      ON CONFLICT (project_id) DO NOTHING`)
  },
}

/** Deletes runs, working state and repository, in that order; the model account and conversation session rows go with them by cascade. */
export const purgeProjectBuilder = async ({ tx }: Admitted<SystemScope<'project-purge'>>, projectId: ProjectId): Promise<void> => {
  await tx.run(sql`DELETE FROM builder.builder_run WHERE project_id = ${projectId}`)
  await tx.run(sql`DELETE FROM builder.project_working_state WHERE project_id = ${projectId}`)
  await tx.run(sql`DELETE FROM builder.project_repository WHERE project_id = ${projectId}`)
}
