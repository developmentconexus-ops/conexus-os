import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import pg from 'pg'
import { readRegister, readSecretFile } from './provision-hub-roles.mjs'

// The application database on the Applications PostgreSQL, and the one role that may provision
// Project roles in it. The Applications PostgreSQL is a cluster of its own, apart from the Hub's
// (scripts/run-application-cluster.sh); this step refuses a cluster that holds any Hub role, so it
// cannot put application data or Project roles back into the Hub's cluster. An installation step run
// with the Applications cluster's superuser, never a power the Hub or the application runner holds:
// the runner connects as `app_provisioner`, which may create Project roles and schemas but holds no
// superuser, database-creation or replication authority.
//
// pg_hba admits Project roles only with the runner's certificate and only to this database
// (scripts/confine-application-cluster.mjs). This step also takes PUBLIC's CONNECT off `postgres`.
//
// In the application database PUBLIC loses USAGE on every trusted language, the only languages a
// non-superuser could write a routine in. A generated migration then cannot create a function,
// procedure, trigger function or DO block, so nothing it leaves behind can run later with the
// migration role's authority, whether a runtime handler calls it through SECURITY DEFINER or an
// owner-rights view, rule or foreign-key action invokes it as the table owner. The runner refuses to
// start while any trusted language is usable (apps/hub/src/app-runner/supervisor.ts).

const PROVISIONER = 'app_provisioner'
const ATTRIBUTES = 'LOGIN CREATEROLE NOINHERIT NOSUPERUSER NOCREATEDB NOREPLICATION NOBYPASSRLS'

const fail = (code, detail) => {
  throw new Error(detail ? `${code}: ${detail}` : code)
}
const required = (environment, name) => environment[name] ?? fail(`MISSING_CONFIG_${name}`)

export const hubRoleNames = (environment) =>
  readRegister().map((entry) => (entry.roleVariable ? environment[entry.roleVariable] : undefined) ?? entry.role)

export const readApplicationDatabaseConfig = (environment) => {
  const database = required(environment, 'CONEXUS_APP_DB_NAME')
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(database)) fail('APPLICATION_DATABASE_NAME_REFUSED', database)
  return {
    cluster: { host: required(environment, 'CONEXUS_APP_DB_HOST'), port: Number(required(environment, 'CONEXUS_APP_DB_PORT')) },
    database,
    hubRoles: hubRoleNames(environment),
    installation: {
      user: required(environment, 'CONEXUS_APP_DB_INSTALL_USER'),
      password: readSecretFile(required(environment, 'CONEXUS_APP_DB_INSTALL_PASSWORD_FILE')),
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
// explicitly, so this step never cuts off a live session's role unannounced.
const closeDatabaseToPublic = async (installation, database) => {
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
    const { rows: hubRoles } = await installation.query('SELECT rolname FROM pg_roles WHERE rolname = ANY($1) ORDER BY rolname', [config.hubRoles])
    if (hubRoles.length > 0) fail('APPLICATION_CLUSTER_HOLDS_HUB_ROLES', hubRoles.map((row) => row.rolname).join(','))
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
    // Lets the provisioner set temp_file_limit on the Project roles it creates; they cannot change it.
    await installation.query(`GRANT SET ON PARAMETER temp_file_limit TO ${PROVISIONER}`)
    // Project sessions filling every ordinary connection slot still leave the runner a way in. The
    // provisioner is NOINHERIT, and Postgres reserves the slots for roles that inherit the privilege.
    await installation.query(`GRANT pg_use_reserved_connections TO ${PROVISIONER} WITH INHERIT TRUE`)
    // Diagnosis only: cluster-wide statement statistics, readable from `postgres`, never from the
    // application database where a Project role would see other Projects' statements.
    await installation.query('CREATE EXTENSION IF NOT EXISTS pg_stat_statements')
    await closeDatabaseToPublic(installation, 'postgres')
  } finally {
    await installation.end().catch(() => {})
  }
  const languages = await connect({ ...config.cluster, ...config.installation, database: config.database })
  try {
    const { rows } = await languages.query('SELECT lanname FROM pg_language WHERE lanpltrusted ORDER BY lanname')
    for (const { lanname } of rows) await languages.query(`REVOKE USAGE ON LANGUAGE ${languages.escapeIdentifier(lanname)} FROM PUBLIC`)
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
