import { randomUUID } from 'node:crypto'
import type { PoolClient, QueryResultRow } from 'pg'
import { canonicalBytes, sha256 } from '../../../../packages/canonical-json/src/index.mjs'
import type { PostgresPool } from '../platform/postgres.js'
import { workspaceError } from './errors.js'

export type WorkspaceSummary = Readonly<{
  workspaceId: string
  name: string
}>

export type WorkspaceCreateResult = WorkspaceSummary & Readonly<{
  creatorAccountId: string
  initialAccessEstablished: true
  replayed: boolean
}>

type CreateWorkspaceInput = Readonly<{
  accountId: string
  idempotencyKey: string
  name: string
}>

type GetWorkspaceInput = Readonly<{
  accountId: string
  workspaceId: string
}>

type WorkspaceResponseBody = Omit<WorkspaceCreateResult, 'replayed'>

type ReservationRow = QueryResultRow & Readonly<{
  state: 'RESERVED' | 'REPLAY' | 'CONFLICT'
  workspace_id: string
  response_status: number | null
  response_body: WorkspaceResponseBody | null
}>

type WorkspaceRow = QueryResultRow & Readonly<{
  workspace_id: string
  name: string
}>

export type WorkspaceStore = Readonly<{
  createWorkspace(input: CreateWorkspaceInput): Promise<WorkspaceCreateResult>
  getWorkspace(input: GetWorkspaceInput): Promise<WorkspaceSummary | null>
}>

const keyDigest = (value: string): string => sha256(Buffer.from(value, 'utf8'))
const bodyDigest = (value: unknown): string => sha256(canonicalBytes(value))
const validReplay = (
  row: ReservationRow,
  accountId: string,
  name: string,
): row is ReservationRow & Readonly<{ response_status: 201; response_body: WorkspaceResponseBody }> => {
  const body = row.response_body
  return row.response_status === 201 && body !== null &&
    Object.keys(body).sort().join(',') === 'creatorAccountId,initialAccessEstablished,name,workspaceId' &&
    body.workspaceId === row.workspace_id && body.name === name &&
    body.creatorAccountId === accountId && body.initialAccessEstablished === true
}

export const createWorkspaceStore = ({
  commandPool,
  readPool,
}: Readonly<{
  commandPool: PostgresPool
  readPool: PostgresPool
}>): WorkspaceStore => {
  const createWorkspace = async ({ accountId, idempotencyKey, name }: CreateWorkspaceInput): Promise<WorkspaceCreateResult> => {
    const client = await commandPool.connect()
    try {
      await client.query('BEGIN')

      const candidateWorkspaceId = randomUUID()
      const requestDigest = bodyDigest({ name })
      const reservation = await client.query<ReservationRow>(`
        SELECT *
        FROM workspace.reserve_or_replay_create_workspace($1, $2, $3, $4)
      `, [accountId, keyDigest(idempotencyKey), requestDigest, candidateWorkspaceId])
      const row = reservation.rows[0]
      if (!row) throw workspaceError('OUTCOME_UNKNOWN')
      if (row.state === 'CONFLICT') throw workspaceError('IDEMPOTENCY_CONFLICT')
      if (row.state === 'REPLAY') {
        if (!validReplay(row, accountId, name)) throw workspaceError('OUTCOME_UNKNOWN')
        await client.query('COMMIT')
        return { ...row.response_body, replayed: true }
      }
      if (row.state !== 'RESERVED') throw workspaceError('OUTCOME_UNKNOWN')

      await client.query('SELECT workspace.create_workspace($1, $2)', [row.workspace_id, name])
      await client.query('SELECT iam.establish_workspace_creator_access($1, $2)', [accountId, row.workspace_id])

      const responseBody: WorkspaceResponseBody = {
        workspaceId: row.workspace_id,
        name,
        creatorAccountId: accountId,
        initialAccessEstablished: true,
      }
      await client.query('SELECT workspace.complete_create_workspace_receipt($1, $2, $3, $4, $5)', [
        accountId,
        keyDigest(idempotencyKey),
        201,
        bodyDigest(responseBody),
        JSON.stringify(responseBody),
      ])
      await client.query('COMMIT')
      return { ...responseBody, replayed: false }
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  const getWorkspace = async ({ accountId, workspaceId }: GetWorkspaceInput): Promise<WorkspaceSummary | null> => {
    const client: PoolClient = await readPool.connect()
    try {
      await client.query('BEGIN READ ONLY')
      const result = await client.query<WorkspaceRow>(`
        SELECT s.workspace_id, s.name
        FROM workspace.list_workspace_summaries(
          ARRAY(SELECT m.workspace_id
                FROM iam.list_workspace_memberships($1) m
                WHERE m.workspace_id = $2)
        ) s
      `, [accountId, workspaceId])
      const row = result.rows[0] ?? null
      await client.query('COMMIT')
      return row ? { workspaceId: row.workspace_id, name: row.name } : null
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  return Object.freeze({ createWorkspace, getWorkspace })
}
