import pg from 'pg'
import type { Pool, PoolConfig } from 'pg'
import { CAPABILITY_BY_ROLE } from './hub-roles.generated.js'
import { fieldOf } from './field-of.js'
import { Failure, logFailure } from './failure.js'
import { logger } from './logger.js'

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

export const createPostgresPool = (connection: PostgresConnection): PostgresPool => {
  const capability = capabilityFor(connection.user)
  const pool = new pg.Pool({
    ...connection,
    application_name: `conexus-hub:${capability}`,
    max: connection.max ?? 6,
    connectionTimeoutMillis: connection.connectionTimeoutMillis ?? DEFAULT_CONNECT_TIMEOUT_MS,
  })
  // The client's own listener logs a drop, whether the client is checked out or idle. The pool re-emits
  // an idle client's error, so its handler only keeps that second emit from crashing the process.
  pool.on('connect', (client) => {
    client.on('error', (error) => logFailure(logger, new Failure('HUB_POOL_ERROR', { cause: error }), { 'hub.capability': capability, 'db.error_code': errorCode(error) ?? '' }))
  })
  pool.on('error', () => undefined)
  return pool
}
