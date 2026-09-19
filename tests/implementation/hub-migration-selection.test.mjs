import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { baselineDigest, baselineName, loadHubMigrationFiles } from '../../scripts/run-hub-migrations.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const migrationsRoot = resolve(repositoryRoot, 'apps/hub/migrations')
const baselineBytes = readFileSync(resolve(migrationsRoot, baselineName))
const secondMigrationName = '0002_prune_dead_iam_actions.sql'
const secondMigrationDigest = createHash('sha256').update(readFileSync(resolve(migrationsRoot, secondMigrationName))).digest('hex')

const fixtureRoot = (t, mutate = () => {}) => {
  const root = mkdtempSync(resolve(tmpdir(), 'conexus-baseline-corpus-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  writeFileSync(resolve(root, baselineName), baselineBytes)
  mutate(root)
  return root
}

test('the corpus is the baseline plus every forward migration, in order', () => {
  const loaded = loadHubMigrationFiles()
  assert.deepEqual(loaded.map(({ name, version, checksum }) => ({ name, version, checksum })), [
    { name: '0001_baseline.sql', version: '0001', checksum: baselineDigest },
    { name: secondMigrationName, version: '0002', checksum: secondMigrationDigest },
  ])
})

test('a baseline whose bytes drifted is refused before any connection opens', (t) => {
  const root = fixtureRoot(t, (dir) => {
    writeFileSync(resolve(dir, baselineName), Buffer.concat([baselineBytes, Buffer.from('\n-- drift\n')]))
  })
  assert.throws(() => loadHubMigrationFiles(root), /MIGRATION_0001_DIGEST_REFUSED/)
})

test('a directory with no baseline is refused', (t) => {
  const root = mkdtempSync(resolve(tmpdir(), 'conexus-baseline-empty-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  assert.throws(() => loadHubMigrationFiles(root), /MIGRATION_CENSUS_REFUSED:0001_baseline\.sql/)
})

// A working tree that still holds a file from the replaced history must not be read, and its
// three-digit name is the thing that gives it away.
test('a three-digit migration left over from the replaced history is refused by name', (t) => {
  const root = fixtureRoot(t, (dir) => writeFileSync(resolve(dir, '059_hub_roles_by_capability.sql'), 'BEGIN;\nSELECT 1;\nCOMMIT;\n'))
  assert.throws(() => loadHubMigrationFiles(root), /MIGRATION_NAME_REFUSED:059_hub_roles_by_capability\.sql/)
})

test('a well-named migration that carries no pin is refused by the census', (t) => {
  const root = fixtureRoot(t, (dir) => writeFileSync(resolve(dir, '0002_unlisted.sql'), 'BEGIN;\nSELECT 1;\nCOMMIT;\n'))
  assert.throws(() => loadHubMigrationFiles(root), /MIGRATION_CENSUS_REFUSED:0002_unlisted\.sql/)
})

test('a baseline that is a symlink is refused', (t) => {
  const root = fixtureRoot(t, (dir) => {
    rmSync(resolve(dir, baselineName))
    symlinkSync(resolve(migrationsRoot, baselineName), resolve(dir, baselineName))
  })
  assert.throws(() => loadHubMigrationFiles(root), /MIGRATION_ENTRY_REFUSED:0001_baseline\.sql/)
})

test('a baseline that is a directory is refused', (t) => {
  const root = fixtureRoot(t, (dir) => {
    rmSync(resolve(dir, baselineName))
    mkdirSync(resolve(dir, baselineName))
  })
  assert.throws(() => loadHubMigrationFiles(root), /MIGRATION_ENTRY_REFUSED:0001_baseline\.sql/)
})
