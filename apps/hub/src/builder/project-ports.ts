import { z } from 'zod'
import type { ProjectId } from '@conexus/contract'
import { OPEN_RUN_STATES } from '../generated/builder-run-vocabulary.js'
import type { Admitted, ProjectScope, SystemScope, WorkspaceScope } from '../identity-access/public.js'
import { requireCreatedProject } from '../project/public.js'
import { ActivityRow } from './project-activity-row.js'
import { sql } from '../platform/db.js'

const Present = z.object({ present: z.literal(1) })

/** The Builder's write on the Project's creation transaction: the proof is its check. */
export const builderProjectPorts = Object.freeze({
  readProjectActivity,
  hasOpenProjectRun,
  /** Makes the working state and repository markers of a Project that was just inserted into the proof's workspace, each once. */
  register: async (proof: Admitted<WorkspaceScope<'project.create'>>, projectId: ProjectId) => {
    await requireCreatedProject(proof, projectId)
    const { tx } = proof
    await tx.run(sql`
      INSERT INTO builder.project_working_state (project_id)
      VALUES (${projectId})
      ON CONFLICT (project_id) DO NOTHING`)
    await tx.run(sql`
      INSERT INTO builder.project_repository (project_id)
      VALUES (${projectId})
      ON CONFLICT (project_id) DO NOTHING`)
  },
})

/** Deletes runs, working state and repository, in that order; the model account and conversation session rows go with them by cascade. */
export const purgeProjectBuilder = async ({ tx }: Admitted<SystemScope<'project-purge'>>, projectId: ProjectId): Promise<void> => {
  await tx.run(sql`DELETE FROM builder.builder_run WHERE project_id = ${projectId}`)
  await tx.run(sql`DELETE FROM builder.project_working_state WHERE project_id = ${projectId}`)
  await tx.run(sql`DELETE FROM builder.project_repository WHERE project_id = ${projectId}`)
}

async function readProjectActivity({ tx }: Admitted<WorkspaceScope<'workspace.read'>, 'read'>, projectIds: readonly ProjectId[]) {
  return tx.rows(ActivityRow, sql`
    SELECT requested.project_id,
      CASE WHEN latest.state IS NOT NULL THEN json_build_object('state', latest.state, 'resultKind', latest.result_kind) END AS latest_run,
      latest.created_at, (extract(epoch FROM latest.created_at) * 1000000)::bigint::text AS sort_at,
      working.last_preview_source_revision IS NOT NULL AS has_preview
    FROM unnest(${projectIds}::uuid[]) AS requested(project_id)
    LEFT JOIN LATERAL (
      SELECT run.state, run.result_kind, run.created_at FROM builder.builder_run AS run
      WHERE run.project_id = requested.project_id ORDER BY run.created_at DESC, run.builder_run_id DESC LIMIT 1
    ) AS latest ON true
    LEFT JOIN builder.project_working_state AS working ON working.project_id = requested.project_id`)
}

async function hasOpenProjectRun({ tx }: Admitted<ProjectScope<'project.delete'>> | Admitted<SystemScope<'project-purge'>>, projectId: ProjectId): Promise<boolean> {
  return await tx.maybe(Present, sql`SELECT 1 AS present FROM builder.builder_run
    WHERE project_id = ${projectId} AND state = ANY(${OPEN_RUN_STATES}::text[]) LIMIT 1`) !== null
}
