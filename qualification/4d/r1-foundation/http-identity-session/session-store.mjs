import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import pg from 'pg'

const { Pool } = pg
const IDLE_MS = 30 * 60 * 1000
const ABSOLUTE_MS = 8 * 60 * 60 * 1000
const digest = token => createHash('sha256').update(token).digest()

export const readSecretFile = path => {
  const stat = statSync(path)
  if ((stat.mode & 0o077) !== 0) throw new Error('SECRET_FILE_PERMISSIONS')
  const value = readFileSync(path, 'utf8').trim()
  if (!value) throw new Error('EMPTY_SECRET_FILE')
  return value
}

export const redactDiagnostic = (value, secrets) => {
  let output = String(value)
  for (const secret of secrets) output = output.split(secret).join('[REDACTED]')
  return output.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, 'postgresql://[REDACTED]')
}

export const createSessionStore = ({ host, port, database, user, passwordFile }) => {
  const password = readSecretFile(passwordFile)
  const pool = new Pool({ host, port, database, user, password, max: 4, connectionTimeoutMillis: 5000 })

  const transaction = async fn => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const value = await fn(client)
      await client.query('COMMIT')
      return value
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  return Object.freeze({
    passwordForRedaction: () => password,
    async init() {
      await pool.query(`
        DROP TABLE IF EXISTS iam_session, iam_grant, iam_bootstrap_consumption, iam_account CASCADE;
        CREATE TABLE iam_account (
          account_id uuid PRIMARY KEY,
          issuer text NOT NULL,
          subject text NOT NULL,
          active boolean NOT NULL DEFAULT true,
          UNIQUE (issuer, subject)
        );
        CREATE TABLE iam_grant (
          account_id uuid NOT NULL REFERENCES iam_account(account_id),
          workspace_id text NOT NULL,
          surface text NOT NULL CHECK (surface IN ('CONTROL', 'APP')),
          active boolean NOT NULL DEFAULT true,
          PRIMARY KEY (account_id, workspace_id, surface)
        );
        CREATE TABLE iam_session (
          token_digest bytea PRIMARY KEY,
          account_id uuid NOT NULL REFERENCES iam_account(account_id),
          created_at timestamptz NOT NULL,
          last_seen_at timestamptz NOT NULL,
          idle_expires_at timestamptz NOT NULL,
          absolute_expires_at timestamptz NOT NULL,
          revoked_at timestamptz
        );
        CREATE TABLE iam_bootstrap_consumption (
          issuer text NOT NULL,
          subject text NOT NULL,
          consumed_at timestamptz NOT NULL,
          PRIMARY KEY (issuer, subject)
        );
      `)
    },
    async createAccount({ issuer, subject }) {
      const accountId = randomUUID()
      await pool.query('INSERT INTO iam_account(account_id, issuer, subject) VALUES ($1, $2, $3)', [accountId, issuer, subject])
      return accountId
    },
    async setGrant({ accountId, workspaceId, surface, active = true }) {
      await pool.query(`
        INSERT INTO iam_grant(account_id, workspace_id, surface, active)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (account_id, workspace_id, surface) DO UPDATE SET active = EXCLUDED.active
      `, [accountId, workspaceId, surface, active])
    },
    async revokeAccount(accountId) {
      await pool.query('UPDATE iam_account SET active = false WHERE account_id = $1', [accountId])
    },
    async createSession({ accountId, now = new Date() }) {
      return transaction(async client => {
        const account = await client.query('SELECT active FROM iam_account WHERE account_id = $1 FOR UPDATE', [accountId])
        if (account.rowCount !== 1 || !account.rows[0].active) throw new Error('ACCOUNT_INACTIVE')
        await client.query('UPDATE iam_session SET revoked_at = $2 WHERE account_id = $1 AND revoked_at IS NULL', [accountId, now])
        const token = randomBytes(32).toString('base64url')
        await client.query(`
          INSERT INTO iam_session(token_digest, account_id, created_at, last_seen_at, idle_expires_at, absolute_expires_at)
          VALUES ($1, $2, $3, $3, $4, $5)
        `, [digest(token), accountId, now, new Date(now.getTime() + IDLE_MS), new Date(now.getTime() + ABSOLUTE_MS)])
        return token
      })
    },
    async validateSession(token, { workspaceId, surface, now = new Date() }) {
      return transaction(async client => {
        const found = await client.query(`
          SELECT s.account_id, s.idle_expires_at, s.absolute_expires_at, s.revoked_at, a.active
          FROM iam_session s JOIN iam_account a USING (account_id)
          WHERE s.token_digest = $1
          FOR UPDATE OF s
        `, [digest(token)])
        if (found.rowCount !== 1) return { ok: false, reason: 'UNKNOWN_SESSION' }
        const row = found.rows[0]
        if (row.revoked_at) return { ok: false, reason: 'REVOKED_SESSION' }
        if (!row.active) return { ok: false, reason: 'REVOKED_ACCOUNT' }
        if (now >= row.absolute_expires_at) return { ok: false, reason: 'ABSOLUTE_EXPIRED' }
        if (now >= row.idle_expires_at) return { ok: false, reason: 'IDLE_EXPIRED' }
        const grant = await client.query(`
          SELECT 1 FROM iam_grant
          WHERE account_id = $1 AND workspace_id = $2 AND surface = $3 AND active = true
        `, [row.account_id, workspaceId, surface])
        if (grant.rowCount !== 1) return { ok: false, reason: 'NO_CURRENT_GRANT' }
        const idle = new Date(Math.min(now.getTime() + IDLE_MS, row.absolute_expires_at.getTime()))
        await client.query('UPDATE iam_session SET last_seen_at = $2, idle_expires_at = $3 WHERE token_digest = $1', [digest(token), now, idle])
        return { ok: true, accountId: row.account_id }
      })
    },
    async endSession(token, now = new Date()) {
      const result = await pool.query('UPDATE iam_session SET revoked_at = $2 WHERE token_digest = $1 AND revoked_at IS NULL', [digest(token), now])
      return result.rowCount === 1
    },
    async bootstrap({ configuredIssuer, configuredSubject, issuer, subject, now = new Date() }) {
      if (issuer !== configuredIssuer || subject !== configuredSubject) throw new Error('BOOTSTRAP_SUBJECT_MISMATCH')
      return transaction(async client => {
        const existing = await client.query('SELECT 1 FROM iam_account WHERE issuer = $1 AND subject = $2', [issuer, subject])
        if (existing.rowCount) throw new Error('BOOTSTRAP_ALREADY_MAPPED')
        const consumed = await client.query(`
          INSERT INTO iam_bootstrap_consumption(issuer, subject, consumed_at)
          VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING issuer
        `, [issuer, subject, now])
        if (!consumed.rowCount) throw new Error('BOOTSTRAP_ALREADY_CONSUMED')
        const accountId = randomUUID()
        await client.query('INSERT INTO iam_account(account_id, issuer, subject) VALUES ($1, $2, $3)', [accountId, issuer, subject])
        return { accountId, permittedOperation: 'IAM-03' }
      })
    },
    query: (text, values) => pool.query(text, values),
    close: () => pool.end(),
  })
}
