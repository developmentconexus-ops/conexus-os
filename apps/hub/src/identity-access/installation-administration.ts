import type { QueryResultRow } from 'pg'
import type { PostgresPool } from '../platform/postgres.js'
import type { AccountId } from './current-session.js'

// Installation administration authorizes installation-wide actions, such as connecting the
// company GitHub organization. It lives only in Conexus IAM: a caller checks it here before
// performing the action, and nothing else keeps a copy of who holds it. It admits nothing inside
// a Workspace or a Project.
export type InstallationAdministration = Readonly<{
  isInstallationAdministrator(account: AccountId): Promise<boolean>
  grant(input: Readonly<{ actor: AccountId; account: AccountId }>): Promise<void>
  revoke(input: Readonly<{ actor: AccountId; account: AccountId }>): Promise<void>
}>

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
})
