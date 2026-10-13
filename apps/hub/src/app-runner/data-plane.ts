import type { PlannedMigration } from './wire.js'
import { ProjectId, type Result } from '@conexus/contract'
import { validateMigrationBatch } from './migration-sql.js'
import type { MigrationFailure, MigrationSource } from './migration-sql.js'
import { allocate } from './allocation.js'
import type { Allocation, PreviewAllocation } from './allocation.js'
/** A Postgres session the data plane issues statements on; pg's Client and PoolClient both fit. */
export type Sql = Readonly<{
  query(text: string, values?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>
}>

export type LedgerRow = Readonly<{ position: number; name: string; sha256: string }>
export type MigrationPlan = Readonly<{ reset: boolean; pending: readonly PlannedMigration[] }>

export const PROVISIONER_ROLE = 'app_provisioner'
const LEDGER_TABLE = 'conexus_migration'
/** Every Project/domain role name the allocation owner derives; pg_hba confines exactly these names. */
export const PROJECT_ROLE_NAME = /^app_[0-9a-f]{32}_(preview|published)_(rt|mig)$/
const RUNTIME_CONNECTION_LIMIT = 8
const MIGRATION_CONNECTION_LIMIT = 2
const RUNTIME_TEMP_FILE_LIMIT = '256MB'
const MIGRATION_TEMP_FILE_LIMIT = '1GB'

const identifier = (value: string): string => {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(value)) throw new Error('the SQL identifier is not one the data plane issues')
  return `"${value}"`
}
const literal = (value: string): string => `'${value.replaceAll("'", "''")}'`

// A Project role authenticates only with the runner's client certificate: the cluster's pg_hba
// admits Project role names with nothing else (scripts/confine-application-cluster.mjs). Its password
// is NULL and already expired; Postgres lets a role change its own password but never its VALID
// UNTIL, so a password it sets for itself fails even on a path that would accept a password.
const ensureRole = async (provisioner: Sql, role: string, connectionLimit: number): Promise<void> => {
  const repeatable = `LOGIN NOINHERIT CONNECTION LIMIT ${connectionLimit} PASSWORD NULL VALID UNTIL '-infinity'`
  const { rows } = await provisioner.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role])
  // Restating an attribute the provisioner itself lacks (SUPERUSER, CREATEDB, REPLICATION, BYPASSRLS)
  // is refused even when nothing changes, and the provisioner could never have granted one, so they are
  // spelled out once at creation.
  await provisioner.query(rows.length === 0
    ? `CREATE ROLE ${identifier(role)} WITH ${repeatable} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`
    : `ALTER ROLE ${identifier(role)} WITH ${repeatable} NOCREATEROLE`)
}

/**
 * Creates or repairs one Project/domain allocation. The provisioner owns the schema; the migration
 * role may create objects in it but, not owning the schema, cannot grant USAGE on it, so a grant it
 * makes on its own tables reaches no other Project. The runtime role gets DML on what the migration
 * role creates, and restoreRuntimePrivileges takes back anything more a migration grants.
 */
export async function ensureAllocation(
  provisioner: Sql,
  input: Readonly<{ allocation: Allocation; database: string }>,
): Promise<void> {
  const { allocation, database } = input
  const schema = identifier(allocation.schema)
  const runtime = identifier(allocation.runtimeRole)
  const migration = identifier(allocation.migrationRole)
  await ensureRole(provisioner, allocation.runtimeRole, RUNTIME_CONNECTION_LIMIT)
  await ensureRole(provisioner, allocation.migrationRole, MIGRATION_CONNECTION_LIMIT)
  // temp_file_limit is the one bound here a session cannot lift: only a role granted SET on it may
  // change it. The timeouts are defaults a session may change; the invocation's wall clock (the
  // worker kill and the relay's cancel) is what ends a runaway statement or transaction. None of
  // these bounds bytes a session writes to tables or WAL, or memory it takes by raising work_mem:
  // the Applications cluster's fixed-size filesystem and its container memory limit do, and they
  // contain that failure in the Data Plane rather than prevent it.
  for (const [role, settings] of [
    [runtime, [['search_path', allocation.schema], ['statement_timeout', '5s'], ['transaction_timeout', '6s'], ['lock_timeout', '2s'], ['idle_in_transaction_session_timeout', '10s'], ['temp_file_limit', RUNTIME_TEMP_FILE_LIMIT]]],
    [migration, [['search_path', allocation.schema], ['statement_timeout', '30s'], ['transaction_timeout', '30s'], ['lock_timeout', '5s'], ['idle_in_transaction_session_timeout', '10s'], ['temp_file_limit', MIGRATION_TEMP_FILE_LIMIT]]],
  ] as const) {
    for (const [name, value] of settings) await provisioner.query(`ALTER ROLE ${role} IN DATABASE ${identifier(database)} SET ${name} = ${literal(value)}`)
  }
  await provisioner.query(`GRANT CONNECT ON DATABASE ${identifier(database)} TO ${runtime}, ${migration}`)
  await provisioner.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`)
  await provisioner.query(`REVOKE ALL ON SCHEMA ${schema} FROM PUBLIC`)
  await provisioner.query(`GRANT USAGE, CREATE ON SCHEMA ${schema} TO ${migration}`)
  await provisioner.query(`GRANT USAGE ON SCHEMA ${schema} TO ${runtime}`)
  // Default privileges for the migration role's objects are set as that role. The provisioner holds
  // SET without INHERIT on it, so it never exercises that role's grants by accident.
  await provisioner.query(`GRANT ${migration} TO ${identifier(PROVISIONER_ROLE)} WITH INHERIT FALSE, SET TRUE`)
  await provisioner.query(`SET ROLE ${migration}`)
  try {
    await provisioner.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${runtime}`)
    await provisioner.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} GRANT USAGE, SELECT ON SEQUENCES TO ${runtime}`)
  } finally {
    await provisioner.query('RESET ROLE')
  }
  await provisioner.query(`CREATE TABLE IF NOT EXISTS ${schema}.${LEDGER_TABLE} (
    position integer PRIMARY KEY CHECK (position > 0),
    name text NOT NULL UNIQUE,
    sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    applied_at timestamptz NOT NULL DEFAULT now())`)
  await provisioner.query(`REVOKE ALL ON ${schema}.${LEDGER_TABLE} FROM PUBLIC`)
  await provisioner.query(`GRANT SELECT, INSERT ON ${schema}.${LEDGER_TABLE} TO ${migration}`)
  // The migration role owns what its migrations create, so a view or rule it defines runs with its
  // rights when a runtime handler touches it. The ledger is the one thing it may write that the
  // runtime role may not; the policy admits it only in a session that logged in as the migration
  // role, which a runtime session never is.
  await provisioner.query(`ALTER TABLE ${schema}.${LEDGER_TABLE} ENABLE ROW LEVEL SECURITY`)
  await provisioner.query(`DROP POLICY IF EXISTS migration_session ON ${schema}.${LEDGER_TABLE}`)
  await provisioner.query(`CREATE POLICY migration_session ON ${schema}.${LEDGER_TABLE} TO ${migration}
    USING (session_user = ${literal(allocation.migrationRole)}) WITH CHECK (session_user = ${literal(allocation.migrationRole)})`)
  await restoreRuntimePrivileges(provisioner, allocation)
}

/**
 * Leaves PUBLIC nothing and the runtime role exactly DML on what the migration role owns in the
 * schema. A migration owns its objects, so it can grant the runtime role TRUNCATE, TRIGGER,
 * REFERENCES or MAINTAIN, or grant PUBLIC anything; the runner calls this after every migration.
 * Revoked as the owner with CASCADE, so grants the runtime role passed on go too.
 */
export async function restoreRuntimePrivileges(provisioner: Sql, allocation: Allocation): Promise<void> {
  const schema = identifier(allocation.schema)
  const runtime = identifier(allocation.runtimeRole)
  const { rows } = await provisioner.query(`SELECT format('%I.%I', n.nspname, c.relname) AS name, c.relkind = 'S' AS sequence
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = $1 AND c.relowner = $2::regrole AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')`, [allocation.schema, allocation.migrationRole])
  const tables = rows.filter((row) => row.sequence !== true).map((row) => String(row.name)).join(', ')
  const sequences = rows.filter((row) => row.sequence === true).map((row) => String(row.name)).join(', ')
  await provisioner.query(`SET ROLE ${identifier(allocation.migrationRole)}`)
  try {
    if (tables) {
      await provisioner.query(`REVOKE ALL ON TABLE ${tables} FROM PUBLIC, ${runtime} CASCADE`)
      await provisioner.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ${tables} TO ${runtime}`)
    }
    if (sequences) {
      await provisioner.query(`REVOKE ALL ON SEQUENCE ${sequences} FROM PUBLIC, ${runtime} CASCADE`)
      await provisioner.query(`GRANT USAGE, SELECT ON SEQUENCE ${sequences} TO ${runtime}`)
    }
    await provisioner.query(`REVOKE ALL ON ALL ROUTINES IN SCHEMA ${schema} FROM PUBLIC, ${runtime} CASCADE`)
  } finally {
    await provisioner.query('RESET ROLE')
  }
}

const ALLOCATION_SCHEMA = /^p_([0-9a-f]{32})_(preview|published)$/

export async function convergeAllocations(provisioner: Sql, database: string): Promise<readonly Allocation[]> {
  const { rows } = await provisioner.query("SELECT nspname FROM pg_namespace WHERE nspname LIKE 'p\\_%' ORDER BY nspname")
  const allocations: Allocation[] = []
  for (const row of rows) {
    const match = ALLOCATION_SCHEMA.exec(String(row.nspname))
    const hex = match?.[1]
    if (!hex) continue
    const projectId = ProjectId.parse(`${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`)
    const allocation = allocate({ projectId, kind: match?.[2] === 'preview' ? 'PREVIEW' : 'PUBLISHED' })
    await ensureAllocation(provisioner, { allocation, database })
    allocations.push(allocation)
  }
  return Object.freeze(allocations)
}

export async function readLedger(provisioner: Sql, allocation: Allocation): Promise<readonly LedgerRow[]> {
  const { rows } = await provisioner.query(`SELECT position, name, sha256 FROM ${identifier(allocation.schema)}.${LEDGER_TABLE} ORDER BY position`)
  return rows.map((row) => Object.freeze({ position: Number(row.position), name: String(row.name), sha256: String(row.sha256) }))
}

/**
 * The applied history must be an exact prefix of the artifact's migrations. Anything else (an edited,
 * removed or reordered migration) cannot apply cleanly: `reset` says the Preview schema would have to be
 * dropped and every migration run again. The caller decides whether that is allowed; a Project with an
 * application refuses instead, so its data is never erased.
 */
export const planMigrations = (ledger: readonly LedgerRow[], migrations: readonly MigrationSource[]): MigrationPlan => {
  const prefix = ledger.length <= migrations.length && ledger.every((row, index) =>
    row.position === index + 1 && row.name === migrations[index]?.name && row.sha256 === migrations[index]?.sha256)
  const start = prefix ? ledger.length : 0
  return Object.freeze({
    reset: !prefix,
    pending: Object.freeze(migrations.slice(start).map((migration, index) => Object.freeze({ ...migration, position: start + index + 1 }))),
  })
}

export async function resetPreviewSchema(provisioner: Sql, allocation: PreviewAllocation): Promise<void> {
  await provisioner.query(`DROP SCHEMA IF EXISTS ${identifier(allocation.schema)} CASCADE`)
}

/**
 * Removes a Project's Preview allocation entirely: the schema and the two roles derived from its
 * id. Called once, when the Project itself is deleted, never as part of the ordinary migrate path.
 * Idempotent: a role or schema already gone is not an error.
 */
export async function disposePreviewAllocation(provisioner: Sql, allocation: PreviewAllocation): Promise<void> {
  await resetPreviewSchema(provisioner, allocation)
  for (const role of [allocation.migrationRole, allocation.runtimeRole]) {
    const { rows } = await provisioner.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role])
    if (rows.length === 0) continue
    // DROP OWNED BY needs the privileges of the role it clears, and the provisioner holds the
    // migration role with INHERIT FALSE and the runtime role with none, so it takes them for this
    // last step. Restating the grant on a retry changes nothing.
    await provisioner.query(`GRANT ${identifier(role)} TO ${identifier(PROVISIONER_ROLE)} WITH INHERIT TRUE, SET TRUE`)
    await provisioner.query(`DROP OWNED BY ${identifier(role)} CASCADE`)
    await provisioner.query(`DROP ROLE ${identifier(role)}`)
  }
}

/**
 * Applies pending migrations in one transaction on a session authenticated as the migration role, so a
 * failure leaves the schema as it was. Runs inside the sandboxed worker in production.
 */
export const applyPendingMigrations = async (migrator: Sql, schema: string, plan: MigrationPlan['pending']): Promise<Result<void, MigrationFailure>> => {
  const admitted = await validateMigrationBatch(plan)
  if (!admitted.ok) return admitted
  const ledger = `${identifier(schema)}.${LEDGER_TABLE}`
  let failedMigration: string | null = null
  try {
    await migrator.query('BEGIN')
    for (const pending of plan) {
      failedMigration = pending.name
      // A previous file can change scanner settings. This separate message pins the settings
      // used to parse the complete unchanged file, including SET statements inside that file.
      await migrator.query("SET LOCAL standard_conforming_strings = on; SET LOCAL backslash_quote = safe_encoding; SET LOCAL client_encoding = 'UTF8'")
      await migrator.query(pending.sql)
      await migrator.query(`INSERT INTO ${ledger} (position, name, sha256) VALUES ($1, $2, $3)`, [pending.position, pending.name, pending.sha256])
    }
    failedMigration = null
    await migrator.query('COMMIT')
    return Object.freeze({ ok: true, result: undefined })
  } catch (error) {
    await migrator.query('ROLLBACK').catch(() => undefined)
    return Object.freeze({ ok: false, error: Object.freeze({ code: 'APPLICATION_MIGRATION_FAILED' as const, migration: failedMigration, cause: error }) })
  }
}
