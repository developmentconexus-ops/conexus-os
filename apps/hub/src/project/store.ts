import { randomUUID } from 'node:crypto'
import type { QueryResultRow } from 'pg'
import { canonicalBytes, sha256 } from '../../../../packages/canonical-json/src/index.mjs'
import type {
  Prj01Response,
  Prj02Response,
  Prj03Body,
  Prj03Response,
  Prj08Response,
  Prj09Response,
  Prj23Response,
} from '../generated/s3-routes.js'
import type { PostgresPool } from '../platform/postgres.js'
import { projectError } from './errors.js'
import type { GitExecutionPort } from './git-execution.js'
import { isProjectIdentity } from './identity.js'
import type { ProjectSourceRecovery } from './source-recovery.js'

const ABANDONED_ATTEMPT_AGE_MS = 60 * 60 * 1_000
const RECOVERY_SCAN_LIMIT = 16

type CreateProjectInput = Readonly<{
  accountId: string
  workspaceId: string
  idempotencyKey: string
  body: Prj03Body
}>

export type CreateProjectResult = Prj03Response & Readonly<{ replayed: boolean }>

type ReservationRow = QueryResultRow & Readonly<{
  state: 'RESERVED' | 'REPLAY' | 'CONFLICT'
  project_id: string
  response_status: number | null
  response_body: Prj03Response | null
}>

type LockRow = QueryResultRow & Readonly<{ outcome: 'RESERVED' | 'SUCCEEDED'; project_id: string }>
type RecoveryRow = QueryResultRow & Readonly<{ project_id: string }>
type ProjectSummaryRow = QueryResultRow & Readonly<{
  project_id: string
  workspace_id: string
  name: string
  archived: boolean
}>
type ProjectRepresentationRow = ProjectSummaryRow & Readonly<{ project_revision: string }>
type BaselineCandidateRow = QueryResultRow & Readonly<{
  candidate_baseline_digest: string
  source_revision: string
  source_text: string
  application_runtime_profile: 'MANAGED' | 'DEDICATED'
}>
type ApprovedBaselineRow = QueryResultRow & Readonly<{
  baseline_digest: string
  source_revision: string
  source_text: string
  application_runtime_profile: 'MANAGED' | 'DEDICATED'
}>

export type ProjectStore = Readonly<{
  createProject(input: CreateProjectInput): Promise<CreateProjectResult>
  listProjects(input: Readonly<{ accountId: string; workspaceId: string }>): Promise<Prj01Response>
  getProject(input: Readonly<{ accountId: string; projectId: string }>): Promise<Prj02Response | null>
  getBaselineCandidate(input: Readonly<{
    accountId: string
    projectId: string
    candidateBaselineDigest: string
  }>): Promise<Prj23Response | null>
  getApprovedBaseline(input: Readonly<{ accountId: string; projectId: string }>): Promise<Prj08Response | null>
  approveBaseline(input: Readonly<{
    accountId: string
    projectId: string
    candidateBaselineDigest: string
  }>): Promise<Prj09Response>
}>

const digestText = (value: string): string => sha256(Buffer.from(value, 'utf8'))
const digestBody = (value: unknown): string => sha256(canonicalBytes(value))
const errorText = (error: unknown): string => error instanceof Error ? error.message : ''
const mapDatabaseError = (error: unknown): never => {
  if (errorText(error).includes('PRJ03_CREATE_NOT_AUTHORIZED')) throw projectError('AUTHORIZATION_DENIED')
  throw error
}

const validReplay = (
  row: ReservationRow,
  input: CreateProjectInput,
): row is ReservationRow & Readonly<{ response_status: 201; response_body: Prj03Response }> => {
  const body = row.response_body
  return row.response_status === 201 && body !== null &&
    Object.keys(body).sort().join(',') === 'archived,name,projectId,projectRevision,workspaceId' &&
    body.projectId === row.project_id && body.workspaceId === input.workspaceId &&
    body.name === input.body.name && body.archived === false &&
    typeof body.projectRevision === 'string' && body.projectRevision.length > 0
}

export const createProjectStore = ({
  commandPool,
  readPool,
  baselineReadPool,
  baselineCommandPool,
  git,
  recovery,
  now = () => Date.now(),
  mintIdentity = randomUUID,
}: Readonly<{
  commandPool: PostgresPool
  readPool?: PostgresPool
  baselineReadPool?: PostgresPool
  baselineCommandPool?: PostgresPool
  git: GitExecutionPort
  recovery: ProjectSourceRecovery
  now?: () => number
  mintIdentity?: () => string
}>): ProjectStore => {
  const requireReadPool = (): PostgresPool => {
    if (!readPool) throw new Error('PROJECT_READ_POOL_NOT_CONFIGURED')
    return readPool
  }
  const requireBaselineReadPool = (): PostgresPool => {
    if (!baselineReadPool) throw new Error('PROJECT_BASELINE_READ_POOL_NOT_CONFIGURED')
    return baselineReadPool
  }
  const requireBaselineCommandPool = (): PostgresPool => {
    if (!baselineCommandPool) throw new Error('PROJECT_BASELINE_COMMAND_POOL_NOT_CONFIGURED')
    return baselineCommandPool
  }
  const approvedBaseline = (row: ApprovedBaselineRow): Prj08Response => ({
    baselineDigest: row.baseline_digest,
    sourceRevision: row.source_revision,
    sourceText: row.source_text,
    applicationRuntimeProfile: row.application_runtime_profile,
  })

  const listProjects = async ({ accountId, workspaceId }: Readonly<{
    accountId: string
    workspaceId: string
  }>): Promise<Prj01Response> => {
    const client = await requireReadPool().connect()
    try {
      await client.query('BEGIN READ ONLY')
      const result = await client.query<ProjectSummaryRow>(`
        SELECT summary.project_id, summary.workspace_id, summary.name, summary.archived
        FROM project.list_project_summaries(
          $2,
          ARRAY(SELECT admitted.project_id
                FROM iam.list_workspace_readable_project_ids($1, $2) admitted)
        ) summary
      `, [accountId, workspaceId])
      await client.query('COMMIT')
      return result.rows.map((row) => ({
        projectId: row.project_id,
        workspaceId: row.workspace_id,
        name: row.name,
        archived: row.archived,
      }))
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  const getProject = async ({ accountId, projectId }: Readonly<{
    accountId: string
    projectId: string
  }>): Promise<Prj02Response | null> => {
    const client = await requireReadPool().connect()
    try {
      await client.query('BEGIN READ ONLY')
      const result = await client.query<ProjectRepresentationRow>(`
        SELECT detail.project_id, detail.workspace_id, detail.name,
          detail.project_revision, detail.archived
        FROM project.get_project_representation(
          $2,
          ARRAY(SELECT admitted.project_id
                FROM iam.admit_project_read($1, $2) admitted)
        ) detail
      `, [accountId, projectId])
      const row = result.rows[0] ?? null
      await client.query('COMMIT')
      return row ? {
        projectId: row.project_id,
        workspaceId: row.workspace_id,
        name: row.name,
        projectRevision: row.project_revision,
        archived: row.archived,
      } : null
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }
  const getBaselineCandidate = async ({ accountId, projectId, candidateBaselineDigest }: Readonly<{
    accountId: string
    projectId: string
    candidateBaselineDigest: string
  }>): Promise<Prj23Response | null> => {
    const client = await requireBaselineReadPool().connect()
    try {
      await client.query('BEGIN READ ONLY')
      const result = await client.query<BaselineCandidateRow>(`
        SELECT candidate.candidate_baseline_digest, candidate.source_revision,
          candidate.source_text, candidate.application_runtime_profile
        FROM project.get_baseline_candidate(
          $2,
          $3,
          ARRAY(SELECT admitted.project_id
                FROM iam.admit_project_manage($1, $2) admitted)
        ) candidate
      `, [accountId, projectId, candidateBaselineDigest])
      const row = result.rows[0] ?? null
      await client.query('COMMIT')
      return row ? {
        candidateBaselineDigest: row.candidate_baseline_digest,
        sourceRevision: row.source_revision,
        sourceText: row.source_text,
        applicationRuntimeProfile: row.application_runtime_profile,
      } : null
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }
  const getApprovedBaseline = async ({ accountId, projectId }: Readonly<{
    accountId: string
    projectId: string
  }>): Promise<Prj08Response | null> => {
    const client = await requireBaselineReadPool().connect()
    try {
      await client.query('BEGIN READ ONLY')
      const result = await client.query<ApprovedBaselineRow>(`
        SELECT baseline.baseline_digest, baseline.source_revision,
          baseline.source_text, baseline.application_runtime_profile
        FROM project.get_approved_baseline(
          $2,
          ARRAY(SELECT admitted.project_id
                FROM iam.admit_project_manage($1, $2) admitted)
        ) baseline
      `, [accountId, projectId])
      const row = result.rows[0] ?? null
      await client.query('COMMIT')
      return row ? approvedBaseline(row) : null
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }
  const approveBaseline = async ({ accountId, projectId, candidateBaselineDigest }: Readonly<{
    accountId: string
    projectId: string
    candidateBaselineDigest: string
  }>): Promise<Prj09Response> => {
    const client = await requireBaselineCommandPool().connect()
    try {
      await client.query('BEGIN')
      const result = await client.query<ApprovedBaselineRow>(`
        SELECT approved.baseline_digest, approved.source_revision,
          approved.source_text, approved.application_runtime_profile
        FROM project.approve_baseline_revision(
          $1, $2, $3, $4,
          ARRAY(SELECT admitted.project_id
                FROM iam.admit_project_manage($1, $2) admitted)
        ) approved
      `, [accountId, projectId, candidateBaselineDigest, mintIdentity()])
      const row = result.rows[0]
      if (!row) throw new Error('PRJ09_OUTCOME_UNKNOWN')
      await client.query('COMMIT')
      return approvedBaseline(row)
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }
  const recoverBeforeIntake = async (): Promise<void> => {
    const client = await commandPool.connect()
    try {
      await client.query('BEGIN')
      const cutoff = new Date(now() - ABANDONED_ATTEMPT_AGE_MS).toISOString()
      const claimed = await client.query<RecoveryRow>(
        'SELECT * FROM project.claim_abandoned_create_project_attempt($1, $2)',
        [cutoff, RECOVERY_SCAN_LIMIT],
      )
      for (const row of claimed.rows) {
        if (!isProjectIdentity(row.project_id)) throw projectError('RECOVERY_REFUSED')
        const cleaned = await recovery.cleanupClaimedProjectSource(row.project_id)
        if (cleaned.status !== 'CLEANED' || cleaned.projectId !== row.project_id) {
          throw projectError('RECOVERY_REFUSED')
        }
      }
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      if (errorText(error).includes('PRJ03_')) throw projectError('RECOVERY_REFUSED')
      throw error
    } finally {
      client.release()
    }
  }

  const reserve = async (
    input: CreateProjectInput,
    keyDigest: string,
    requestDigest: string,
    candidateProjectId: string,
  ): Promise<ReservationRow> => {
    const client = await commandPool.connect()
    try {
      await client.query('BEGIN')
      const result = await client.query<ReservationRow>(`
        SELECT * FROM project.reserve_or_replay_create_project($1, $2, $3, $4, $5)
      `, [input.accountId, input.workspaceId, keyDigest, requestDigest, candidateProjectId])
      const row = result.rows[0]
      if (!row) throw projectError('OUTCOME_UNKNOWN')
      if (row.state === 'CONFLICT') throw projectError('IDEMPOTENCY_CONFLICT')
      if (!isProjectIdentity(row.project_id)) throw projectError('OUTCOME_UNKNOWN')
      if (row.state === 'REPLAY' && !validReplay(row, input)) throw projectError('OUTCOME_UNKNOWN')
      await client.query('COMMIT')
      return row
    } catch (error) {
      await client.query('ROLLBACK')
      return mapDatabaseError(error)
    } finally {
      client.release()
    }
  }

  const createProject = async (input: CreateProjectInput): Promise<CreateProjectResult> => {
    await recoverBeforeIntake()
    const candidateProjectId = mintIdentity()
    const attemptId = mintIdentity()
    const projectRevision = mintIdentity()
    if (![candidateProjectId, attemptId, projectRevision].every(isProjectIdentity)) throw projectError('OUTCOME_UNKNOWN')
    const keyDigest = digestText(input.idempotencyKey)
    const requestDigest = digestBody(input.body)
    const reservation = await reserve(input, keyDigest, requestDigest, candidateProjectId)
    if (reservation.state === 'REPLAY') {
      if (!validReplay(reservation, input)) throw projectError('OUTCOME_UNKNOWN')
      return { ...reservation.response_body, replayed: true }
    }
    if (reservation.state !== 'RESERVED') throw projectError('OUTCOME_UNKNOWN')

    const projectId = reservation.project_id
    const staged = input.body.sourceBootstrap.mode === 'NEW'
      ? await git.stageNewProjectSource({ projectId, attemptId })
      : await git.stageExistingGitProjectSource({
        projectId,
        attemptId,
        locator: input.body.sourceBootstrap.repositoryLocator,
      })
    if (staged.status === 'REFUSED') {
      if (['CATALOG_REFUSED', 'LOCATOR_REFUSED', 'DESTINATION_NOT_ADMITTED'].includes(staged.code)) {
        throw projectError('SOURCE_INPUT_REFUSED')
      }
      throw projectError('SOURCE_DEPENDENCY_REFUSED')
    }
    const sourceRevision = staged.sourceRevision
    const promoted = await git.promoteStagedProjectSource({ projectId, attemptId, sourceRevision })
    if (promoted.status === 'REFUSED') {
      if (promoted.code === 'CANDIDATE_QUARANTINED') throw projectError('SOURCE_CONFLICT')
      throw projectError('SOURCE_DEPENDENCY_REFUSED')
    }

    const client = await commandPool.connect()
    try {
      await client.query('BEGIN')
      const locked = await client.query<LockRow>(`
        SELECT * FROM project.lock_create_project_receipt($1, $2, $3, $4, $5)
      `, [input.accountId, input.workspaceId, keyDigest, requestDigest, projectId])
      const lock = locked.rows[0]
      if (!lock || lock.project_id !== projectId) throw projectError('OUTCOME_UNKNOWN')
      if (lock.outcome === 'SUCCEEDED') {
        const replay = await client.query<ReservationRow>(`
          SELECT * FROM project.reserve_or_replay_create_project($1, $2, $3, $4, $5)
        `, [input.accountId, input.workspaceId, keyDigest, requestDigest, projectId])
        const row = replay.rows[0]
        if (row?.state !== 'REPLAY' || !validReplay(row, input)) throw projectError('OUTCOME_UNKNOWN')
        await client.query('COMMIT')
        return { ...row.response_body, replayed: true }
      }
      if (lock.outcome !== 'RESERVED') throw projectError('OUTCOME_UNKNOWN')
      const canonical = await git.verifyCanonicalProjectSource({ projectId, attemptId, sourceRevision })
      if (canonical.status !== 'VERIFIED' || canonical.sourceRevision !== sourceRevision) {
        throw projectError('SOURCE_DEPENDENCY_REFUSED')
      }

      const response: Prj03Response = {
        projectId,
        workspaceId: input.workspaceId,
        name: input.body.name,
        projectRevision,
        archived: false,
      }
      await client.query('SELECT project.create_project_with_source($1, $2, $3, $4, $5, $6, $7, $8, $9)', [
        input.accountId, input.workspaceId, keyDigest, requestDigest, projectId,
        input.body.name, input.body.sourceBootstrap.mode, sourceRevision, projectRevision,
      ])
      await client.query('SELECT iam.establish_project_creator_grant($1, $2, $3, $4, $5)', [
        input.accountId, input.workspaceId, keyDigest, requestDigest, projectId,
      ])
      await client.query('SELECT project.complete_create_project_receipt($1, $2, $3, $4, $5, $6, $7, $8)', [
        input.accountId, input.workspaceId, keyDigest, requestDigest, projectId,
        201, digestBody(response), JSON.stringify(response),
      ])
      await client.query('COMMIT')
      return { ...response, replayed: false }
    } catch (error) {
      await client.query('ROLLBACK')
      return mapDatabaseError(error)
    } finally {
      client.release()
    }
  }

  return Object.freeze({
    createProject,
    listProjects,
    getProject,
    getBaselineCandidate,
    getApprovedBaseline,
    approveBaseline,
  })
}
