import pg from 'pg'
import type { Pool, PoolConfig } from 'pg'

export type PostgresPool = Pool
export type PostgresConnection = PoolConfig

// Role names carry the program phase that introduced them, not the capability they hold,
// and nothing in Postgres shows an operator what a connection is for. Without this,
// pg_stat_activity, every server log line and every 28P01 identify a connection only by
// a name like hub_rb_ingress. C-006 claims physical roles enforce owner boundaries, so a
// reader auditing that claim has to decode grants to learn what a connection may do.
// This map is the register, kept beside the code that uses it so it cannot drift.
export const CAPABILITY_BY_ROLE: Readonly<Record<string, string>> = Object.freeze({
  hub_iam_runtime: 'identity-and-access',
  hub_s2_read: 'workspace-read',
  hub_ws01_command: 'workspace-command',
  hub_s3_read: 'project-read',
  hub_prj03_command: 'project-command',
  hub_r2_project_binding: 'project-binding',
  hub_r2_brain_read: 'brain-read',
  hub_r2_brain_attester: 'brain-attester',
  hub_r2_key_conformance_subject: 'key-conformance-subject',
  hub_r2_connections: 'connections',
  hub_rb_ingress: 'builder-request',
  hub_rb_executor: 'builder-run-execution',
})

// An unregistered role labels itself. A connection is never refused for being unknown here.
export const capabilityFor = (role: string | undefined): string =>
  (role && CAPABILITY_BY_ROLE[role]) || role || 'unlabelled'

export const createPostgresPool = (connection: PostgresConnection): PostgresPool => new pg.Pool({
  ...connection,
  application_name: `conexus-hub:${capabilityFor(connection.user)}`,
  max: 6,
  connectionTimeoutMillis: 5000,
})
