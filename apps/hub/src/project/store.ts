import { randomUUID } from 'node:crypto'
import type { QueryResultRow } from 'pg'
import { canonicalBytes, sha256 } from '../../../../packages/canonical-json/src/index.mjs'
import type {
  Prj01Response,
  Prj02Response,
  Prj03Body,
  Prj03Response,
} from '../generated/s3-routes.js'
import type { FactoryBinding } from '../builder/factory-provisioning.js'
import type { PostgresPool } from '../platform/postgres.js'
import { projectError, repositoryRefused } from './errors.js'
import { isProjectIdentity } from './identity.js'

// Gives a Project that does not exist yet its repository and Factory rows, and nothing else. The
// same Project id always reaches the same repository, so calling it again converges.
export type ProjectRepositoryPort = Readonly<{
  prepare(input: Readonly<{ projectId: string; projectName: string }>): Promise<FactoryBinding>
}>

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
type ProjectSummaryRow = QueryResultRow & Readonly<{
  project_id: string
  workspace_id: string
  name: string
  archived: boolean
}>
type ProjectRepresentationRow = ProjectSummaryRow & Readonly<{ project_revision: string }>

export type ProjectStore = Readonly<{
  createProject(input: CreateProjectInput): Promise<CreateProjectResult>
  listProjects(input: Readonly<{ accountId: string; workspaceId: string }>): Promise<Prj01Response>
  getProject(input: Readonly<{ accountId: string; projectId: string }>): Promise<Prj02Response | null>
}>

const digestText = (value: string): string => sha256(Buffer.from(value, 'utf8'))
const digestBody = (value: unknown): string => sha256(canonicalBytes(value))
const errorText = (error: unknown): string => error instanceof Error ? error.message : ''
const isNotAdmitted = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '42501'
const mapDatabaseError = (error: unknown): never => {
  if (isNotAdmitted(error)) throw projectError('AUTHORIZATION_DENIED')
  if (errorText(error).startsWith('FACTORY_BINDING_')) throw repositoryRefused(error)
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
  repository,
  mintIdentity = randomUUID,
}: Readonly<{
  commandPool: PostgresPool
  readPool?: PostgresPool
  repository: ProjectRepositoryPort
  mintIdentity?: () => string
}>): ProjectStore => {
  const requireReadPool = (): PostgresPool => {
    if (!readPool) throw new Error('PROJECT_READ_POOL_NOT_CONFIGURED')
    return readPool
  }

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
      const result = await client.query<ProjectRepresentationRow>(`
        SELECT detail.project_id, detail.workspace_id, detail.name,
          detail.project_revision, detail.archived
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
      } : null
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
    const binding = await repository.prepare({ projectId, projectName: input.body.name }).catch((error: unknown) => {
      throw repositoryRefused(error)
    })
    if (binding.projectId !== projectId) throw projectError('OUTCOME_UNKNOWN')

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
      await client.query('SELECT project.create_project_with_repository($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)', [
        input.accountId, input.workspaceId, keyDigest, requestDigest, projectId, input.body.name, projectRevision,
        binding.factoryProjectId, binding.projectRepositoryId, binding.repositoryId, binding.headRevision,
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
  })
}
