import { createHmac } from 'node:crypto'

/** A Postgres session the data plane issues statements on; pg's Client and PoolClient both fit. */
export type Sql = Readonly<{
  query(text: string, values?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>
}>

/**
 * Where one Project's Preview data lives and who may touch it. Every name derives from the Project id
 * alone, so the platform never stores a mapping a handler could influence.
 */
export type PreviewAllocation = Readonly<{
  projectId: string
  schema: string
  runtimeRole: string
  migrationRole: string
}>

export type MigrationSource = Readonly<{ name: string; sha256: string; sql: string }>
export type LedgerRow = Readonly<{ position: number; name: string; sha256: string }>
export type MigrationPlan = Readonly<{ reset: boolean; pending: readonly (MigrationSource & Readonly<{ position: number }>)[] }>

export const PROVISIONER_ROLE = 'app_provisioner'
export const LEDGER_TABLE = 'conexus_migration'
const PROJECT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const RUNTIME_CONNECTION_LIMIT = 8
const MIGRATION_CONNECTION_LIMIT = 2

export const previewAllocation = (projectId: string): PreviewAllocation => {
  if (!PROJECT_ID.test(projectId)) throw new Error('APPLICATION_PROJECT_ID_REFUSED')
  const hex = projectId.replaceAll('-', '')
  return Object.freeze({
    projectId,
    schema: `p_${hex}_preview`,
    runtimeRole: `app_${hex}_preview_rt`,
    migrationRole: `app_${hex}_preview_mig`,
  })
}

// A Project role's password is a function of the runner's key and the role name, so provisioning
// converges on the same credential after a restart without a stored secret per Project.
export const roleCredential = (key: Uint8Array, role: string): string => {
  if (key.byteLength < 32) throw new Error('APPLICATION_CREDENTIAL_KEY_REFUSED')
  return createHmac('sha256', key).update(`conexus-application-role:${role}`).digest('base64url')
}

const identifier = (value: string): string => {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(value)) throw new Error('APPLICATION_IDENTIFIER_REFUSED')
  return `"${value}"`
}
const literal = (value: string): string => `'${value.replaceAll("'", "''")}'`

const ensureRole = async (provisioner: Sql, role: string, password: string, connectionLimit: number): Promise<void> => {
  const repeatable = `LOGIN NOINHERIT CONNECTION LIMIT ${connectionLimit} PASSWORD ${literal(password)}`
  const { rows } = await provisioner.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role])
  // Restating an attribute the provisioner itself lacks (SUPERUSER, CREATEDB, REPLICATION, BYPASSRLS)
  // is refused even when nothing changes, and the provisioner could never have granted one, so they are
  // spelled out once at creation.
  await provisioner.query(rows.length === 0
    ? `CREATE ROLE ${identifier(role)} WITH ${repeatable} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`
    : `ALTER ROLE ${identifier(role)} WITH ${repeatable} NOCREATEROLE`)
}

/**
 * Creates or repairs one Project's Preview allocation. The provisioner owns the schema; the migration
 * role may create objects in it but, not owning it, cannot grant it to anyone; the runtime role gets
 * DML on what the migration role creates and nothing else.
 */
export const ensurePreviewAllocation = async (
  provisioner: Sql,
  input: Readonly<{ allocation: PreviewAllocation; database: string; credential(role: string): string }>,
): Promise<void> => {
  const { allocation, database } = input
  const schema = identifier(allocation.schema)
  const runtime = identifier(allocation.runtimeRole)
  const migration = identifier(allocation.migrationRole)
  await ensureRole(provisioner, allocation.runtimeRole, input.credential(allocation.runtimeRole), RUNTIME_CONNECTION_LIMIT)
  await ensureRole(provisioner, allocation.migrationRole, input.credential(allocation.migrationRole), MIGRATION_CONNECTION_LIMIT)
  for (const [role, settings] of [
    [runtime, [['search_path', allocation.schema], ['statement_timeout', '5s'], ['idle_in_transaction_session_timeout', '10s']]],
    [migration, [['search_path', allocation.schema], ['statement_timeout', '30s'], ['lock_timeout', '5s'], ['idle_in_transaction_session_timeout', '10s']]],
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
}

export const readLedger = async (provisioner: Sql, allocation: PreviewAllocation): Promise<readonly LedgerRow[]> => {
  const { rows } = await provisioner.query(`SELECT position, name, sha256 FROM ${identifier(allocation.schema)}.${LEDGER_TABLE} ORDER BY position`)
  return rows.map((row) => Object.freeze({ position: Number(row.position), name: String(row.name), sha256: String(row.sha256) }))
}

/**
 * The applied history must be an exact prefix of the artifact's migrations. Anything else (an edited,
 * removed or reordered migration) cannot apply cleanly, so the Preview schema is reset and every
 * migration runs again; Preview data is disposable and the caller says so.
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

export const resetPreviewSchema = async (provisioner: Sql, allocation: PreviewAllocation): Promise<void> => {
  await provisioner.query(`DROP SCHEMA IF EXISTS ${identifier(allocation.schema)} CASCADE`)
}

/**
 * Applies pending migrations in one transaction on a session authenticated as the migration role, so a
 * failure leaves the schema as it was. Runs inside the sandboxed worker in production.
 */
export const applyPendingMigrations = async (migrator: Sql, schema: string, plan: MigrationPlan['pending']): Promise<void> => {
  const ledger = `${identifier(schema)}.${LEDGER_TABLE}`
  await migrator.query('BEGIN')
  try {
    for (const migration of plan) {
      await migrator.query(migration.sql)
      await migrator.query(`INSERT INTO ${ledger} (position, name, sha256) VALUES ($1, $2, $3)`, [migration.position, migration.name, migration.sha256])
    }
    await migrator.query('COMMIT')
  } catch (error) {
    await migrator.query('ROLLBACK').catch(() => undefined)
    throw error
  }
}
