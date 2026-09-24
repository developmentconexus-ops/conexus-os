import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { catalogDigest, readCatalog, readCommittedSnapshot } from '../../scripts/hub-catalog.mjs'
import { loadHubMigrationFiles, runHubMigrations, runMigrations } from '../../scripts/run-hub-migrations.mjs'
import { buildHubDatabase, createEmptyDatabase, query, withClient } from './hub-database.mjs'

const ledgerOf = async (connectionString) =>
  (await query(connectionString, 'SELECT version, checksum_sha256 FROM iam.schema_migration ORDER BY version')).rows

// Derived from the runner's own corpus rather than named here, so adding a migration does not
// mean editing this file to say the same thing twice.
const corpus = loadHubMigrationFiles()
const corpusVersions = corpus.map(({ version }) => version)
const corpusLedger = corpus.map(({ version, checksum }) => ({ version, checksum_sha256: checksum }))

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

// Two synthetic migrations, independent of the real catalog, that exercise the exact shape of the
// runner's post-baseline bug: a snapshot describing the state after both, and a fresh database
// that starts with neither applied.
const migrationA = (() => {
  const bytes = Buffer.from(
    'BEGIN;\nCREATE SCHEMA iam;\nCREATE TABLE iam.schema_migration (version text PRIMARY KEY, checksum_sha256 text NOT NULL);\nCREATE TABLE iam.widget (id int PRIMARY KEY);\nCOMMIT;\n',
  )
  return { version: '0001', name: '0001_a.sql', bytes, checksum: sha256(bytes) }
})()
const migrationB = (() => {
  const bytes = Buffer.from('BEGIN;\nCREATE TABLE iam.gadget (id int PRIMARY KEY);\nCOMMIT;\n')
  return { version: '0002', name: '0002_b.sql', bytes, checksum: sha256(bytes) }
})()
const twoMigrations = [migrationA, migrationB]

// Builds the snapshot the fixed runner must reproduce, by applying both migrations with no
// catalog assertion at all (the same trick scripts/generate-hub-catalog-snapshot.mjs uses).
const snapshotAfterBoth = async (t) => {
  const { connectionString } = await createEmptyDatabase(t, 'conexus_mig_snap')
  await runMigrations({ connectionString, migrations: twoMigrations, catalogSnapshot: null })
  return { catalog: await withClient(connectionString, readCatalog) }
}

test('a fresh install with two pending migrations applies both instead of refusing the second', async (t) => {
  const catalogSnapshot = await snapshotAfterBoth(t)
  const { connectionString } = await createEmptyDatabase(t, 'conexus_mig_two')
  const result = await runMigrations({ connectionString, migrations: twoMigrations, catalogSnapshot })
  assert.deepEqual(result, { verdict: 'PASS', appliedNow: ['0001', '0002'], versions: ['0001', '0002'] })
})

test('a database already at the first migration upgrades to the second', async (t) => {
  const catalogSnapshot = await snapshotAfterBoth(t)
  const { connectionString } = await createEmptyDatabase(t, 'conexus_mig_upgrade')
  await runMigrations({ connectionString, migrations: [migrationA], catalogSnapshot: null })
  const result = await runMigrations({ connectionString, migrations: twoMigrations, catalogSnapshot })
  assert.deepEqual(result, { verdict: 'PASS', appliedNow: ['0002'], versions: ['0001', '0002'] })
})

test('a fresh database is built by the baseline and the forward migration, and reports both', async (t) => {
  const { connectionString } = await createEmptyDatabase(t, 'conexus_mig')
  const installed = await runHubMigrations({ connectionString })
  assert.deepEqual(installed, { verdict: 'PASS', appliedNow: corpusVersions, versions: corpusVersions })
  assert.deepEqual(await ledgerOf(connectionString), corpusLedger)
})

test('running again applies nothing and still passes', async (t) => {
  const { connectionString } = await buildHubDatabase(t, 'conexus_mig')
  const restarted = await runHubMigrations({ connectionString })
  assert.deepEqual(restarted, { verdict: 'PASS', appliedNow: [], versions: corpusVersions })
  assert.deepEqual(await ledgerOf(connectionString), corpusLedger)
})

// The advisory lock is what stops two Hub processes starting at once from both applying the same
// pending migration; one of them waits and then finds the ledger already holds it.
test('two runs at once leave one ledger row per version', async (t) => {
  const { connectionString } = await createEmptyDatabase(t, 'conexus_mig')
  const results = await Promise.all([runHubMigrations({ connectionString }), runHubMigrations({ connectionString })])
  assert.deepEqual(results.map(({ verdict }) => verdict), ['PASS', 'PASS'])
  assert.deepEqual(results.flatMap(({ appliedNow }) => appliedNow).sort(), [...corpusVersions].sort())
  assert.deepEqual(await ledgerOf(connectionString), corpusLedger)
})

test('the baseline is refused over a schema that already exists without the ledger', async (t) => {
  const { connectionString } = await createEmptyDatabase(t, 'conexus_mig')
  await query(connectionString, 'CREATE SCHEMA iam')
  await assert.rejects(runHubMigrations({ connectionString }), /MIGRATION_DIRTY_BASELINE_REFUSED/)
})

test('an applied checksum that is not the file is refused', async (t) => {
  const { connectionString } = await buildHubDatabase(t, 'conexus_mig')
  await query(connectionString, 'UPDATE iam.schema_migration SET checksum_sha256 = $1', ['b'.repeat(64)])
  await assert.rejects(runHubMigrations({ connectionString }), /MIGRATION_APPLIED_DIGEST_DRIFT:0001/)
})

test('a ledger row with no file is refused', async (t) => {
  const { connectionString } = await buildHubDatabase(t, 'conexus_mig')
  await query(connectionString, 'INSERT INTO iam.schema_migration(version, checksum_sha256) VALUES ($1, $2)', ['9999', 'c'.repeat(64)])
  await assert.rejects(runHubMigrations({ connectionString }), /MIGRATION_UNKNOWN_APPLIED:9999/)
})

test('a catalog that drifted from the snapshot is refused by line', async (t) => {
  const { connectionString } = await buildHubDatabase(t, 'conexus_mig')
  await query(connectionString, 'ALTER TABLE iam.account ADD COLUMN unauthorized text')
  await assert.rejects(
    runHubMigrations({ connectionString }),
    /MIGRATION_CATALOG_DRIFT:1 differing lines; unexpected column iam\.account\.unauthorized text/,
  )
})

// @mastra/pg migrates the factory schema itself at runtime, so what it creates there is not the
// catalog the Hub's migrations describe. The schema itself, its owner and its grants still are.
test('objects hub_factory creates inside the factory schema are not catalog drift', async (t) => {
  const { connectionString } = await buildHubDatabase(t, 'conexus_mig')
  await query(connectionString, `
    SET ROLE hub_factory;
    CREATE TYPE factory.session_state AS ENUM ('open', 'closed');
    CREATE TABLE factory.factory_projects (id text PRIMARY KEY, state factory.session_state NOT NULL);
    CREATE INDEX factory_projects_state ON factory.factory_projects (state);
    CREATE FUNCTION factory.touch() RETURNS int LANGUAGE sql AS 'SELECT 1';
  `)
  const restarted = await runHubMigrations({ connectionString })
  assert.deepEqual(restarted, { verdict: 'PASS', appliedNow: [], versions: corpusVersions })
})

test('a grant on the factory schema to another Hub role is catalog drift', async (t) => {
  const { connectionString } = await buildHubDatabase(t, 'conexus_mig')
  await query(connectionString, 'GRANT USAGE ON SCHEMA factory TO hub_builder_ingress')
  await assert.rejects(
    runHubMigrations({ connectionString }),
    /MIGRATION_CATALOG_DRIFT:2 differing lines; missing schema factory owner=hub_factory acl=hub_factory:CREATE:false,hub_factory:USAGE:false \| unexpected schema factory owner=hub_factory acl=hub_builder_ingress:USAGE:false,hub_factory:CREATE:false,hub_factory:USAGE:false/,
  )
})

test('the committed snapshot is the catalog the baseline and forward migration build', async (t) => {
  const { connectionString } = await buildHubDatabase(t, 'conexus_mig')
  const snapshot = readCommittedSnapshot()
  assert.equal(snapshot.head, corpusVersions.at(-1))
  assert.equal(snapshot.format, 2)
  assert.equal(catalogDigest(snapshot.catalog), 'c04cac9e123142e5f75ad0e6fc9a06cbc7214bff1b996940df00e2821ab40f9c')
  assert.deepEqual(await ledgerOf(connectionString), corpusLedger)
})

test('after the forward migrations the action enum holds exactly the four live values, and role_allows is unchanged', async (t) => {
  const { connectionString } = await buildHubDatabase(t, 'conexus_mig')
  const labels = (await query(
    connectionString,
    "SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'action' ORDER BY e.enumsortorder",
  )).rows.map((row) => row.enumlabel)
  assert.deepEqual(labels, ['workspace.read', 'members.manage', 'project.create', 'project.build'])

  const allows = async (role, action) =>
    (await query(connectionString, 'SELECT iam.role_allows($1, $2) AS allowed', [role, action])).rows[0].allowed
  for (const action of labels) assert.equal(await allows('owner', action), true, action)
  assert.equal(await allows('member', 'members.manage'), false)
  for (const action of labels.filter((action) => action !== 'members.manage')) assert.equal(await allows('member', action), true, action)
})

test('after the forward migrations nothing of the model-connection subsystem is left in the database', async (t) => {
  const { connectionString } = await buildHubDatabase(t, 'conexus_mig')
  const present = (await query(connectionString, `
    SELECT to_regnamespace('model_connection') IS NOT NULL AS schema,
      to_regprocedure('iam.account_is_active(uuid)') IS NOT NULL AS account_is_active,
      EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        CROSS JOIN LATERAL aclexplode(p.proacl) AS entry
        WHERE n.nspname IN ('iam', 'workspace', 'project', 'builder', 'reg')
          AND pg_get_userbyid(entry.grantee) IN ('hub_model_connection', 'model_connection_owner')
      ) AS function_grant
  `)).rows[0]
  assert.deepEqual(present, { schema: false, account_is_active: false, function_grant: false })
})

test('a login role provisioned with CONNECT on its database is still revoked and dropped', async (t) => {
  // Provisioning grants a login role CONNECT on its own database, a cluster-level dependency that
  // 0009 alone never revoked, so the role outlived the subsystem on every install.
  const { connectionString } = await createEmptyDatabase(t, 'conexus_mig')
  const throughRemoval = corpus.filter(({ version }) => version <= '0009')
  await runMigrations({ connectionString, migrations: throughRemoval, catalogSnapshot: null })
  const database = (await query(connectionString, 'SELECT current_database() AS name')).rows[0].name
  await query(connectionString, "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hub_model_connection') THEN CREATE ROLE hub_model_connection LOGIN; END IF; END $$")
  await query(connectionString, `GRANT CONNECT ON DATABASE "${database}" TO hub_model_connection`)

  await runHubMigrations({ connectionString })

  const granted = (await query(connectionString, `
    SELECT EXISTS (
      SELECT 1 FROM pg_database d CROSS JOIN LATERAL aclexplode(d.datacl) AS entry
      WHERE d.datname = current_database()
        AND pg_get_userbyid(entry.grantee) IN ('hub_model_connection', 'model_connection_owner')
    ) AS granted
  `)).rows[0].granted
  assert.equal(granted, false)
})
