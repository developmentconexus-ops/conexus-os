import { createHash, randomUUID } from 'node:crypto'
import type { QueryResultRow } from 'pg'
import type { PostgresPool } from '../platform/postgres.js'
import type { CredentialBackend } from '../platform/credential-backend.js'
import type { OAuthTokenSet } from '../model-connection/oauth-token-endpoint.js'

export type ModelCredentialReference = Readonly<{ connectionId: string; generation: string }>

// The projection is everything a caller may learn about a connection. It carries provider, kind,
// label and state, and never the credential: no operation in this module returns one.
export type ModelConnectionProjection = Readonly<{ connectionId: string; label: string; state: 'ACTIVE' | 'REVOKED'; generation: string; ownerAccountId: string; workspaceId: string; role: 'OWNER' | 'USER'; revokedAt: string | null; providerId: string; credentialKind: 'OAUTH_TOKEN_SET' | 'API_KEY'; selected: boolean }>
export type ModelAuthorization = Readonly<{ authorizationId: string; url: string; state: string }>
export type ModelConnectionStore = Readonly<{
  startAuthorization(input: Readonly<{ accountId: string; authorization: Readonly<{ authorizationId: string; state: string; verifier: string; url: string }> }>): Promise<ModelAuthorization>
  completeAuthorization(input: Readonly<{ accountId: string; providerId: string; result: string; label: string; extractState: (value: string) => string; parse: (value: string, state: string) => string; exchange: (input: Readonly<{ code: string; state: string; verifier: string; fetchImpl?: typeof fetch }>) => Promise<OAuthTokenSet>; fetchImpl?: typeof fetch }>): Promise<ModelConnectionProjection>
  addApiKey(input: Readonly<{ accountId: string; providerId: string; label: string; apiKey: string }>): Promise<ModelConnectionProjection>
  list(accountId: string): Promise<readonly ModelConnectionProjection[]>
  select(input: Readonly<{ accountId: string; connectionId: string }>): Promise<void>
  share(input: Readonly<{ accountId: string; connectionId: string; workspaceId: string }>): Promise<void>
  unshare(input: Readonly<{ accountId: string; connectionId: string; workspaceId: string }>): Promise<void>
  revoke(input: Readonly<{ accountId: string; connectionId: string }>): Promise<void>
  admitForProject(input: Readonly<{ accountId: string; projectId: string; providerId?: string | null }>): Promise<ModelCredentialReference>
}>

const text = (value: unknown): string => typeof value === 'string' ? value : ''
const stateDigest = (state: string): Buffer => createHash('sha256').update(state, 'utf8').digest()
const generation = (value: unknown): string => typeof value === 'bigint' ? value.toString() : String(value)
const refuseNotAdmitted = (denial: string) => (error: unknown): never => {
  if (typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '42501') throw new Error(denial)
  throw error
}
const rowProjection = (row: QueryResultRow): ModelConnectionProjection => ({
  connectionId: text(row.connection_id), label: text(row.label), state: row.state === 'REVOKED' ? 'REVOKED' : 'ACTIVE',
  generation: generation(row.current_generation), ownerAccountId: text(row.owner_account_id), workspaceId: text(row.workspace_id),
  role: row.role === 'OWNER' ? 'OWNER' : 'USER', revokedAt: row.revoked_at instanceof Date ? row.revoked_at.toISOString() : null,
  providerId: text(row.provider_id), credentialKind: row.credential_kind === 'API_KEY' ? 'API_KEY' : 'OAUTH_TOKEN_SET',
  selected: row.selected === true,
})

export const createModelConnectionStore = ({ pool, credentialBackend }: Readonly<{ pool: PostgresPool; credentialBackend: CredentialBackend }>): ModelConnectionStore => Object.freeze({
  startAuthorization: async ({ accountId, authorization }) => {
    const ok = (await pool.query('SELECT model_connection.start_authorization($1,$2,$3,$4,$5) AS value', [authorization.authorizationId, accountId, stateDigest(authorization.state), authorization.verifier, new Date(Date.now() + 10 * 60_000)])).rows[0]?.value
    if (ok !== true) throw new Error('MODEL_AUTHORIZATION_REFUSED')
    return { authorizationId: authorization.authorizationId, url: authorization.url, state: authorization.state }
  },
  // The state is recovered from the pasted value by the provider that minted it, because what the
  // user pastes differs per provider: Anthropic prints `code#state`, OpenAI sends the whole
  // redirect URL. The recovered state is only a lookup key for the authorization row; the row's
  // own state digest decides whether it matches, and parse() compares the two in constant time.
  completeAuthorization: async ({ accountId, providerId, result, label, extractState, parse, exchange, fetchImpl }) => {
    const state = extractState(result)
    const consumed = await pool.query<QueryResultRow & { authorization_id: string; pkce_verifier: string }>('SELECT * FROM model_connection.consume_authorization($1,$2)', [accountId, stateDigest(state)])
    const pending = consumed.rows[0]
    if (!pending) throw new Error('MODEL_AUTHORIZATION_STATE_INVALID')
    const code = parse(result, state)
    try {
      const tokens = await exchange({ code, state, verifier: pending.pkce_verifier, ...(fetchImpl ? { fetchImpl } : {}) })
      const connectionId = randomUUID()
      const plaintext = Buffer.from(JSON.stringify(tokens), 'utf8')
      try {
        await credentialBackend.publishOrMatch({ connectionId, generation: '1' }, plaintext)
      } finally { plaintext.fill(0) }
      const published = await pool.query('SELECT model_connection.publish_connection($1,$2,$3,$4,$5,$6) AS value', [accountId, connectionId, providerId, 'OAUTH_TOKEN_SET', label, 1])
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
  // The key goes to custody and nowhere else. It is never returned, and the projection the caller
  // gets back is the same one list() returns, built by re-reading the row rather than echoing the
  // input, so there is no path by which the key could ride the response.
  addApiKey: async ({ accountId, providerId, label, apiKey }) => {
    const connectionId = randomUUID()
    const plaintext = Buffer.from(apiKey, 'utf8')
    try {
      await credentialBackend.publishOrMatch({ connectionId, generation: '1' }, plaintext)
    } finally { plaintext.fill(0) }
    const published = await pool.query('SELECT model_connection.publish_connection($1,$2,$3,$4,$5,$6) AS value',
      [accountId, connectionId, providerId, 'API_KEY', label, 1])
    if (published.rows[0]?.value !== true) throw new Error('MODEL_CONNECTION_PUBLISH_REFUSED')
    const listed = await pool.query('SELECT * FROM model_connection.list_connections($1) WHERE connection_id = $2', [accountId, connectionId])
    if (!listed.rows[0]) throw new Error('MODEL_CONNECTION_PUBLISH_REFUSED')
    return rowProjection(listed.rows[0])
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
