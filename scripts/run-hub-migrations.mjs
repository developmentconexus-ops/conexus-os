import { createHash } from 'node:crypto'
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { assertCatalog, assertRoleInvariants, catalogDigest, describeCatalogDrift, readCatalog, readCommittedSnapshot } from './hub-catalog.mjs'

const repositoryRoot = resolve(import.meta.dirname, '..')
const defaultMigrationsRoot = resolve(repositoryRoot, 'apps/hub/migrations')
const migrationPattern = /^(\d{4})_[a-z0-9_]+\.sql$/
export const baselineName = '0001_baseline.sql'
export const baselineVersion = '0001'
export const baselineDigest = 'f558c1f0bcbc23273b822ec03ce566425c8b518acacfa28a5ba6baf5b52ea0d7'
const migrationDigests = new Map([[baselineName, baselineDigest]])

// The ledger a Hub installed before the baseline carries: 57 three-digit versions ending at 059.
// Recognising it needs its shape, not its contents, so no digest of a deleted file survives here.
const legacyLedgerSize = 57
const legacyLedgerHead = '059'

const advisoryLock = 4_349_395_539_450_322_946n
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

const isLegacyLedger = (rows) => rows.length > 0 && rows.every((row) => /^\d{3}$/.test(row.version))

// The ledger proves which versions ran and that their bytes did not change. The catalog snapshot
// proves the database is the one a clean application of exactly those versions produces.
const verifyLedger = async (client, migrations, catalogSnapshot) => {
  if (!await tableExists(client, 'iam.schema_migration')) return { applied: new Map(), maximum: null }
  const rows = await ledgerRows(client)
  if (isLegacyLedger(rows)) fail('MIGRATION_ADOPTION_REQUIRED', `ledger head ${rows.at(-1).version}; run node scripts/run-hub-migrations.mjs --adopt-baseline`)
  const files = new Map(migrations.map((migration) => [migration.version, migration]))
  for (const row of rows) {
    const migration = files.get(row.version)
    if (!migration) fail('MIGRATION_UNKNOWN_APPLIED', row.version)
    if (migration.checksum !== row.checksum_sha256) fail('MIGRATION_APPLIED_DIGEST_DRIFT', row.version)
  }
  const applied = new Map(rows.map((row) => [row.version, row.checksum_sha256]))
  if (catalogSnapshot) {
    await assertCatalog(client, catalogSnapshot)
    await assertRoleInvariants(client)
  }
  return { applied, maximum: rows.at(-1)?.version ?? null }
}

const runMigrations = async ({ connectionString, migrations, catalogSnapshot = readCommittedSnapshot() }) => {
  const client = new pg.Client({ connectionString })
  await client.connect()
  const appliedNow = []
  try {
    for (const migration of migrations) {
      await client.query('BEGIN')
      try {
        await client.query('SELECT pg_advisory_xact_lock($1)', [advisoryLock.toString()])
        const ledger = await verifyLedger(client, migrations, catalogSnapshot)
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
    await client.query('BEGIN')
    try {
      await client.query('SELECT pg_advisory_xact_lock($1)', [advisoryLock.toString()])
      const ledger = await verifyLedger(client, migrations, catalogSnapshot)
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

// A Hub installed before the baseline existed carries the 001-059 ledger and a catalog that equals
// the baseline's once the three superseded owner roles stop holding grants in it. Adoption proves
// that equality and then replaces the ledger. It never applies the baseline over live data.
export const adoptHubBaseline = async ({ connectionString, migrationsRoot = defaultMigrationsRoot }) => {
  const baseline = loadHubMigrationFiles(migrationsRoot).find((migration) => migration.version === baselineVersion)
  const snapshot = readCommittedSnapshot()
  const expected = catalogDigest(snapshot.catalog)
  const client = new pg.Client({ connectionString })
  await client.connect()
  try {
    await client.query('BEGIN')
    try {
      await client.query('SELECT pg_advisory_xact_lock($1)', [advisoryLock.toString()])
      if (!await tableExists(client, 'iam.schema_migration')) fail('BASELINE_ADOPT_NO_LEDGER')
      const rows = await ledgerRows(client)
      if (rows.length === 1 && rows[0].version === baselineVersion && rows[0].checksum_sha256 === baseline.checksum) {
        await client.query('COMMIT')
        return { verdict: 'ALREADY_ADOPTED', head: baselineVersion }
      }
      if (!isLegacyLedger(rows) || rows.length !== legacyLedgerSize || rows.at(-1).version !== legacyLedgerHead) {
        fail('BASELINE_ADOPT_HEAD_REFUSED', `${rows.length} rows, head ${rows.at(-1)?.version ?? 'none'}`)
      }
      await client.query('DROP OWNED BY brain_owner, connections_owner, claude_connection_owner')
      const actual = await readCatalog(client)
      if (catalogDigest(actual) !== expected) fail('BASELINE_ADOPT_CATALOG_REFUSED', describeCatalogDrift(actual, snapshot.catalog))
      await assertRoleInvariants(client)
      await client.query('DELETE FROM iam.schema_migration')
      await client.query('INSERT INTO iam.schema_migration(version, checksum_sha256) VALUES ($1, $2)', [baselineVersion, baseline.checksum])
      await client.query('COMMIT')
      return { verdict: 'ADOPTED', from: legacyLedgerHead, to: baselineVersion }
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    }
  } finally {
    await client.end()
  }
}

const readConnectionString = (path) => {
  if (!path || !existsSync(path) || !lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) fail('MIGRATION_DATABASE_URL_FILE_REFUSED')
  const value = readFileSync(path, 'utf8').trim()
  if (!value) fail('MIGRATION_DATABASE_URL_EMPTY')
  return value
}

const isEntrypoint = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isEntrypoint) {
  const connectionString = readConnectionString(process.env.CONEXUS_MIGRATION_DATABASE_URL_FILE)
  const result = process.argv.includes('--adopt-baseline')
    ? await adoptHubBaseline({ connectionString })
    : await runHubMigrations({ connectionString })
  process.stdout.write(`${JSON.stringify(result)}\n`)
}
