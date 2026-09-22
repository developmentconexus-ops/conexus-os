import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import pg from 'pg'
import { readDatabase, readSecretFile } from './provision-hub-roles.mjs'

const fail = (code) => {
  throw new Error(code)
}

const resolveAccount = async (client, { email, accountId }) => {
  if ((email === undefined) === (accountId === undefined)) fail('BOOTSTRAP_NAME_ONE_ACCOUNT')
  const { rows } = accountId === undefined
    ? await client.query('SELECT account_id FROM iam.account WHERE email = lower(btrim($1)) AND active', [email])
    : await client.query('SELECT account_id FROM iam.account WHERE account_id = $1 AND active', [accountId])
  if (rows.length === 0) fail('BOOTSTRAP_ACCOUNT_NOT_FOUND')
  if (rows.length > 1) fail('BOOTSTRAP_ACCOUNT_AMBIGUOUS')
  return rows[0].account_id
}

// Runs as the operator's provisioning credential, because no Hub role may execute the bootstrap
// function. A second run for the same Account answers ALREADY_ADMINISTRATOR and writes nothing.
export const bootstrapInstallationAdministrator = async (client, account) => {
  const accountId = await resolveAccount(client, account)
  const { rows } = await client.query('SELECT iam.bootstrap_installation_administrator($1) AS verdict', [accountId])
  return { verdict: rows[0].verdict, accountId }
}

const isEntrypoint = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isEntrypoint) {
  const { values } = parseArgs({ options: { email: { type: 'string' }, 'account-id': { type: 'string' } } })
  const environment = process.env
  const client = new pg.Client({
    ...readDatabase(environment),
    user: environment.CONEXUS_PROVISION_USER ?? fail('MISSING_CONFIG_CONEXUS_PROVISION_USER'),
    password: readSecretFile(environment.CONEXUS_PROVISION_PASSWORD_FILE ?? fail('MISSING_CONFIG_CONEXUS_PROVISION_PASSWORD_FILE')),
    application_name: 'conexus-provision:installation-administrator',
    connectionTimeoutMillis: 5000,
  })
  await client.connect()
  try {
    const result = await bootstrapInstallationAdministrator(client, {
      ...(values.email === undefined ? {} : { email: values.email }),
      ...(values['account-id'] === undefined ? {} : { accountId: values['account-id'] }),
    })
    process.stdout.write(`${JSON.stringify(result)}\n`)
  } finally {
    await client.end()
  }
}
