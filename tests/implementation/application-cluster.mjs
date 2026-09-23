import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import pg from 'pg'
import { hubModuleUrl } from './hub-build.mjs'

const { openPgRelay } = await import(hubModuleUrl('app-runner/pg-relay.js'))

// The test cluster is confined once, the way an installation is, by
// scripts/confine-application-cluster.mjs (CI runs it before verify). Its TLS directory holds the
// runner's client certificate, the only credential a Project role logs in with.
export const relayTls = () => {
  const directory = process.env.CONEXUS_TEST_APP_TLS_DIR
  if (!directory) throw new Error('MISSING_TEST_CONFIG_CONEXUS_TEST_APP_TLS_DIR')
  const read = (file) => readFileSync(join(directory, file), 'utf8')
  return { ca: read('ca.pem'), cert: read('relay.pem'), key: read('relay-key.pem') }
}

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
