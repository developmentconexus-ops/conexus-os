import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const migrationPath = resolve(repositoryRoot, 'apps/hub/migrations/008_project_baseline_custody.sql')
const routePath = resolve(repositoryRoot, 'apps/hub/src/generated/s3-routes.ts')
const clientPath = resolve(repositoryRoot, 'apps/web/src/generated/project-client.ts')

test('S4-P0 projects exactly PRJ-08/09/23 beside the closed S3 routes', () => {
  const routes = readFileSync(routePath, 'utf8')
  const client = readFileSync(clientPath, 'utf8')
  assert.match(routes, /'PRJ-01' \| 'PRJ-02' \| 'PRJ-03' \| 'PRJ-08' \| 'PRJ-09' \| 'PRJ-23'/)
  assert.match(routes, /GetApprovedProjectBaseline/)
  assert.match(routes, /ApproveProjectBaselineRevision/)
  assert.match(routes, /GetProjectBaselineCandidate/)
  assert.match(routes, /export type Prj09Body/)
  assert.match(client, /getApprovedBaseline/)
  assert.match(client, /approveBaseline/)
  assert.match(client, /getBaselineCandidate/)
})

test('S4-P0 migration freezes immutable digest custody and distinct execute-only roles', () => {
  assert.equal(existsSync(migrationPath), true)
  const source = readFileSync(migrationPath, 'utf8')
  assert.match(source, /CREATE ROLE hub_s4_baseline_read LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS/)
  assert.match(source, /CREATE ROLE hub_s4_baseline_command LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS/)
  assert.match(source, /CREATE TABLE project\.baseline_candidate/)
  assert.match(source, /CREATE TABLE project\.baseline_state/)
  assert.match(source, /CREATE TABLE project\.baseline_approval/)
  assert.match(source, /candidate_digest text NOT NULL CHECK \(candidate_digest ~ '\^\[0-9a-f\]\{64\}\$'\)/)
  assert.match(source, /project\.get_baseline_candidate/)
  assert.match(source, /project\.get_approved_baseline/)
  assert.match(source, /project\.approve_baseline_revision/)
  assert.match(source, /iam\.admit_project_manage/)
  assert.match(source, /REVOKE ALL ON ALL TABLES IN SCHEMA project FROM hub_s4_baseline_read/)
  assert.match(source, /REVOKE ALL ON ALL TABLES IN SCHEMA project FROM hub_s4_baseline_command/)
})

test('S4-P0 production composition contains no candidate injection capability', () => {
  const productionPaths = [
    'apps/hub/migrations/008_project_baseline_custody.sql',
    'apps/hub/src/project/routes.ts',
    'apps/hub/src/project/module.ts',
    'apps/hub/src/platform/config.ts',
  ]
  for (const path of productionPaths) {
    const absolute = resolve(repositoryRoot, path)
    if (!existsSync(absolute)) continue
    assert.doesNotMatch(readFileSync(absolute, 'utf8'), /inject[_A-Za-z]*baseline|baseline[_A-Za-z]*inject/i, path)
  }
})
