import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { SUPERSEDED_ROLES } from './generate-hub-baseline.mjs'

const fail = (code, detail = '') => { throw new Error(`${code}${detail ? `:${detail}` : ''}`) }

const ownershipQuery = `
  SELECT r.rolname,
    (SELECT count(*)::integer FROM pg_class WHERE relowner = r.oid) AS relations,
    (SELECT count(*)::integer FROM pg_namespace WHERE nspowner = r.oid) AS schemas,
    (SELECT count(*)::integer FROM pg_proc WHERE proowner = r.oid) AS functions,
    (SELECT count(*)::integer FROM pg_type WHERE typowner = r.oid) AS types,
    (SELECT count(*)::integer FROM pg_auth_members WHERE member = r.oid OR roleid = r.oid) AS memberships
  FROM pg_roles AS r WHERE r.rolname = ANY($1) ORDER BY 1
`

const connectionStringFor = (admin, database) => {
  const url = new URL('postgresql://localhost')
  url.hostname = admin.host
  url.port = String(admin.port)
  url.pathname = `/${database}`
  url.username = admin.user
  url.password = admin.password
  return url.toString()
}

const withClient = async (connectionString, body) => {
  const client = new pg.Client({ connectionString })
  await client.connect()
  try {
    return await body(client)
  } finally {
    await client.end()
  }
}

// DROP ROLE fails with 2BP01 while any database in the cluster still records a dependency, so
// every database is surveyed, not just the Hub's.
export const clusterDatabases = (client) =>
  client.query(`SELECT datname FROM pg_database WHERE datallowconn AND datname NOT IN ('template0', 'template1') ORDER BY 1`)
    .then(({ rows }) => rows.map((row) => row.datname))

export const surveySupersededRoles = async ({ admin, roles = SUPERSEDED_ROLES }) => {
  const databases = await withClient(connectionStringFor(admin, admin.database), clusterDatabases)
  const present = []
  const refusals = []
  for (const database of databases) {
    const rows = await withClient(connectionStringFor(admin, database), (client) => client.query(ownershipQuery, [roles]).then(({ rows }) => rows))
    for (const row of rows) {
      if (!present.includes(row.rolname)) present.push(row.rolname)
      const owned = row.relations + row.schemas + row.functions + row.types + row.memberships
      if (owned > 0) refusals.push(`${row.rolname} in ${database} holds ${JSON.stringify(row)}`)
    }
  }
  return { databases, present: present.sort(), absent: roles.filter((role) => !present.includes(role)), refusals }
}

export const dropSupersededRoles = async ({ admin, roles = SUPERSEDED_ROLES, apply = false }) => {
  const survey = await surveySupersededRoles({ admin, roles })
  if (survey.refusals.length > 0) fail('SUPERSEDED_ROLE_STILL_OWNS', survey.refusals.join('; '))
  if (!apply) return { verdict: 'DRY_RUN', ...survey, wouldDrop: survey.present }
  for (const database of survey.databases) {
    await withClient(connectionStringFor(admin, database), async (client) => {
      for (const role of survey.present) await client.query(`DROP OWNED BY "${role}"`)
    })
  }
  await withClient(connectionStringFor(admin, admin.database), async (client) => {
    for (const role of survey.present) await client.query(`DROP ROLE "${role}"`)
  })
  return { verdict: 'DROPPED', databases: survey.databases, dropped: survey.present, absent: survey.absent }
}

const readAdmin = () => {
  const read = (name) => process.env[name] ?? fail(`MISSING_CONFIG_${name}`)
  return {
    host: read('CONEXUS_TEST_DB_HOST'),
    port: Number(read('CONEXUS_TEST_DB_PORT')),
    database: read('CONEXUS_TEST_DB_NAME'),
    user: read('CONEXUS_TEST_DB_USER'),
    password: read('CONEXUS_TEST_DB_PASSWORD'),
  }
}

const isEntrypoint = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isEntrypoint) {
  const result = await dropSupersededRoles({ admin: readAdmin(), apply: process.argv.includes('--apply') })
  process.stdout.write(`${JSON.stringify(result)}\n`)
}
