import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import pg from 'pg'
import { hubModuleUrl } from './hub-build.mjs'

const { openPgRelay, readRelayTls } = await import(hubModuleUrl('app-runner/pg-relay.js'))

const required = (name) => {
  const value = process.env[name]
  if (!value) throw new Error(`MISSING_TEST_CONFIG_${name}`)
  return value
}

// The Applications PostgreSQL the suites run against: a cluster apart from the Hub's test cluster,
// started by scripts/run-application-cluster.sh and confined once, the way an installation is, by
// scripts/confine-application-cluster.mjs (CI does both before verify).
export const applicationClusterAdmin = () => ({
  host: required('CONEXUS_TEST_APP_DB_HOST'),
  port: Number(required('CONEXUS_TEST_APP_DB_PORT')),
  user: required('CONEXUS_TEST_APP_DB_USER'),
  password: required('CONEXUS_TEST_APP_DB_PASSWORD'),
  database: 'postgres',
})

// The suites set app_provisioner's password and create and drop Project roles, which belong to the
// cluster. On a cluster that serves real Previews that would replace the runner's credential.
const PROTECTED_APPLICATION_DATABASES = (process.env.CONEXUS_PROTECTED_APP_DATABASES ?? 'conexus_apps').split(',').map((name) => name.trim()).filter(Boolean)

export const refuseProtectedApplicationCluster = async () => {
  const admin = applicationClusterAdmin()
  const client = new pg.Client(admin)
  await client.connect()
  try {
    const { rows } = await client.query('SELECT datname FROM pg_database WHERE datname = ANY($1)', [PROTECTED_APPLICATION_DATABASES])
    if (rows.length > 0) throw new Error(`PROTECTED_APPLICATION_CLUSTER_REFUSED: ${admin.host}:${admin.port} hosts ${rows.map((row) => row.datname).join(', ')}`)
  } finally {
    await client.end().catch(() => {})
  }
}

// Read through the runner's own reader, so every suite runs on the directory rules the runner enforces.
export const relayTls = () => readRelayTls(required('CONEXUS_TEST_APP_TLS_DIR'))

/** A session as `role` on `database` through the runner's pinned relay, closed when the test ends. */
export const loginThroughRelay = async (t, upstream, role, database) => {
  const directory = mkdtempSync(join(tmpdir(), 'conexus-relay-'))
  const relay = await openPgRelay({ socketPath: join(directory, '.s.PGSQL.5432'), upstream, pin: { user: role, database }, tls: relayTls(), maxSessions: 2 })
  const client = new pg.Client({ host: directory, user: role, database, connectionTimeoutMillis: 5000 })
  t.after(async () => {
    await client.end().catch(() => {})
    await relay.close()
    rmSync(directory, { recursive: true, force: true })
  })
  await client.connect()
  return client
}
