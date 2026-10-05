import { z } from 'zod'
import { BuilderRunSummary as BuilderRunSummarySchema, BuilderRunId, ProjectId, SourceRevision, type BuilderRunSummary } from '../../../../packages/contract/dist/index.js'
import { BUILDER_RUN_PHASES, BUILDER_RUN_RESULT_KINDS, BUILDER_RUN_STATES } from '../generated/builder-run-vocabulary.js'
import { sql } from '../platform/db.js'

export type { BuilderRunSummary, BuilderRunView } from '../../../../packages/contract/dist/index.js'

/** The result kinds of a run that changed the source. */
export const CODE_CHANGING_RESULT_KINDS = BUILDER_RUN_RESULT_KINDS.filter((kind) => kind !== 'RESPONSE_ONLY')

// The columns a run summary reads, the creation time as UTC milliseconds as the wire writes it.
export const RUN_COLUMNS = sql`
  run.builder_run_id, run.project_id, run.conversation_id, run.state, run.phase, run.base_source_revision,
  run.result_source_revision, run.result_kind, run.failure_code, run.request_text,
  to_char(run.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
  run.cancellation_requested_at IS NOT NULL AS cancellation_requested`

export const RunRow = z.object({
  builder_run_id: BuilderRunId,
  project_id: ProjectId,
  conversation_id: z.string(),
  state: z.enum(BUILDER_RUN_STATES),
  phase: z.enum(BUILDER_RUN_PHASES).nullable(),
  base_source_revision: SourceRevision,
  result_source_revision: SourceRevision.nullable(),
  result_kind: z.enum(BUILDER_RUN_RESULT_KINDS).nullable(),
  failure_code: z.string().nullable(),
  request_text: z.string().nullable(),
  created_at: z.string(),
  cancellation_requested: z.boolean(),
})

/** The one presenter of a run row: the store and the routes answer a run through it. */
export const runSummary = (row: z.output<typeof RunRow>): BuilderRunSummary => BuilderRunSummarySchema.parse({
  builderRunId: row.builder_run_id,
  projectId: row.project_id,
  conversationId: row.conversation_id,
  state: row.state,
  phase: row.phase,
  baseSourceRevision: row.base_source_revision,
  resultSourceRevision: row.result_source_revision,
  resultKind: row.result_kind,
  failureCode: row.failure_code,
  requestText: row.request_text,
  createdAt: row.created_at,
  cancellationRequested: row.cancellation_requested,
})
