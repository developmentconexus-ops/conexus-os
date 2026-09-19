import { createHash, randomUUID } from 'node:crypto'
import type { QueryResultRow } from 'pg'
import type { PostgresPool } from '../platform/postgres.js'
import type { CredentialBackend } from '../platform/credential-backend.js'
import type { OAuthTokenSet } from '../model-connection/anthropic-oauth.js'

export const ANTHROPIC_PROVIDER_ID = 'anthropic'

export type ClaudeCredentialReference = Readonly<{ connectionId: string; generation: string }>

export type ClaudeConnectionProjection = Readonly<{ connectionId: string; label: string; state: 'ACTIVE' | 'REVOKED'; generation: string; ownerAccountId: string; workspaceId: string; role: 'OWNER' | 'USER'; revokedAt: string | null }>
export type ClaudeAuthorization = Readonly<{ authorizationId: string; url: string; state: string }>
export type ClaudeAccountStore = Readonly<{
  startAuthorization(input: Readonly<{ accountId: string; authorization: Readonly<{ authorizationId: string; state: string; verifier: string; url: string }> }>): Promise<ClaudeAuthorization>
  completeAuthorization(input: Readonly<{ accountId: string; result: string; label: string; parse: (value: string, state: string) => string; exchange: (input: Readonly<{ code: string; state: string; verifier: string; fetchImpl?: typeof fetch }>) => Promise<OAuthTokenSet>; fetchImpl?: typeof fetch }>): Promise<ClaudeConnectionProjection>
  list(accountId: string): Promise<readonly ClaudeConnectionProjection[]>
  select(input: Readonly<{ accountId: string; connectionId: string }>): Promise<void>
  share(input: Readonly<{ accountId: string; connectionId: string; workspaceId: string }>): Promise<void>
  unshare(input: Readonly<{ accountId: string; connectionId: string; workspaceId: string }>): Promise<void>
  revoke(input: Readonly<{ accountId: string; connectionId: string }>): Promise<void>
  admitForProject(input: Readonly<{ accountId: string; projectId: string; providerId?: string | null }>): Promise<ClaudeCredentialReference>
}>

const text = (value: unknown): string => typeof value === 'string' ? value : ''
const stateDigest = (state: string): Buffer => createHash('sha256').update(state, 'utf8').digest()
const generation = (value: unknown): string => typeof value === 'bigint' ? value.toString() : String(value)
const refuseNotAdmitted = (denial: string) => (error: unknown): never => {
  if (typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '42501') throw new Error(denial)
  throw error
}
const rowProjection = (row: QueryResultRow): ClaudeConnectionProjection => ({
  connectionId: text(row.connection_id), label: text(row.label), state: row.state === 'REVOKED' ? 'REVOKED' : 'ACTIVE',
  generation: generation(row.current_generation), ownerAccountId: text(row.owner_account_id), workspaceId: text(row.workspace_id),
  role: row.role === 'OWNER' ? 'OWNER' : 'USER', revokedAt: row.revoked_at instanceof Date ? row.revoked_at.toISOString() : null,
})

export const createClaudeAccountStore = ({ pool, credentialBackend }: Readonly<{ pool: PostgresPool; credentialBackend: CredentialBackend }>): ClaudeAccountStore => Object.freeze({
  startAuthorization: async ({ accountId, authorization }) => {
    const ok = (await pool.query('SELECT model_connection.start_authorization($1,$2,$3,$4,$5) AS value', [authorization.authorizationId, accountId, stateDigest(authorization.state), authorization.verifier, new Date(Date.now() + 10 * 60_000)])).rows[0]?.value
    if (ok !== true) throw new Error('CLAUDE_AUTHORIZATION_REFUSED')
    return { authorizationId: authorization.authorizationId, url: authorization.url, state: authorization.state }
  },
  completeAuthorization: async ({ accountId, result, label, parse, exchange, fetchImpl }) => {
    const separator = result.lastIndexOf('#')
    if (separator < 1) throw new Error('ANTHROPIC_OAUTH_AUTHORIZATION_RESULT_INVALID')
    const state = result.slice(separator + 1).trim()
    const consumed = await pool.query<QueryResultRow & { authorization_id: string; pkce_verifier: string }>('SELECT * FROM model_connection.consume_authorization($1,$2)', [accountId, stateDigest(state)])
    const pending = consumed.rows[0]
    if (!pending) throw new Error('ANTHROPIC_OAUTH_STATE_INVALID')
    const code = parse(result, state)
    try {
      const tokens = await exchange({ code, state, verifier: pending.pkce_verifier, ...(fetchImpl ? { fetchImpl } : {}) })
      const connectionId = randomUUID()
      const plaintext = Buffer.from(JSON.stringify(tokens), 'utf8')
      try {
        await credentialBackend.publishOrMatch({ connectionId, generation: '1' }, plaintext)
      } finally { plaintext.fill(0) }
      const published = await pool.query('SELECT model_connection.publish_connection($1,$2,$3,$4,$5,$6) AS value', [accountId, connectionId, ANTHROPIC_PROVIDER_ID, 'OAUTH_TOKEN_SET', label, 1])
      if (published.rows[0]?.value !== true) throw new Error('MODEL_CONNECTION_PUBLISH_REFUSED')
      if ((await pool.query('SELECT model_connection.complete_authorization($1) AS value', [pending.authorization_id])).rows[0]?.value !== true) {
        throw new Error('MODEL_AUTHORIZATION_SETTLEMENT_REFUSED')
      }
      const listed = await pool.query('SELECT * FROM model_connection.list_connections($1) WHERE connection_id = $2', [accountId, connectionId])
      if (!listed.rows[0]) throw new Error('MODEL_CONNECTION_PUBLISH_REFUSED')
      return rowProjection(listed.rows[0])
    } catch (error) {
      await pool.query('SELECT model_connection.fail_authorization($1) AS value', [pending.authorization_id]).catch(() => undefined)
      throw error
    }
  },
  list: async (accountId) => (await pool.query('SELECT * FROM model_connection.list_connections($1)', [accountId])).rows.map(rowProjection),
  select: async ({ accountId, connectionId }) => { if ((await pool.query('SELECT model_connection.select_connection($1,$2) AS value', [accountId, connectionId])).rows[0]?.value !== true) throw new Error('MODEL_CONNECTION_SELECT_DENIED') },
  share: async ({ accountId, connectionId, workspaceId }) => {
    const shared = await pool.query('SELECT model_connection.share_connection($1,$2,$3) AS value', [accountId, connectionId, workspaceId]).catch(refuseNotAdmitted('MODEL_CONNECTION_SHARE_DENIED'))
    if (shared.rows[0]?.value !== true) throw new Error('MODEL_CONNECTION_SHARE_DENIED')
  },
  unshare: async ({ accountId, connectionId, workspaceId }) => {
    const unshared = await pool.query('SELECT model_connection.unshare_connection($1,$2,$3) AS value', [accountId, connectionId, workspaceId]).catch(refuseNotAdmitted('MODEL_CONNECTION_UNSHARE_DENIED'))
    if (unshared.rows[0]?.value !== true) throw new Error('MODEL_CONNECTION_UNSHARE_DENIED')
  },
  revoke: async ({ accountId, connectionId }) => { if ((await pool.query('SELECT model_connection.revoke_connection($1,$2) AS value', [accountId, connectionId])).rows[0]?.value !== true) throw new Error('MODEL_CONNECTION_REVOKE_DENIED') },
  admitForProject: async ({ accountId, projectId, providerId = null }) => {
    const row = (await pool.query<QueryResultRow & { connection_id: string; generation: string | number | bigint }>('SELECT * FROM model_connection.admit_for_project($1,$2,$3)', [accountId, projectId, providerId])).rows[0]
    if (!row) throw new Error('MODEL_CONNECTION_REQUIRED')
    return { connectionId: row.connection_id, generation: generation(row.generation) }
  },
})
