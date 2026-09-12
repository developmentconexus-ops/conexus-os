import assert from 'node:assert/strict'
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  loadCurrentHubMigrationFiles,
  loadMigrationFiles,
  loadR2MigrationFiles,
} from '../../scripts/run-hub-migrations.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const migrationsRoot = resolve(repositoryRoot, 'apps/hub/migrations')
const r1Names = [
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
const r2Names = [
  ...r1Names,
  '011_r2_brain_connections.sql',
  '012_r2_project_binding_recovery.sql',
  '013_r2_binding_source_concordance.sql',
  '014_r2_brain_binding_settlement.sql',
  '015_r2_project_brain_read_envelopes.sql',
  '016_r2_brain_binding_removal.sql',
  '017_r2_key_conformance_subject.sql',
  '018_r2_brain_revision_selection.sql',
]
const currentNames = [
  ...r2Names,
  '019_rb_builder_first_vertical.sql',
  '020_rb_builder_verification_acceptance.sql',
  '021_rb_builder_bounded_correction.sql',
  '022_rb_builder_source_inspection.sql',
  '023_rb_builder_preview_subject.sql',
]
const heldNames = ['024_mar_pg_boss_projection.sql', '025_mar_admission_function.sql']
const names = (migrations) => migrations.map((migration) => migration.name)

const makeFixture = (selectedNames) => {
  const root = mkdtempSync(resolve(tmpdir(), 'conexus-hub-migration-selection-'))
  for (const name of selectedNames) copyFileSync(resolve(migrationsRoot, name), resolve(root, name))
  return root
}

test('loaders select their admitted migration corpus from the repository', () => {
  assert.deepEqual(names(loadMigrationFiles()), r1Names)
  assert.deepEqual(names(loadR2MigrationFiles()), r2Names)
  assert.deepEqual(names(loadCurrentHubMigrationFiles()), currentNames)
})

test('each loader accepts a fixture containing only its selected migrations', (t) => {
  for (const [loader, selectedNames] of [
    [loadMigrationFiles, r1Names],
    [loadR2MigrationFiles, r2Names],
    [loadCurrentHubMigrationFiles, currentNames],
  ]) {
    const root = makeFixture(selectedNames)
    t.after(() => rmSync(root, { recursive: true, force: true }))
    assert.deepEqual(names(loader(root)), selectedNames)
  }
})

test('held migration files are optional and their bytes do not affect admitted selection', (t) => {
  const root = makeFixture(currentNames)
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const absent = loadCurrentHubMigrationFiles(root).map(({ name, checksum }) => ({ name, checksum }))

  for (const name of heldNames) copyFileSync(resolve(migrationsRoot, name), resolve(root, name))
  assert.deepEqual(
    loadCurrentHubMigrationFiles(root).map(({ name, checksum }) => ({ name, checksum })),
    absent,
  )

  for (const name of heldNames) writeFileSync(resolve(root, name), '\nSELECT held_bytes_are_not_read;\n', { flag: 'a' })
  assert.deepEqual(
    loadCurrentHubMigrationFiles(root).map(({ name, checksum }) => ({ name, checksum })),
    absent,
  )
})

test('loaders refuse unknown SQL files', (t) => {
  const root = makeFixture(currentNames)
  t.after(() => rmSync(root, { recursive: true, force: true }))
  writeFileSync(resolve(root, '999_unknown.sql'), 'BEGIN;\nSELECT 1;\nCOMMIT;\n')
  assert.throws(() => loadCurrentHubMigrationFiles(root), /MIGRATION_CENSUS_REFUSED/)
})

test('loaders refuse missing and digest-drifted selected migrations', (t) => {
  const missingRoot = makeFixture(currentNames)
  const driftRoot = makeFixture(r1Names)
  t.after(() => rmSync(missingRoot, { recursive: true, force: true }))
  t.after(() => rmSync(driftRoot, { recursive: true, force: true }))

  unlinkSync(resolve(missingRoot, '023_rb_builder_preview_subject.sql'))
  assert.throws(() => loadCurrentHubMigrationFiles(missingRoot), /MIGRATION_CENSUS_REFUSED/)

  writeFileSync(resolve(driftRoot, '001_iam_foundation.sql'), '\nSELECT changed_admitted_bytes;\n', { flag: 'a' })
  assert.throws(() => loadMigrationFiles(driftRoot), /MIGRATION_001_DIGEST_REFUSED/)
})

test('loaders refuse selected migrations that are symlinks or directories', (t) => {
  const symlinkRoot = makeFixture(r2Names)
  const directoryRoot = makeFixture(currentNames)
  t.after(() => rmSync(symlinkRoot, { recursive: true, force: true }))
  t.after(() => rmSync(directoryRoot, { recursive: true, force: true }))

  unlinkSync(resolve(symlinkRoot, '018_r2_brain_revision_selection.sql'))
  symlinkSync(
    resolve(migrationsRoot, '018_r2_brain_revision_selection.sql'),
    resolve(symlinkRoot, '018_r2_brain_revision_selection.sql'),
  )
  assert.throws(() => loadR2MigrationFiles(symlinkRoot), /MIGRATION_ENTRY_REFUSED:018_r2_brain_revision_selection\.sql/)

  unlinkSync(resolve(directoryRoot, '023_rb_builder_preview_subject.sql'))
  mkdirSync(resolve(directoryRoot, '023_rb_builder_preview_subject.sql'))
  assert.throws(() => loadCurrentHubMigrationFiles(directoryRoot), /MIGRATION_ENTRY_REFUSED:023_rb_builder_preview_subject\.sql/)
})
