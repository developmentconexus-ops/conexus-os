import pg from 'pg'
import type { Pool, PoolConfig } from 'pg'
import { CAPABILITY_BY_ROLE } from '../generated/hub-roles.js'

export type PostgresPool = Pool
export type PostgresConnection = PoolConfig

// Role names carry the program phase that introduced them, not the capability they hold,
// and nothing in Postgres shows an operator what a connection is for. Without this,
// pg_stat_activity, every server log line and every 28P01 identify a connection only by
// a name like hub_rb_ingress. C-006 claims physical roles enforce owner boundaries, so a
// reader auditing that claim has to decode grants to learn what a connection may do.
// The register is contracts/technical/hub-database-roles.json, projected here so one row
// serves this label, the provisioning step and the reference doc.

// An unregistered role labels itself. A connection is never refused for being unknown here.
export const capabilityFor = (role: string | undefined): string =>
  (role && CAPABILITY_BY_ROLE[role]) || role || 'unlabelled'

export const createPostgresPool = (connection: PostgresConnection): PostgresPool => new pg.Pool({
  ...connection,
  application_name: `conexus-hub:${capabilityFor(connection.user)}`,
  max: 6,
  connectionTimeoutMillis: 5000,
})
