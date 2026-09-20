import { createHash } from 'node:crypto'
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { assertCatalog, assertRoleInvariants, readCommittedSnapshot } from './hub-catalog.mjs'

const repositoryRoot = resolve(import.meta.dirname, '..')
const defaultMigrationsRoot = resolve(repositoryRoot, 'apps/hub/migrations')
const migrationPattern = /^(\d{4})_[a-z0-9_]+\.sql$/
export const baselineName = '0001_baseline.sql'
export const baselineVersion = '0001'
export const baselineDigest = 'f558c1f0bcbc23273b822ec03ce566425c8b518acacfa28a5ba6baf5b52ea0d7'
const pruneDeadIamActionsDigest = 'a7ec17faae66640cbe2e85efec79f168abe0b3f8dc2bd07d76394909e24e65f4'
const listConnectionsSelectedDigest = '35a82f9f7a4a78da5571f503c4cd7d1f440f7d0ae7b9718b51a4fb6646c9031c'
const listConnectionsSharedDigest = '0d62c72585ce8d2987d4cb5a2cec04ec0cea1284f369c748130382a1f7da03f6'
const builderRunRequestTextDigest = '4dded47eda6987575baea9cdc6f3565990cb3b637b779cb4bd7d428d0e9d9386'
const migrationDigests = new Map([
  [baselineName, baselineDigest],
  ['0002_prune_dead_iam_actions.sql', pruneDeadIamActionsDigest],
  ['0003_list_connections_selected.sql', listConnectionsSelectedDigest],
  ['0004_list_connections_shared.sql', listConnectionsSharedDigest],
  ['0005_builder_run_request_text.sql', builderRunRequestTextDigest],
])

const advisoryLock = 4_349_395_539_450_322_946n
// A second Hub starting at the same moment waits on the advisory lock, and that wait is normally
// milliseconds. Bounding it means a lock nobody will ever release fails the run with SQLSTATE
// 55P03 instead of holding the process open forever.
const lockTimeoutMs = 60_000
const takeAdvisoryLock = async (client) => {
  await client.query(`SET LOCAL lock_timeout = ${lockTimeoutMs}`)
  await client.query('SELECT pg_advisory_xact_lock($1)', [advisoryLock.toString()])
}
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const fail = (code, detail = '') => { throw new Error(`${code}${detail ? `:${detail}` : ''}`) }

export const loadHubMigrationFiles = (migrationsRoot = defaultMigrationsRoot) => {
  const names = readdirSync(migrationsRoot).filter((name) => name.endsWith('.sql')).sort()
  if (!names.includes(baselineName)) fail('MIGRATION_CENSUS_REFUSED', baselineName)
  return names.map((name) => {
    // Four digits from the baseline onward, so a three-digit file left behind by the history this
    // baseline replaced is refused by name rather than read.
    const match = migrationPattern.exec(name)
    if (!match) fail('MIGRATION_NAME_REFUSED', name)
    if (!migrationDigests.has(name)) fail('MIGRATION_CENSUS_REFUSED', name)
    const path = resolve(migrationsRoot, name)
    const entry = lstatSync(path)
    if (!entry.isFile() || entry.isSymbolicLink()) fail('MIGRATION_ENTRY_REFUSED', name)
    const bytes = readFileSync(path)
    const checksum = sha256(bytes)
    if (checksum !== migrationDigests.get(name)) fail(`MIGRATION_${match[1]}_DIGEST_REFUSED`)
    return { version: match[1], name, path, bytes, checksum }
  })
}

const migrationBody = ({ name, bytes }) => {
  const source = bytes.toString('utf8')
  const match = /^BEGIN;\r?\n([\s\S]*)\r?\nCOMMIT;\r?\n?$/.exec(source)
  if (!match) fail('MIGRATION_TRANSACTION_ENVELOPE_REFUSED', name)
  return match[1]
}

const tableExists = async (client, qualified) => (await client.query('SELECT to_regclass($1) IS NOT NULL AS present', [qualified])).rows[0].present
const schemaExists = async (client, schema) => (await client.query('SELECT to_regnamespace($1) IS NOT NULL AS present', [schema])).rows[0].present
const ledgerRows = async (client) => (await client.query('SELECT version, checksum_sha256 FROM iam.schema_migration ORDER BY version')).rows

// The ledger proves which versions ran against this database and that their bytes did not change.
// It says nothing about the catalog: while migrations are still pending, the database is not yet
// the one any snapshot describes, so only the ledger is checked here.
const ledgerState = async (client, migrations) => {
  if (!await tableExists(client, 'iam.schema_migration')) return { applied: new Map(), maximum: null }
  const rows = await ledgerRows(client)
  const files = new Map(migrations.map((migration) => [migration.version, migration]))
  for (const row of rows) {
    const migration = files.get(row.version)
    if (!migration) fail('MIGRATION_UNKNOWN_APPLIED', row.version)
    if (migration.checksum !== row.checksum_sha256) fail('MIGRATION_APPLIED_DIGEST_DRIFT', row.version)
  }
  const applied = new Map(rows.map((row) => [row.version, row.checksum_sha256]))
  return { applied, maximum: rows.at(-1)?.version ?? null }
}

export const runMigrations = async ({ connectionString, migrations, catalogSnapshot = readCommittedSnapshot() }) => {
  const client = new pg.Client({ connectionString })
  await client.connect()
  const appliedNow = []
  try {
    for (const migration of migrations) {
      await client.query('BEGIN')
      try {
        await takeAdvisoryLock(client)
        const ledger = await ledgerState(client, migrations)
        if (ledger.applied.has(migration.version)) {
          await client.query('COMMIT')
          continue
        }
        if (migration.version === baselineVersion && await schemaExists(client, 'iam')) fail('MIGRATION_DIRTY_BASELINE_REFUSED')
        await client.query(migrationBody(migration))
        await client.query('INSERT INTO iam.schema_migration(version, checksum_sha256) VALUES ($1, $2)', [migration.version, migration.checksum])
        await client.query('COMMIT')
        appliedNow.push(migration.version)
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      }
    }
    // Every pending migration has now run, so this is the one point where the database is the one
    // the snapshot describes. The catalog and role invariants are asserted here, once, rather than
    // on every loop iteration: checking them earlier would compare a database that still has
    // migrations left to run against a snapshot of the finished one, which refuses every upgrade
    // and every fresh install of more than one migration. The cost is that a catalog that drifted
    // independently of the ledger is now caught after pending migrations run rather than before;
    // a ledger that is already complete still runs no migration bodies, so that case is unaffected.
    await client.query('BEGIN')
    try {
      await takeAdvisoryLock(client)
      const ledger = await ledgerState(client, migrations)
      if (catalogSnapshot) {
        await assertCatalog(client, catalogSnapshot)
        await assertRoleInvariants(client)
      }
      await client.query('COMMIT')
      return { verdict: 'PASS', appliedNow, versions: [...ledger.applied.keys()] }
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    }
  } finally {
    await client.end()
  }
}

export const runHubMigrations = ({ connectionString, migrationsRoot = defaultMigrationsRoot, catalogSnapshot }) =>
  runMigrations({ connectionString, migrations: loadHubMigrationFiles(migrationsRoot), ...(catalogSnapshot === undefined ? {} : { catalogSnapshot }) })

const readConnectionString = (path) => {
  if (!path || !existsSync(path) || !lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) fail('MIGRATION_DATABASE_URL_FILE_REFUSED')
  const value = readFileSync(path, 'utf8').trim()
  if (!value) fail('MIGRATION_DATABASE_URL_EMPTY')
  return value
}

const isEntrypoint = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isEntrypoint) {
  const connectionString = readConnectionString(process.env.CONEXUS_MIGRATION_DATABASE_URL_FILE)
  const result = await runHubMigrations({ connectionString })
  process.stdout.write(`${JSON.stringify(result)}\n`)
}
