import { randomUUID } from 'node:crypto'
import type { QueryResultRow } from 'pg'
import type { z } from 'zod'
import { canonicalBytes, sha256 } from '../../../../packages/canonical-json/src/index.mjs'
import { ProjectCard, ProjectCreated, ProjectDetail, ProjectListItem } from '../../../../packages/contract/dist/index.js'
import type { AccountId, Input, ProjectId, PRJ03, WorkspaceId } from '../../../../packages/contract/dist/index.js'
import { Failure } from '../platform/failure.js'
import { errorCode, type PostgresPool } from '../platform/db.js'
import { createProjectDeletionOrchestrator } from './deletion.js'
import type { ProjectDeletionPorts } from './deletion.js'
import { isProjectIdentity } from './identity.js'

// Gives a Project that does not exist yet its repository in the Conexus Git, with the starter on
// `main`, and answers `main`. The same Project id always reaches the same repository, so calling it
// again converges.
export type ProjectRepositoryPort = Readonly<{
  prepare(projectId: string): Promise<string>
}>

type Prj03Response = z.output<typeof ProjectCreated>
type CreateProjectInput = Readonly<{
  accountId: AccountId
  workspaceId: WorkspaceId
  idempotencyKey: string
  body: Input<typeof PRJ03>['body']
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

export type ProjectStore = Readonly<{
  createProject(input: CreateProjectInput): Promise<CreateProjectResult>
  listProjects(input: Readonly<{ accountId: AccountId; workspaceId: WorkspaceId }>): Promise<z.output<typeof ProjectListItem>[]>
  getProject(input: Readonly<{ accountId: AccountId; projectId: ProjectId }>): Promise<ProjectDetail | null>
  listProjectSummariesWithActivity(input: Readonly<{ accountId: AccountId; workspaceId: WorkspaceId }>): Promise<ProjectCard[]>
  deleteProject(input: Readonly<{ accountId: AccountId; projectId: ProjectId; confirmName: string }>): Promise<void>
}>

const digestText = (value: string): string => sha256(Buffer.from(value, 'utf8'))
const digestBody = (value: unknown): string => sha256(canonicalBytes(value))
const isNotAdmitted = (error: unknown): boolean => errorCode(error) === '42501'
// Conexus Git failures are named codes; only the code is kept, and anything else is a failure with no name.
const GIT_FAILURE_NAME = /^(CONEXUS_GIT_[A-Z_]+)$/
const gitFailureName = (error: unknown): string => GIT_FAILURE_NAME.exec(error instanceof Error ? error.message : '')?.[1] ?? 'CONEXUS_GIT_FAILED'
const mapDatabaseError = (error: unknown): never => {
  if (isNotAdmitted(error)) throw new Failure('PROJECT_CREATE_DENIED')
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
    if (!readPool) throw new Failure('INTERNAL_UNEXPECTED', { details: { invariant: 'PROJECT_READ_POOL_NOT_CONFIGURED' } })
    return readPool
  }
  const deletionOrchestrator = createProjectDeletionOrchestrator({ commandPool, ports: deletion })

  const listProjects = async ({ accountId, workspaceId }: Readonly<{
    accountId: AccountId
    workspaceId: WorkspaceId
  }>): Promise<z.output<typeof ProjectListItem>[]> => {
    const client = await requireReadPool().connect()
    try {
      await client.query('BEGIN READ ONLY')
      const result = await client.query<ProjectSummaryRow>(`
        SELECT summary.project_id, summary.workspace_id, summary.name, summary.archived
        FROM project.list_project_summaries($1, $2) summary
      `, [accountId, workspaceId])
      await client.query('COMMIT')
      return ProjectListItem.array().parse(result.rows.map((row) => ({
        projectId: row.project_id,
        workspaceId: row.workspace_id,
        name: row.name,
        archived: row.archived,
      })))
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  const getProject = async ({ accountId, projectId }: Readonly<{
    accountId: AccountId
    projectId: ProjectId
  }>): Promise<ProjectDetail | null> => {
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
      return row ? ProjectDetail.parse({
        projectId: row.project_id,
        workspaceId: row.workspace_id,
        name: row.name,
        projectRevision: row.project_revision,
        archived: row.archived,
        deleting: row.deleting,
      }) : null
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }
  const listProjectSummariesWithActivity = async ({ accountId, workspaceId }: Readonly<{
    accountId: AccountId
    workspaceId: WorkspaceId
  }>): Promise<ProjectCard[]> => {
    const client = await requireReadPool().connect()
    try {
      await client.query('BEGIN READ ONLY')
      const result = await client.query<JsonRow<readonly ProjectCard[]>>(
        'SELECT project.list_project_summaries_with_activity($1, $2) AS value', [accountId, workspaceId],
      )
      await client.query('COMMIT')
      return ProjectCard.array().parse(result.rows[0]?.value ?? [])
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
      if (!row) throw new Failure('OUTCOME_UNKNOWN')
      if (row.state === 'CONFLICT') throw new Failure('IDEMPOTENCY_CONFLICT')
      if (!isProjectIdentity(row.project_id)) throw new Failure('OUTCOME_UNKNOWN')
      if (row.state === 'REPLAY' && !validReplay(row, input)) throw new Failure('OUTCOME_UNKNOWN')
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
    if (input.body.sourceBootstrap.mode !== 'NEW') throw new Failure('PROJECT_SOURCE_REFUSED')
    const candidateProjectId = mintIdentity()
    const projectRevision = mintIdentity()
    if (![candidateProjectId, projectRevision].every(isProjectIdentity)) throw new Failure('OUTCOME_UNKNOWN')
    const keyDigest = digestText(input.idempotencyKey)
    const requestDigest = digestBody(input.body)
    const reservation = await reserve(input, keyDigest, requestDigest, candidateProjectId)
    if (reservation.state === 'REPLAY') {
      if (!validReplay(reservation, input)) throw new Failure('OUTCOME_UNKNOWN')
      return { ...reservation.response_body, replayed: true }
    }
    if (reservation.state !== 'RESERVED') throw new Failure('OUTCOME_UNKNOWN')

    // The reserved receipt is the intent: a retry with the same key reaches the same Project id, and
    // so the repository this call may already have created.
    const projectId = reservation.project_id
    const starterRevision = await repository.prepare(projectId).catch((error: unknown) => {
      throw new Failure('PROJECT_REPOSITORY_UNAVAILABLE', { cause: error, details: { reason: gitFailureName(error) } })
    })

    const client = await commandPool.connect()
    try {
      await client.query('BEGIN')
      const locked = await client.query<LockRow>(`
        SELECT * FROM project.lock_create_project_receipt($1, $2, $3, $4, $5)
      `, [input.accountId, input.workspaceId, keyDigest, requestDigest, projectId])
      const lock = locked.rows[0]
      if (!lock || lock.project_id !== projectId) throw new Failure('OUTCOME_UNKNOWN')
      if (lock.outcome === 'SUCCEEDED') {
        const replay = await client.query<ReservationRow>(`
          SELECT * FROM project.reserve_or_replay_create_project($1, $2, $3, $4, $5)
        `, [input.accountId, input.workspaceId, keyDigest, requestDigest, projectId])
        const row = replay.rows[0]
        if (row?.state !== 'REPLAY' || !validReplay(row, input)) throw new Failure('OUTCOME_UNKNOWN')
        await client.query('COMMIT')
        return { ...row.response_body, replayed: true }
      }
      if (lock.outcome !== 'RESERVED') throw new Failure('OUTCOME_UNKNOWN')

      const response = ProjectCreated.parse({
        projectId,
        workspaceId: input.workspaceId,
        name: input.body.name,
        projectRevision,
        archived: false,
      })
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
