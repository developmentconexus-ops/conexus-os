import { z } from 'zod'
import { canonicalBytes, sha256 } from '../../../../packages/canonical-json/src/index.mjs'
import { AccountId, BuilderRunId, SourceRevision, type BuilderRunId as BuilderRunIdType, type ProjectId } from '../../../../packages/contract/dist/index.js'
import { admitProject } from '../identity-access/admission.js'
import { sql, type Database } from '../platform/db.js'
import { Failure } from '../platform/failure.js'
import { OPEN_RUN_STATES, RUN_COLUMNS, RunRow, runSummary, type BuilderRunSummary } from './run-row.js'

const Present = z.object({ present: z.literal(1) })
const Replay = RunRow.extend({ account_id: AccountId, request_digest: z.string() })
const MESSAGE_ID = /^.{1,200}$/s
const REQUEST_TEXT_MAX = 20000

export type RunStart = Readonly<{
  /** Admits the account to build in the Project, or refuses with the row of its access; it commits, so an answer here holds before any side effect. */
  admitBuilder(input: Readonly<{ accountId: AccountId; projectId: ProjectId }>): Promise<void>
  /** Takes the Project's locks, reads the base with readBase while holding them, and inserts the run on that base, or replays the run the same key already made. */
  createBuilderRun(input: Readonly<{ accountId: AccountId; projectId: ProjectId; conversationId: string; idempotencyKey: string; content: string; readBase(): Promise<string> }>): Promise<BuilderRunSummary>
  requestBuilderRunCancellation(input: Readonly<{ accountId: AccountId; projectId: ProjectId; builderRunId: BuilderRunIdType }>): Promise<BuilderRunSummary>
  bindBuilderRunMessage(input: Readonly<{ builderRunId: BuilderRunIdType; projectId: ProjectId; accountId: AccountId; messageId: string }>): Promise<void>
}>

export const createRunStart = ({ database, mintIdentity }: Readonly<{ database: Database; mintIdentity: () => string }>): RunStart => ({
  admitBuilder: ({ accountId, projectId }) => database.transaction(accountId, async (gate) => {
    await admitProject(gate, projectId, 'project.build')
  }),
  createBuilderRun: ({ accountId, projectId, conversationId, idempotencyKey, content, readBase }) => database.transaction(accountId, async (gate) => {
    const project = await admitProject(gate, projectId, 'project.build')
    const conversation = conversationId.trim()
    if (conversation.length < 1 || conversation.length > 200 || content.length < 1 || content.length > REQUEST_TEXT_MAX) throw new Failure('BUILDER_MESSAGE_REFUSED')
    const { tx, scope } = project
    const subject = await tx.maybe(Present, sql`
      SELECT 1 AS present FROM builder.project_working_state AS working
      WHERE working.project_id = ${scope.projectId} AND EXISTS (SELECT 1 FROM builder.project_repository AS repository WHERE repository.project_id = working.project_id) FOR UPDATE`)
    if (!subject) throw new Failure('PROJECT_BUILD_DENIED')
    const base = SourceRevision.safeParse(await readBase())
    if (!base.success) throw new Failure('BUILDER_MESSAGE_REFUSED')
    const idempotencyDigest = sha256(Buffer.from(idempotencyKey, 'utf8'))
    const requestDigest = sha256(canonicalBytes({ content }))
    const replay = await tx.maybe(Replay, sql`
      SELECT ${RUN_COLUMNS}, run.account_id, run.request_digest FROM builder.builder_run AS run
      WHERE run.project_id = ${scope.projectId} AND run.idempotency_digest = ${idempotencyDigest}`)
    if (replay) {
      if (replay.account_id !== scope.accountId || replay.request_digest !== requestDigest || replay.request_text !== content || replay.conversation_id !== conversation) throw new Failure('IDEMPOTENCY_CONFLICT')
      return runSummary(replay)
    }
    if (await tx.maybe(Present, sql`SELECT 1 AS present FROM builder.builder_run AS run WHERE run.project_id = ${scope.projectId} AND run.state = ANY(${OPEN_RUN_STATES}::text[]) LIMIT 1`)) throw new Failure('PROJECT_BUSY')
    const created = await tx.one(RunRow, sql`
      INSERT INTO builder.builder_run AS run (builder_run_id, project_id, account_id, conversation_id, idempotency_digest, request_digest, request_text, base_source_revision)
      VALUES (${BuilderRunId.parse(mintIdentity())}, ${scope.projectId}, ${scope.accountId}, ${conversation}, ${idempotencyDigest}, ${requestDigest}, ${content}, ${base.data})
      RETURNING ${RUN_COLUMNS}`, 'BUILDER_RUN_CREATE_FAILED')
    return runSummary(created)
  }),
  requestBuilderRunCancellation: ({ accountId, projectId, builderRunId }) => database.transaction(accountId, async (gate) => {
    const { tx, scope } = await admitProject(gate, projectId, 'project.build')
    const run = await tx.maybe(z.object({ state: z.string() }), sql`
      SELECT run.state FROM builder.builder_run AS run
      WHERE run.builder_run_id = ${builderRunId} AND run.project_id = ${scope.projectId} AND run.account_id = ${scope.accountId} FOR UPDATE`)
    if (!run) throw new Failure('BUILDER_RUN_NOT_FOUND')
    if (run.state === 'QUEUED') {
      await tx.run(sql`
        UPDATE builder.builder_run SET state = 'INTERRUPTED', phase = NULL, cancellation_requested_at = COALESCE(cancellation_requested_at, clock_timestamp()),
          cancellation_reason = COALESCE(cancellation_reason, 'USER_CANCELLED'), finished_at = COALESCE(finished_at, clock_timestamp())
        WHERE builder_run_id = ${builderRunId} AND project_id = ${scope.projectId} AND state = 'QUEUED'`)
    } else if (run.state === 'RUNNING') {
      await tx.run(sql`
        UPDATE builder.builder_run SET phase = NULL, cancellation_requested_at = COALESCE(cancellation_requested_at, clock_timestamp()),
          cancellation_reason = COALESCE(cancellation_reason, 'USER_CANCELLED')
        WHERE builder_run_id = ${builderRunId} AND project_id = ${scope.projectId} AND state = 'RUNNING'`)
    }
    const after = await tx.one(RunRow, sql`
      SELECT ${RUN_COLUMNS} FROM builder.builder_run AS run WHERE run.builder_run_id = ${builderRunId} AND run.project_id = ${scope.projectId}`, 'BUILDER_RUN_CANCELLATION_REFUSED')
    return runSummary(after)
  }),
  bindBuilderRunMessage: ({ builderRunId, projectId, accountId, messageId }) => database.transaction(accountId, async (gate) => {
    const id = messageId.trim()
    if (!MESSAGE_ID.test(id)) throw new Failure('BUILDER_RUN_MESSAGE_BIND_REFUSED')
    const { tx, scope } = await admitProject(gate, projectId, 'project.build')
    await tx.maybe(Present, sql`SELECT 1 AS present FROM builder.builder_run AS run WHERE run.builder_run_id = ${builderRunId} AND run.project_id = ${scope.projectId} FOR UPDATE`)
    const bound = await tx.run(sql`
      UPDATE builder.builder_run SET trigger_message_id = ${id}
      WHERE builder_run_id = ${builderRunId} AND project_id = ${scope.projectId} AND state = ANY(${OPEN_RUN_STATES}::text[]) AND (trigger_message_id IS NULL OR trigger_message_id = ${id})`)
    if (bound !== 1) throw new Failure('BUILDER_RUN_MESSAGE_BIND_REFUSED')
  }),
})
