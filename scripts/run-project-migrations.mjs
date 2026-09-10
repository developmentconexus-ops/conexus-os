import { createHash } from 'node:crypto'
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const repositoryRoot = resolve(import.meta.dirname, '..')
export const defaultProjectMigrationsRoot = resolve(repositoryRoot, 'apps/hub/project-migrations')
const migrationPattern = /^(\d{3})_[a-z0-9_]+\.sql$/
const advisoryLock = -781_236_451_234_567_890n
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const fail = (code, detail = '') => { throw new Error(`${code}${detail ? `:${detail}` : ''}`) }

const migrationBody = ({ name, bytes }) => {
  const source = bytes.toString('utf8')
  if (!/^BEGIN;\r?\n[\s\S]*\r?\nCOMMIT;\r?\n?$/.test(source)) fail('PROJECT_MIGRATION_ENVELOPE_REFUSED', name)
  return source.replace(/^BEGIN;\r?\n/, '').replace(/\r?\nCOMMIT;\r?\n?$/, '')
}

export const loadProjectMigrationFiles = (migrationsRoot = defaultProjectMigrationsRoot) => {
  if (!existsSync(migrationsRoot) || !lstatSync(migrationsRoot).isDirectory() || lstatSync(migrationsRoot).isSymbolicLink()) {
    fail('PROJECT_MIGRATION_ROOT_REFUSED')
  }
  const files = readdirSync(migrationsRoot).filter((name) => name.endsWith('.sql')).sort()
  const migrations = files.map((name) => {
    const match = migrationPattern.exec(name)
    if (!match) fail('PROJECT_MIGRATION_NAME_REFUSED', name)
    const path = resolve(migrationsRoot, name)
    if (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) fail('PROJECT_MIGRATION_ENTRY_REFUSED', name)
    const bytes = readFileSync(path)
    migrationBody({ name, bytes })
    return { version: match[1], name, path, bytes, checksum: sha256(bytes) }
  })
  if (migrations.length === 0) fail('PROJECT_MIGRATION_CENSUS_REFUSED')
  if (new Set(migrations.map(({ version }) => version)).size !== migrations.length) fail('PROJECT_MIGRATION_CENSUS_REFUSED')
  if (migrations.map(({ version }) => version).join(',') !== migrations.map(({ version }) => version).sort().join(',')) {
    fail('PROJECT_MIGRATION_ORDER_REFUSED')
  }
  return migrations
}

const tableExists = async (client, qualifiedName) => {
  const result = await client.query('SELECT to_regclass($1) IS NOT NULL AS present', [qualifiedName])
  return result.rows[0]?.present === true
}

const verifyProjectLedger = async (client, migrations, expectedSourceRevision) => {
  if (!await tableExists(client, 'project_meta.schema_migration')) return { applied: new Map(), maximum: null }
  const rows = (await client.query(`
    SELECT version, checksum_sha256, project_source_revision
    FROM project_meta.schema_migration
    ORDER BY version
  `)).rows
  const files = new Map(migrations.map((migration) => [migration.version, migration]))
  for (const row of rows) {
    const migration = files.get(row.version)
    if (!migration) fail('PROJECT_MIGRATION_UNKNOWN_APPLIED', row.version)
    if (migration.checksum !== row.checksum_sha256) fail('PROJECT_MIGRATION_APPLIED_DIGEST_DRIFT', row.version)
    if (typeof row.project_source_revision !== 'string' || !/\S/.test(row.project_source_revision)) {
      fail('PROJECT_MIGRATION_SOURCE_REVISION_MISSING', row.version)
    }
    if (expectedSourceRevision !== undefined && row.project_source_revision !== expectedSourceRevision) {
      fail('PROJECT_MIGRATION_SOURCE_REVISION_MISMATCH', row.version)
    }
  }
  return {
    applied: new Map(rows.map((row) => [row.version, row])),
    maximum: rows.at(-1)?.version ?? null,
  }
}

const requireSourceRevision = (projectSourceRevision) => {
  if (typeof projectSourceRevision !== 'string' || !/\S/.test(projectSourceRevision)) {
    fail('PROJECT_MIGRATION_SOURCE_REVISION_REFUSED')
  }
  return projectSourceRevision.trim()
}

export const runProjectMigrations = async ({
  connectionString,
  projectSourceRevision,
  migrationsRoot = defaultProjectMigrationsRoot,
}) => {
  const sourceRevision = requireSourceRevision(projectSourceRevision)
  if (typeof connectionString !== 'string' || !/\S/.test(connectionString)) fail('PROJECT_MIGRATION_DATABASE_URL_REFUSED')
  const migrations = loadProjectMigrationFiles(migrationsRoot)
  const client = new pg.Client({ connectionString })
  await client.connect()
  const appliedNow = []
  try {
    for (const migration of migrations) {
      await client.query('BEGIN')
      try {
        await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [advisoryLock.toString()])
        const ledger = await verifyProjectLedger(client, migrations, sourceRevision)
        if (ledger.applied.has(migration.version)) {
          await client.query('COMMIT')
          continue
        }
        if (ledger.maximum !== null && migration.version < ledger.maximum) fail('PROJECT_MIGRATION_BACK_INSERT_REFUSED', migration.version)
        await client.query(migrationBody(migration))
        await client.query(`
          INSERT INTO project_meta.schema_migration(version, checksum_sha256, project_source_revision)
          VALUES ($1, $2, $3)
        `, [migration.version, migration.checksum, sourceRevision])
        await client.query('COMMIT')
        appliedNow.push(migration.version)
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      }
    }
    await client.query('BEGIN')
    try {
      await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [advisoryLock.toString()])
      const ledger = await verifyProjectLedger(client, migrations, sourceRevision)
      const identity = (await client.query(`
        SELECT current_database() AS database_name,
          current_user AS migration_role,
          current_setting('server_version_num') AS server_version_num
      `)).rows[0]
      await client.query('COMMIT')
      return {
        verdict: 'PASS',
        appliedNow,
        versions: [...ledger.applied.keys()],
        isolationProof: {
          databaseName: identity.database_name,
          migrationRole: identity.migration_role,
          serverVersionNum: identity.server_version_num,
          ledger: 'project_meta.schema_migration',
        },
      }
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    }
  } finally {
    await client.end()
  }
}

const readConnectionString = (path) => {
  if (!path || !existsSync(path) || !lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) fail('PROJECT_MIGRATION_DATABASE_URL_FILE_REFUSED')
  const value = readFileSync(path, 'utf8').trim()
  if (!value) fail('PROJECT_MIGRATION_DATABASE_URL_EMPTY')
  return value
}

const isEntrypoint = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isEntrypoint) {
  const connectionString = readConnectionString(process.env.CONEXUS_PROJECT_MIGRATION_DATABASE_URL_FILE)
  const projectSourceRevision = process.env.CONEXUS_PROJECT_SOURCE_REVISION
  process.stdout.write(`${JSON.stringify(await runProjectMigrations({ connectionString, projectSourceRevision }))}\n`)
}
