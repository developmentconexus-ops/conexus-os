import { randomUUID } from 'node:crypto'
import type { QueryResultRow } from 'pg'
import { canonicalBytes, sha256 } from '../../../../packages/canonical-json/src/index.mjs'
import type {
  Prj01Response,
  Prj02Response,
  Prj03Body,
  Prj03Response,
} from '../generated/project-routes.js'
import type { BuilderRunResultKind, BuilderRunState } from '../generated/builder-run-vocabulary.js'
import { errorCode, type PostgresPool } from '../platform/postgres.js'
import { createProjectDeletionOrchestrator } from './deletion.js'
import type { ProjectDeletionPorts } from './deletion.js'
import { projectError, repositoryRefused } from './errors.js'
import { isProjectIdentity } from './identity.js'

// Gives a Project that does not exist yet its repository in the Conexus Git, with the starter on
// `main`, and answers `main`. The same Project id always reaches the same repository, so calling it
// again converges.
export type ProjectRepositoryPort = Readonly<{
  prepare(projectId: string): Promise<string>
}>

type CreateProjectInput = Readonly<{
  accountId: string
  workspaceId: string
  idempotencyKey: string
  body: Prj03Body
}>

type CreateProjectResult = Prj03Response & Readonly<{ replayed: boolean }>

type ReservationRow = QueryResultRow & Readonly<{
  state: 'RESERVED' | 'REPLAY' | 'CONFLICT'
  project_id: string
  response_status: number | null
  response_body: Prj03Response | null
}>

type LockRow = QueryResultRow & Readonly<{ outcome: 'RESERVED' | 'SUCCEEDED'; project_id: string }>
type ProjectSummaryRow = QueryResultRow & Readonly<{
  project_id: string
  workspace_id: string
  name: string
  archived: boolean
}>
type ProjectRepresentationRow = ProjectSummaryRow & Readonly<{ project_revision: string }>
type ProjectDetailRow = ProjectRepresentationRow & Readonly<{ deleting: boolean }>
type JsonRow<T> = QueryResultRow & Readonly<{ value: T }>

// The Projects home's card row: a Project's name and archived flag next to its latest Builder
// activity, so the Hub answers one read instead of the browser paging one builder-session call
// per Project.
type ProjectLatestRunSummary = Readonly<{
  state: BuilderRunState
  resultKind: BuilderRunResultKind | null
}>
export type ProjectSummaryWithActivity = Readonly<{
  projectId: string
  name: string
  archived: boolean
  lastActivityAt: string
  latestRun: ProjectLatestRunSummary | null
  hasPreview: boolean
  deleting: boolean
}>

export type ProjectStore = Readonly<{
  createProject(input: CreateProjectInput): Promise<CreateProjectResult>
  listProjects(input: Readonly<{ accountId: string; workspaceId: string }>): Promise<Prj01Response>
  getProject(input: Readonly<{ accountId: string; projectId: string }>): Promise<Prj02Response | null>
  listProjectSummariesWithActivity(input: Readonly<{ accountId: string; workspaceId: string }>): Promise<readonly ProjectSummaryWithActivity[]>
  deleteProject(input: Readonly<{ accountId: string; projectId: string; confirmName: string }>): Promise<void>
}>

const digestText = (value: string): string => sha256(Buffer.from(value, 'utf8'))
const digestBody = (value: unknown): string => sha256(canonicalBytes(value))
const isNotAdmitted = (error: unknown): boolean => errorCode(error) === '42501'
const mapDatabaseError = (error: unknown): never => {
  if (isNotAdmitted(error)) throw projectError('AUTHORIZATION_DENIED')
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

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: debt: owning wave
export const createProjectStore = ({
  commandPool,
  readPool,
  repository,
  deletion,
  mintIdentity = randomUUID,
}: Readonly<{
  commandPool: PostgresPool
  readPool?: PostgresPool
  repository: ProjectRepositoryPort
  deletion: ProjectDeletionPorts
  mintIdentity?: () => string
}>): ProjectStore => {
  const requireReadPool = (): PostgresPool => {
    if (!readPool) throw new Error('PROJECT_READ_POOL_NOT_CONFIGURED')
    return readPool
  }
  const deletionOrchestrator = createProjectDeletionOrchestrator({ commandPool, ports: deletion })

  const listProjects = async ({ accountId, workspaceId }: Readonly<{
    accountId: string
    workspaceId: string
  }>): Promise<Prj01Response> => {
    const client = await requireReadPool().connect()
    try {
      await client.query('BEGIN READ ONLY')
      const result = await client.query<ProjectSummaryRow>(`
        SELECT summary.project_id, summary.workspace_id, summary.name, summary.archived
        FROM project.list_project_summaries($1, $2) summary
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
      const result = await client.query<ProjectDetailRow>(`
        SELECT detail.project_id, detail.workspace_id, detail.name,
          detail.project_revision, detail.archived, detail.deleting
        FROM project.get_project($1, $2) detail
      `, [accountId, projectId])
      const row = result.rows[0] ?? null
      await client.query('COMMIT')
      return row ? {
        projectId: row.project_id,
        workspaceId: row.workspace_id,
        name: row.name,
        projectRevision: row.project_revision,
        archived: row.archived,
        deleting: row.deleting,
      } : null
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }
  const listProjectSummariesWithActivity = async ({ accountId, workspaceId }: Readonly<{
    accountId: string
    workspaceId: string
  }>): Promise<readonly ProjectSummaryWithActivity[]> => {
    const client = await requireReadPool().connect()
    try {
      await client.query('BEGIN READ ONLY')
      const result = await client.query<JsonRow<readonly ProjectSummaryWithActivity[]>>(
        'SELECT project.list_project_summaries_with_activity($1, $2) AS value', [accountId, workspaceId],
      )
      await client.query('COMMIT')
      return result.rows[0]?.value ?? []
    } catch (error) {
      await client.query('ROLLBACK')
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
    // Starting from an existing repository is not offered yet, and never from the host Git path.
    if (input.body.sourceBootstrap.mode !== 'NEW') throw projectError('SOURCE_INPUT_REFUSED')
    const candidateProjectId = mintIdentity()
    const projectRevision = mintIdentity()
    if (![candidateProjectId, projectRevision].every(isProjectIdentity)) throw projectError('OUTCOME_UNKNOWN')
    const keyDigest = digestText(input.idempotencyKey)
    const requestDigest = digestBody(input.body)
    const reservation = await reserve(input, keyDigest, requestDigest, candidateProjectId)
    if (reservation.state === 'REPLAY') {
      if (!validReplay(reservation, input)) throw projectError('OUTCOME_UNKNOWN')
      return { ...reservation.response_body, replayed: true }
    }
    if (reservation.state !== 'RESERVED') throw projectError('OUTCOME_UNKNOWN')

    // The reserved receipt is the intent: a retry with the same key reaches the same Project id, and
    // so the repository this call may already have created.
    const projectId = reservation.project_id
    const starterRevision = await repository.prepare(projectId).catch((error: unknown) => {
      throw repositoryRefused(error)
    })

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

      const response: Prj03Response = {
        projectId,
        workspaceId: input.workspaceId,
        name: input.body.name,
        projectRevision,
        archived: false,
      }
      await client.query('SELECT project.create_project_with_repository($1, $2, $3, $4, $5, $6, $7, $8)', [
        input.accountId, input.workspaceId, keyDigest, requestDigest, projectId, input.body.name, projectRevision, starterRevision,
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
    listProjectSummariesWithActivity,
    deleteProject: deletionOrchestrator.deleteProject,
  })
}
