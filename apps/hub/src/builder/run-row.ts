import { z } from 'zod'
import { BuilderRunSummary as BuilderRunSummarySchema, BuilderRunId, ConversationId, FAILURE_CODES, ProjectId, SourceRevision, type BuilderRunSummary } from '@conexus/contract'
import { BUILDER_RUN_PHASES, BUILDER_RUN_RESULT_KINDS, BUILDER_RUN_STATES } from '../generated/builder-run-vocabulary.js'
import { sql } from '../platform/db.js'

export type { BuilderRunSummary, BuilderRunView } from '@conexus/contract'

/** The result kinds of a run that changed the source. */
export const CODE_CHANGING_RESULT_KINDS = BUILDER_RUN_RESULT_KINDS.filter((kind) => kind !== 'RESPONSE_ONLY')

export const RUN_COLUMNS = sql`
  run.builder_run_id, run.project_id, run.conversation_id, run.state, run.phase, run.base_source_revision,
  run.result_source_revision, run.result_kind, run.failure_code, run.request_text, run.created_at,
  run.cancellation_requested_at IS NOT NULL AS cancellation_requested`

export const RunRow = z.object({
  builder_run_id: BuilderRunId,
  project_id: ProjectId,
  conversation_id: ConversationId,
  state: z.enum(BUILDER_RUN_STATES),
  phase: z.enum(BUILDER_RUN_PHASES).nullable(),
  base_source_revision: SourceRevision,
  result_source_revision: SourceRevision.nullable(),
  result_kind: z.enum(BUILDER_RUN_RESULT_KINDS).nullable(),
  failure_code: z.enum(FAILURE_CODES).nullable(),
  request_text: z.string().nullable(),
  created_at: z.date(),
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
  createdAt: row.created_at.toISOString(),
  cancellationRequested: row.cancellation_requested,
})
