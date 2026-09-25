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
const mergedSandboxTemplateDigest = '4a3f1e7dbc2b8c8e6d2df71fd506f19991ee72cec67133446c530501f16fd595'
const bootSmokeTemplateDigest = '4e29eb4b9372180428d9e02c3f85b3ab08fa4b1faa6959b1b2125930297350c4'
const builderRunConversationDigest = '071d758f040764d99122e7ff013b0075fe0e497adc423176871887705fa0c2c8'
const removeModelConnectionsDigest = 'eb802f15571f536b60c1218426a983c38365d5c07bb519fce50c484e1b613d08'
const dropModelConnectionRolesDigest = '435eac1ee965f3e11a6e0d69869be1c57a781ed72ff17e7f8a975fd41c13a534'
const factoryBindingDigest = 'd70c3ead2d7d9634927e6cd7d22ee65f8228524b477524a0cde3a212cfcd8191'
const factorySourceHeadDigest = 'c0902c5e58c9b1a41c28cc1e5286409d7ecd78d7466a4aec983a33d50ddc6d96'
const factoryBindingRepositoryDigest = 'f7a7fb9a43ef315d12e41374983e451348d8fb13fca747591191740acc66cf16'
const agentUserTemplateDigest = 'f306150fc474049aeae2c1a5c2d78f53ea07ab5185f9bb14506b7e72b03789e7'
const factoryAdmissionCandidateDigest = 'caff6732157047bb45c2dd0898b272eecd5f0babb0d3c7a5520b4bc3c4707c56'
const factoryCandidatePendingDigest = 'ebd57cef7033753bf3bf01664279b6e445da29bce12f9c7c1107175ed7173829'
const installationAdministratorDigest = '8f089db3a396dedb23f15fd9b4336dfd7360c336f27b9ecf9ae87e25f1005491'
const projectFactoryCreationDigest = 'c93bcaf16b850a41780446af60ef84277b41d42a90a020072470a247953938dc'
const projectSummariesWithActivityDigest = '3e94164b4bae49923a2b19f7eb109250dc057d3d689f91ce32ba893eddf20c85'
const installationAdministratorListDigest = '70071c23e385ecd843db32d57446f94c9e3c7983ea98fe8c32054f8dbb8f2ec6'
const firstAccountInstallationAdministratorDigest = '0671c33652ea96da8cfad3437f79c9d4124ba84af7f1f9e0cae2ca6f356b519b'
const applicationAccessDigest = 'aab11d37b619ce81df07c292336b7bcff31b9b260245343c9460012d3694bea4'
const applicationSessionDigest = 'e3efcd8b1a7ad067d336f7466011870792521f57c1464b0c5ed5db3172914e40'
const applicationAccessReviewDigest = 'c8d5f024ce4e83f66cfe6c6f304060d45ef7fd68b9a6d05101b03e1e4868a8e8'
const applicationAccessVerificationDigest = '5c31112ec06e7d69bd43ad40b4a4cdb77405ec92dd7bff3060def078672d7f62'
const singleSessionDigest = '8b68fd77bdf58eb1ea8dc728d2315e1f32f42ba361e67744cf72c68aeee58f24'

const migrationDigests = new Map([
  [baselineName, baselineDigest],
  ['0002_prune_dead_iam_actions.sql', pruneDeadIamActionsDigest],
  ['0003_list_connections_selected.sql', listConnectionsSelectedDigest],
  ['0004_list_connections_shared.sql', listConnectionsSharedDigest],
  ['0005_builder_run_request_text.sql', builderRunRequestTextDigest],
  ['0006_merged_sandbox_template.sql', mergedSandboxTemplateDigest],
  ['0007_boot_smoke_template.sql', bootSmokeTemplateDigest],
  ['0008_builder_run_conversation.sql', builderRunConversationDigest],
  ['0009_remove_model_connections.sql', removeModelConnectionsDigest],
  ['0010_drop_model_connection_roles.sql', dropModelConnectionRolesDigest],
  ['0011_factory_binding.sql', factoryBindingDigest],
  ['0012_factory_source_head.sql', factorySourceHeadDigest],
  ['0013_factory_binding_repository.sql', factoryBindingRepositoryDigest],
  ['0014_agent_user_template.sql', agentUserTemplateDigest],
  ['0015_factory_admission_candidate.sql', factoryAdmissionCandidateDigest],
  ['0016_factory_candidate_pending.sql', factoryCandidatePendingDigest],
  ['0017_installation_administrator.sql', installationAdministratorDigest],
  ['0018_project_factory_creation.sql', projectFactoryCreationDigest],
  ['0019_project_summaries_with_activity.sql', projectSummariesWithActivityDigest],
  ['0020_installation_administrator_list.sql', installationAdministratorListDigest],
  ['0021_first_account_installation_administrator.sql', firstAccountInstallationAdministratorDigest],
  ['0022_application_access.sql', applicationAccessDigest],
  ['0023_application_session.sql', applicationSessionDigest],
  ['0024_application_access_review.sql', applicationAccessReviewDigest],
  ['0025_application_access_verification.sql', applicationAccessVerificationDigest],
  ['0026_single_session.sql', singleSessionDigest],
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
