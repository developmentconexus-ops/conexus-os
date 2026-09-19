import assert from 'node:assert/strict'
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
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
  '026_builder_application_registry.sql',
  '027_rb_builder_working_source.sql',
  '028_builder_run.sql',
  '029_builder_run_execution.sql',
  '030_builder_run_invariants.sql',
  '031_builder_run_application_build.sql',
  '032_builder_project_build_grant.sql',
  '033_builder_execution_artifact_admission.sql',
  '034_builder_project_source_preview.sql',
  '035_builder_c020_state_invariants.sql',
  '036_builder_project_creation_bootstrap.sql',
  '037_builder_c020_source_inspection.sql',
  '038_builder_c020_legacy_excision.sql',
  '039_builder_c020_execution_invariants.sql',
  '040_builder_registry_settlement_boundary.sql',
  '041_builder_claude_connections.sql',
  '042_builder_claude_connection_safety.sql',
  '043_builder_model_admission.sql',
  '044_builder_run_cancellation.sql',
  '045_builder_run_history.sql',
  '046_builder_run_admission_cas.sql',
  '047_reconcile_040_settlement_boundary.sql',
  '048_builder_claude_connection_label.sql',
  '049_project_creator_builder_grant.sql',
  '050_builder_run_phase.sql',
  '051_builder_orphan_function_excision.sql',
  '052_iam_membership_authority.sql',
]
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

test('049 carries builder authority with project creator authority and preserves existing decisions', () => {
  const source = readFileSync(resolve(migrationsRoot, '049_project_creator_builder_grant.sql'), 'utf8')
  assert.match(source, /CREATE OR REPLACE FUNCTION iam\.establish_project_creator_grant/)
  assert.match(source, /INSERT INTO iam\.project_builder_grant \(account_id, project_id, can_build, can_read_source\)/)
  assert.match(source, /receipt\.outcome = 'SUCCEEDED'/)
  assert.match(source, /ON CONFLICT DO NOTHING/)
})

test('050 carries durable BuilderRun phase semantics without widening the running state', () => {
  const source = readFileSync(resolve(migrationsRoot, '050_builder_run_phase.sql'), 'utf8')
  assert.match(source, /ADD COLUMN IF NOT EXISTS phase text/)
  assert.match(source, /state = 'RUNNING'/)
  assert.match(source, /cancellation_requested_at IS NULL/)
  assert.match(source, /PREPARING.*AGENT.*SOURCE_ADMISSION.*COMPILING.*FINALIZING/s)
  assert.match(source, /CREATE OR REPLACE FUNCTION builder\.set_builder_run_phase/)
  assert.match(source, /GRANT EXECUTE ON FUNCTION builder\.set_builder_run_phase\(uuid,text\) TO hub_rb_executor/)
  assert.match(source, /CREATE TRIGGER builder_run_phase_boundary/)
})

test('052 adds the membership authority without switching or dropping a grant surface', () => {
  const source = readFileSync(resolve(migrationsRoot, '052_iam_membership_authority.sql'), 'utf8')
  assert.match(source, /CREATE TYPE iam\.workspace_role AS ENUM \('owner', 'member'\)/)
  assert.match(source, /ADD COLUMN role iam\.workspace_role NOT NULL DEFAULT 'owner'/)
  assert.match(source, /ALTER COLUMN role SET DEFAULT 'member'/)
  assert.match(source, /FOR SHARE OF admitted_account, membership/)
  assert.match(source, /RAISE EXCEPTION 'NOT_ADMITTED' USING ERRCODE = '42501'/)
  assert.match(source, /RAISE EXCEPTION 'LAST_OWNER' USING ERRCODE = '42501'/)
  assert.match(source, /MIGRATION_052_GRANT_WITHOUT_MEMBERSHIP_REFUSED/)
  assert.match(source, /MIGRATION_052_WORKSPACE_MULTIPLE_MEMBERSHIPS_REFUSED/)
  assert.equal(/\bDROP (TABLE|COLUMN|FUNCTION)\b/.test(source), false)
  assert.equal(/CREATE OR REPLACE FUNCTION/.test(source.replace('CREATE OR REPLACE FUNCTION iam.establish_workspace_creator_access', '')), false)
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

// The held-migration case was deleted with the concept. It asserted that 024 and 025 could sit
// in the directory without affecting the admitted selection and that their bytes were never
// read. With no held names left, the recognized set is exactly the current corpus, so an extra
// file is now refused outright. The next case is what proves that.

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
