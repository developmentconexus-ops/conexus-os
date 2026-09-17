import { randomUUID } from 'node:crypto'
import type { QueryResultRow } from 'pg'
import { canonicalBytes, sha256 } from '../../../../packages/canonical-json/src/index.mjs'
import type { PostgresPool } from '../platform/postgres.js'
import type { BuilderPreviewSubject } from './preview.js'

export type BuilderRunSummary = Readonly<{
  builderRunId: string
  projectId: string
  state: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'INTERRUPTED'
  mode: 'BUILD' | 'PLAN'
  baseSourceRevision: string
  resultSourceRevision: string | null
  resultKind: 'RESPONSE_ONLY' | 'SOURCE_CHANGED' | 'SOURCE_CHANGED_BUILD_FAILED' | null
  failureCode: string | null
  claudeConnectionId?: string | null
  claudeCredentialGeneration?: string | null
}>
export type BuilderCodeChangingRun = Readonly<{
  builderRunId: string
  projectId: string
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
  createBuilderRun(input: Readonly<{ accountId: string; projectId: string; idempotencyKey: string; content: string; mode: 'BUILD' | 'PLAN' }>): Promise<BuilderRunSummary>
  readBuilderRun(input: Readonly<{ accountId: string; projectId: string }>): Promise<BuilderRunSummary | null>
  readLatestCodeChangingBuilderRun(input: Readonly<{ accountId: string; projectId: string }>): Promise<BuilderCodeChangingRun | null>
  claimBuilderRun(builderRunId: string, modelIdentity: Readonly<{ admissionId: string; providerId: string; modelId: string }>): Promise<BuilderRunSummary>
  bindBuilderRunMessage(builderRunId: string, messageId: string): Promise<void>
  bindBuilderRunSandbox(builderRunId: string, sandboxId: string): Promise<void>
  settleBuilderRun(input: Readonly<{ builderRunId: string; resultSourceRevision: null; resultKind: 'RESPONSE_ONLY'; failureCode: null }>): Promise<void>
  advanceBuilderRunSource(builderRunId: string, sourceRevision: string): Promise<void>
  settleBuilderRunBuild(input: Readonly<{ builderRunId: string; sourceRevision: string; artifactRevisionId?: string; artifactDigest?: string; failureCode?: string }>): Promise<void>
  failBuilderRun(builderRunId: string, failureCode: string): Promise<void>
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
  createBuilderRun: async ({ accountId, projectId, idempotencyKey, content, mode }) => {
    const request = { mode, content }
    const result = await ingressPool.query<JsonRow<BuilderRunSummary>>(
      'SELECT builder.create_builder_run($1,$2,$3,$4,$5,$6,$7) AS value',
      [accountId, projectId, sha256(Buffer.from(idempotencyKey, 'utf8')), sha256(canonicalBytes(request)), null, mode, mintIdentity()],
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
  readLatestCodeChangingBuilderRun: async ({ accountId, projectId }) => {
    const result = await ingressPool.query<JsonRow<BuilderCodeChangingRun | null>>(
      'SELECT builder.read_latest_code_changing_builder_run($1,$2) AS value', [accountId, projectId],
    )
    return result.rows[0]?.value ?? null
  },
  claimBuilderRun: async (builderRunId, modelIdentity) => {
    const result = await executorPool.query<JsonRow<BuilderRunSummary>>(
      'SELECT builder.claim_builder_run($1,$2,$3,$4) AS value',
      [builderRunId, modelIdentity.admissionId, modelIdentity.providerId, modelIdentity.modelId],
    )
    const value = result.rows[0]?.value
    if (!value || value.builderRunId !== builderRunId || value.state !== 'RUNNING') throw new Error('BUILDER_RUN_CLAIM_REFUSED')
    return value
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
