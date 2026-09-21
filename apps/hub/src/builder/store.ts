import { randomUUID } from 'node:crypto'
import type { QueryResultRow } from 'pg'
import { canonicalBytes, sha256 } from '../../../../packages/canonical-json/src/index.mjs'
import type { PostgresPool } from '../platform/postgres.js'
import type { BuilderPreviewSubject } from './preview.js'

export type BuilderRunningPhase = 'PREPARING' | 'AGENT' | 'SOURCE_ADMISSION' | 'COMPILING' | 'FINALIZING'
export type BuilderRunPhase = BuilderRunningPhase | 'SUCCEEDED' | 'FAILED' | 'INTERRUPTED'

export type BuilderRunSummary = Readonly<{
  builderRunId: string
  projectId: string
  conversationId: string
  state: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'INTERRUPTED'
  phase: BuilderRunningPhase | null
  mode: 'BUILD' | 'PLAN'
  baseSourceRevision: string
  resultSourceRevision: string | null
  resultKind: 'RESPONSE_ONLY' | 'SOURCE_CHANGED' | 'SOURCE_CHANGED_BUILD_FAILED' | null
  failureCode: string | null
  requestText: string | null
  createdAt: string
  cancellationRequested?: boolean
}>
export type BuilderCodeChangingRun = Readonly<{
  builderRunId: string
  projectId: string
  conversationId: string
  baseSourceRevision: string
  resultSourceRevision: string
  resultKind: 'SOURCE_CHANGED' | 'SOURCE_CHANGED_BUILD_FAILED'
}>
export type BuilderWorkingPreviewSubject = BuilderPreviewSubject & Readonly<{
  previewEligible: boolean
  workingSourceRevision: string
  lastPreviewSourceRevision: string | null
}>
type JsonRow<T> = QueryResultRow & Readonly<{ value: T }>

export type BuilderStore = Readonly<{
  createBuilderRun(input: Readonly<{ accountId: string; projectId: string; conversationId: string; idempotencyKey: string; content: string; mode: 'BUILD' | 'PLAN' }>): Promise<BuilderRunSummary>
  readBuilderRun(input: Readonly<{ accountId: string; projectId: string }>): Promise<BuilderRunSummary | null>
  listBuilderRuns(input: Readonly<{ accountId: string; projectId: string; limit?: number }>): Promise<readonly BuilderRunSummary[]>
  readLatestCodeChangingBuilderRun(input: Readonly<{ accountId: string; projectId: string }>): Promise<BuilderCodeChangingRun | null>
  claimBuilderRun(builderRunId: string): Promise<BuilderRunSummary>
  setBuilderRunPhase(builderRunId: string, phase: BuilderRunPhase): Promise<void>
  bindBuilderRunMessage(builderRunId: string, messageId: string): Promise<void>
  bindBuilderRunSandbox(builderRunId: string, sandboxId: string): Promise<void>
  settleBuilderRun(input: Readonly<{ builderRunId: string; resultSourceRevision: null; resultKind: 'RESPONSE_ONLY'; failureCode: null }>): Promise<void>
  advanceBuilderRunSource(builderRunId: string, sourceRevision: string): Promise<void>
  settleBuilderRunBuild(input: Readonly<{ builderRunId: string; sourceRevision: string; artifactRevisionId?: string; artifactDigest?: string; failureCode?: string }>): Promise<void>
  failBuilderRun(builderRunId: string, failureCode: string): Promise<void>
  requestBuilderRunCancellation(input: Readonly<{ accountId: string; projectId: string; builderRunId: string }>): Promise<BuilderRunSummary>
  interruptBuilderRun(builderRunId: string, reason: string): Promise<void>
  readPreviewSubject(input: Readonly<{ accountId: string; projectId: string }>): Promise<BuilderWorkingPreviewSubject | null>
  admitSourceRevision(input: Readonly<{ accountId: string; projectId: string; sourceRevision: string }>): Promise<boolean>
  recoverAndListQueuedBuilderRuns(): Promise<readonly string[]>
  close(): Promise<void>
}>

export const createBuilderStore = ({
  ingressPool,
  executorPool,
  mintIdentity = randomUUID,
}: Readonly<{
  ingressPool: PostgresPool
  executorPool: PostgresPool
  mintIdentity?: () => string
}>): BuilderStore => Object.freeze({
  createBuilderRun: async ({ accountId, projectId, conversationId, idempotencyKey, content, mode }) => {
    const request = { mode, content }
    const result = await ingressPool.query<JsonRow<BuilderRunSummary>>(
      'SELECT builder.create_builder_run($1,$2,$3,$4,$5,$6,$7,$8,$9) AS value',
      [accountId, projectId, conversationId, sha256(Buffer.from(idempotencyKey, 'utf8')), sha256(canonicalBytes(request)), content, null, mode, mintIdentity()],
    )
    const value = result.rows[0]?.value
    if (!value) throw new Error('BUILDER_RUN_CREATE_FAILED')
    return value
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
  claimBuilderRun: async (builderRunId) => {
    // A claim asks for authority the run's author may no longer hold. That is terminal. The outer
    // dispatch catch fails the run, and no retry can recover an access that was taken away.
    const result = await executorPool.query<JsonRow<BuilderRunSummary>>(
      'SELECT builder.claim_builder_run($1) AS value', [builderRunId],
    ).catch((error: unknown) => {
      if (typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '42501') {
        throw new Error('BUILDER_RUN_NOT_ADMITTED')
      }
      throw error
    })
    const value = result.rows[0]?.value
    if (!value || value.builderRunId !== builderRunId || value.state !== 'RUNNING') throw new Error('BUILDER_RUN_CLAIM_REFUSED')
    return value
  },
  setBuilderRunPhase: async (builderRunId, phase) => {
    const result = await executorPool.query<{ value: boolean }>(
      'SELECT builder.set_builder_run_phase($1,$2) AS value', [builderRunId, phase],
    )
    if (result.rows[0]?.value !== true) throw new Error('BUILDER_RUN_PHASE_UPDATE_REFUSED')
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
    const result = await ingressPool.query<JsonRow<BuilderWorkingPreviewSubject | null>>(
      'SELECT builder.read_preview_subject($1,$2) AS value', [accountId, projectId],
    )
    return result.rows[0]?.value ?? null
  },
  admitSourceRevision: async ({ accountId, projectId, sourceRevision }) => {
    const result = await ingressPool.query<QueryResultRow & Readonly<{ admitted: boolean }>>(
      'SELECT builder.admit_source_revision($1,$2,$3) AS admitted', [accountId, projectId, sourceRevision],
    )
    return result.rows[0]?.admitted === true
  },
  recoverAndListQueuedBuilderRuns: async () => {
    const result = await executorPool.query<QueryResultRow & Readonly<{ builder_run_id: string }>>(
      'SELECT builder.recover_builder_runs() AS builder_run_id',
    )
    return result.rows.map((row) => row.builder_run_id)
  },
  close: async () => { await Promise.all([ingressPool.end(), executorPool.end()]) },
})
