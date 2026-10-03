import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import pg from 'pg'
import { loadHubMigrationFiles, runHubMigrations } from '../../scripts/run-hub-migrations.mjs'
import { ROLE_BY_CALL_SITE, hubCallSites } from '../repository/hub-call-sites.mjs'
import { refuseProtectedCluster } from './protected-cluster.mjs'

const required = (name) => {
  const value = process.env[name]
  if (!value) throw new Error(`MISSING_TEST_CONFIG_${name}`)
  return value
}
const admin = {
  host: required('CONEXUS_TEST_DB_HOST'), port: Number(required('CONEXUS_TEST_DB_PORT')),
  database: required('CONEXUS_TEST_DB_NAME'), user: required('CONEXUS_TEST_DB_USER'),
  password: required('CONEXUS_TEST_DB_PASSWORD'),
}
const query = async (connection, sql, parameters = []) => {
  const client = new pg.Client(connection)
  await client.connect()
  try { return await client.query(sql, parameters) } finally { await client.end() }
}
const connectionStringFor = (connection) => {
  const url = new URL('postgresql://localhost')
  url.hostname = connection.host
  url.port = String(connection.port)
  url.pathname = `/${connection.database}`
  url.username = connection.user
  url.password = connection.password
  return url.toString()
}
const freshDatabase = async (t) => {
  await refuseProtectedCluster()
  const database = `conexus_privilege_${randomUUID().replaceAll('-', '')}`
  await query(admin, `CREATE DATABASE "${database}"`)
  t.after(() => query(admin, `DROP DATABASE "${database}" WITH (FORCE)`))
  return { ...admin, database }
}

test('every function the Hub calls is EXECUTE-granted to the login role that calls it', async (t) => {
  const connection = await freshDatabase(t)
  const finished = await runHubMigrations({ connectionString: connectionStringFor(connection), catalogSnapshot: null })
  assert.deepEqual(finished.versions, loadHubMigrationFiles().map(({ version }) => version))

  const denied = []
  const unresolved = []
  for (const site of hubCallSites()) {
    const role = ROLE_BY_CALL_SITE[site.file]?.[site.name]
    if (role === undefined) continue
    const [schema, name] = site.name.split('.')
    const { rows } = await query(connection, `
      SELECT p.oid::regprocedure::text AS signature,
        has_function_privilege($4, p.oid, 'EXECUTE') AS granted
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = $1 AND p.proname = $2
        AND $3::int BETWEEN p.pronargs - p.pronargdefaults AND p.pronargs`,
      [schema, name, site.arity, role])
    if (rows.length === 0) {
      unresolved.push(`${site.file}:${site.line} ${site.name}/${site.arity}`)
      continue
    }
    for (const row of rows.filter((candidate) => candidate.granted !== true)) {
      denied.push(`${site.file}:${site.line} ${row.signature} not EXECUTE-granted to ${role}`)
    }
  }
  assert.deepEqual(unresolved, [], 'these call sites name a function the migrated database does not have')
  assert.deepEqual(denied, [])
})
