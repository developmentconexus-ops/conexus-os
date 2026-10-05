import { z } from 'zod'
import { AccountId, ArtifactRevisionId, ProjectId, SourceRevision, type BuilderRunId, type ModelAccountId } from '../../../../packages/contract/dist/index.js'
import { admitProject, admitSystem, type Admitted, type RunScope, type SystemScope } from '../identity-access/admission.js'
import type { BuilderRunPhase } from '../generated/builder-run-vocabulary.js'
import { sql, type Database } from '../platform/db.js'
import { Failure, type FailureCode } from '../platform/failure.js'
import { OPEN_RUN_STATES, RUN_COLUMNS, RunRow, runSummary, type BuilderRunSummary } from './run-row.js'
import { unlessNotAdmitted, withRun, type RunActor } from './run-access.js'

/** How a run ends without failing: the person's stop, a Hub that stopped, or a question nobody answered. */
export type InterruptionCode = Extract<FailureCode, 'USER_CANCELLED' | 'HUB_RESTART' | 'BUILDER_QUESTION_EXPIRED'>

/** How a run no claim reached ends: a refused claim fails it, a stop interrupts it. */
export type UnclaimedEnding = Readonly<{ kind: 'FAILED'; code: FailureCode }> | Readonly<{ kind: 'INTERRUPTED'; code: InterruptionCode }>

/** What the Preview build of an admitted source came to: the artifact the registry holds, or the code the build failed with. */
type BuildSettlement = Readonly<{ builderRunId: BuilderRunId; sourceRevision: SourceRevision }> & (
  | Readonly<{ kind: 'BUILT'; artifactRevisionId: string; artifactDigest: string }>
  | Readonly<{ kind: 'FAILED'; failureCode: FailureCode }>
)

export type RunSteps = Readonly<{
  /** Starts a queued run under this Hub, after the Project admits its author; a refused, unclaimed row ends FAILED. */
  claimBuilderRun(builderRunId: BuilderRunId): Promise<BuilderRunSummary>
  /** Ends a run that was never claimed: only a row still queued and unowned, so a claim or a cancellation that won is left alone. */
  endUnclaimedBuilderRun(builderRunId: BuilderRunId, ending: UnclaimedEnding): Promise<void>
  /** Answers the run as written, or null when a stop was requested first. */
  setBuilderRunPhase(builderRunId: BuilderRunId, phase: BuilderRunPhase, actor: RunActor): Promise<BuilderRunSummary | null>
  /** Enters SOURCE_ADMISSION with the candidate about to be fast forwarded onto `main`; refused once a stop is requested. */
  recordBuilderRunCandidate(input: Readonly<{ builderRunId: BuilderRunId; accountId: AccountId; sourceRevision: string }>): Promise<void>
  bindBuilderRunSandbox(builderRunId: BuilderRunId, sandboxId: string): Promise<void>
  /** Records the model account that paid for one of the run's calls; once recorded, recording it again changes nothing. */
  recordBuilderRunModelAccount(input: Readonly<{ builderRunId: BuilderRunId; accountId: AccountId; modelAccountId: ModelAccountId }>): Promise<void>
  /** A run that changed no source ends as a response. */
  settleBuilderRun(builderRunId: BuilderRunId): Promise<void>
  advanceBuilderRunSource(builderRunId: BuilderRunId, sourceRevision: string): Promise<void>
  settleBuilderRunBuild(settlement: BuildSettlement): Promise<void>
  failBuilderRun(builderRunId: BuilderRunId, failureCode: FailureCode): Promise<void>
  interruptBuilderRun(builderRunId: BuilderRunId, reason: InterruptionCode): Promise<void>
}>

const QueuedRun = z.object({ account_id: AccountId, project_id: ProjectId })
const Present = z.object({ present: z.literal(1) })
const Matches = z.object({ matches: z.boolean() })
const Candidates = z.object({ state: z.string(), candidate_revision: SourceRevision.nullable(), result_source_revision: SourceRevision.nullable() })
const SANDBOX_ID = /^.{1,200}$/s
const ADMISSION_REFUSALS: ReadonlySet<string> = new Set(['BUILDER_RUN_NOT_ADMITTED', 'PROJECT_BUILD_DENIED', 'ACCOUNT_INACTIVE', 'ACCOUNT_NOT_FOUND'])

const refusedWith = (code: FailureCode) => (error: unknown): never => {
  throw error instanceof Failure && error.id === 'BUILDER_RUN_NOT_ADMITTED' ? new Failure(code, { cause: error }) : error
}

// Every transition that leaves RUNNING or asks for a stop writes a null phase: the CHECK allows a phase only on a running, uncancelled run.
// The run row is locked first, then the Project's working state: the order every settlement takes.
const lockWorking = async ({ tx, scope }: Admitted<RunScope>, refusal: FailureCode): Promise<void> => {
  if (!await tx.maybe(Present, sql`SELECT 1 AS present FROM builder.project_working_state WHERE project_id = ${scope.projectId} FOR UPDATE`)) throw new Failure(refusal)
}

export const createRunSteps = ({ database, ownerId }: Readonly<{ database: Database; ownerId: string }>): RunSteps => {
  const act = <T>(builderRunId: BuilderRunId, actor: RunActor, work: (proof: Admitted<RunScope>) => Promise<T>) => withRun(database, ownerId, builderRunId, actor, work)
  const executor: RunActor = { via: 'executor' }
  const written = async (proof: Admitted<RunScope>, statement: ReturnType<typeof sql>, code: FailureCode): Promise<void> => {
    if (await proof.tx.run(statement) !== 1) throw new Failure(code)
  }
  const claim = async (builderRunId: BuilderRunId): Promise<BuilderRunSummary> => {
    const queued = await database.system('builder-executor', async (gate) => {
      const { tx } = await admitSystem(gate, 'builder-executor')
      return tx.maybe(QueuedRun, sql`SELECT account_id, project_id FROM builder.builder_run WHERE builder_run_id = ${builderRunId} AND state = 'QUEUED'`)
    })
    if (!queued) throw new Failure('BUILDER_RUN_CLAIM_REFUSED')
    const run = await database.transaction(queued.account_id, async (gate) => {
      const project = await admitProject(gate, queued.project_id, 'project.build')
      const held = await project.tx.maybe(Present, sql`
        SELECT 1 AS present FROM builder.builder_run AS run
        WHERE run.builder_run_id = ${builderRunId} AND run.project_id = ${project.scope.projectId} AND run.account_id = ${project.scope.accountId} AND run.state = 'QUEUED' FOR UPDATE`)
      if (!held) throw new Failure('BUILDER_RUN_CLAIM_REFUSED')
      return project.tx.maybe(RunRow, sql`
        UPDATE builder.builder_run AS run SET state = 'RUNNING', phase = 'PREPARING', started_at = clock_timestamp(), owner_id = ${ownerId}, heartbeat_at = clock_timestamp()
        WHERE run.builder_run_id = ${builderRunId} AND run.project_id = ${project.scope.projectId} AND run.state = 'QUEUED'
        RETURNING ${RUN_COLUMNS}`)
    }).catch((error: unknown) => { throw error instanceof Failure && ADMISSION_REFUSALS.has(error.id) ? new Failure('BUILDER_RUN_NOT_ADMITTED', { cause: error }) : error })
    if (!run) throw new Failure('BUILDER_RUN_CLAIM_REFUSED')
    return runSummary(run)
  }
  return {
    claimBuilderRun: claim,
    endUnclaimedBuilderRun: (builderRunId, ending) => database.system('builder-executor', async (gate) => {
      await endUnclaimed(await admitSystem(gate, 'builder-executor'), builderRunId, ending)
    }),
    setBuilderRunPhase: (builderRunId, phase, actor) => act(builderRunId, actor, async (proof) => {
      const row = await proof.tx.maybe(RunRow, sql`
        UPDATE builder.builder_run AS run SET phase = ${phase}
        WHERE run.builder_run_id = ${proof.scope.builderRunId} AND run.project_id = ${proof.scope.projectId} AND run.state = 'RUNNING' AND run.cancellation_requested_at IS NULL
        RETURNING ${RUN_COLUMNS}`)
      return row ? runSummary(row) : null
    }).catch(unlessNotAdmitted(null)),
    recordBuilderRunCandidate: async ({ builderRunId, accountId, sourceRevision }) => {
      const candidate = SourceRevision.safeParse(sourceRevision)
      if (!candidate.success) throw new Failure('BUILDER_RUN_CANDIDATE_REFUSED')
      await act(builderRunId, { via: 'account', accountId }, (proof) => written(proof, sql`
        UPDATE builder.builder_run AS run SET phase = 'SOURCE_ADMISSION', candidate_revision = ${candidate.data}
        WHERE run.builder_run_id = ${proof.scope.builderRunId} AND run.project_id = ${proof.scope.projectId} AND run.state = 'RUNNING' AND run.cancellation_requested_at IS NULL
          AND (run.candidate_revision IS NULL OR run.candidate_revision = ${candidate.data})`, 'BUILDER_RUN_CANDIDATE_REFUSED'))
        .catch(refusedWith('BUILDER_RUN_CANDIDATE_REFUSED'))
    },
    bindBuilderRunSandbox: async (builderRunId, sandboxId) => {
      const id = sandboxId.trim()
      if (!SANDBOX_ID.test(id)) throw new Failure('BUILDER_RUN_SANDBOX_BIND_REFUSED')
      await act(builderRunId, executor, (proof) => written(proof, sql`
        UPDATE builder.builder_run AS run SET sandbox_id = ${id}
        WHERE run.builder_run_id = ${proof.scope.builderRunId} AND run.project_id = ${proof.scope.projectId} AND run.state = 'RUNNING' AND (run.sandbox_id IS NULL OR run.sandbox_id = ${id})`, 'BUILDER_RUN_SANDBOX_BIND_REFUSED'))
        .catch(refusedWith('BUILDER_RUN_SANDBOX_BIND_REFUSED'))
    },
    recordBuilderRunModelAccount: ({ builderRunId, accountId, modelAccountId }) =>
      act(builderRunId, { via: 'account', accountId }, async (proof) => {
        const running = await proof.tx.maybe(Present, sql`
          SELECT 1 AS present FROM builder.builder_run AS run WHERE run.builder_run_id = ${proof.scope.builderRunId} AND run.project_id = ${proof.scope.projectId} AND run.state = 'RUNNING'`)
        if (!running) throw new Failure('BUILDER_RUN_MODEL_ACCOUNT_RECORD_REFUSED')
        await proof.tx.run(sql`
          INSERT INTO builder.builder_run_model_account (builder_run_id, model_account_id) VALUES (${proof.scope.builderRunId}, ${modelAccountId}) ON CONFLICT DO NOTHING`)
      }).catch(refusedWith('BUILDER_RUN_MODEL_ACCOUNT_RECORD_REFUSED')),
    settleBuilderRun: (builderRunId) => act(builderRunId, executor, (proof) => written(proof, sql`
      UPDATE builder.builder_run AS run SET state = 'SUCCEEDED', phase = NULL, result_source_revision = NULL, result_kind = 'RESPONSE_ONLY', failure_code = NULL, finished_at = clock_timestamp()
      WHERE run.builder_run_id = ${proof.scope.builderRunId} AND run.project_id = ${proof.scope.projectId} AND run.state = 'RUNNING' AND run.candidate_revision IS NULL`, 'BUILDER_RUN_SETTLEMENT_REFUSED'))
      .catch(refusedWith('BUILDER_RUN_SETTLEMENT_REFUSED')),
    advanceBuilderRunSource: async (builderRunId, sourceRevision) => {
      const revision = SourceRevision.safeParse(sourceRevision)
      if (!revision.success) throw new Failure('BUILDER_RUN_SOURCE_SETTLEMENT_REFUSED')
      await act(builderRunId, executor, async (proof) => {
        const run = await proof.tx.maybe(Candidates, sql`
          SELECT run.state, run.candidate_revision, run.result_source_revision FROM builder.builder_run AS run WHERE run.builder_run_id = ${proof.scope.builderRunId} AND run.project_id = ${proof.scope.projectId}`)
        if (run?.state !== 'RUNNING') throw new Failure('BUILDER_RUN_SOURCE_SETTLEMENT_REFUSED')
        await lockWorking(proof, 'BUILDER_RUN_SOURCE_SETTLEMENT_REFUSED')
        if (run.result_source_revision === revision.data) return
        if (run.result_source_revision !== null || run.candidate_revision !== revision.data) throw new Failure('BUILDER_RUN_SOURCE_SETTLEMENT_REFUSED')
        await written(proof, sql`UPDATE builder.builder_run AS run SET result_source_revision = ${revision.data} WHERE run.builder_run_id = ${proof.scope.builderRunId} AND run.project_id = ${proof.scope.projectId}`, 'BUILDER_RUN_SOURCE_SETTLEMENT_REFUSED')
      }).catch(refusedWith('BUILDER_RUN_SOURCE_SETTLEMENT_REFUSED'))
    },
    settleBuilderRunBuild: (settlement) => act(settlement.builderRunId, executor, async (proof) => {
      const run = await proof.tx.maybe(Candidates, sql`
        SELECT run.state, run.candidate_revision, run.result_source_revision FROM builder.builder_run AS run WHERE run.builder_run_id = ${proof.scope.builderRunId} AND run.project_id = ${proof.scope.projectId}`)
      if (run?.state !== 'RUNNING' || run.result_source_revision !== settlement.sourceRevision) throw new Failure('BUILDER_RUN_BUILD_SETTLEMENT_REFUSED')
      await lockWorking(proof, 'BUILDER_RUN_BUILD_SETTLEMENT_REFUSED')
      if (settlement.kind === 'BUILT') {
        const artifact = ArtifactRevisionId.safeParse(settlement.artifactRevisionId)
        if (!artifact.success || !/^[0-9a-f]{64}$/.test(settlement.artifactDigest)) throw new Failure('BUILDER_RUN_BUILD_SETTLEMENT_REFUSED')
        const matches = await proof.tx.one(Matches, sql`
          SELECT reg.matches_application_artifact(${proof.scope.projectId}, ${settlement.sourceRevision}, ${artifact.data}, ${settlement.artifactDigest}) AS matches`, 'INTERNAL_UNEXPECTED')
        if (!matches.matches) throw new Failure('BUILDER_RUN_BUILD_SETTLEMENT_REFUSED')
        await proof.tx.run(sql`
          UPDATE builder.project_working_state SET current_state = 'PREVIEW_READY', last_preview_source_revision = ${settlement.sourceRevision},
            last_preview_artifact_revision_id = ${artifact.data}, last_preview_artifact_digest = ${settlement.artifactDigest}, updated_at = clock_timestamp()
          WHERE project_id = ${proof.scope.projectId}`)
        await proof.tx.run(sql`
          UPDATE builder.builder_run AS run SET state = 'SUCCEEDED', phase = NULL, result_kind = 'SOURCE_CHANGED', failure_code = NULL, finished_at = clock_timestamp()
          WHERE run.builder_run_id = ${proof.scope.builderRunId} AND run.project_id = ${proof.scope.projectId}`)
        return
      }
      await proof.tx.run(sql`
        UPDATE builder.project_working_state SET current_state = 'BUILD_FAILED', updated_at = clock_timestamp() WHERE project_id = ${proof.scope.projectId}`)
      await proof.tx.run(sql`
        UPDATE builder.builder_run AS run SET state = 'FAILED', phase = NULL, result_kind = 'SOURCE_CHANGED_BUILD_FAILED', failure_code = ${settlement.failureCode}, finished_at = clock_timestamp()
        WHERE run.builder_run_id = ${proof.scope.builderRunId} AND run.project_id = ${proof.scope.projectId}`)
    }).catch(refusedWith('BUILDER_RUN_BUILD_SETTLEMENT_REFUSED')),
    failBuilderRun: (builderRunId, failureCode) => act(builderRunId, executor, (proof) => written(proof, sql`
      UPDATE builder.builder_run AS run SET state = 'FAILED', phase = NULL, failure_code = ${failureCode}, finished_at = clock_timestamp()
      WHERE run.builder_run_id = ${proof.scope.builderRunId} AND run.project_id = ${proof.scope.projectId} AND run.state = ANY(${OPEN_RUN_STATES}::text[])`, 'BUILDER_RUN_FAILURE_REFUSED'))
      .catch(refusedWith('BUILDER_RUN_FAILURE_REFUSED')),
    interruptBuilderRun: (builderRunId, reason) => act(builderRunId, executor, (proof) => written(proof, sql`
      UPDATE builder.builder_run AS run SET state = 'INTERRUPTED', phase = NULL, failure_code = ${reason},
        cancellation_requested_at = COALESCE(run.cancellation_requested_at, clock_timestamp()), cancellation_reason = COALESCE(run.cancellation_reason, ${reason}), finished_at = clock_timestamp()
      WHERE run.builder_run_id = ${proof.scope.builderRunId} AND run.project_id = ${proof.scope.projectId} AND run.state = ANY(${OPEN_RUN_STATES}::text[])`, 'BUILDER_RUN_INTERRUPTION_REFUSED'))
      .catch(refusedWith('BUILDER_RUN_INTERRUPTION_REFUSED')),
  }
}

/** The one transition of a run no executor owns yet: a still queued, unowned row ends; zero rows means a claim or a cancellation won. A stop keeps the first cancellation time and reason. */
const endUnclaimed = async ({ tx }: Admitted<SystemScope<'builder-executor'>>, builderRunId: BuilderRunId, ending: UnclaimedEnding): Promise<void> => {
  if (ending.kind === 'FAILED') {
    await tx.run(sql`
      UPDATE builder.builder_run SET state = 'FAILED', phase = NULL, failure_code = ${ending.code}, finished_at = clock_timestamp()
      WHERE builder_run_id = ${builderRunId} AND state = 'QUEUED' AND owner_id IS NULL`)
    return
  }
  await tx.run(sql`
    UPDATE builder.builder_run SET state = 'INTERRUPTED', phase = NULL, failure_code = ${ending.code},
      cancellation_requested_at = COALESCE(cancellation_requested_at, clock_timestamp()), cancellation_reason = COALESCE(cancellation_reason, ${ending.code}), finished_at = clock_timestamp()
    WHERE builder_run_id = ${builderRunId} AND state = 'QUEUED' AND owner_id IS NULL`)
}
