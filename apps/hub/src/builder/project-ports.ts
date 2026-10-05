import type { ProjectId } from '../../../../packages/contract/dist/index.js'
import type { Admitted, SystemScope, WorkspaceScope } from '../identity-access/admission.js'
import { sql } from '../platform/db.js'

/** The two writes Project makes into Builder tables: it hands each its own proof, and the proof is the job check. */
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
  /** Deletes runs, working state and repository, in that order; the model account and conversation session rows go with them by cascade. */
  purge: async ({ tx }: Admitted<SystemScope<'project-purge'>>, projectId: ProjectId) => {
    await tx.run(sql`DELETE FROM builder.builder_run WHERE project_id = ${projectId}`)
    await tx.run(sql`DELETE FROM builder.project_working_state WHERE project_id = ${projectId}`)
    await tx.run(sql`DELETE FROM builder.project_repository WHERE project_id = ${projectId}`)
  },
}
