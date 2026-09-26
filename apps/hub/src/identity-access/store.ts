import { randomUUID } from 'node:crypto'
import type { PoolClient, QueryResultRow } from 'pg'
import { canonicalBytes } from '../../../../packages/canonical-json/src/index.mjs'
import { digest, opaqueToken as token } from '../platform/opaque-token.js'
import type { PostgresPool } from '../platform/postgres.js'
import { accountId as brandAccountId } from './current-session.js'
import type { AccountId, AccountSummary, CurrentSession, EmailAddress } from './current-session.js'
import { identityAccessError, translatePostgresError } from './errors.js'
import type { OidcIdentity, OidcTransaction, VerifiedIdentity } from './oidc.js'

export type { CurrentSession }

const BOOTSTRAP_MS = 10 * 60 * 1000
const OIDC_MS = 10 * 60 * 1000

type ProvisionResult = AccountSummary & Readonly<{ replayed: boolean }>
type AccessibleWorkspace = Readonly<{ workspaceId: string; name: string }>

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
  application_project_id: string | null
  sign_in_binding_digest: Buffer | null
}

/** Where a sign-in returns. Stored with the OIDC transaction and never read from the callback. */
export type SignInReturn =
  | Readonly<{ kind: 'HUB' }>
  | Readonly<{ kind: 'APPLICATION'; projectId: string; bindingDigest: Buffer }>

type BootstrapRow = QueryResultRow & {
  issuer: string
  external_subject: string
  verified_email: string | null
  expires_at: Date
  consumed_at: Date | null
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
  accountId: brandAccountId(row.account_id),
  displayName: row.display_name,
  ...(row.email ? { email: row.email } : {}),
})

export type IdentityAccessStore = Readonly<{
  createOidcTransaction(input: OidcTransaction & Readonly<{ signInReturn?: SignInReturn; now?: Date }>): Promise<void>
  consumeOidcTransaction(input: Readonly<{ state: string; now?: Date }>): Promise<Readonly<{ pkceVerifier: string; nonce: string; signInReturn: SignInReturn }> | null>
  resolveIdentity(identity: OidcIdentity): Promise<AccountSummary | null>
  createProvisioningContext(input: VerifiedIdentity & Readonly<{ configuredIssuer: string; configuredSubject: string; now?: Date }>): Promise<string>
  claimInvitations(input: Readonly<{ accountId: AccountId; verifiedEmail: EmailAddress | null }>): Promise<number>
  provisionBootstrap(input: Readonly<{ bootstrapToken: string; idempotencyKey: string; configuredIssuer: string; configuredSubject: string; displayName: string; email?: string; now?: Date }>): Promise<ProvisionResult>
  listAccessibleWorkspaces(accountId: string): Promise<readonly AccessibleWorkspace[]>
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
    async createOidcTransaction({ state, pkceVerifier, nonce, signInReturn = { kind: 'HUB' }, now = new Date() }): Promise<void> {
      const application = signInReturn.kind === 'APPLICATION' ? signInReturn : null
      await pool.query(`
        INSERT INTO iam.oidc_transaction(state_digest, pkce_verifier, nonce, expires_at, application_project_id, sign_in_binding_digest)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [digest(state), pkceVerifier, nonce, new Date(now.getTime() + OIDC_MS), application?.projectId ?? null, application?.bindingDigest ?? null])
    },
    consumeOidcTransaction({ state, now = new Date() }) {
      return transaction(async (client) => {
        const found = await client.query<OidcTransactionRow>(`
          SELECT pkce_verifier, nonce, expires_at, consumed_at, application_project_id, sign_in_binding_digest
          FROM iam.oidc_transaction WHERE state_digest = $1 FOR UPDATE
        `, [digest(state)])
        const row = found.rows[0]
        if (!row || row.consumed_at || now >= row.expires_at) return null
        await client.query('UPDATE iam.oidc_transaction SET consumed_at = $2 WHERE state_digest = $1', [digest(state), now])
        const signInReturn: SignInReturn = row.application_project_id && row.sign_in_binding_digest
          ? { kind: 'APPLICATION', projectId: row.application_project_id, bindingDigest: row.sign_in_binding_digest }
          : { kind: 'HUB' }
        return { pkceVerifier: row.pkce_verifier, nonce: row.nonce, signInReturn }
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
    createProvisioningContext({ issuer, subject, verifiedEmail, configuredIssuer, configuredSubject, now = new Date() }) {
      return transaction(async (client) => {
        if (await loadAccountByIdentity(client, issuer, subject, true)) throw identityAccessError('BOOTSTRAP_SEALED')
        const configured = issuer === configuredIssuer && subject === configuredSubject
        if (configured) {
          const existing = await client.query('SELECT 1 FROM iam.account LIMIT 1')
          if (existing.rowCount !== 0) throw identityAccessError('BOOTSTRAP_SEALED')
        } else {
          const invited = await client.query<QueryResultRow & { invited: boolean }>(
            'SELECT iam.email_has_open_invitation($1) AS invited', [verifiedEmail])
          if (!invited.rows[0]?.invited) throw identityAccessError('IDENTITY_NOT_ELIGIBLE')
        }
        const raw = token()
        const inserted = await client.query(`
          INSERT INTO iam.bootstrap_context(token_digest, issuer, external_subject, verified_email, expires_at)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (issuer, external_subject) DO UPDATE
          SET token_digest = EXCLUDED.token_digest, verified_email = EXCLUDED.verified_email, expires_at = EXCLUDED.expires_at
          WHERE iam.bootstrap_context.consumed_at IS NULL AND iam.bootstrap_context.expires_at <= $6
          RETURNING token_digest
        `, [digest(raw), issuer, subject, verifiedEmail, new Date(now.getTime() + BOOTSTRAP_MS), now])
        if (inserted.rowCount !== 1) throw identityAccessError('BOOTSTRAP_SEALED')
        return raw
      })
    },
    claimInvitations({ accountId, verifiedEmail }) {
      return transaction(async (client) => {
        const claimed = await client.query<QueryResultRow & { claimed: number }>(
          'SELECT iam.claim_invitations($1, $2) AS claimed', [accountId, verifiedEmail])
        return claimed.rows[0]?.claimed ?? 0
      })
    },
    provisionBootstrap({ bootstrapToken, idempotencyKey, configuredIssuer, configuredSubject, displayName, email, now = new Date() }) {
      return transaction(async (client) => {
        const context = await client.query<BootstrapRow>(`
          SELECT issuer, external_subject, verified_email, expires_at, consumed_at
          FROM iam.bootstrap_context WHERE token_digest = $1 FOR UPDATE
        `, [digest(bootstrapToken)])
        const row = context.rows[0]
        if (!row) throw identityAccessError('BOOTSTRAP_SEALED')
        const authorityScope = `bootstrap:${row.issuer}:${row.external_subject}`
        const request = { displayName, ...(email ? { email } : {}) }
        const replay = await reserve(client, authorityScope, idempotencyKey, request)
        if (replay) return { ...replay, replayed: true }
        if (row.consumed_at || now >= row.expires_at) throw identityAccessError('BOOTSTRAP_SEALED')
        // An invited Account's address is the claim the provider verified, never the form.
        const invited = !(row.issuer === configuredIssuer && row.external_subject === configuredSubject)
        const accountEmail = invited ? row.verified_email : (email ?? null)
        const account: AccountSummary = {
          accountId: brandAccountId(randomUUID()),
          displayName,
          ...(accountEmail ? { email: accountEmail } : {}),
        }
        await client.query(`
          INSERT INTO iam.account(account_id, issuer, external_subject, display_name, email)
          VALUES ($1, $2, $3, $4, $5)
        `, [account.accountId, row.issuer, row.external_subject, displayName, accountEmail])
        const claimed = await client.query<QueryResultRow & { claimed: number }>(
          'SELECT iam.claim_invitations($1, $2) AS claimed', [account.accountId, row.verified_email])
        // The invitation could have been cancelled between the callback and this form.
        // Aborting here is what keeps an invited Account from existing with no membership.
        if (invited && (claimed.rows[0]?.claimed ?? 0) === 0) throw identityAccessError('IDENTITY_NOT_ELIGIBLE')
        if (!invited) await client.query('SELECT iam.grant_first_installation_administrator($1)', [account.accountId])
        await client.query('UPDATE iam.bootstrap_context SET consumed_at = $2 WHERE token_digest = $1', [digest(bootstrapToken), now])
        await complete(client, authorityScope, idempotencyKey, account, now)
        return { ...account, replayed: false }
      })
    },
    async listAccessibleWorkspaces(accountId) {
      if (!workspaceReadPool) return []
      const client = await workspaceReadPool.connect()
      try {
        await client.query('BEGIN READ ONLY')
        const result = await client.query<WorkspaceSummaryRow>(`
          SELECT s.workspace_id, s.name
          FROM workspace.list_visible_workspace_summaries($1) s
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
