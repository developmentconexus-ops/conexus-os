import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { BinaryLike } from 'node:crypto'
import type { PoolClient, QueryResultRow } from 'pg'
import { canonicalBytes } from '../../../../packages/canonical-json/src/index.mjs'
import type { PostgresPool } from '../platform/postgres.js'
import { identityAccessError, translatePostgresError } from './errors.js'
import type { OidcIdentity, OidcTransaction } from './oidc.js'

const IDLE_MS = 30 * 60 * 1000
const ABSOLUTE_MS = 8 * 60 * 60 * 1000
const BOOTSTRAP_MS = 10 * 60 * 1000
const OIDC_MS = 10 * 60 * 1000
const digest = (value: BinaryLike): Buffer => createHash('sha256').update(value).digest()
const token = (): string => randomBytes(32).toString('base64url')

export type AccountSummary = Readonly<{ accountId: string; displayName: string; email?: string }>
export type CurrentSession = Readonly<{ account: AccountSummary; issuer: string; subject: string }>
export type SessionTokens = Readonly<{ sessionToken: string; csrfToken: string }>
export type ProvisionResult = AccountSummary & Readonly<{ replayed: boolean }>
export type AccessibleWorkspace = Readonly<{ workspaceId: string; name: string }>

type AccountRow = QueryResultRow & {
  account_id: string
  issuer: string
  external_subject: string
  display_name: string
  email: string | null
  active: boolean
}

type OidcTransactionRow = QueryResultRow & {
  pkce_verifier: string
  nonce: string
  expires_at: Date
  consumed_at: Date | null
}

type BootstrapRow = QueryResultRow & {
  issuer: string
  external_subject: string
  expires_at: Date
  consumed_at: Date | null
}

type SessionRow = AccountRow & {
  csrf_digest: Buffer
  idle_expires_at: Date
  absolute_expires_at: Date
  revoked_at: Date | null
}

type IdempotencyRow = QueryResultRow & {
  request_digest: Buffer
  outcome: string
  response_body: AccountSummary
}

type WorkspaceSummaryRow = QueryResultRow & {
  workspace_id: string
  name: string
}

const accountSummary = (row: AccountRow): AccountSummary => ({
  accountId: row.account_id,
  displayName: row.display_name,
  ...(row.email ? { email: row.email } : {}),
})

export type IdentityAccessStore = Readonly<{
  createOidcTransaction(input: OidcTransaction & Readonly<{ now?: Date }>): Promise<void>
  consumeOidcTransaction(input: Readonly<{ state: string; now?: Date }>): Promise<Readonly<{ pkceVerifier: string; nonce: string }> | null>
  resolveIdentity(identity: OidcIdentity): Promise<AccountSummary | null>
  createBootstrapContext(input: OidcIdentity & Readonly<{ configuredIssuer: string; configuredSubject: string; now?: Date }>): Promise<string>
  provisionBootstrap(input: Readonly<{ bootstrapToken: string; idempotencyKey: string; displayName: string; email?: string; now?: Date }>): Promise<ProvisionResult>
  createSession(input: Readonly<{ accountId: string; now?: Date }>): Promise<SessionTokens>
  validateSession(input: Readonly<{ sessionToken: string; csrfToken?: string; requireCsrf?: boolean; now?: Date }>): Promise<CurrentSession | null>
  listAccessibleWorkspaces(accountId: string): Promise<readonly AccessibleWorkspace[]>
  endSession(sessionToken: string, now?: Date): Promise<boolean>
  provisionByOperator(input: Readonly<{ operator: CurrentSession; issuer: string; idempotencyKey: string; externalSubject: string; displayName: string; email?: string; now?: Date }>): Promise<ProvisionResult>
  close(): Promise<void>
}>

export const createIdentityAccessStore = ({
  pool,
  workspaceReadPool,
}: Readonly<{
  pool: PostgresPool
  workspaceReadPool?: PostgresPool
}>): IdentityAccessStore => {
  const transaction = async <Result>(work: (client: PoolClient) => Promise<Result>): Promise<Result> => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const result = await work(client)
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK')
      return translatePostgresError(error)
    } finally {
      client.release()
    }
  }

  const loadAccountByIdentity = async (client: PoolClient, issuer: string, subject: string, lock = false): Promise<AccountRow | null> => {
    const result = await client.query<AccountRow>(`
      SELECT account_id, issuer, external_subject, display_name, email, active
      FROM iam.account WHERE issuer = $1 AND external_subject = $2
      ${lock ? 'FOR UPDATE' : ''}
    `, [issuer, subject])
    return result.rows[0] ?? null
  }

  return Object.freeze({
    async createOidcTransaction({ state, pkceVerifier, nonce, now = new Date() }): Promise<void> {
      await pool.query(`
        INSERT INTO iam.oidc_transaction(state_digest, pkce_verifier, nonce, expires_at)
        VALUES ($1, $2, $3, $4)
      `, [digest(state), pkceVerifier, nonce, new Date(now.getTime() + OIDC_MS)])
    },
    consumeOidcTransaction({ state, now = new Date() }) {
      return transaction(async (client) => {
        const found = await client.query<OidcTransactionRow>(`
          SELECT pkce_verifier, nonce, expires_at, consumed_at
          FROM iam.oidc_transaction WHERE state_digest = $1 FOR UPDATE
        `, [digest(state)])
        const row = found.rows[0]
        if (!row || row.consumed_at || now >= row.expires_at) return null
        await client.query('UPDATE iam.oidc_transaction SET consumed_at = $2 WHERE state_digest = $1', [digest(state), now])
        return { pkceVerifier: row.pkce_verifier, nonce: row.nonce }
      })
    },
    async resolveIdentity({ issuer, subject }) {
      const client = await pool.connect()
      try {
        const row = await loadAccountByIdentity(client, issuer, subject)
        return row?.active ? accountSummary(row) : null
      } finally {
        client.release()
      }
    },
    createBootstrapContext({ issuer, subject, configuredIssuer, configuredSubject, now = new Date() }) {
      if (issuer !== configuredIssuer || subject !== configuredSubject) throw identityAccessError('IDENTITY_NOT_ELIGIBLE')
      return transaction(async (client) => {
        if (await loadAccountByIdentity(client, issuer, subject, true)) throw identityAccessError('BOOTSTRAP_SEALED')
        const raw = token()
        const inserted = await client.query(`
          INSERT INTO iam.bootstrap_context(token_digest, issuer, external_subject, expires_at)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (issuer, external_subject) DO UPDATE
          SET token_digest = EXCLUDED.token_digest, expires_at = EXCLUDED.expires_at
          WHERE iam.bootstrap_context.consumed_at IS NULL AND iam.bootstrap_context.expires_at <= $5
          RETURNING token_digest
        `, [digest(raw), issuer, subject, new Date(now.getTime() + BOOTSTRAP_MS), now])
        if (inserted.rowCount !== 1) throw identityAccessError('BOOTSTRAP_SEALED')
        return raw
      })
    },
    provisionBootstrap({ bootstrapToken, idempotencyKey, displayName, email, now = new Date() }) {
      return transaction(async (client) => {
        const context = await client.query<BootstrapRow>(`
          SELECT issuer, external_subject, expires_at, consumed_at
          FROM iam.bootstrap_context WHERE token_digest = $1 FOR UPDATE
        `, [digest(bootstrapToken)])
        const row = context.rows[0]
        if (!row) throw identityAccessError('BOOTSTRAP_SEALED')
        const authorityScope = `bootstrap:${row.issuer}:${row.external_subject}`
        const request = { displayName, ...(email ? { email } : {}) }
        const replay = await reserve(client, authorityScope, idempotencyKey, request)
        if (replay) return { ...replay, replayed: true }
        if (row.consumed_at || now >= row.expires_at) throw identityAccessError('BOOTSTRAP_SEALED')
        const account: AccountSummary = { accountId: randomUUID(), displayName, ...(email ? { email } : {}) }
        await client.query(`
          INSERT INTO iam.account(account_id, issuer, external_subject, display_name, email)
          VALUES ($1, $2, $3, $4, $5)
        `, [account.accountId, row.issuer, row.external_subject, displayName, email ?? null])
        await client.query('UPDATE iam.bootstrap_context SET consumed_at = $2 WHERE token_digest = $1', [digest(bootstrapToken), now])
        await complete(client, authorityScope, idempotencyKey, account, now)
        return { ...account, replayed: false }
      })
    },
    createSession({ accountId, now = new Date() }) {
      return transaction(async (client) => {
        const account = await client.query<QueryResultRow & { active: boolean }>('SELECT active FROM iam.account WHERE account_id = $1 FOR UPDATE', [accountId])
        if (account.rowCount !== 1 || !account.rows[0]?.active) throw identityAccessError('ACCOUNT_INACTIVE')
        const sessionToken = token()
        const csrfToken = token()
        await client.query(`
          INSERT INTO iam.session(token_digest, csrf_digest, account_id, created_at, last_seen_at, idle_expires_at, absolute_expires_at)
          VALUES ($1, $2, $3, $4, $4, $5, $6)
        `, [digest(sessionToken), digest(csrfToken), accountId, now, new Date(now.getTime() + IDLE_MS), new Date(now.getTime() + ABSOLUTE_MS)])
        return { sessionToken, csrfToken }
      })
    },
    validateSession({ sessionToken, csrfToken, requireCsrf = false, now = new Date() }) {
      return transaction(async (client) => {
        const found = await client.query<SessionRow>(`
          SELECT s.account_id, s.csrf_digest, s.idle_expires_at, s.absolute_expires_at, s.revoked_at,
            a.issuer, a.external_subject, a.display_name, a.email, a.active
          FROM iam.session s JOIN iam.account a USING (account_id)
          WHERE s.token_digest = $1 FOR UPDATE OF s
        `, [digest(sessionToken)])
        const row = found.rows[0]
        if (!row || row.revoked_at || !row.active || now >= row.idle_expires_at || now >= row.absolute_expires_at) return null
        if (requireCsrf && (!csrfToken || !digest(csrfToken).equals(row.csrf_digest))) return null
        const idle = new Date(Math.min(now.getTime() + IDLE_MS, row.absolute_expires_at.getTime()))
        await client.query('UPDATE iam.session SET last_seen_at = $2, idle_expires_at = $3 WHERE token_digest = $1', [digest(sessionToken), now, idle])
        return { account: accountSummary(row), issuer: row.issuer, subject: row.external_subject }
      })
    },
    async listAccessibleWorkspaces(accountId) {
      if (!workspaceReadPool) return []
      const client = await workspaceReadPool.connect()
      try {
        await client.query('BEGIN READ ONLY')
        const result = await client.query<WorkspaceSummaryRow>(`
          SELECT s.workspace_id, s.name
          FROM workspace.list_workspace_summaries(
            ARRAY(SELECT m.workspace_id
                  FROM iam.list_workspace_memberships($1) m)
          ) s
          ORDER BY s.name, s.workspace_id
        `, [accountId])
        await client.query('COMMIT')
        return result.rows.map((row) => ({ workspaceId: row.workspace_id, name: row.name }))
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    },
    async endSession(sessionToken, now = new Date()) {
      const result = await pool.query('UPDATE iam.session SET revoked_at = $2 WHERE token_digest = $1 AND revoked_at IS NULL', [digest(sessionToken), now])
      return result.rowCount === 1
    },
    provisionByOperator({ operator, issuer, idempotencyKey, externalSubject, displayName, email, now = new Date() }) {
      return transaction(async (client) => {
        const authorityScope = `operator:${operator.account.accountId}`
        const request = { externalSubject, displayName, ...(email ? { email } : {}) }
        const replay = await reserve(client, authorityScope, idempotencyKey, request)
        if (replay) return { ...replay, replayed: true }
        const account: AccountSummary = { accountId: randomUUID(), displayName, ...(email ? { email } : {}) }
        await client.query(`
          INSERT INTO iam.account(account_id, issuer, external_subject, display_name, email)
          VALUES ($1, $2, $3, $4, $5)
        `, [account.accountId, issuer, externalSubject, displayName, email ?? null])
        await complete(client, authorityScope, idempotencyKey, account, now)
        return { ...account, replayed: false }
      })
    },
    close: () => pool.end(),
  })
}

const reserve = async (client: PoolClient, authorityScope: string, idempotencyKey: string, request: object): Promise<AccountSummary | null> => {
  const keyDigest = digest(idempotencyKey)
  const requestDigest = digest(canonicalBytes(request))
  const existing = await client.query<IdempotencyRow>(`
    SELECT request_digest, outcome, response_body
    FROM iam.operation_idempotency
    WHERE operation_id = 'IAM-03' AND authority_scope = $1 AND key_digest = $2
    FOR UPDATE
  `, [authorityScope, keyDigest])
  const row = existing.rows[0]
  if (row) {
    if (!row.request_digest.equals(requestDigest)) throw identityAccessError('IDEMPOTENCY_CONFLICT')
    if (row.outcome !== 'SUCCEEDED') throw identityAccessError('OUTCOME_UNKNOWN')
    return row.response_body
  }
  await client.query(`
    INSERT INTO iam.operation_idempotency(operation_id, authority_scope, key_digest, request_digest, outcome)
    VALUES ('IAM-03', $1, $2, $3, 'RESERVED')
  `, [authorityScope, keyDigest, requestDigest])
  return null
}

const complete = (client: PoolClient, authorityScope: string, idempotencyKey: string, response: AccountSummary, now: Date) => client.query(`
  UPDATE iam.operation_idempotency
  SET outcome = 'SUCCEEDED', response_status = 201, response_body = $3, completed_at = $4
  WHERE operation_id = 'IAM-03' AND authority_scope = $1 AND key_digest = $2
`, [authorityScope, digest(idempotencyKey), JSON.stringify(response), now])
