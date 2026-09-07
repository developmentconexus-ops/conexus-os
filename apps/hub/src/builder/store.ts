import { randomUUID } from 'node:crypto'
import type { QueryResultRow } from 'pg'
import { canonicalBytes, sha256 } from '../../../../packages/canonical-json/src/index.mjs'
import type { PostgresPool } from '../platform/postgres.js'

export type ChangeProjection = Readonly<{
  changeId: string
  projectId: string
  intent: string
  baselineDigest: string
  planningDepth: 'DIRECT'
  rigorProfile: 'CONTROLLED'
  state: 'QUEUED' | 'RUNNING' | 'RESULT_READY' | 'FAILED' | 'INTERRUPTED'
}>
export type PlanProjection = Readonly<{
  planRevision: string
  planningDepth: 'DIRECT'
  rigorProfile: 'CONTROLLED'
  items: readonly Readonly<{ itemId: string; summary: string; state: string }>[]
  dependencyEdges: readonly never[]
  acceptanceLinks: readonly never[]
  blockers: readonly string[]
  unknowns: readonly string[]
  progress: string
}>
export type ChangeProgress = Readonly<{
  planRevision: string
  items: readonly Readonly<{ itemId: string; summary: string; state: string }>[]
  overallState: string
}>
export type ChangeDiff = Readonly<{ baseSourceRevision: string; candidateSourceRevision: string; patch: string }>
export type ChangeExecution = Readonly<{
  changeId: string
  workUnits: readonly Readonly<{ workUnitId: string; state: string; actorRunIds: readonly string[]; resultCommit: string | null }>[]
  actorRuns: readonly Readonly<{ actorRunId: string; state: string; lineageDisposition: 'FRESH_BASE' }>[]
}>
export type BuilderSnapshot = Readonly<{
  change: ChangeProjection
  plan: PlanProjection
  progress: ChangeProgress
  diff: ChangeDiff | null
  execution: ChangeExecution
}>
export type ClaimedChange = Readonly<{
  projectId: string
  changeId: string
  workUnitId: string
  actorRunId: string
  admissionToken: string
  intent: string
  baseSourceRevision: string
}>

type JsonRow<T> = QueryResultRow & Readonly<{ value: T }>

export type BuilderStore = Readonly<{
  createChange(input: Readonly<{ accountId: string; projectId: string; idempotencyKey: string; intent: string }>): Promise<ChangeProjection>
  listChanges(input: Readonly<{ accountId: string; projectId: string }>): Promise<readonly ChangeProjection[]>
  readSnapshot(input: Readonly<{ accountId: string; projectId: string; changeId: string; requireSource: boolean }>): Promise<BuilderSnapshot | null>
  claimChange(changeId: string): Promise<ClaimedChange>
  bindSandbox(actorRunId: string, admissionToken: string, sandboxId: string): Promise<void>
  settleResult(input: Readonly<ClaimedChange & { sandboxId: string; candidateSourceRevision: string; patch: string; summary: string }>): Promise<void>
  failRun(actorRunId: string, admissionToken: string): Promise<void>
  recoverAndListQueued(): Promise<readonly string[]>
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
  createChange: async ({ accountId, projectId, idempotencyKey, intent }) => {
    const request = { intent }
    const result = await ingressPool.query<JsonRow<ChangeProjection>>(
      'SELECT builder.create_change($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) AS value',
      [accountId, projectId, sha256(Buffer.from(idempotencyKey, 'utf8')), sha256(canonicalBytes(request)),
        mintIdentity(), mintIdentity(), mintIdentity(), mintIdentity(), mintIdentity(), intent],
    )
    const value = result.rows[0]?.value
    if (!value) throw new Error('BLD03_CREATE_FAILED')
    return value
  },
  listChanges: async ({ accountId, projectId }) => {
    const result = await ingressPool.query<JsonRow<ChangeProjection>>(
      'SELECT value FROM builder.list_changes($1,$2) AS value', [accountId, projectId],
    )
    return result.rows.map((row) => row.value)
  },
  readSnapshot: async ({ accountId, projectId, changeId, requireSource }) => {
    const result = await ingressPool.query<JsonRow<BuilderSnapshot | null>>(
      'SELECT builder.read_snapshot($1,$2,$3,$4) AS value', [accountId, projectId, changeId, requireSource],
    )
    return result.rows[0]?.value ?? null
  },
  claimChange: async (changeId) => {
    const actorRunId = mintIdentity()
    const admissionToken = mintIdentity()
    const result = await executorPool.query<JsonRow<ClaimedChange>>(
      'SELECT builder.claim_change($1,$2,$3) AS value', [changeId, actorRunId, admissionToken],
    )
    const value = result.rows[0]?.value
    if (!value || value.actorRunId !== actorRunId || value.admissionToken !== admissionToken) {
      throw new Error('BUILDER_CLAIM_REFUSED')
    }
    return value
  },
  bindSandbox: async (actorRunId, admissionToken, sandboxId) => {
    await executorPool.query('SELECT builder.bind_sandbox($1,$2,$3)', [actorRunId, admissionToken, sandboxId])
  },
  settleResult: async (input) => {
    const result = await executorPool.query<QueryResultRow & Readonly<{ settled: boolean }>>(
      'SELECT builder.settle_result($1,$2,$3,$4,$5,$6,$7) AS settled', [
      input.actorRunId, input.admissionToken, input.sandboxId, input.baseSourceRevision,
      input.candidateSourceRevision, input.patch, input.summary,
      ],
    )
    if (result.rows[0]?.settled !== true) throw new Error('BUILDER_LATE_RESULT_REFUSED')
  },
  failRun: async (actorRunId, admissionToken) => {
    await executorPool.query('SELECT builder.fail_run($1,$2)', [actorRunId, admissionToken])
  },
  recoverAndListQueued: async () => {
    const result = await executorPool.query<QueryResultRow & Readonly<{ change_id: string }>>(
      'SELECT builder.recover_and_list_queued() AS change_id',
    )
    return result.rows.map((row) => row.change_id)
  },
  close: async () => { await Promise.all([ingressPool.end(), executorPool.end()]) },
})
