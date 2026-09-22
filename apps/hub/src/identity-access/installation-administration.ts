import type { QueryResultRow } from 'pg'
import type { PostgresPool } from '../platform/postgres.js'
import type { AccountId } from './current-session.js'

// Installation administration authorizes installation-wide actions, such as connecting the
// company GitHub organization. It lives only in Conexus IAM: a caller checks it here before
// performing the action, and nothing else keeps a copy of who holds it. It admits nothing inside
// a Workspace or a Project.
export type InstallationAdministrator = Readonly<{
  accountId: AccountId
  displayName: string
  email: string | null
  grantedVia: 'OPERATOR_BOOTSTRAP' | 'ADMINISTRATOR'
  grantedBy: Readonly<{ accountId: AccountId; displayName: string }> | null
  grantedAt: Date
}>

export type InstallationAdministration = Readonly<{
  isInstallationAdministrator(account: AccountId): Promise<boolean>
  grant(input: Readonly<{ actor: AccountId; account: AccountId }>): Promise<void>
  revoke(input: Readonly<{ actor: AccountId; account: AccountId }>): Promise<void>
  list(actor: AccountId): Promise<readonly InstallationAdministrator[]>
  // Returns the granted (or already-held) Account's id. Throws ACCOUNT_NOT_FOUND (P0002) for no
  // match and ACCOUNT_EMAIL_AMBIGUOUS (P0003) for more than one.
  grantByEmail(input: Readonly<{ actor: AccountId; email: string }>): Promise<AccountId>
}>

type AdministratorRow = QueryResultRow & Readonly<{
  account_id: string
  display_name: string
  email: string | null
  granted_via: 'OPERATOR_BOOTSTRAP' | 'ADMINISTRATOR'
  granted_by: string | null
  granted_by_display_name: string | null
  granted_at: Date
}>

const toAdministrator = (row: AdministratorRow): InstallationAdministrator => ({
  accountId: row.account_id as AccountId,
  displayName: row.display_name,
  email: row.email,
  grantedVia: row.granted_via,
  grantedBy: row.granted_by ? { accountId: row.granted_by as AccountId, displayName: row.granted_by_display_name ?? '' } : null,
  grantedAt: row.granted_at,
})

export const createInstallationAdministration = ({ pool }: Readonly<{ pool: PostgresPool }>): InstallationAdministration => Object.freeze({
  async isInstallationAdministrator(account) {
    const result = await pool.query<QueryResultRow & { administrator: boolean }>(
      'SELECT iam.is_installation_administrator($1) AS administrator', [account])
    return result.rows[0]?.administrator === true
  },
  async grant({ actor, account }) {
    await pool.query('SELECT iam.grant_installation_administrator($1, $2)', [actor, account])
  },
  async revoke({ actor, account }) {
    await pool.query('SELECT iam.revoke_installation_administrator($1, $2)', [actor, account])
  },
  async list(actor) {
    const result = await pool.query<AdministratorRow>('SELECT * FROM iam.list_installation_administrators($1)', [actor])
    return result.rows.map(toAdministrator)
  },
  async grantByEmail({ actor, email }) {
    const result = await pool.query<QueryResultRow & { account_id: string }>(
      'SELECT iam.grant_installation_administrator_by_email($1, $2) AS account_id', [actor, email])
    return result.rows[0]?.account_id as AccountId
  },
})
