import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import pg from 'pg'
import { readSecretFile } from './provision-hub-roles.mjs'

// The application database and the one role that may provision Project roles in it. An
// installation step run with the cluster's installation credential, never a power the Hub or the
// application runner holds: the runner connects as `app_provisioner`, which may create Project roles
// and schemas but holds no superuser, database-creation, replication or Hub authority.

const PROVISIONER = 'app_provisioner'
const ATTRIBUTES = 'LOGIN CREATEROLE NOINHERIT NOSUPERUSER NOCREATEDB NOREPLICATION NOBYPASSRLS'

const fail = (code, detail) => {
  throw new Error(detail ? `${code}: ${detail}` : code)
}
const required = (environment, name) => environment[name] ?? fail(`MISSING_CONFIG_${name}`)

export const readApplicationDatabaseConfig = (environment) => {
  const database = required(environment, 'CONEXUS_APP_DB_NAME')
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(database)) fail('APPLICATION_DATABASE_NAME_REFUSED', database)
  if (database === environment.CONEXUS_DB_NAME) fail('APPLICATION_DATABASE_IS_HUB_DATABASE', database)
  return {
    cluster: { host: required(environment, 'CONEXUS_DB_HOST'), port: Number(required(environment, 'CONEXUS_DB_PORT')) },
    database,
    installation: {
      user: required(environment, 'CONEXUS_PROVISION_USER'),
      password: readSecretFile(required(environment, 'CONEXUS_PROVISION_PASSWORD_FILE')),
    },
    provisionerPassword: readSecretFile(required(environment, 'CONEXUS_DB_APP_PROVISIONER_PASSWORD_FILE')),
  }
}

const connect = async (config) => {
  const client = new pg.Client({ ...config, application_name: 'conexus-provision:application-database', connectionTimeoutMillis: 5000 })
  await client.connect()
  return client
}

/** Converges on: the provisioner role with exactly its attributes, the database it owns, PUBLIC closed. */
export const provisionApplicationDatabase = async (config) => {
  const installation = await connect({ ...config.cluster, ...config.installation, database: 'postgres' })
  const changed = []
  try {
    const role = await installation.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [PROVISIONER])
    const password = installation.escapeLiteral(config.provisionerPassword)
    await installation.query(`${role.rowCount === 0 ? 'CREATE' : 'ALTER'} ROLE ${PROVISIONER} WITH ${ATTRIBUTES} PASSWORD ${password}`)
    if (role.rowCount === 0) changed.push('role')
    const database = await installation.query('SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname = $1', [config.database])
    if (database.rowCount === 0) {
      await installation.query(`CREATE DATABASE ${installation.escapeIdentifier(config.database)} OWNER ${PROVISIONER}`)
      changed.push('database')
    } else if (database.rows[0].owner !== PROVISIONER) {
      fail('APPLICATION_DATABASE_OWNER_REFUSED', database.rows[0].owner)
    }
  } finally {
    await installation.end().catch(() => {})
  }
  const owner = await connect({ ...config.cluster, database: config.database, user: PROVISIONER, password: config.provisionerPassword })
  try {
    await owner.query(`REVOKE ALL ON DATABASE ${owner.escapeIdentifier(config.database)} FROM PUBLIC`)
    await owner.query('REVOKE ALL ON SCHEMA public FROM PUBLIC')
  } finally {
    await owner.end().catch(() => {})
  }
  return { verdict: changed.length === 0 ? 'CURRENT' : 'PROVISIONED', database: config.database, role: PROVISIONER, changed }
}

const isEntrypoint = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isEntrypoint) {
  process.stdout.write(`${JSON.stringify(await provisionApplicationDatabase(readApplicationDatabaseConfig(process.env)), null, 2)}\n`)
}
