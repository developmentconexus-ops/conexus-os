import { z } from 'zod'
import { BuilderRunSummary, ProjectId } from '@conexus/contract'

const LatestRun = z.union(BuilderRunSummary.options.map((variant) => variant.pick({ state: true, resultKind: true })))
const Activity = z.object({ project_id: ProjectId, has_preview: z.boolean() })
export const ActivityRow = z.union([
  Activity.extend({ latest_run: z.null(), created_at: z.null(), sort_at: z.null() }),
  Activity.extend({ latest_run: LatestRun, created_at: z.date(), sort_at: z.coerce.bigint() }),
]).transform((row) => ({ projectId: row.project_id, latestRun: row.latest_run, createdAt: row.created_at, sortAt: row.sort_at, hasPreview: row.has_preview }))
