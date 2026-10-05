import { z } from 'zod'
import { BuilderRunId, ProjectId, SourceRevision } from '../../../../packages/contract/dist/index.js'
import { admitSystem } from '../identity-access/admission.js'
import { sql, type Database } from '../platform/db.js'
import { OPEN_RUN_STATES } from './run-row.js'

/** A queued or working run a lease pass took over from an owner that went quiet. */
const TakenOver = z.object({
  builder_run_id: BuilderRunId,
  project_id: ProjectId,
  conversation_id: z.string(),
  candidate_revision: SourceRevision.nullable(),
  result_source_revision: SourceRevision.nullable(),
  previous_owner_id: z.string().nullable(),
})
export type TakenOverRun = Readonly<{
  builderRunId: BuilderRunId
  projectId: ProjectId
  conversationId: string
  /** Offered before `main` moved; `main` in the Conexus Git says whether it was admitted. */
  candidateRevision: SourceRevision | null
  /** Equal to the candidate once the advance is recorded. */
  resultSourceRevision: SourceRevision | null
  previousOwnerId: string | null
}>

export type RunLease = Readonly<{
  /** One call: beats every listed run of this owner, then takes over the queued and working runs that are not listed and whose owner's heartbeat is older than the limit. A listed run is never taken. */
  renewRunLease(ownerId: string, liveRunIds: readonly BuilderRunId[], staleAfterMs: number): Promise<readonly TakenOverRun[]>
}>

export const createRunLease = ({ database }: Readonly<{ database: Database }>): RunLease => ({
  renewRunLease: (ownerId, liveRunIds, staleAfterMs) => database.system('builder-executor', async (gate) => {
    const { tx } = await admitSystem(gate, 'builder-executor')
    const live = [...liveRunIds]
    await tx.run(sql`
      UPDATE builder.builder_run SET heartbeat_at = clock_timestamp()
      WHERE builder_run_id = ANY(${live}::uuid[]) AND owner_id = ${ownerId}::uuid AND state = ANY(${OPEN_RUN_STATES}::text[])`)
    const taken = await tx.rows(TakenOver, sql`
      WITH stale AS (
        SELECT builder_run_id, owner_id AS previous_owner_id FROM builder.builder_run
        WHERE state = ANY(${OPEN_RUN_STATES}::text[]) AND builder_run_id <> ALL(${live}::uuid[])
          AND COALESCE(heartbeat_at, created_at) < clock_timestamp() - make_interval(secs => ${staleAfterMs}::integer / 1000.0)
        FOR UPDATE SKIP LOCKED
      ), updated AS (
        UPDATE builder.builder_run AS run SET owner_id = ${ownerId}::uuid, heartbeat_at = clock_timestamp()
        WHERE run.builder_run_id IN (SELECT stale.builder_run_id FROM stale)
        RETURNING run.builder_run_id, run.project_id, run.conversation_id, run.candidate_revision, run.result_source_revision, run.created_at
      )
      SELECT updated.builder_run_id, updated.project_id, updated.conversation_id, updated.candidate_revision, updated.result_source_revision,
        stale.previous_owner_id::text AS previous_owner_id
      FROM updated JOIN stale ON stale.builder_run_id = updated.builder_run_id
      ORDER BY updated.created_at, updated.builder_run_id`)
    return taken.map((row) => ({
      builderRunId: row.builder_run_id,
      projectId: row.project_id,
      conversationId: row.conversation_id,
      candidateRevision: row.candidate_revision,
      resultSourceRevision: row.result_source_revision,
      previousOwnerId: row.previous_owner_id,
    }))
  }),
})
