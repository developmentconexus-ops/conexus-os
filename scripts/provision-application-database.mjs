import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import pg from 'pg'
import { readRegister, readSecretFile } from './provision-hub-roles.mjs'

// The application database and the one role that may provision Project roles in it. An
// installation step run with the cluster's installation credential, never a power the Hub or the
// application runner holds: the runner connects as `app_provisioner`, which may create Project roles
// and schemas but holds no superuser, database-creation, replication or Hub authority.
//
// pg_hba admits Project roles only with the runner's certificate and only to this database
// (scripts/confine-application-cluster.mjs). This step also takes PUBLIC's CONNECT off the Hub
// database and `postgres`, so no role reaches them by default.
//
// In the application database PUBLIC loses USAGE on LANGUAGE sql and plpgsql, the only languages
// a non-superuser could write a routine in. A generated migration then cannot create a function,
// procedure, trigger function or DO block, so nothing it leaves behind can run later with the
// migration role's authority, whether a runtime handler calls it through SECURITY DEFINER or an
// owner-rights view, rule or foreign-key action invokes it as the table owner.

const PROVISIONER = 'app_provisioner'
const ATTRIBUTES = 'LOGIN CREATEROLE NOINHERIT NOSUPERUSER NOCREATEDB NOREPLICATION NOBYPASSRLS'

const fail = (code, detail) => {
  throw new Error(detail ? `${code}: ${detail}` : code)
}
const required = (environment, name) => environment[name] ?? fail(`MISSING_CONFIG_${name}`)

export const readApplicationDatabaseConfig = (environment) => {
  const database = required(environment, 'CONEXUS_APP_DB_NAME')
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(database)) fail('APPLICATION_DATABASE_NAME_REFUSED', database)
  const hubDatabase = required(environment, 'CONEXUS_DB_NAME')
  if (database === hubDatabase) fail('APPLICATION_DATABASE_IS_HUB_DATABASE', database)
  return {
    cluster: { host: required(environment, 'CONEXUS_DB_HOST'), port: Number(required(environment, 'CONEXUS_DB_PORT')) },
    database,
    hubDatabase,
    hubRoles: readRegister().map((entry) => (entry.roleVariable ? environment[entry.roleVariable] : undefined) ?? entry.role),
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

// Before PUBLIC loses CONNECT on a database, every role that connects there today must hold it
// explicitly, so this step can never cut off a live Hub.
const closeDatabaseToPublic = async (installation, database, keep) => {
  const { rows: existing } = await installation.query('SELECT rolname FROM pg_roles WHERE rolname = ANY($1)', [keep])
  for (const { rolname } of existing) await installation.query(`GRANT CONNECT ON DATABASE ${installation.escapeIdentifier(database)} TO ${installation.escapeIdentifier(rolname)}`)
  const { rows: stranded } = await installation.query(`SELECT DISTINCT a.usename FROM pg_stat_activity a
    JOIN pg_roles r ON r.oid = a.usesysid JOIN pg_database d ON d.oid = a.datid
    WHERE d.datname = $1 AND NOT r.rolsuper AND d.datdba <> r.oid AND NOT EXISTS (
      SELECT 1 FROM aclexplode(coalesce(d.datacl, acldefault('d', d.datdba))) acl
      WHERE acl.privilege_type = 'CONNECT' AND acl.grantee <> 0 AND pg_has_role(r.oid, acl.grantee, 'USAGE'))`, [database])
  if (stranded.length > 0) fail('APPLICATION_PUBLIC_CONNECT_IN_USE', `${database}: ${stranded.map((row) => row.usename).join(',')}`)
  await installation.query(`REVOKE CONNECT ON DATABASE ${installation.escapeIdentifier(database)} FROM PUBLIC`)
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
    await closeDatabaseToPublic(installation, config.hubDatabase, config.hubRoles)
    await closeDatabaseToPublic(installation, 'postgres', [])
  } finally {
    await installation.end().catch(() => {})
  }
  const languages = await connect({ ...config.cluster, ...config.installation, database: config.database })
  try {
    await languages.query('REVOKE USAGE ON LANGUAGE sql, plpgsql FROM PUBLIC')
  } finally {
    await languages.end().catch(() => {})
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
