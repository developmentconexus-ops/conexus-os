import pg from 'pg'
import type { Pool, PoolConfig } from 'pg'
import { CAPABILITY_BY_ROLE } from './hub-roles.generated.js'
import { fieldOf } from './field-of.js'
import { logLine } from './logger.js'

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
const capabilityFor = (role: string | undefined): string =>
  (role && CAPABILITY_BY_ROLE[role]) || role || 'unlabelled'

export const errorCode = (error: unknown): string | undefined => {
  const code = fieldOf(error, 'code')
  return typeof code === 'string' ? code : undefined
}

const DEFAULT_CONNECT_TIMEOUT_MS = 5000

export const createPostgresPool = (
  connection: PostgresConnection,
  write: (line: string) => void = (line) => logLine(line),
): PostgresPool => {
  const capability = capabilityFor(connection.user)
  const pool = new pg.Pool({
    ...connection,
    application_name: `conexus-hub:${capability}`,
    max: connection.max ?? 6,
    connectionTimeoutMillis: connection.connectionTimeoutMillis ?? DEFAULT_CONNECT_TIMEOUT_MS,
  })
  // A checked-out client and an idle one both log their drop, and neither crashes the process.
  const logPoolError = (error: Error): void => { write(`HUB_POOL_ERROR:${capability}:${errorCode(error) ?? ''}\n`) }
  pool.on('connect', (client) => { client.on('error', logPoolError) })
  pool.on('error', logPoolError)
  return pool
}
