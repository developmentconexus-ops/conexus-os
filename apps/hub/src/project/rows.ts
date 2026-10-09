import { z } from 'zod'
import { ProjectDetail, ProjectId, ProjectListRow, ProjectName, ProjectRevision, WorkspaceId } from '@conexus/contract'

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
export const SummaryRow = z.discriminatedUnion('state', [
  ProjectRow.pick({ project_id: true, name: true }).extend({ state: z.literal('live'), archived: z.boolean(), created_at: z.date(), sort_at: z.coerce.bigint() }),
  ProjectRow.pick({ project_id: true, name: true }).extend({ state: z.literal('deleting'), created_at: z.date(), sort_at: z.coerce.bigint() }),
])
