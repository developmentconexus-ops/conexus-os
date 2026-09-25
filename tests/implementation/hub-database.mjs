import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { readCatalog } from '../../scripts/hub-catalog.mjs'
import { runHubMigrations } from '../../scripts/run-hub-migrations.mjs'
import { refuseProtectedCluster } from './protected-cluster.mjs'

const required = (name) => {
  const value = process.env[name]
  if (!value) throw new Error(`MISSING_TEST_CONFIG_${name}`)
  return value
}

export const adminConnection = () => ({
  host: required('CONEXUS_TEST_DB_HOST'),
  port: Number(required('CONEXUS_TEST_DB_PORT')),
  database: required('CONEXUS_TEST_DB_NAME'),
  user: required('CONEXUS_TEST_DB_USER'),
  password: required('CONEXUS_TEST_DB_PASSWORD'),
})

export const connectionStringFor = (connection, database) => {
  const url = new URL('postgresql://localhost')
  url.hostname = connection.host
  url.port = String(connection.port)
  url.pathname = `/${database}`
  url.username = connection.user
  url.password = connection.password
  return url.toString()
}

// Every suite that needs the Hub's schema gets it the way a new installation does: one empty
// database, one baseline.
// Dropping WITH (FORCE) terminates any client still connected, and the pool then reports that
// termination as an unhandled error, so the caller's own teardown has to finish first. node:test
// runs after-hooks in registration order and this helper registers before the caller, so callers
// hand their teardown to onCleanup rather than registering a hook of their own.
export const createEmptyDatabase = async (t, prefix = 'conexus_hub') => {
  await refuseProtectedCluster()
  const connection = adminConnection()
  const database = `${prefix}_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 10)}`
  const admin = new pg.Client(connection)
  await admin.connect()
  await admin.query(`CREATE DATABASE "${database}"`)
  const cleanups = []
  t.after(async () => {
    try {
      let cleanupError
      for (const cleanup of cleanups.reverse()) {
        try {
          await cleanup()
        } catch (error) {
          cleanupError ??= error
        }
      }
      try {
        await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`)
      } catch (error) {
        if (cleanupError) throw new AggregateError([cleanupError, error], 'Fixture cleanup and database drop failed')
        throw error
      }
      if (cleanupError) throw cleanupError
    } finally {
      await admin.end()
    }
  })
  return {
    admin,
    connection: { ...connection, database },
    database,
    connectionString: connectionStringFor(connection, database),
    onCleanup: (cleanup) => cleanups.push(cleanup),
  }
}

export const buildHubDatabase = async (t, prefix = 'conexus_hub') => {
  const fixture = await createEmptyDatabase(t, prefix)
  await runHubMigrations({ connectionString: fixture.connectionString })
  return fixture
}

export const withClient = async (connectionString, body) => {
  const client = new pg.Client({ connectionString })
  await client.connect()
  try {
    return await body(client)
  } finally {
    await client.end()
  }
}

export const catalogOf = (connectionString) => withClient(connectionString, readCatalog)

// node-postgres requires every Pool to carry an 'error' listener: a client the pool already
// considers idle can still report a connection drop later (for example, our own DROP DATABASE
// WITH (FORCE) above racing pool.end(), which resolves once its bookkeeping empties rather than
// once every socket finishes closing). With no listener, that later 'error' event has nothing to
// throw into but the pool itself, which throws, and node:test then charges the failure to
// whichever test happens to be running at that moment. Every pool a Postgres test builds directly
// goes through this helper instead of `new pg.Pool(...)` so that race stays inert.
export const testPool = (config) => {
  const pool = new pg.Pool(config)
  pool.on('error', () => {})
  return pool
}

export const query = async (connection, statement, values = []) => {
  const client = new pg.Client(typeof connection === 'string' ? { connectionString: connection } : connection)
  await client.connect()
  try {
    return await client.query(statement, values)
  } finally {
    await client.end()
  }
}
