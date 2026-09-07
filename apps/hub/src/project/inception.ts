import { randomUUID } from 'node:crypto'
import type { QueryResultRow } from 'pg'
import { canonicalBytes, sha256 } from '../../../../packages/canonical-json/src/index.mjs'
import type { Prj07Body, Prj07Response } from '../generated/s3-routes.js'
import type { PostgresPool } from '../platform/postgres.js'
import type { ProjectMastraPort, ProjectSourceSnapshot } from './project-mastra.js'

type ReservationRow = QueryResultRow & Readonly<{
  state: 'RESERVED' | 'REPLAY' | 'CONFLICT' | 'IN_PROGRESS'
  source_revision: string
  response_body: Prj07Response | null
  prior_candidate_digest: string | null
  prior_source_text: string | null
  prior_application_runtime_profile: 'MANAGED' | 'DEDICATED' | null
}>

export type ProjectSourceSnapshotFactory = (input: Readonly<{
  projectId: string
  sourceRevision: string
}>) => ProjectSourceSnapshot

export type ProjectInceptionService = Readonly<{
  run(input: Readonly<{
    accountId: string
    projectId: string
    idempotencyKey: string
    body: Prj07Body
  }>): Promise<Prj07Response>
  close(): Promise<void>
}>

export const createProjectInceptionService = ({
  pool,
  cognition,
  sourceSnapshot,
  admissionId,
  mintIdentity = randomUUID,
  reconcileBindingSource,
}: Readonly<{
  pool: PostgresPool
  cognition: ProjectMastraPort
  sourceSnapshot: ProjectSourceSnapshotFactory
  admissionId: string
  mintIdentity?: () => string
  reconcileBindingSource?: (accountId: string, projectId: string) => Promise<void>
}>): ProjectInceptionService => Object.freeze({
  close: async () => pool.end(),
  run: async (input) => {
    const hasPriorCandidate = input.body.priorCandidateBaselineDigest !== undefined
    const hasReviewFeedback = input.body.reviewFeedback !== undefined
    if (!input.body.intent.trim() || hasPriorCandidate !== hasReviewFeedback ||
      (input.body.priorCandidateBaselineDigest !== undefined && !input.body.priorCandidateBaselineDigest.trim()) ||
      (input.body.reviewFeedback !== undefined && !input.body.reviewFeedback.trim())) {
      throw new Error('PRJ07_REFINEMENT_INPUT_REFUSED')
    }
    const attemptId = mintIdentity()
    const keyDigest = sha256(Buffer.from(input.idempotencyKey, 'utf8'))
    const requestDigest = sha256(canonicalBytes(input.body))
    const reconcileSource = async () => {
      if (!reconcileBindingSource) return
      try {
        await reconcileBindingSource(input.accountId, input.projectId)
      } catch (error) {
        const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined
        if (code === '42501' || code === 'P0002') throw new Error('PRJ07_NOT_AUTHORIZED')
        if (['P0001', 'P0412', '40001', '40P01'].includes(String(code))) throw new Error('PRJ07_BINDING_SOURCE_CONFLICT')
        throw error
      }
    }
    await reconcileSource()
    const client = await pool.connect()
    let reserved = false
    try {
      await client.query('BEGIN')
      const result = await client.query<ReservationRow>(`
        SELECT * FROM project.reserve_or_replay_inception($1, $2, $3, $4, $5, $6)
      `, [input.accountId, input.projectId, keyDigest, requestDigest, attemptId,
        input.body.priorCandidateBaselineDigest ?? null])
      const reservation = result.rows[0]
      await client.query('COMMIT')
      if (!reservation) throw new Error('PRJ07_OUTCOME_UNKNOWN')
      if (reservation.state === 'CONFLICT') throw new Error('PRJ07_IDEMPOTENCY_CONFLICT')
      if (reservation.state === 'IN_PROGRESS') throw new Error('PRJ07_IN_PROGRESS')
      if (reservation.state === 'REPLAY') {
        if (!reservation.response_body) throw new Error('PRJ07_OUTCOME_UNKNOWN')
        return reservation.response_body
      }
      reserved = true
      await reconcileSource()
      const source = sourceSnapshot({ projectId: input.projectId, sourceRevision: reservation.source_revision })
      await source.listPaths()
      const priorDigest = reservation.prior_candidate_digest
      const priorSourceText = reservation.prior_source_text
      const priorProfile = reservation.prior_application_runtime_profile
      if (input.body.priorCandidateBaselineDigest && (
        priorDigest !== input.body.priorCandidateBaselineDigest || !priorSourceText || !priorProfile
      )) throw new Error('PRJ07_PRIOR_CANDIDATE_STALE')
      const priorCandidate = input.body.priorCandidateBaselineDigest
        ? Object.freeze({
          candidateBaselineDigest: priorDigest as string,
          sourceRevision: reservation.source_revision,
          sourceText: priorSourceText as string,
          applicationRuntimeProfile: priorProfile as 'MANAGED' | 'DEDICATED',
        })
        : undefined
      const proposal = await cognition.runInception({
        admissionId,
        intent: input.body.intent,
        source,
        ...(priorCandidate
          ? { priorCandidate, reviewFeedback: input.body.reviewFeedback }
          : {}),
      })
      const candidate = Object.freeze({
        sourceRevision: reservation.source_revision,
        sourceText: proposal.sourceText,
        applicationRuntimeProfile: proposal.applicationRuntimeProfile,
      })
      const response: Prj07Response = {
        candidateBaselineDigest: sha256(canonicalBytes(candidate)),
        ...candidate,
      }
      if (priorCandidate && response.candidateBaselineDigest === priorCandidate.candidateBaselineDigest) {
        throw new Error('PRJ07_REFINEMENT_NO_CHANGE')
      }
      await client.query('BEGIN')
      const completed = await client.query<{ complete_inception: Prj07Response }>(`
        SELECT project.complete_inception($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) AS complete_inception
      `, [input.accountId, input.projectId, keyDigest, requestDigest, attemptId,
        response.sourceRevision, priorCandidate?.candidateBaselineDigest ?? null,
        response.candidateBaselineDigest, response.sourceText,
        response.applicationRuntimeProfile, JSON.stringify(response)])
      await client.query('COMMIT')
      const settled = completed.rows[0]?.complete_inception
      if (!settled || sha256(canonicalBytes(settled)) !== sha256(canonicalBytes(response))) {
        throw new Error('PRJ07_OUTCOME_UNKNOWN')
      }
      reserved = false
      return settled
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      if (reserved) {
        await client.query('SELECT project.abandon_inception($1,$2,$3,$4)', [
          input.accountId, input.projectId, keyDigest, attemptId,
        ]).catch(() => {})
      }
      throw error
    } finally {
      client.release()
    }
  },
})
