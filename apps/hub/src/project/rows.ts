import { z } from 'zod'
import { BuilderRunSummary, ProjectCard, ProjectDetail, ProjectId, ProjectListRow, ProjectName, ProjectRevision, WorkspaceId } from '@conexus/contract'

const LatestRun = z.union(BuilderRunSummary.options.map((variant) => variant.pick({ state: true, resultKind: true })))
const Card = z.discriminatedUnion('state', [
  ProjectCard.options[0].extend({ latestRun: LatestRun.nullable() }),
  ProjectCard.options[1],
])

const ProjectRow = z.object({ project_id: ProjectId, workspace_id: WorkspaceId, name: ProjectName })
export const ListRow = z.discriminatedUnion('state', [
  ProjectRow.extend({ state: z.literal('live'), archived: z.boolean() }),
  ProjectRow.extend({ state: z.literal('deleting') }),
]).transform((row): unknown => row.state === 'deleting'
  ? { projectId: row.project_id, workspaceId: row.workspace_id, name: row.name, state: row.state }
  : { projectId: row.project_id, workspaceId: row.workspace_id, name: row.name, state: row.state, archived: row.archived }
).pipe(ProjectListRow)
export const DetailRow = z.discriminatedUnion('state', [
  ProjectRow.extend({ state: z.literal('live'), project_revision: ProjectRevision, archived: z.boolean() }),
  ProjectRow.extend({ state: z.literal('deleting') }),
]).transform((row): unknown => row.state === 'deleting'
  ? { projectId: row.project_id, workspaceId: row.workspace_id, name: row.name, state: row.state }
  : { projectId: row.project_id, workspaceId: row.workspace_id, name: row.name, state: row.state, projectRevision: row.project_revision, archived: row.archived }
).pipe(ProjectDetail)
export const CardRow = z.discriminatedUnion('state', [
  ProjectRow.pick({ project_id: true, name: true }).extend({
    state: z.literal('live'), archived: z.boolean(), last_activity_at: z.string(),
    run_state: z.unknown(), run_result_kind: z.unknown(), has_preview: z.boolean(),
  }),
  ProjectRow.pick({ project_id: true, name: true }).extend({ state: z.literal('deleting') }),
]).transform((row): unknown => row.state === 'deleting'
  ? { projectId: row.project_id, name: row.name, state: row.state }
  : {
    projectId: row.project_id, name: row.name, state: row.state, archived: row.archived,
    lastActivityAt: row.last_activity_at,
    latestRun: row.run_state === null && row.run_result_kind === null ? null : { state: row.run_state, resultKind: row.run_result_kind },
    hasPreview: row.has_preview,
  }
).pipe(Card)
