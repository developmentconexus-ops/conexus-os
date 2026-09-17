import { createHash, randomUUID } from 'node:crypto'
import type { QueryResultRow } from 'pg'
import type { PostgresPool } from '../platform/postgres.js'
import type { CredentialBackend } from '../platform/credential-backend.js'
import type { OAuthTokenSet } from '../project/anthropic-oauth.js'
import type { ClaudeCredentialReference } from './module.js'

export type ClaudeConnectionProjection = Readonly<{ connectionId: string; label: string; state: 'ACTIVE' | 'REVOKED'; generation: string; ownerAccountId: string; workspaceId: string; role: 'OWNER' | 'USER'; revokedAt: string | null }>
export type ClaudeAuthorization = Readonly<{ authorizationId: string; url: string; state: string }>
export type ClaudeAccountStore = Readonly<{
  startAuthorization(input: Readonly<{ accountId: string; authorization: Readonly<{ authorizationId: string; state: string; verifier: string; url: string }> }>): Promise<ClaudeAuthorization>
  completeAuthorization(input: Readonly<{ accountId: string; result: string; label: string; parse: (value: string, state: string) => string; exchange: (input: Readonly<{ code: string; verifier: string; fetchImpl?: typeof fetch }>) => Promise<OAuthTokenSet>; fetchImpl?: typeof fetch }>): Promise<ClaudeConnectionProjection>
  list(accountId: string): Promise<readonly ClaudeConnectionProjection[]>
  select(input: Readonly<{ accountId: string; connectionId: string }>): Promise<void>
  share(input: Readonly<{ accountId: string; connectionId: string; targetAccountId: string; workspaceId: string }>): Promise<void>
  revoke(input: Readonly<{ accountId: string; connectionId: string }>): Promise<void>
  admitForProject(input: Readonly<{ accountId: string; projectId: string }>): Promise<ClaudeCredentialReference>
}>

const text = (value: unknown): string => typeof value === 'string' ? value : ''
const stateDigest = (state: string): Buffer => createHash('sha256').update(state, 'utf8').digest()
const generation = (value: unknown): string => typeof value === 'bigint' ? value.toString() : String(value)
const rowProjection = (row: QueryResultRow): ClaudeConnectionProjection => ({
  connectionId: text(row.connection_id), label: text(row.label), state: row.state === 'REVOKED' ? 'REVOKED' : 'ACTIVE',
  generation: generation(row.current_generation), ownerAccountId: text(row.owner_account_id), workspaceId: text(row.workspace_id),
  role: row.role === 'OWNER' ? 'OWNER' : 'USER', revokedAt: row.revoked_at instanceof Date ? row.revoked_at.toISOString() : null,
})

export const createClaudeAccountStore = ({ pool, credentialBackend }: Readonly<{ pool: PostgresPool; credentialBackend: CredentialBackend }>): ClaudeAccountStore => Object.freeze({
  startAuthorization: async ({ accountId, authorization }) => {
    const ok = (await pool.query('SELECT claude_connection.start_authorization($1,$2,$3,$4,$5) AS value', [authorization.authorizationId, accountId, stateDigest(authorization.state), authorization.verifier, new Date(Date.now() + 10 * 60_000)])).rows[0]?.value
    if (ok !== true) throw new Error('CLAUDE_AUTHORIZATION_REFUSED')
    return { authorizationId: authorization.authorizationId, url: authorization.url, state: authorization.state }
  },
  completeAuthorization: async ({ accountId, result, label, parse, exchange, fetchImpl }) => {
    const separator = result.lastIndexOf('#')
    if (separator < 1) throw new Error('ANTHROPIC_OAUTH_AUTHORIZATION_RESULT_INVALID')
    const state = result.slice(separator + 1).trim()
    const consumed = await pool.query<QueryResultRow & { authorization_id: string; pkce_verifier: string }>('SELECT * FROM claude_connection.consume_authorization($1,$2)', [accountId, stateDigest(state)])
    const pending = consumed.rows[0]
    if (!pending) throw new Error('ANTHROPIC_OAUTH_STATE_INVALID')
    const code = parse(result, state)
    try {
      const tokens = await exchange({ code, verifier: pending.pkce_verifier, ...(fetchImpl ? { fetchImpl } : {}) })
      const connectionId = randomUUID()
      const plaintext = Buffer.from(JSON.stringify(tokens), 'utf8')
      try {
        await credentialBackend.publishOrMatch({ connectionId, generation: '1' }, plaintext)
      } finally { plaintext.fill(0) }
      const published = await pool.query('SELECT claude_connection.publish_connection($1,$2,$3,$4) AS value', [accountId, connectionId, label, 1])
      if (published.rows[0]?.value !== true) throw new Error('CLAUDE_CONNECTION_PUBLISH_REFUSED')
      if ((await pool.query('SELECT claude_connection.complete_authorization($1) AS value', [pending.authorization_id])).rows[0]?.value !== true) {
        throw new Error('CLAUDE_AUTHORIZATION_SETTLEMENT_REFUSED')
      }
      const listed = await pool.query('SELECT * FROM claude_connection.list_connections($1) WHERE connection_id = $2', [accountId, connectionId])
      if (!listed.rows[0]) throw new Error('CLAUDE_CONNECTION_PUBLISH_REFUSED')
      return rowProjection(listed.rows[0])
    } catch (error) {
      await pool.query('SELECT claude_connection.fail_authorization($1) AS value', [pending.authorization_id]).catch(() => undefined)
      throw error
    }
  },
  list: async (accountId) => (await pool.query('SELECT * FROM claude_connection.list_connections($1)', [accountId])).rows.map(rowProjection),
  select: async ({ accountId, connectionId }) => { if ((await pool.query('SELECT claude_connection.select_connection($1,$2) AS value', [accountId, connectionId])).rows[0]?.value !== true) throw new Error('CLAUDE_CONNECTION_SELECT_DENIED') },
  share: async ({ accountId, connectionId, targetAccountId, workspaceId }) => { if ((await pool.query('SELECT claude_connection.share_connection($1,$2,$3,$4) AS value', [accountId, connectionId, targetAccountId, workspaceId])).rows[0]?.value !== true) throw new Error('CLAUDE_CONNECTION_SHARE_DENIED') },
  revoke: async ({ accountId, connectionId }) => { if ((await pool.query('SELECT claude_connection.revoke_connection($1,$2) AS value', [accountId, connectionId])).rows[0]?.value !== true) throw new Error('CLAUDE_CONNECTION_REVOKE_DENIED') },
  admitForProject: async ({ accountId, projectId }) => {
    const row = (await pool.query<QueryResultRow & { connection_id: string; generation: string | number | bigint }>('SELECT * FROM claude_connection.admit_for_project($1,$2)', [accountId, projectId])).rows[0]
    if (!row) throw new Error('CLAUDE_CONNECTION_REQUIRED')
    return { connectionId: row.connection_id, generation: generation(row.generation) }
  },
})
