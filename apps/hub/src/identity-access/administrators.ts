import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { AccountId, DisplayName, EmailAddress, addInstallationAdministrator, listInstallationAdministrators, removeInstallationAdministrator } from '@conexus/contract'
import type { AdministratorEntry } from '@conexus/contract'
import { routes } from '../http/access.js'
import { sql } from '../platform/db.js'
import type { Database, Mode, Sql } from '../platform/db.js'
import { Failure } from '../platform/failure.js'
import { logLine } from '../platform/logger.js'
import { idempotent } from '../platform/receipt.js'
import { ActiveAccount, admitInstallationAdministrator, receiptOf } from './admission.js'
import type { Admitted, AdministratorScope, BootstrapScope } from './admission.js'

/** An open tenure, as the administrators' table lock holds the set. */
type Tenure = Readonly<{ accountId: AccountId; active: boolean }>

/**
 * The installation keeps an active administrator: ending a tenure needs another active one in the locked set.
 * @public Tests call it through the built Hub.
 */
export const lastAdministratorStays = (tenures: readonly Tenure[], ending: AccountId): boolean =>
  tenures.some((tenure) => tenure.accountId !== ending && tenure.active)

const Holder = { account_id: AccountId, display_name: DisplayName, email: EmailAddress.nullable(), granted_at: z.date() }
// The founding tenure has no grantor; every other one names the administrator who granted it.
const EntryRow = z.discriminatedUnion('granted_via', [
  z.object({ ...Holder, granted_via: z.literal('OPERATOR_BOOTSTRAP'), granted_by: z.null(), granted_by_name: z.null() }),
  z.object({ ...Holder, granted_via: z.literal('ADMINISTRATOR'), granted_by: AccountId, granted_by_name: DisplayName }),
])
const Match = z.object({ account_id: AccountId })

const entryOf = (row: z.output<typeof EntryRow>): AdministratorEntry => {
  const fields = { accountId: row.account_id, displayName: row.display_name, ...(row.email ? { email: row.email } : {}), grantedAt: row.granted_at.toISOString() }
  if (row.granted_via === 'OPERATOR_BOOTSTRAP') return { ...fields, grantedVia: 'OPERATOR_BOOTSTRAP' }
  return { ...fields, grantedVia: 'ADMINISTRATOR', grantedBy: { accountId: row.granted_by, displayName: row.granted_by_name } }
}

// The reader role sees an account's id, name and email only, so the list shows every open tenure; a command reads the tenure it wrote.
const entries = (proof: Admitted<AdministratorScope<'administrators.manage'>, Mode>, only: Sql) => proof.tx.rows(EntryRow, sql`
  SELECT person.account_id, person.display_name, person.email, tenure.granted_via, tenure.granted_at, tenure.granted_by, grantor.display_name AS granted_by_name
  FROM iam.installation_administrator AS tenure
  JOIN iam.account AS person ON person.account_id = tenure.account_id
  LEFT JOIN iam.account AS grantor ON grantor.account_id = tenure.granted_by
  WHERE tenure.revoked_at IS NULL${only}
  ORDER BY tenure.granted_at, tenure.tenure_id`)

/** The founding tenure of the installation, on the bootstrap proof that found no account. */
export const grantFirstTenure = async (proof: Admitted<BootstrapScope>, accountId: AccountId): Promise<void> => {
  await proof.tx.run(sql`INSERT INTO iam.installation_administrator (account_id, granted_via) VALUES (${accountId}, 'OPERATOR_BOOTSTRAP')`)
}

/** Written after the tenure's transaction commits, so no line names a tenure that was rolled back. */
export const tenureGranted = (accountId: AccountId, grantedVia: AdministratorEntry['grantedVia']): void => {
  logLine('INSTALLATION_ADMINISTRATOR_GRANTED', { accountId, grantedVia })
}

export const registerAdministratorRoutes = async (app: FastifyInstance, database: Database) => {
  const route = routes(app)

  route.operation(listInstallationAdministrators, (_input, session) => database.read(session.account.accountId, async (gate) => {
    const proof = await admitInstallationAdministrator(gate, { action: 'administrators.manage' })
    return { administrators: (await entries(proof, sql``)).map(entryOf) }
  }))

  // An email names one active account or none: two active accounts with the same email are refused, never guessed between.
  // An account that already holds a tenure keeps it: the add answers 200 with that tenure and grants nothing.
  route.operation(addInstallationAdministrator, async ({ headers, body }, session) => {
    const { reply, replayed } = await database.transaction(session.account.accountId, async (gate) => {
      const proof = await admitInstallationAdministrator(gate, { action: 'administrators.manage' })
      return idempotent(receiptOf(proof), addInstallationAdministrator, headers['idempotency-key'], { params: undefined, query: undefined, body }, AccountId, async () => {
        const matches = await proof.tx.rows(Match, sql`SELECT account_id FROM iam.account WHERE active AND email = ${body.email} ORDER BY account_id LIMIT 2`)
        const [match] = matches
        if (!match) throw new Failure('ACCOUNT_NOT_FOUND')
        if (matches.length > 1) throw new Failure('ACCOUNT_EMAIL_AMBIGUOUS')
        const granted = await proof.tx.maybe(Match, sql`
          INSERT INTO iam.installation_administrator (account_id, granted_via, granted_by) VALUES (${match.account_id}, 'ADMINISTRATOR', ${proof.scope.accountId})
          ON CONFLICT (account_id) WHERE revoked_at IS NULL DO NOTHING
          RETURNING account_id`)
        const [entry] = await entries(proof, sql` AND tenure.account_id = ${match.account_id}`)
        if (!entry) throw new Failure('INTERNAL_UNEXPECTED', { details: { invariant: 'TENURE_NOT_READABLE' } })
        return granted ? { status: 201 as const, body: entryOf(entry) } : { status: 200 as const, body: entryOf(entry) }
      })
    })
    if (!replayed && reply.status === 201) tenureGranted(reply.body.accountId, reply.body.grantedVia)
    return reply
  })

  route.operation(removeInstallationAdministrator, async ({ params }, session) => {
    await database.transaction(session.account.accountId, async (gate) => {
      const proof = await admitInstallationAdministrator(gate, { action: 'administrators.manage' })
      const tenures = (await proof.tx.rows(ActiveAccount, sql`
        SELECT tenure.account_id, person.active FROM iam.installation_administrator AS tenure
        JOIN iam.account AS person ON person.account_id = tenure.account_id
        WHERE tenure.revoked_at IS NULL`)).map((row) => ({ accountId: row.account_id, active: row.active }))
      if (!tenures.some((tenure) => tenure.accountId === params.accountId)) throw new Failure('INSTALLATION_ADMINISTRATOR_NOT_FOUND')
      if (!lastAdministratorStays(tenures, params.accountId)) throw new Failure('LAST_INSTALLATION_ADMINISTRATOR')
      await proof.tx.run(sql`
        UPDATE iam.installation_administrator SET revoked_at = clock_timestamp(), revoked_by = ${proof.scope.accountId}
        WHERE account_id = ${params.accountId} AND revoked_at IS NULL`)
    })
    logLine('INSTALLATION_ADMINISTRATOR_REVOKED', { accountId: params.accountId })
    return undefined
  })

  return ['listInstallationAdministrators', 'addInstallationAdministrator', 'removeInstallationAdministrator'] as const
}
