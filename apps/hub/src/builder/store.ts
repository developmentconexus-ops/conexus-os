import { randomUUID } from 'node:crypto'
import type { QueryResultRow } from 'pg'
import { canonicalBytes, sha256 } from '../../../../packages/canonical-json/src/index.mjs'
import type { BuilderRunPhase, BuilderRunResultKind, BuilderRunState } from '../generated/builder-run-vocabulary.js'
import { errorCode, type PostgresPool } from '../platform/postgres.js'

export type BuilderRunSummary = Readonly<{
  builderRunId: string
  projectId: string
  conversationId: string
  state: BuilderRunState
  phase: BuilderRunPhase | null
  baseSourceRevision: string
  resultSourceRevision: string | null
  resultKind: BuilderRunResultKind | null
  failureCode: string | null
  requestText: string | null
  createdAt: string
  cancellationRequested?: boolean
}>
type BuilderCodeChangingRun = Readonly<{
  builderRunId: string
  projectId: string
  conversationId: string
  baseSourceRevision: string
  resultSourceRevision: string
  resultKind: Exclude<BuilderRunResultKind, 'RESPONSE_ONLY'>
}>
// The Preview a Project serves. `main` is not here: the Conexus Git holds it.
type BuilderPreview = Readonly<{
  lastPreviewSourceRevision: string | null
  lastPreviewArtifactRevisionId: string | null
  lastPreviewArtifactDigest: string | null
}>
type JsonRow<T> = QueryResultRow & Readonly<{ value: T }>

/** A queued or working run a sweep took over from an owner that went quiet. */
export type TakenOverRun = Readonly<{
  builderRunId: string
  projectId: string
  conversationId: string
  /** Claimed by a leg, so its agent may have left a question on the thread. */
  started: boolean
  /** Offered before `main` moved; `main` in the Conexus Git says whether it was admitted. */
  candidateRevision: string | null
  // Equal to the candidate once the advance is recorded.
  resultSourceRevision: string | null
  previousOwnerId: string | null
}>

export type BuilderStore = Readonly<{
  // Takes the Project's run lock, reads the base with readBase while holding it, and inserts the run
  // on that base, all in one transaction.
  createBuilderRun(input: Readonly<{ accountId: string; projectId: string; conversationId: string; idempotencyKey: string; content: string; readBase(): Promise<string> }>): Promise<BuilderRunSummary>
  readBuilderRun(input: Readonly<{ accountId: string; projectId: string }>): Promise<BuilderRunSummary | null>
  listBuilderRuns(input: Readonly<{ accountId: string; projectId: string; limit?: number }>): Promise<readonly BuilderRunSummary[]>
  readLatestCodeChangingBuilderRun(input: Readonly<{ accountId: string; projectId: string }>): Promise<BuilderCodeChangingRun | null>
  // Starts a queued run under its owner, the Hub process whose leg works it.
  claimBuilderRun(builderRunId: string, ownerId: string): Promise<BuilderRunSummary>
  // Takes a PARKED run back to PREPARING under its owner for the answer; null when the run is not parked, which is how a second answer is told.
  resumeBuilderRun(builderRunId: string, ownerId: string): Promise<BuilderRunSummary | null>
  setBuilderRunPhase(builderRunId: string, phase: BuilderRunPhase): Promise<void>
  // Enters SOURCE_ADMISSION with the candidate about to be fast forwarded onto `main`; refused once a stop is requested.
  recordBuilderRunCandidate(builderRunId: string, sourceRevision: string): Promise<void>
  bindBuilderRunMessage(builderRunId: string, messageId: string): Promise<void>
  bindBuilderRunSandbox(builderRunId: string, sandboxId: string): Promise<void>
  recordBuilderRunModelAccount(builderRunId: string, modelAccountId: string): Promise<void>
  settleBuilderRun(input: Readonly<{ builderRunId: string; resultSourceRevision: null; resultKind: 'RESPONSE_ONLY'; failureCode: null }>): Promise<void>
  advanceBuilderRunSource(builderRunId: string, sourceRevision: string): Promise<void>
  settleBuilderRunBuild(input: Readonly<{ builderRunId: string; sourceRevision: string; artifactRevisionId?: string; artifactDigest?: string; failureCode?: string }>): Promise<void>
  failBuilderRun(builderRunId: string, failureCode: string): Promise<void>
  requestBuilderRunCancellation(input: Readonly<{ accountId: string; projectId: string; builderRunId: string }>): Promise<BuilderRunSummary>
  interruptBuilderRun(builderRunId: string, reason: string): Promise<void>
  readPreviewSubject(input: Readonly<{ accountId: string; projectId: string }>): Promise<BuilderPreview | null>
  // mainRevision is `main` as the Hub just read it from the Conexus Git.
  admitSourceRevision(input: Readonly<{ accountId: string; projectId: string; sourceRevision: string; mainRevision: string | null }>): Promise<boolean>
  heartbeatBuilderRuns(ownerId: string, builderRunIds: readonly string[]): Promise<void>
  // Takes over the queued and working runs whose owner's heartbeat is older than the limit; a parked run has no owner and is never taken.
  takeOverStaleBuilderRuns(ownerId: string, staleAfterMs: number): Promise<readonly TakenOverRun[]>
  // Interrupts the runs parked for longer than the limit with BUILDER_RUN_PARKED_EXPIRED, answering each as it ended.
  expireParkedBuilderRuns(idleMs: number): Promise<readonly BuilderRunSummary[]>
  // Upserts the conversation's working state outside any one turn; the Git ref stays the mirror's truth.
  recordConversationSession(input: Readonly<{ projectId: string; conversationId: string; mirrorHead: string; syncedMain?: string; turnEnded: boolean }>): Promise<void>
  // The E2B sandbox a conversation's turns resume, by its provider id.
  recordConversationSandbox(input: Readonly<{ projectId: string; conversationId: string; providerSandboxId: string }>): Promise<void>
  readConversationSandbox(input: Readonly<{ projectId: string; conversationId: string }>): Promise<string | null>
  readProjectSandboxes(projectId: string): Promise<readonly string[]>
  readOpenRunConversations(): Promise<ReadonlySet<string>>
  close(): Promise<void>
}>

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: debt: owning wave
export const createBuilderStore = ({
  ingressPool,
  executorPool,
  mintIdentity = randomUUID,
}: Readonly<{
  ingressPool: PostgresPool
  executorPool: PostgresPool
  mintIdentity?: () => string
}>): BuilderStore => Object.freeze({
  createBuilderRun: async ({ accountId, projectId, conversationId, idempotencyKey, content, readBase }) => {
    const request = { content }
    const client = await ingressPool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SELECT builder.lock_project_for_run($1,$2)', [accountId, projectId])
      const base = await readBase()
      const result = await client.query<JsonRow<BuilderRunSummary>>(
        'SELECT builder.create_builder_run($1,$2,$3,$4,$5,$6,$7,$8,$9) AS value',
        [accountId, projectId, conversationId, sha256(Buffer.from(idempotencyKey, 'utf8')), sha256(canonicalBytes(request)), content, null, mintIdentity(), base],
      )
      await client.query('COMMIT')
      const value = result.rows[0]?.value
      if (!value) throw new Error('BUILDER_RUN_CREATE_FAILED')
      return value
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
  },
  readBuilderRun: async ({ accountId, projectId }) => {
    const result = await ingressPool.query<JsonRow<BuilderRunSummary | null>>(
      'SELECT builder.read_builder_run($1,$2) AS value', [accountId, projectId],
    )
    return result.rows[0]?.value ?? null
  },
  listBuilderRuns: async ({ accountId, projectId, limit = 20 }) => {
    const result = await ingressPool.query<JsonRow<readonly BuilderRunSummary[]>>(
      'SELECT builder.list_builder_runs($1,$2,$3) AS value', [accountId, projectId, limit],
    )
    return result.rows[0]?.value ?? []
  },
  readLatestCodeChangingBuilderRun: async ({ accountId, projectId }) => {
    const result = await ingressPool.query<JsonRow<BuilderCodeChangingRun | null>>(
      'SELECT builder.read_latest_code_changing_builder_run($1,$2) AS value', [accountId, projectId],
    )
    return result.rows[0]?.value ?? null
  },
  claimBuilderRun: async (builderRunId, ownerId) => {
    // A claim asks for authority the run's author may no longer hold. That is terminal. The outer
    // dispatch catch fails the run, and no retry can recover an access that was taken away.
    const result = await executorPool.query<JsonRow<BuilderRunSummary>>(
      'SELECT builder.claim_builder_run($1,$2) AS value', [builderRunId, ownerId],
    ).catch((error: unknown) => {
      if (errorCode(error) === '42501') {
        throw new Error('BUILDER_RUN_NOT_ADMITTED')
      }
      throw error
    })
    const value = result.rows[0]?.value
    if (!value || value.builderRunId !== builderRunId || value.state !== 'RUNNING') throw new Error('BUILDER_RUN_CLAIM_REFUSED')
    return value
  },
  resumeBuilderRun: async (builderRunId, ownerId) => {
    const result = await executorPool.query<JsonRow<BuilderRunSummary | null>>(
      'SELECT builder.resume_builder_run($1,$2) AS value', [builderRunId, ownerId],
    )
    return result.rows[0]?.value ?? null
  },
  setBuilderRunPhase: async (builderRunId, phase) => {
    const result = await executorPool.query<{ value: boolean }>(
      'SELECT builder.set_builder_run_phase($1,$2) AS value', [builderRunId, phase],
    )
    if (result.rows[0]?.value !== true) throw new Error('BUILDER_RUN_PHASE_UPDATE_REFUSED')
  },
  recordBuilderRunCandidate: async (builderRunId, sourceRevision) => {
    const result = await executorPool.query<{ value: boolean }>(
      'SELECT builder.record_builder_run_candidate($1,$2) AS value', [builderRunId, sourceRevision],
    )
    if (result.rows[0]?.value !== true) throw new Error('BUILDER_RUN_CANDIDATE_REFUSED')
  },
  bindBuilderRunMessage: async (builderRunId, messageId) => {
    const result = await executorPool.query<{ value: boolean }>(
      'SELECT builder.bind_builder_run_message($1,$2) AS value', [builderRunId, messageId],
    )
    if (result.rows[0]?.value !== true) throw new Error('BUILDER_RUN_MESSAGE_BIND_REFUSED')
  },
  bindBuilderRunSandbox: async (builderRunId, sandboxId) => {
    const result = await executorPool.query<{ value: boolean }>(
      'SELECT builder.bind_builder_run_sandbox($1,$2) AS value', [builderRunId, sandboxId],
    )
    if (result.rows[0]?.value !== true) throw new Error('BUILDER_RUN_SANDBOX_BIND_REFUSED')
  },
  recordBuilderRunModelAccount: async (builderRunId, modelAccountId) => {
    const result = await executorPool.query<{ value: boolean }>(
      'SELECT builder.record_builder_run_model_account($1,$2) AS value', [builderRunId, modelAccountId],
    )
    if (result.rows[0]?.value !== true) throw new Error('BUILDER_RUN_MODEL_ACCOUNT_RECORD_REFUSED')
  },
  settleBuilderRun: async ({ builderRunId, resultSourceRevision, resultKind, failureCode }) => {
    const result = await executorPool.query<{ value: boolean }>(
      'SELECT builder.settle_builder_run($1,$2,$3,$4) AS value', [builderRunId, resultSourceRevision, resultKind, failureCode],
    )
    if (result.rows[0]?.value !== true) throw new Error('BUILDER_RUN_SETTLEMENT_REFUSED')
  },
  advanceBuilderRunSource: async (builderRunId, sourceRevision) => {
    const result = await executorPool.query<{ value: boolean }>(
      'SELECT builder.advance_builder_run_source($1,$2) AS value', [builderRunId, sourceRevision],
    )
    if (result.rows[0]?.value !== true) throw new Error('BUILDER_RUN_SOURCE_SETTLEMENT_REFUSED')
  },
  settleBuilderRunBuild: async ({ builderRunId, sourceRevision, artifactRevisionId, artifactDigest, failureCode }) => {
    const result = await executorPool.query<{ value: boolean }>(
      'SELECT builder.settle_builder_run_build($1,$2,$3,$4,$5) AS value',
      [builderRunId, sourceRevision, artifactRevisionId ?? null, artifactDigest ?? null, failureCode ?? null],
    )
    if (result.rows[0]?.value !== true) throw new Error('BUILDER_RUN_BUILD_SETTLEMENT_REFUSED')
  },
  failBuilderRun: async (builderRunId, failureCode) => {
    const result = await executorPool.query<{ value: boolean }>(
      'SELECT builder.fail_builder_run($1,$2) AS value', [builderRunId, failureCode],
    )
    if (result.rows[0]?.value !== true) throw new Error('BUILDER_RUN_FAILURE_REFUSED')
  },
  requestBuilderRunCancellation: async ({ accountId, projectId, builderRunId }) => {
    const result = await ingressPool.query<JsonRow<BuilderRunSummary>>(
      'SELECT builder.request_builder_run_cancellation($1,$2,$3) AS value', [accountId, projectId, builderRunId],
    )
    const value = result.rows[0]?.value
    if (!value) throw new Error('BUILDER_RUN_CANCELLATION_REFUSED')
    return value
  },
  interruptBuilderRun: async (builderRunId, reason) => {
    const result = await executorPool.query<{ value: boolean }>(
      'SELECT builder.interrupt_builder_run($1,$2) AS value', [builderRunId, reason],
    )
    if (result.rows[0]?.value !== true) throw new Error('BUILDER_RUN_INTERRUPTION_REFUSED')
  },
  readPreviewSubject: async ({ accountId, projectId }) => {
    const result = await ingressPool.query<JsonRow<BuilderPreview | null>>(
      'SELECT builder.read_preview_subject($1,$2) AS value', [accountId, projectId],
    )
    return result.rows[0]?.value ?? null
  },
  admitSourceRevision: async ({ accountId, projectId, sourceRevision, mainRevision }) => {
    const result = await ingressPool.query<QueryResultRow & Readonly<{ admitted: boolean }>>(
      'SELECT builder.admit_source_revision($1,$2,$3,$4) AS admitted', [accountId, projectId, sourceRevision, mainRevision],
    )
    return result.rows[0]?.admitted === true
  },
  heartbeatBuilderRuns: async (ownerId, builderRunIds) => {
    await executorPool.query('SELECT builder.heartbeat_builder_runs($1,$2)', [ownerId, builderRunIds])
  },
  takeOverStaleBuilderRuns: async (ownerId, staleAfterMs) => {
    const result = await executorPool.query<JsonRow<readonly TakenOverRun[]>>('SELECT builder.take_over_stale_builder_runs($1,$2) AS value', [ownerId, staleAfterMs])
    return result.rows[0]?.value ?? []
  },
  expireParkedBuilderRuns: async (idleMs) => {
    const result = await executorPool.query<JsonRow<readonly BuilderRunSummary[]>>('SELECT builder.expire_parked_builder_runs($1) AS value', [idleMs])
    return result.rows[0]?.value ?? []
  },
  recordConversationSession: async ({ projectId, conversationId, mirrorHead, syncedMain, turnEnded }) => {
    await executorPool.query(
      'SELECT builder.record_conversation_session($1,$2,$3,$4,$5)', [projectId, conversationId, mirrorHead, syncedMain ?? null, turnEnded],
    )
  },
  recordConversationSandbox: async ({ projectId, conversationId, providerSandboxId }) => {
    await executorPool.query('SELECT builder.record_conversation_sandbox($1,$2,$3)', [projectId, conversationId, providerSandboxId])
  },
  readConversationSandbox: async ({ projectId, conversationId }) => {
    const result = await executorPool.query<Readonly<{ value: string | null }>>('SELECT builder.read_conversation_sandbox($1,$2) AS value', [projectId, conversationId])
    return result.rows[0]?.value ?? null
  },
  readProjectSandboxes: async (projectId) => {
    const result = await executorPool.query<Readonly<{ value: string[] }>>('SELECT builder.read_project_sandboxes($1) AS value', [projectId])
    return result.rows[0]?.value ?? []
  },
  readOpenRunConversations: async () => {
    const result = await executorPool.query<Readonly<{ value: string[] }>>('SELECT builder.read_open_run_conversations() AS value')
    return new Set(result.rows[0]?.value ?? [])
  },
  close: async () => { await Promise.all([ingressPool.end(), executorPool.end()]) },
})
