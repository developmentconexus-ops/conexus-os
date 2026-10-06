import { z } from 'zod'
import { canonicalBytes, sha256 } from '../../../../packages/canonical-json/src/index.mjs'
import { AccountId, BuilderRunId, ProjectId, SourceRevision, type ConversationId, type ModelAccountId } from '../../../../packages/contract/dist/index.js'
import { admitProject, admitRun, admitSystem, type Admitted, type ProjectScope, type RunScope, type SystemScope } from '../identity-access/admission.js'
import { BUILDER_RUN_STATES, OPEN_RUN_STATES, type OpenRunState, type BuilderRunPhase, } from '../generated/builder-run-vocabulary.js'
import { sql, type Database, } from '../platform/db.js'
import { Failure, type FailureCode } from '../platform/failure.js'
import type { BuilderRegistry } from './application-build.js'
import type { SealedApplication } from '../platform/sealed-application.js'
import { RUN_COLUMNS, RunRow, runSummary, type BuilderRunSummary } from './run-row.js'

/** Who a run's write acts as: its author's account before the candidate, the executor for everything it settles. */
export type RunActor = Readonly<{ via: 'account'; accountId: AccountId }> | Readonly<{ via: 'executor' }>

/** Opens the entry the actor names and admits the run in it, so the work gets the run's proof and nothing else. */
export const withRun = <T>(database: Database, ownerId: string, builderRunId: BuilderRunId, actor: RunActor, work: (proof: Admitted<RunScope>) => Promise<T>): Promise<T> =>
  actor.via === 'account'
    ? database.transaction(actor.accountId, async (gate) => work(await admitRun(gate, builderRunId, { ownerId })))
    : database.system('builder-executor', async (gate) => work(await admitRun(gate, builderRunId, { ownerId })))

/** How a run stops holding its Project: the person's stop, a Hub that stopped, or a question nobody answered. */
export type InterruptionCode = Extract<FailureCode, 'USER_CANCELLED' | 'HUB_RESTART' | 'BUILDER_QUESTION_EXPIRED'>

type Ended = Exclude<BuilderRunSummary, Readonly<{ state: OpenRunState }>>
type EndingOf<Variant> = Variant extends Ended ? Readonly<Pick<Variant, 'state' | 'resultKind' | 'failureCode'>> : never
/** What an ending stores, one variant per ended state of the contract's run union; a stop is one of the three interruption codes. */
type RunEnding = Exclude<EndingOf<Ended>, Readonly<{ state: 'INTERRUPTED' }>> | (EndingOf<Extract<Ended, { state: 'INTERRUPTED' }>> & Readonly<{ failureCode: InterruptionCode }>)

/** The rows an ending may write over: the guard each transition needs beside the run's own key. */
const ENDS_FROM = {
  open: sql`run.state = ANY(${OPEN_RUN_STATES}::text[])`,
  queued: sql`run.state = 'QUEUED'`,
  unclaimed: sql`run.state = 'QUEUED' AND run.owner_id IS NULL`,
  running: sql`run.state = 'RUNNING'`,
  withoutCandidate: sql`run.state = 'RUNNING' AND run.candidate_revision IS NULL`,
} as const

/** The only writer of a run's final columns: the state, a null phase, the result and the failure the ending names, and the finish time. A stop keeps the first cancellation time and reason. */
const endRun = ({ tx }: Admitted<ProjectScope> | Admitted<RunScope> | Admitted<SystemScope<'builder-executor'>>, { builderRunId, projectId, ending, from }: Readonly<{ builderRunId: BuilderRunId; projectId: ProjectId; ending: RunEnding; from: keyof typeof ENDS_FROM }>): Promise<number> =>
  tx.run(sql`
    UPDATE builder.builder_run AS run SET state = ${ending.state}, phase = NULL, result_kind = ${ending.resultKind}, failure_code = ${ending.failureCode}, finished_at = clock_timestamp()
      ${ending.state === 'INTERRUPTED' ? sql`, cancellation_requested_at = COALESCE(run.cancellation_requested_at, clock_timestamp()), cancellation_reason = COALESCE(run.cancellation_reason, ${ending.failureCode})` : sql``}
    WHERE run.builder_run_id = ${builderRunId} AND run.project_id = ${projectId} AND ${ENDS_FROM[from]}`)

const Present = z.object({ present: z.literal(1) })
const Replay = RunRow.extend({ account_id: AccountId, request_digest: z.string() })
const MESSAGE_ID = /^.{1,200}$/s

export type RunStart = Readonly<{
  /** Admits the account to build in the Project, or refuses with the row of its access; it commits, so an answer here holds before any side effect. */
  admitBuilder(input: Readonly<{ accountId: AccountId; projectId: ProjectId }>): Promise<void>
  /** Takes the Project's locks, reads the base with readBase while holding them, and inserts the run on that base, or replays the run the same key already made. */
  createBuilderRun(input: Readonly<{ accountId: AccountId; projectId: ProjectId; conversationId: ConversationId; idempotencyKey: string; content: string; readBase(): Promise<SourceRevision> }>): Promise<BuilderRunSummary>
  requestBuilderRunCancellation(input: Readonly<{ accountId: AccountId; projectId: ProjectId; builderRunId: BuilderRunId }>): Promise<BuilderRunSummary>
  bindBuilderRunMessage(input: Readonly<{ builderRunId: BuilderRunId; projectId: ProjectId; accountId: AccountId; messageId: string }>): Promise<void>
}>

export const createRunStart = ({ database, mintIdentity }: Readonly<{ database: Database; mintIdentity: () => string }>): RunStart => ({
  admitBuilder: ({ accountId, projectId }) => database.transaction(accountId, async (gate) => {
    await admitProject(gate, projectId, 'project.build')
  }),
  createBuilderRun: ({ accountId, projectId, conversationId, idempotencyKey, content, readBase }) => database.transaction(accountId, async (gate) => {
    const project = await admitProject(gate, projectId, 'project.build')
    const { tx, scope } = project
    const subject = await tx.maybe(Present, sql`
      SELECT 1 AS present FROM builder.project_working_state AS working
      WHERE working.project_id = ${scope.projectId} AND EXISTS (SELECT 1 FROM builder.project_repository AS repository WHERE repository.project_id = working.project_id) FOR UPDATE`)
    if (!subject) throw new Failure('INTERNAL_UNEXPECTED', { details: { invariant: 'BUILDER_PROJECT_ROWS_MISSING' } })
    const base = await readBase()
    const idempotencyDigest = sha256(Buffer.from(idempotencyKey, 'utf8'))
    const requestDigest = sha256(canonicalBytes({ content }))
    const replay = await tx.maybe(Replay, sql`
      SELECT ${RUN_COLUMNS}, run.account_id, run.request_digest FROM builder.builder_run AS run
      WHERE run.project_id = ${scope.projectId} AND run.idempotency_digest = ${idempotencyDigest}`)
    if (replay) {
      if (replay.account_id !== scope.accountId || replay.request_digest !== requestDigest || replay.request_text !== content || replay.conversation_id !== conversationId) throw new Failure('IDEMPOTENCY_CONFLICT')
      return runSummary(replay)
    }
    if (await tx.maybe(Present, sql`SELECT 1 AS present FROM builder.builder_run AS run WHERE run.project_id = ${scope.projectId} AND run.state = ANY(${OPEN_RUN_STATES}::text[]) LIMIT 1`)) throw new Failure('PROJECT_BUSY')
    const created = await tx.one(RunRow, sql`
      INSERT INTO builder.builder_run AS run (builder_run_id, project_id, account_id, conversation_id, idempotency_digest, request_digest, request_text, base_source_revision)
      VALUES (${BuilderRunId.parse(mintIdentity())}, ${scope.projectId}, ${scope.accountId}, ${conversationId}, ${idempotencyDigest}, ${requestDigest}, ${content}, ${base})
      RETURNING ${RUN_COLUMNS}`, 'BUILDER_RUN_CREATE_FAILED')
    return runSummary(created)
  }),
  requestBuilderRunCancellation: ({ accountId, projectId, builderRunId }) => database.transaction(accountId, async (gate) => {
    const project = await admitProject(gate, projectId, 'project.build')
    const { tx, scope } = project
    const run = await tx.maybe(z.object({ state: z.enum(BUILDER_RUN_STATES) }), sql`
      SELECT run.state FROM builder.builder_run AS run
      WHERE run.builder_run_id = ${builderRunId} AND run.project_id = ${scope.projectId} AND run.account_id = ${scope.accountId} FOR UPDATE`)
    if (!run) throw new Failure('BUILDER_RUN_NOT_FOUND')
    if (run.state === 'QUEUED') {
      await endRun(project, { builderRunId, projectId: scope.projectId, ending: { state: 'INTERRUPTED', resultKind: null, failureCode: 'USER_CANCELLED' }, from: 'queued' })
    } else if (run.state === 'RUNNING') {
      await tx.run(sql`
        UPDATE builder.builder_run SET phase = NULL, cancellation_requested_at = COALESCE(cancellation_requested_at, clock_timestamp()),
          cancellation_reason = COALESCE(cancellation_reason, 'USER_CANCELLED')
        WHERE builder_run_id = ${builderRunId} AND project_id = ${scope.projectId} AND state = 'RUNNING'`)
    }
    const after = await tx.maybe(RunRow, sql`
      SELECT ${RUN_COLUMNS} FROM builder.builder_run AS run WHERE run.builder_run_id = ${builderRunId} AND run.project_id = ${scope.projectId}`)
    if (!after) throw transitionRefused('cancellation')
    return runSummary(after)
  }),
  bindBuilderRunMessage: ({ builderRunId, projectId, accountId, messageId }) => database.transaction(accountId, async (gate) => {
    const id = messageId.trim()
    if (!MESSAGE_ID.test(id)) throw transitionRefused('message bind')
    const { tx, scope } = await admitProject(gate, projectId, 'project.build')
    await tx.maybe(Present, sql`SELECT 1 AS present FROM builder.builder_run AS run WHERE run.builder_run_id = ${builderRunId} AND run.project_id = ${scope.projectId} FOR UPDATE`)
    const bound = await tx.run(sql`
      UPDATE builder.builder_run SET trigger_message_id = ${id}
      WHERE builder_run_id = ${builderRunId} AND project_id = ${scope.projectId} AND state = ANY(${OPEN_RUN_STATES}::text[]) AND (trigger_message_id IS NULL OR trigger_message_id = ${id})`)
    if (bound !== 1) throw transitionRefused('message bind')
  }),
})

/** An ending without a result: the run failed, or a stop interrupted it. */
export type StoppedEnding = Exclude<RunEnding, Readonly<{ state: 'SUCCEEDED' }>>

type BuildSettlement =
  | Readonly<{ kind: 'BUILT'; builderRunId: BuilderRunId; sealed: SealedApplication }>
  | Readonly<{ kind: 'FAILED'; builderRunId: BuilderRunId; sourceRevision: SourceRevision; failureCode: FailureCode }>

export type RunSteps = Readonly<{
  /** Starts a queued run under this Hub, after the Project admits its author; a refused, unclaimed row ends FAILED. */
  claimBuilderRun(input: Readonly<{ builderRunId: BuilderRunId }>): Promise<BuilderRunSummary>
  /** Ends a run that was never claimed: only a row still queued and unowned, so a claim or a cancellation that won is left alone. */
  endUnclaimedBuilderRun(input: Readonly<{ builderRunId: BuilderRunId; projectId: ProjectId; ending: StoppedEnding }>): Promise<void>
  /** Answers the run as written, or null when a stop was requested first. */
  setBuilderRunPhase(input: Readonly<{ builderRunId: BuilderRunId; phase: BuilderRunPhase; actor: RunActor }>): Promise<BuilderRunSummary | null>
  /** Enters SOURCE_ADMISSION with the candidate about to be fast forwarded onto `main`; refused once a stop is requested. */
  recordBuilderRunCandidate(input: Readonly<{ builderRunId: BuilderRunId; accountId: AccountId; sourceRevision: SourceRevision }>): Promise<void>
  bindBuilderRunSandbox(input: Readonly<{ builderRunId: BuilderRunId; sandboxId: string }>): Promise<void>
  /** Records the model account that paid for one of the run's calls; once recorded, recording it again changes nothing. */
  recordBuilderRunModelAccount(input: Readonly<{ builderRunId: BuilderRunId; accountId: AccountId; modelAccountId: ModelAccountId }>): Promise<void>
  /** A run that changed no source ends as a response. */
  settleBuilderRun(input: Readonly<{ builderRunId: BuilderRunId }>): Promise<void>
  advanceBuilderRunSource(input: Readonly<{ builderRunId: BuilderRunId; sourceRevision: SourceRevision }>): Promise<void>
  settleBuilderRunBuild(settlement: BuildSettlement): Promise<void>
  failBuilderRun(input: Readonly<{ builderRunId: BuilderRunId; failureCode: FailureCode }>): Promise<void>
  interruptBuilderRun(input: Readonly<{ builderRunId: BuilderRunId; failureCode: InterruptionCode }>): Promise<void>
}>

const QueuedRun = z.object({ account_id: AccountId, project_id: ProjectId })
const Candidates = z.object({ state: z.enum(BUILDER_RUN_STATES), candidate_revision: SourceRevision.nullable(), result_source_revision: SourceRevision.nullable() })
type Transition = 'candidate' | 'sandbox bind' | 'model account record' | 'settlement' | 'source settlement' | 'build settlement' | 'failure' | 'interruption' | 'cancellation' | 'message bind'
/** A guarded transition that wrote nothing: the run was not in the state it needs, or the input was not what it takes. */
const transitionRefused = (transition: Transition): Failure => new Failure('BUILDER_RUN_TRANSITION_REFUSED', { details: { transition } })

const SANDBOX_ID = /^.{1,200}$/s
export const ADMISSION_REFUSALS: ReadonlySet<string> = new Set(['BUILDER_RUN_NOT_ADMITTED', 'PROJECT_BUILD_DENIED', 'ACCOUNT_INACTIVE', 'ACCOUNT_NOT_FOUND'])

// The run row is locked first, then the Project's working state: the order every settlement takes.
const lockWorking = async ({ tx, scope }: Admitted<RunScope>, transition: Transition): Promise<void> => {
  if (!await tx.maybe(Present, sql`SELECT 1 AS present FROM builder.project_working_state WHERE project_id = ${scope.projectId} FOR UPDATE`)) throw transitionRefused(transition)
}

export const createRunSteps = ({ database, ownerId, registry }: Readonly<{ database: Database; ownerId: string; registry: Pick<BuilderRegistry, 'retain'> }>): RunSteps => {
  const executor: RunActor = { via: 'executor' }
  const written = async (proof: Admitted<RunScope>, statement: ReturnType<typeof sql>, transition: Transition): Promise<void> => {
    if (await proof.tx.run(statement) !== 1) throw transitionRefused(transition)
  }
  const claim = async ({ builderRunId }: Readonly<{ builderRunId: BuilderRunId }>): Promise<BuilderRunSummary> => {
    const queued = await database.system('builder-executor', async (gate) => {
      const { tx } = await admitSystem(gate, 'builder-executor')
      return tx.maybe(QueuedRun, sql`SELECT account_id, project_id FROM builder.builder_run WHERE builder_run_id = ${builderRunId} AND state = 'QUEUED'`)
    })
    if (!queued) throw new Failure('BUILDER_RUN_NOT_ADMITTED')
    const run = await database.transaction(queued.account_id, async (gate) => {
      const project = await admitProject(gate, queued.project_id, 'project.build')
      const held = await project.tx.maybe(Present, sql`
        SELECT 1 AS present FROM builder.builder_run AS run
        WHERE run.builder_run_id = ${builderRunId} AND run.project_id = ${project.scope.projectId} AND run.account_id = ${project.scope.accountId} AND run.state = 'QUEUED' FOR UPDATE`)
      if (!held) throw new Failure('BUILDER_RUN_NOT_ADMITTED')
      return project.tx.maybe(RunRow, sql`
        UPDATE builder.builder_run AS run SET state = 'RUNNING', phase = 'PREPARING', started_at = clock_timestamp(), owner_id = ${ownerId}, heartbeat_at = clock_timestamp()
        WHERE run.builder_run_id = ${builderRunId} AND run.project_id = ${project.scope.projectId} AND run.state = 'QUEUED'
        RETURNING ${RUN_COLUMNS}`)
    }).catch((error: unknown) => { throw error instanceof Failure && ADMISSION_REFUSALS.has(error.id) ? new Failure('BUILDER_RUN_NOT_ADMITTED', { cause: error }) : error })
    if (!run) throw new Failure('BUILDER_RUN_NOT_ADMITTED')
    return runSummary(run)
  }
  return {
    claimBuilderRun: claim,
    endUnclaimedBuilderRun: ({ builderRunId, projectId, ending }) => database.system('builder-executor', async (gate) => {
      await endRun(await admitSystem(gate, 'builder-executor'), { builderRunId, projectId, ending, from: 'unclaimed' })
    }),
    setBuilderRunPhase: ({ builderRunId, phase, actor }) => withRun(database, ownerId, builderRunId, actor, async (proof) => {
      const row = await proof.tx.maybe(RunRow, sql`
        UPDATE builder.builder_run AS run SET phase = ${phase}
        WHERE run.builder_run_id = ${proof.scope.builderRunId} AND run.project_id = ${proof.scope.projectId} AND run.state = 'RUNNING' AND run.cancellation_requested_at IS NULL
        RETURNING ${RUN_COLUMNS}`)
      return row ? runSummary(row) : null
    }).catch((error: unknown) => {
      if (error instanceof Failure && error.id === 'BUILDER_RUN_NOT_ADMITTED') return null
      throw error
    }),
    recordBuilderRunCandidate: async ({ builderRunId, accountId, sourceRevision }) => {
      await withRun(database, ownerId, builderRunId, { via: 'account', accountId }, (proof) => written(proof, sql`
        UPDATE builder.builder_run AS run SET phase = 'SOURCE_ADMISSION', candidate_revision = ${sourceRevision}
        WHERE run.builder_run_id = ${proof.scope.builderRunId} AND run.project_id = ${proof.scope.projectId} AND run.state = 'RUNNING' AND run.cancellation_requested_at IS NULL
          AND (run.candidate_revision IS NULL OR run.candidate_revision = ${sourceRevision})`, 'candidate'))
    },
    bindBuilderRunSandbox: async ({ builderRunId, sandboxId }) => {
      const id = sandboxId.trim()
      if (!SANDBOX_ID.test(id)) throw transitionRefused('sandbox bind')
      await withRun(database, ownerId, builderRunId, executor, (proof) => written(proof, sql`
        UPDATE builder.builder_run AS run SET sandbox_id = ${id}
        WHERE run.builder_run_id = ${proof.scope.builderRunId} AND run.project_id = ${proof.scope.projectId} AND run.state = 'RUNNING' AND (run.sandbox_id IS NULL OR run.sandbox_id = ${id})`, 'sandbox bind'))
    },
    recordBuilderRunModelAccount: ({ builderRunId, accountId, modelAccountId }) =>
      withRun(database, ownerId, builderRunId, { via: 'account', accountId }, async (proof) => {
        const running = await proof.tx.maybe(Present, sql`
          SELECT 1 AS present FROM builder.builder_run AS run WHERE run.builder_run_id = ${proof.scope.builderRunId} AND run.project_id = ${proof.scope.projectId} AND run.state = 'RUNNING'`)
        if (!running) throw transitionRefused('model account record')
        await proof.tx.run(sql`
          INSERT INTO builder.builder_run_model_account (builder_run_id, model_account_id) VALUES (${proof.scope.builderRunId}, ${modelAccountId}) ON CONFLICT DO NOTHING`)
      }),
    settleBuilderRun: ({ builderRunId }) => withRun(database, ownerId, builderRunId, executor, async (proof) => {
      if (await endRun(proof, { ...proof.scope, ending: { state: 'SUCCEEDED', resultKind: 'RESPONSE_ONLY', failureCode: null }, from: 'withoutCandidate' }) !== 1) throw transitionRefused('settlement')
    }),
    advanceBuilderRunSource: async ({ builderRunId, sourceRevision }) => {
      await withRun(database, ownerId, builderRunId, executor, async (proof) => {
        const run = await proof.tx.maybe(Candidates, sql`
          SELECT run.state, run.candidate_revision, run.result_source_revision FROM builder.builder_run AS run WHERE run.builder_run_id = ${proof.scope.builderRunId} AND run.project_id = ${proof.scope.projectId}`)
        if (run?.state !== 'RUNNING') throw transitionRefused('source settlement')
        await lockWorking(proof, 'source settlement')
        if (run.result_source_revision === sourceRevision) return
        if (run.result_source_revision !== null || run.candidate_revision !== sourceRevision) throw transitionRefused('source settlement')
        await written(proof, sql`UPDATE builder.builder_run AS run SET result_source_revision = ${sourceRevision} WHERE run.builder_run_id = ${proof.scope.builderRunId} AND run.project_id = ${proof.scope.projectId}`, 'source settlement')
      })
    },
    settleBuilderRunBuild: (settlement) => withRun(database, ownerId, settlement.builderRunId, executor, async (proof) => {
      const run = await proof.tx.maybe(Candidates, sql`
        SELECT run.state, run.candidate_revision, run.result_source_revision FROM builder.builder_run AS run WHERE run.builder_run_id = ${proof.scope.builderRunId} AND run.project_id = ${proof.scope.projectId}`)
      const sourceRevision = settlement.kind === 'BUILT' ? settlement.sealed.sourceRevision : settlement.sourceRevision
      if (run?.state !== 'RUNNING' || run.result_source_revision !== sourceRevision) throw transitionRefused('build settlement')
      await lockWorking(proof, 'build settlement')
      if (settlement.kind === 'BUILT') {
        const retained = await registry.retain(proof, settlement.sealed)
        await proof.tx.run(sql`
          UPDATE builder.project_working_state SET current_state = 'PREVIEW_READY', last_preview_source_revision = ${sourceRevision},
            last_preview_artifact_revision_id = ${retained.artifactRevisionId}, last_preview_artifact_digest = ${retained.digest}, updated_at = clock_timestamp()
          WHERE project_id = ${proof.scope.projectId}`)
        await endRun(proof, { ...proof.scope, ending: { state: 'SUCCEEDED', resultKind: 'SOURCE_CHANGED', failureCode: null }, from: 'running' })
        return
      }
      await proof.tx.run(sql`
        UPDATE builder.project_working_state SET current_state = 'BUILD_FAILED', updated_at = clock_timestamp() WHERE project_id = ${proof.scope.projectId}`)
      await endRun(proof, { ...proof.scope, ending: { state: 'FAILED', resultKind: 'SOURCE_CHANGED_BUILD_FAILED', failureCode: settlement.failureCode }, from: 'running' })
    }),
    failBuilderRun: ({ builderRunId, failureCode }) => withRun(database, ownerId, builderRunId, executor, async (proof) => {
      if (await endRun(proof, { ...proof.scope, ending: { state: 'FAILED', resultKind: null, failureCode }, from: 'open' }) !== 1) throw transitionRefused('failure')
    }),
    interruptBuilderRun: ({ builderRunId, failureCode }) => withRun(database, ownerId, builderRunId, executor, async (proof) => {
      if (await endRun(proof, { ...proof.scope, ending: { state: 'INTERRUPTED', resultKind: null, failureCode }, from: 'open' }) !== 1) throw transitionRefused('interruption')
    }),
  }
}
