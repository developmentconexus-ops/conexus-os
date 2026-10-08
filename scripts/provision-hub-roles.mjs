import { readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import pg from 'pg'

const repositoryRoot = resolve(import.meta.dirname, '..')
const registerPath = 'contracts/technical/hub-database-roles.json'

const fail = (code, detail) => {
  throw new Error(detail ? `${code}: ${detail}` : code)
}

// Same 0600 rule apps/hub/src/platform/secrets.ts enforces. A provisioning step that accepted
// a world-readable secret would undo the property the Hub maintains.
export const readSecretFile = (path) => {
  const stat = statSync(path)
  if (!stat.isFile() || (stat.mode & 0o077) !== 0) fail('SECRET_FILE_PERMISSIONS', path)
  const value = readFileSync(path, 'utf8').trim()
  if (!value) fail('EMPTY_SECRET_FILE', path)
  return value
}

const required = (environment, name) => environment[name] ?? fail(`MISSING_CONFIG_${name}`)

export const readRegister = (root = repositoryRoot) =>
  JSON.parse(readFileSync(resolve(root, registerPath), 'utf8')).roles

export const readDatabase = (environment) => ({
  host: required(environment, 'CONEXUS_DB_HOST'),
  port: Number(required(environment, 'CONEXUS_DB_PORT')),
  database: required(environment, 'CONEXUS_DB_NAME'),
})

const sqlstateOf = (error) => (typeof error?.code === 'string' ? error.code : 'UNKNOWN')

const probe = async (database, role, password) => {
  const client = new pg.Client({ ...database, user: role, password, application_name: 'conexus-provision:probe', connectionTimeoutMillis: 5000 })
  try {
    await client.connect()
    await client.query('select 1')
    return { state: 'ok' }
  } catch (error) {
    return sqlstateOf(error) === '28P01' ? { state: 'invalid', sqlstate: '28P01' } : { state: 'error', sqlstate: sqlstateOf(error) }
  } finally {
    await client.end().catch(() => {})
  }
}

// One row per registered role. A role with no password file is unconfigured, which is not the
// same as invalid: four of the fifteen have no pilot secret and reporting them as broken would
// describe a healthy cluster as failing.
export const censusRoles = async (database, environment, roles) => {
  const rows = []
  for (const registered of roles) {
    const role = (registered.roleVariable ? environment[registered.roleVariable] : undefined) ?? registered.role
    const passwordFile = environment[registered.passwordFileVariable]
    if (!passwordFile) {
      rows.push({ role, capability: registered.capability, state: 'unconfigured' })
      continue
    }
    const observed = await probe(database, role, readSecretFile(passwordFile))
    rows.push({ role, capability: registered.capability, passwordFile, ...observed })
  }
  return rows
}

// Idempotent by construction. A role whose current password already authenticates is not
// written to, so a second run writes nothing and reports the same end state. A role in an
// error state is never written to, because the cause may be the network rather than the
// credential, and writing would mask it.
export const provisionRoles = async (database, environment, roles) => {
  const before = await censusRoles(database, environment, roles)
  const repairable = before.filter(row => row.state === 'invalid')
  if (repairable.length === 0) {
    return { verdict: 'CURRENT', checked: before.length, repaired: [], invalid: [], unconfigured: before.filter(row => row.state === 'unconfigured').map(row => row.role), errors: before.filter(row => row.state === 'error').map(row => ({ role: row.role, sqlstate: row.sqlstate })) }
  }

  const admin = new pg.Client({
    ...database,
    user: required(environment, 'CONEXUS_PROVISION_USER'),
    password: readSecretFile(required(environment, 'CONEXUS_PROVISION_PASSWORD_FILE')),
    application_name: 'conexus-provision:alter-role',
    connectionTimeoutMillis: 5000,
  })
  await admin.connect()
  const repaired = []
  const stillInvalid = []
  try {
    for (const row of repairable) {
      const password = readSecretFile(row.passwordFile)
      await admin.query(`alter role ${admin.escapeIdentifier(row.role)} with password ${admin.escapeLiteral(password)}`)
      const after = await probe(database, row.role, password)
      if (after.state === 'ok') repaired.push(row.role)
      else stillInvalid.push({ role: row.role, sqlstate: after.sqlstate })
    }
  } finally {
    await admin.end().catch(() => {})
  }
  if (stillInvalid.length > 0) fail('PROVISION_ROLE_UNREPAIRED', stillInvalid.map(entry => entry.role).join(','))

  return { verdict: 'REPAIRED', checked: before.length, repaired, invalid: stillInvalid, unconfigured: before.filter(row => row.state === 'unconfigured').map(row => row.role), errors: before.filter(row => row.state === 'error').map(row => ({ role: row.role, sqlstate: row.sqlstate })) }
}

const isEntrypoint = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isEntrypoint) {
  const roles = readRegister()
  const database = readDatabase(process.env)
  if (process.argv.includes('--check')) {
    const rows = await censusRoles(database, process.env, roles)
    const unhealthy = rows.filter(row => row.state === 'invalid' || row.state === 'error')
    process.stdout.write(`${JSON.stringify({ verdict: unhealthy.length === 0 ? 'HEALTHY' : 'UNHEALTHY', rows: rows.map(({ role, capability, state, sqlstate }) => ({ role, capability, state, ...(sqlstate ? { sqlstate } : {}) })) }, null, 2)}\n`)
    if (unhealthy.length > 0) process.exitCode = 1
  } else {
    process.stdout.write(`${JSON.stringify(await provisionRoles(database, process.env, roles), null, 2)}\n`)
  }
}
