import pg from 'pg'
import type { Pool, PoolConfig } from 'pg'
import { CAPABILITY_BY_ROLE } from './hub-roles.generated.js'

export type PostgresPool = Pool
export type PostgresConnection = PoolConfig

// Role names carry the program phase that introduced them, not the capability they hold,
// and nothing in Postgres shows an operator what a connection is for. Without this,
// pg_stat_activity, every server log line and every 28P01 identify a connection only by
// a name like hub_builder_ingress. C-006 claims physical roles enforce owner boundaries, so a
// reader auditing that claim has to decode grants to learn what a connection may do.
// The register is contracts/technical/hub-database-roles.json, projected here so one row
// serves this label, the provisioning step and the reference doc.

// An unregistered role labels itself. A connection is never refused for being unknown here.
/** @public Tests import this at runtime from the built module. */
export const capabilityFor = (role: string | undefined): string =>
  (role && CAPABILITY_BY_ROLE[role]) || role || 'unlabelled'

const errorCode = (error: unknown): string | undefined =>
  typeof error === 'object' && error !== null && 'code' in error && typeof (error as { code: unknown }).code === 'string'
    ? (error as { code: string }).code
    : undefined

export const createPostgresPool = (
  connection: PostgresConnection,
  write: (line: string) => void = (line) => { process.stderr.write(line) },
): PostgresPool => {
  const capability = capabilityFor(connection.user)
  const pool = new pg.Pool({
    ...connection,
    application_name: `conexus-hub:${capability}`,
    max: connection.max ?? 6,
    connectionTimeoutMillis: 5000,
  })
  // pg-pool only ever attaches its own error listener to a client while that
  // client sits idle in the pool; it removes that listener the moment the
  // client is checked out. A client mid-query (or about to query) has no
  // listener at all, so a dropped connection there is an unhandled 'error'
  // event — a fatal, uncaught exception that takes the Hub down with it.
  // Attaching our own listener once per physical connection (on 'connect')
  // covers the client for its whole lifetime, idle or checked out, so it is
  // the single place that logs. pg-pool still re-emits an idle client's
  // error on the pool itself (unconditionally, regardless of what else is
  // listening on the client) — that pool-level 'error' listener stays, but
  // only to stop that unrelated emit from throwing; the line above already
  // logged it.
  pool.on('connect', (client) => {
    client.on('error', (error) => write(`HUB_POOL_ERROR:${capability}:${errorCode(error) ?? ''}\n`))
  })
  pool.on('error', () => {})
  return pool
}
