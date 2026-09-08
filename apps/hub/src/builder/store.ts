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
  state: 'QUEUED' | 'RUNNING' | 'RESULT_READY' | 'VERIFYING' | 'VERIFIED' | 'VERIFICATION_FAILED' | 'UNVERIFIED' | 'FAILED' | 'INTERRUPTED'
}>
export type PlanProjection = Readonly<{
  planRevision: string
  planningDepth: 'DIRECT'
  rigorProfile: 'CONTROLLED'
  items: readonly Readonly<{ itemId: string; summary: string; state: string }>[]
  dependencyEdges: readonly never[]
  acceptanceLinks: readonly Readonly<{ itemId: string; assertionRef: string }>[]
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
  changeBaseSourceRevision?: string
  correctionFindings?: readonly Readonly<{ findingId: string; findingRevision: string; summary: string }>[]
}>

export type ClaimedVerification = Readonly<{
  projectId: string
  changeId: string
  workUnitId: string
  actorRunId: string
  admissionToken: string
  intent: string
  assertionRef: string
  contractRevision: string
  planRevision: string
  baselineDigest: string
  baseSourceRevision: string
  candidateSourceRevision: string
}>

export type FindingProjection = Readonly<{
  findingId: string
  changeId: string
  findingRevision: string
  state: 'OPEN' | 'CLOSED'
  summary: string
}>

export type EvidenceProjection = Readonly<{
  evidenceId: string
  changeId: string
  claim: string
  subjectDigest: string
  provenance: readonly string[]
}>

type JsonRow<T> = QueryResultRow & Readonly<{ value: T }>

export type BuilderStore = Readonly<{
  createChange(input: Readonly<{ accountId: string; projectId: string; idempotencyKey: string; intent: string }>): Promise<ChangeProjection>
  listChanges(input: Readonly<{ accountId: string; projectId: string }>): Promise<readonly ChangeProjection[]>
  readSnapshot(input: Readonly<{ accountId: string; projectId: string; changeId: string; requireSource: boolean }>): Promise<BuilderSnapshot | null>
  claimChange(changeId: string, modelIdentity: Readonly<{ admissionId: string; providerId: string; modelId: string }>): Promise<ClaimedChange>
  claimCorrection(changeId: string, modelIdentity: Readonly<{ admissionId: string; providerId: string; modelId: string }>): Promise<ClaimedChange | null>
  bindSandbox(actorRunId: string, admissionToken: string, sandboxId: string): Promise<void>
  settleResult(input: Readonly<ClaimedChange & { sandboxId: string; candidateSourceRevision: string; patch: string; summary: string }>): Promise<void>
  claimVerification(changeId: string, modelIdentity: Readonly<{ admissionId: string; providerId: string; modelId: string }>): Promise<ClaimedVerification>
  failVerificationClaim(changeId: string): Promise<void>
  settleVerification(input: Readonly<ClaimedVerification & { sandboxId: string; report: unknown }>): Promise<void>
  failVerification(actorRunId: string, admissionToken: string, failureCode: string): Promise<void>
  failRun(actorRunId: string, admissionToken: string): Promise<void>
  listFindings(input: Readonly<{ accountId: string; projectId: string; changeId: string }>): Promise<readonly FindingProjection[]>
  getFinding(input: Readonly<{ accountId: string; projectId: string; changeId: string; findingId: string }>): Promise<FindingProjection | null>
  closeFinding(input: Readonly<{ accountId: string; projectId: string; changeId: string; findingId: string; expectedFindingRevision: string; resolutionEvidenceIds: readonly string[] }>): Promise<FindingProjection>
  listEvidence(input: Readonly<{ accountId: string; projectId: string; changeId: string }>): Promise<readonly EvidenceProjection[]>
  getEvidence(input: Readonly<{ accountId: string; projectId: string; changeId: string; evidenceId: string }>): Promise<EvidenceProjection | null>
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
  claimChange: async (changeId, modelIdentity) => {
    const actorRunId = mintIdentity()
    const admissionToken = mintIdentity()
    const result = await executorPool.query<JsonRow<ClaimedChange>>(
      'SELECT builder.claim_change($1,$2,$3,$4,$5,$6) AS value', [
        changeId, actorRunId, admissionToken, modelIdentity.admissionId, modelIdentity.providerId, modelIdentity.modelId,
      ],
    )
    const value = result.rows[0]?.value
    if (!value || value.actorRunId !== actorRunId || value.admissionToken !== admissionToken) {
      throw new Error('BUILDER_CLAIM_REFUSED')
    }
    return value
  },
  claimCorrection: async (changeId, modelIdentity) => {
    const workUnitId = mintIdentity()
    const actorRunId = mintIdentity()
    const admissionToken = mintIdentity()
    const result = await executorPool.query<JsonRow<ClaimedChange | null>>(
      'SELECT builder.claim_correction($1,$2,$3,$4,$5,$6,$7) AS value', [
        changeId, workUnitId, actorRunId, admissionToken,
        modelIdentity.admissionId, modelIdentity.providerId, modelIdentity.modelId,
      ],
    )
    const value = result.rows[0]?.value ?? null
    if (value && (value.workUnitId !== workUnitId || value.actorRunId !== actorRunId ||
      value.admissionToken !== admissionToken)) throw new Error('BUILDER_CORRECTION_CLAIM_REFUSED')
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
  claimVerification: async (changeId, modelIdentity) => {
    const actorRunId = mintIdentity()
    const admissionToken = mintIdentity()
    const result = await executorPool.query<JsonRow<ClaimedVerification>>(
      'SELECT builder.claim_verification($1,$2,$3,$4,$5,$6) AS value', [
        changeId, actorRunId, admissionToken, modelIdentity.admissionId, modelIdentity.providerId, modelIdentity.modelId,
      ],
    )
    const value = result.rows[0]?.value
    if (!value || value.actorRunId !== actorRunId || value.admissionToken !== admissionToken) {
      throw new Error('BUILDER_VERIFICATION_CLAIM_REFUSED')
    }
    return value
  },
  failVerificationClaim: async (changeId) => {
    await executorPool.query('SELECT builder.fail_verification_claim($1)', [changeId])
  },
  settleVerification: async (input) => {
    const reportFindings = typeof input.report === 'object' && input.report !== null &&
      Array.isArray((input.report as Readonly<{ findings?: unknown }>).findings)
      ? (input.report as Readonly<{ findings: readonly unknown[] }>).findings
      : []
    const findingIds = reportFindings.map(() => mintIdentity())
    const findingRevisions = reportFindings.map(() => mintIdentity())
    const evidenceSetDigest = sha256(canonicalBytes({
      projectId: input.projectId, changeId: input.changeId, actorRunId: input.actorRunId,
      assertionRef: input.assertionRef, contractRevision: input.contractRevision, planRevision: input.planRevision,
      baselineDigest: input.baselineDigest, baseSourceRevision: input.baseSourceRevision,
      candidateSourceRevision: input.candidateSourceRevision, report: input.report,
    }))
    const result = await executorPool.query<QueryResultRow & Readonly<{ settled: boolean }>>(
      'SELECT builder.settle_verification($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) AS settled', [
        input.actorRunId, input.admissionToken, input.sandboxId, input.assertionRef,
        input.contractRevision, input.planRevision, input.baselineDigest, input.baseSourceRevision,
        input.candidateSourceRevision, mintIdentity(), findingIds, findingRevisions, evidenceSetDigest, input.report,
      ],
    )
    if (result.rows[0]?.settled !== true) throw new Error('BUILDER_LATE_VERIFICATION_REFUSED')
  },
  failVerification: async (actorRunId, admissionToken, failureCode) => {
    await executorPool.query('SELECT builder.fail_verification($1,$2,$3)', [actorRunId, admissionToken, failureCode])
  },
  failRun: async (actorRunId, admissionToken) => {
    await executorPool.query('SELECT builder.fail_run($1,$2)', [actorRunId, admissionToken])
  },
  listFindings: async ({ accountId, projectId, changeId }) => {
    const result = await ingressPool.query<JsonRow<FindingProjection>>(
      'SELECT value FROM builder.list_findings($1,$2,$3) AS value', [accountId, projectId, changeId],
    )
    return result.rows.map((row) => row.value)
  },
  getFinding: async ({ accountId, projectId, changeId, findingId }) => {
    const result = await ingressPool.query<JsonRow<FindingProjection | null>>(
      'SELECT builder.get_finding($1,$2,$3,$4) AS value', [accountId, projectId, changeId, findingId],
    )
    return result.rows[0]?.value ?? null
  },
  closeFinding: async ({ accountId, projectId, changeId, findingId, expectedFindingRevision, resolutionEvidenceIds }) => {
    const result = await ingressPool.query<JsonRow<FindingProjection>>(
      'SELECT builder.close_finding($1,$2,$3,$4,$5,$6) AS value',
      [accountId, projectId, changeId, findingId, expectedFindingRevision, resolutionEvidenceIds],
    )
    const value = result.rows[0]?.value
    if (!value) throw new Error('BLD13_CLOSE_FAILED')
    return value
  },
  listEvidence: async ({ accountId, projectId, changeId }) => {
    const result = await ingressPool.query<JsonRow<EvidenceProjection>>(
      'SELECT value FROM builder.list_evidence($1,$2,$3) AS value', [accountId, projectId, changeId],
    )
    return result.rows.map((row) => row.value)
  },
  getEvidence: async ({ accountId, projectId, changeId, evidenceId }) => {
    const result = await ingressPool.query<JsonRow<EvidenceProjection | null>>(
      'SELECT builder.get_evidence($1,$2,$3,$4) AS value', [accountId, projectId, changeId, evidenceId],
    )
    return result.rows[0]?.value ?? null
  },
  recoverAndListQueued: async () => {
    const result = await executorPool.query<QueryResultRow & Readonly<{ change_id: string }>>(
      'SELECT builder.recover_and_list_queued() AS change_id',
    )
    return result.rows.map((row) => row.change_id)
  },
  close: async () => { await Promise.all([ingressPool.end(), executorPool.end()]) },
})
