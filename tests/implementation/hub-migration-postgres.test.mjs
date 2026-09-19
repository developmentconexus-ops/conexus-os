import assert from 'node:assert/strict'
import { test } from 'node:test'
import { catalogDigest, readCommittedSnapshot } from '../../scripts/hub-catalog.mjs'
import { baselineDigest, baselineVersion, runHubMigrations } from '../../scripts/run-hub-migrations.mjs'
import { buildHubDatabase, createEmptyDatabase, query } from './hub-database.mjs'

const ledgerOf = async (connectionString) =>
  (await query(connectionString, 'SELECT version, checksum_sha256 FROM iam.schema_migration ORDER BY version')).rows

test('a fresh database is built by the one baseline and records it', async (t) => {
  const { connectionString } = await createEmptyDatabase(t, 'conexus_mig')
  const installed = await runHubMigrations({ connectionString })
  assert.deepEqual(installed, { verdict: 'PASS', appliedNow: [baselineVersion], versions: [baselineVersion] })
  assert.deepEqual(await ledgerOf(connectionString), [{ version: baselineVersion, checksum_sha256: baselineDigest }])
})

test('running again applies nothing and still passes', async (t) => {
  const { connectionString } = await buildHubDatabase(t, 'conexus_mig')
  const restarted = await runHubMigrations({ connectionString })
  assert.deepEqual(restarted, { verdict: 'PASS', appliedNow: [], versions: [baselineVersion] })
  assert.deepEqual(await ledgerOf(connectionString), [{ version: baselineVersion, checksum_sha256: baselineDigest }])
})

// The advisory lock is what stops two Hub processes starting at once from both applying the
// baseline; one of them waits and then finds the ledger already holds it.
test('two runs at once leave one ledger row', async (t) => {
  const { connectionString } = await createEmptyDatabase(t, 'conexus_mig')
  const results = await Promise.all([runHubMigrations({ connectionString }), runHubMigrations({ connectionString })])
  assert.deepEqual(results.map(({ verdict }) => verdict), ['PASS', 'PASS'])
  assert.deepEqual(results.flatMap(({ appliedNow }) => appliedNow), [baselineVersion])
  assert.deepEqual(await ledgerOf(connectionString), [{ version: baselineVersion, checksum_sha256: baselineDigest }])
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

test('the committed snapshot is the catalog the baseline builds', async (t) => {
  const { connectionString } = await buildHubDatabase(t, 'conexus_mig')
  const snapshot = readCommittedSnapshot()
  assert.equal(snapshot.head, baselineVersion)
  assert.equal(snapshot.format, 2)
  assert.equal(catalogDigest(snapshot.catalog), '6a4b20eca279e291dd5d7e01796552a10317d3b6a2f1acf21096590f70f347fc')
  assert.equal((await ledgerOf(connectionString)).length, 1)
})
