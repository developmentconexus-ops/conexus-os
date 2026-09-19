import { createHash } from 'node:crypto'
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { assertCatalogAt, assertRoleInvariants, readCommittedSnapshot } from './hub-catalog.mjs'

const repositoryRoot = resolve(import.meta.dirname, '..')
const defaultMigrationsRoot = resolve(repositoryRoot, 'apps/hub/migrations')
const migrationPattern = /^(\d{3})_[a-z0-9_]+\.sql$/
const r1MigrationNames = [
  '001_iam_foundation.sql',
  '002_workspace_foundation.sql',
  '003_project_foundation.sql',
  '004_project_source_recovery.sql',
  '005_project_source_recovery_scan.sql',
  '006_project_create_authorization.sql',
  '007_project_read_disclosure.sql',
  '008_project_baseline_custody.sql',
  '009_project_inception.sql',
  '010_project_inception_refinement.sql',
]
const r2MigrationNames = ['011_r2_brain_connections.sql', '012_r2_project_binding_recovery.sql', '013_r2_binding_source_concordance.sql', '014_r2_brain_binding_settlement.sql', '015_r2_project_brain_read_envelopes.sql', '016_r2_brain_binding_removal.sql', '017_r2_key_conformance_subject.sql', '018_r2_brain_revision_selection.sql']
const currentMigrationNames = [...r1MigrationNames, ...r2MigrationNames, '019_rb_builder_first_vertical.sql', '020_rb_builder_verification_acceptance.sql', '021_rb_builder_bounded_correction.sql', '022_builder_source_inspection.sql', '023_rb_builder_preview_subject.sql', '026_builder_application_registry.sql', '027_rb_builder_working_source.sql', '028_builder_run.sql', '029_builder_run_execution.sql', '030_builder_run_invariants.sql', '031_builder_run_application_build.sql', '032_builder_project_build_grant.sql', '033_builder_execution_artifact_admission.sql', '034_builder_project_source_preview.sql', '035_builder_c020_state_invariants.sql', '036_builder_project_creation_bootstrap.sql', '037_builder_c020_source_inspection.sql', '038_builder_c020_legacy_excision.sql', '039_builder_c020_execution_invariants.sql', '040_builder_registry_settlement_boundary.sql', '041_builder_claude_connections.sql']
currentMigrationNames[currentMigrationNames.indexOf('022_builder_source_inspection.sql')] = '022_rb_builder_source_inspection.sql'
currentMigrationNames[currentMigrationNames.indexOf('027_builder_working_source.sql')] = '027_rb_builder_working_source.sql'
currentMigrationNames.push('042_builder_claude_connection_safety.sql', '043_builder_model_admission.sql', '044_builder_run_cancellation.sql', '045_builder_run_history.sql', '046_builder_run_admission_cas.sql', '047_reconcile_040_settlement_boundary.sql', '048_builder_claude_connection_label.sql', '049_project_creator_builder_grant.sql', '050_builder_run_phase.sql', '051_builder_orphan_function_excision.sql')
const expectedMigrationNames = [...currentMigrationNames]
const migration001Digest = 'd27e76b972145bc3a6bf669d4fd32734fc06153d07cddaf1072c6b29845b112f'
const migration002Digest = 'b64a8e041a8e63ac3b85559805ac5573a1d53f6d5d95ba1421ffe3f9803804b5'
const migration003Digest = '866c6da3d1a4171437b2c0a5beb72ff4994cfce499826cd8b397c2daa60037f2'
const migration004Digest = 'c7477d9ac1786ebe330221641a916df102b8af553d18fb8b3c302b519b13f313'
const migration005Digest = '8eac8987356002c4a22ee96d169c5a33622d0116d7b5b8190af5f412f6db2bd5'
const migration006Digest = 'e8db0346c822bc38543d3e18d71862c4be186165709fc032ed1b110260ef32d4'
const migration007Digest = 'd68caa47710295c28bcdf82ca102d8318779ae0033a9c62debd7f22d72a68975'
const migration008Digest = '066ce45f5df4be134792c575e9339729a5532efa540cd4bf8fa6e776c651add0'
const migration009Digest = '86f5d88587d90fc26387a8b36002e0797bf340cea7d45ac3d910210ae615538a'
const migration010Digest = '31755edeac0509d32620d4307ea8227f58d59e5b2fcd1b89b6b0884cee450ba2'
const migration011Digest = 'e9b3cbfe9be43536f7a4d130f0650799e13c2c65fe36d6cd1dc8bdd65c8d917f'
const migration012Digest = 'c34a67137d88d49deb2bfba6de317d243fbebad0fb501e40dd53dce354b3adcf'
const migration013Digest = 'cd3a7f19963aef2a4e0da2fbf13b1b09d3d24f512f69c0f2cb1f9fe381bd8c98'
const migration014Digest = '519680aac42b07877493f67e554b88b4fe553f0da9d6889d6ffb7ef60d011f63'
const migration015Digest = 'ad10379d135d8bdd238fe114f6fcb7c26fb51adc4c5d5b186a8791c8f0b4526c'
const migration016Digest = '75c7f915ca25f9ebdf29f2e047b68903f25232a92dc38b434717f2df8c11903b'
const migration017Digest = '6627c95995e642579257b80450c4c0d342a5deaa9a73f3fe57ff097d666ca61d'
const migration018Digest = '85db476ba4b6acbaa65cf1e538ef760c2812613ae171c0cf13d21394c9d3453c'
const migration019Digest = '819fe3ae150517a03a2e7e036f18a73b6cbec745b653c1f0ab3dc82565470353'
const migration020Digest = '8ed9da5891cef908388d734e16c4de4708bdf88fd9aeb4d2ca14fbc4f893da7f'
const migration021Digest = '81de472647e7ee4fc0555fd9a58cd362c95450b300b3bb4b876899214ac2cb38'
const migration022Digest = '34a1a21d6545b43832894efbbb7a5f27e9f0456a6e05f5ced3554ff273238787'
const migration023Digest = '849357f4daf7254ca7c7a2d487989cde75b45a130eb75ab72b84fbd37eabaf4f'
const migration026Digest = 'a5b051a57a40d7640bce15d248012a772d1b4129eb4f6a75475d23792449f006'
const migration027Digest = '747ed9fc7e3b66a26e4713f5bb3787208c9aca1fb9bd6ebbbd4d153c2f2c0f83'
const migration028Digest = '13660b97c452be1a00068ea32d760eef1db5b16ca1eb202b97f835660af6126d'
const migration029Digest = '62ed4cbb0e39df19d53f6d16fe5c4b285821c2e435940b859a1dbf0aa8ab9306'
const migration030Digest = 'c648ecddc66e9f9321c3ff73666d1e39339980ab522b70e869acbb505303612c'
const migration031Digest = 'ab7928d23051ecbe238eeab31be3804c4d27eabc22a17422bb25547f51964d9e'
const migration032Digest = '9172fea2b8bc61ff6c3f2378cf666399b5c847319fa22391c19f5704b41115a8'
const migration033Digest = '4f0f83b3c0df6b510c031f2ea1b65548cad4819e6d96f19402742b579094fb35'
const migration034Digest = '24b2657102da0cd492480e650ca42d07ee66f16e1daf3339877fd2795a691ecb'
const migration035Digest = 'e3000ac16799dede8a585a495e7c8e6a418889bfc23816715604b79afabb02dd'
const migration036Digest = 'f0fe953e4f202ee8d7c266621a5cfb8c863097b022c7dd9f9e0485bab618d8d2'
const migration037Digest = '356d01a90237c24464b9e05b5fdc65c716ddb24130187c4cc88e03673c6d3190'
const migration038Digest = '30d5e9af141a6278c0cbe82a329ef906c7cd2c0efcd6a178f341393e954660a9'
const migration039Digest = '712955ef10bd196204067835179816a5873b0898786fce89df56f0fa7eb4580a'
const migration040Digest = '0b9a404adef843024ab086bdab54409bf5f84618265926744cae75fcaa2be847'
const migration041Digest = 'b7ec89cffdd0c856302a0a6cdc330b410d0f6ae9b31b79f1a54bd187f164093b'
const migration042Digest = '924e3c5f002937177b88d0df03b441d6887d75d6eb94934d7ac804afc2b62802'
const migration043Digest = 'c95a357dedb0c5ebba58774bf6b707430317c85bb1fa94a5cf55f90d906f35f4'
const migration044Digest = '0b3ba4b45551b2585000e6b58ec98dd89f1765ef423a91eecc9e7b731955e5ee'
const migration045Digest = 'd652e72dc53e8a5fbece219235002fcb9db7f518112230321e5e37eee5a73eef'
const migration046Digest = 'd427f4e176dc3671c58a06bda11119b20a05af5e3eda71b9575f23dccee2e2f3'
const migration047Digest = '9356eb5bd548db0541b76523a5947677a140a1c8669ae20130709232ea105ccc'
const migration048Digest = 'fbf8e55d82edf548b7a78879bff05994ee92ee36e20555c91f4adc0c97571675'
const migration049Digest = '92ebd66206a7cbdcf9de898ba1b900bef0452047c34aec1e0a87976e01abe0dd'
const migration050Digest = '7fd9ced94dcf8f897b6a6ce0f0ab28d27696023f83dfaf99b219848484eaf520'
const migration051Digest = 'f3d5f9d547d945525228212de586d719d78586f758f50ac5af033e3f947e33dc'
const legacyMigrationDigests = new Map([
  ['040', '359d1d386b01f40a5b842f56363e82176db56b9b731736f01080597ca762f7f5'],
  ['047', '74703fb0042a0617f81dd68ae0b2553401050262aa4ad385ea758cec97ba70c3'],
])
const advisoryLock = 4_349_395_539_450_322_946n
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const fail = (code, detail = '') => { throw new Error(`${code}${detail ? `:${detail}` : ''}`) }
const migrationDigests = new Map([
  ['001_iam_foundation.sql', migration001Digest],
  ['002_workspace_foundation.sql', migration002Digest],
  ['003_project_foundation.sql', migration003Digest],
  ['004_project_source_recovery.sql', migration004Digest],
  ['005_project_source_recovery_scan.sql', migration005Digest],
  ['006_project_create_authorization.sql', migration006Digest],
  ['007_project_read_disclosure.sql', migration007Digest],
  ['008_project_baseline_custody.sql', migration008Digest],
  ['009_project_inception.sql', migration009Digest],
  ['010_project_inception_refinement.sql', migration010Digest],
  ['011_r2_brain_connections.sql', migration011Digest],
  ['012_r2_project_binding_recovery.sql', migration012Digest],
  ['013_r2_binding_source_concordance.sql', migration013Digest],
  ['014_r2_brain_binding_settlement.sql', migration014Digest],
  ['015_r2_project_brain_read_envelopes.sql', migration015Digest],
  ['016_r2_brain_binding_removal.sql', migration016Digest],
  ['017_r2_key_conformance_subject.sql', migration017Digest],
  ['018_r2_brain_revision_selection.sql', migration018Digest],
  ['019_rb_builder_first_vertical.sql', migration019Digest],
  ['020_rb_builder_verification_acceptance.sql', migration020Digest],
  ['021_rb_builder_bounded_correction.sql', migration021Digest],
  ['022_rb_builder_source_inspection.sql', migration022Digest],
  ['023_rb_builder_preview_subject.sql', migration023Digest],
  ['026_builder_application_registry.sql', migration026Digest],
  ['027_rb_builder_working_source.sql', migration027Digest],
  ['028_builder_run.sql', migration028Digest],
  ['029_builder_run_execution.sql', migration029Digest],
  ['030_builder_run_invariants.sql', migration030Digest],
  ['031_builder_run_application_build.sql', migration031Digest],
  ['032_builder_project_build_grant.sql', migration032Digest],
  ['033_builder_execution_artifact_admission.sql', migration033Digest],
  ['034_builder_project_source_preview.sql', migration034Digest],
  ['035_builder_c020_state_invariants.sql', migration035Digest],
  ['036_builder_project_creation_bootstrap.sql', migration036Digest],
  ['037_builder_c020_source_inspection.sql', migration037Digest],
  ['038_builder_c020_legacy_excision.sql', migration038Digest],
  ['039_builder_c020_execution_invariants.sql', migration039Digest],
  ['040_builder_registry_settlement_boundary.sql', migration040Digest],
  ['041_builder_claude_connections.sql', migration041Digest],
  ['042_builder_claude_connection_safety.sql', migration042Digest],
  ['043_builder_model_admission.sql', migration043Digest],
  ['044_builder_run_cancellation.sql', migration044Digest],
  ['045_builder_run_history.sql', migration045Digest],
  ['046_builder_run_admission_cas.sql', migration046Digest],
  ['047_reconcile_040_settlement_boundary.sql', migration047Digest],
  ['048_builder_claude_connection_label.sql', migration048Digest],
  ['049_project_creator_builder_grant.sql', migration049Digest],
  ['050_builder_run_phase.sql', migration050Digest],
  ['051_builder_orphan_function_excision.sql', migration051Digest],
])
const recognizedMigrationNames = new Set(expectedMigrationNames)

const loadSelectedMigrationFiles = (selectedNames, migrationsRoot = defaultMigrationsRoot) => {
  const files = readdirSync(migrationsRoot).filter((name) => name.endsWith('.sql')).sort()
  if (files.some((name) => !recognizedMigrationNames.has(name))) fail('MIGRATION_CENSUS_REFUSED')
  const presentNames = new Set(files)
  if (selectedNames.some((name) => !presentNames.has(name))) fail('MIGRATION_CENSUS_REFUSED')
  return selectedNames.map((name) => {
    const match = migrationPattern.exec(name)
    if (!match) fail('MIGRATION_NAME_REFUSED', name)
    const path = resolve(migrationsRoot, name)
    const entry = lstatSync(path)
    if (!entry.isFile() || entry.isSymbolicLink()) fail('MIGRATION_ENTRY_REFUSED', name)
    const bytes = readFileSync(path)
    const checksum = sha256(bytes)
    if (checksum !== migrationDigests.get(name)) fail(`MIGRATION_${match[1]}_DIGEST_REFUSED`)
    return { version: match[1], name, path, bytes, checksum }
  })
}

export const loadMigrationFiles = (migrationsRoot = defaultMigrationsRoot) =>
  loadSelectedMigrationFiles(r1MigrationNames, migrationsRoot)

export const loadR2MigrationFiles = (migrationsRoot = defaultMigrationsRoot) =>
  loadSelectedMigrationFiles([...r1MigrationNames, ...r2MigrationNames], migrationsRoot)

export const loadCurrentHubMigrationFiles = (migrationsRoot = defaultMigrationsRoot) =>
  loadSelectedMigrationFiles(currentMigrationNames, migrationsRoot)

const migrationBody = ({ name, bytes }) => {
  const source = bytes.toString('utf8')
  const match = /^BEGIN;\r?\n([\s\S]*)\r?\nCOMMIT;\r?\n?$/.exec(source)
  if (!match) fail('MIGRATION_TRANSACTION_ENVELOPE_REFUSED', name)
  return match[1]
}

const tableExists = async (client, qualified) => (await client.query('SELECT to_regclass($1) IS NOT NULL AS present', [qualified])).rows[0].present
const schemaExists = async (client, schema) => (await client.query('SELECT to_regnamespace($1) IS NOT NULL AS present', [schema])).rows[0].present

// The ledger proves which versions ran and that their bytes did not change. The catalog snapshot
// proves the database is the one a clean replay of exactly those versions produces, which is
// what the per-version assertion functions used to prove by hand.
const verifyLedger = async (client, migrations, catalogSnapshot) => {
  if (!await tableExists(client, 'iam.schema_migration')) return { applied: new Map(), maximum: null }
  const rows = (await client.query('SELECT version, checksum_sha256 FROM iam.schema_migration ORDER BY version')).rows
  const files = new Map(migrations.map((migration) => [migration.version, migration]))
  for (const row of rows) {
    const migration = files.get(row.version)
    if (!migration) fail('MIGRATION_UNKNOWN_APPLIED', row.version)
    if (migration.checksum !== row.checksum_sha256 && legacyMigrationDigests.get(row.version) !== row.checksum_sha256) fail('MIGRATION_APPLIED_DIGEST_DRIFT', row.version)
  }
  const applied = new Map(rows.map((row) => [row.version, row.checksum_sha256]))
  const maximum = rows.at(-1)?.version ?? null
  if (maximum !== null && catalogSnapshot) {
    await assertCatalogAt(client, catalogSnapshot, maximum)
    await assertRoleInvariants(client)
  }
  return { applied, maximum }
}

const runMigrations = async ({ connectionString, migrations, recognizedMigrations = migrations, catalogSnapshot = readCommittedSnapshot() }) => {
  const client = new pg.Client({ connectionString })
  await client.connect()
  const appliedNow = []
  try {
    for (const migration of migrations) {
      await client.query('BEGIN')
      try {
        await client.query('SELECT pg_advisory_xact_lock($1)', [advisoryLock.toString()])
        const ledger = await verifyLedger(client, recognizedMigrations, catalogSnapshot)
        if (ledger.applied.has(migration.version)) {
          await client.query('COMMIT')
          continue
        }
        if (ledger.maximum !== null && migration.version < ledger.maximum) fail('MIGRATION_BACK_INSERT_REFUSED', migration.version)

        if (migration.version === '001' && await tableExists(client, 'iam.schema_migration')) {
          if (migration.checksum !== migration001Digest) fail('MIGRATION_001_DIGEST_REFUSED')
          if (catalogSnapshot) await assertCatalogAt(client, catalogSnapshot, '001')
          await client.query('INSERT INTO iam.schema_migration(version, checksum_sha256) VALUES ($1, $2)', [migration.version, migration.checksum])
        } else {
          if (migration.version === '001' && await schemaExists(client, 'iam')) fail('MIGRATION_DIRTY_BASELINE_REFUSED')
          await client.query(migrationBody(migration))
          await client.query('INSERT INTO iam.schema_migration(version, checksum_sha256) VALUES ($1, $2)', [migration.version, migration.checksum])
        }
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
      const ledger = await verifyLedger(client, recognizedMigrations, catalogSnapshot)
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

export const runHubMigrations = ({ connectionString, migrationsRoot = defaultMigrationsRoot }) =>
  runMigrations({
    connectionString,
    migrations: loadMigrationFiles(migrationsRoot),
    recognizedMigrations: loadR2MigrationFiles(migrationsRoot),
  })

export const runR2HubMigrations = ({ connectionString, migrationsRoot = defaultMigrationsRoot }) =>
  runMigrations({ connectionString, migrations: loadR2MigrationFiles(migrationsRoot) })

export const runCurrentHubMigrations = ({ connectionString, migrationsRoot = defaultMigrationsRoot }) =>
  runMigrations({ connectionString, migrations: loadCurrentHubMigrationFiles(migrationsRoot) })

// The snapshot generator replays one version at a time with the catalog check off, because it is
// producing the snapshot that check compares against.
export const runSelectedHubMigrations = ({ connectionString, migrations, recognizedMigrations = migrations, catalogSnapshot }) =>
  runMigrations({ connectionString, migrations, recognizedMigrations, ...(catalogSnapshot === undefined ? {} : { catalogSnapshot }) })

const readConnectionString = (path) => {
  if (!path || !existsSync(path) || !lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) fail('MIGRATION_DATABASE_URL_FILE_REFUSED')
  const value = readFileSync(path, 'utf8').trim()
  if (!value) fail('MIGRATION_DATABASE_URL_EMPTY')
  return value
}

const isEntrypoint = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isEntrypoint) {
  const connectionString = readConnectionString(process.env.CONEXUS_MIGRATION_DATABASE_URL_FILE)
  process.stdout.write(`${JSON.stringify(await runCurrentHubMigrations({ connectionString }))}\n`)
}
