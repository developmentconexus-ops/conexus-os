import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadHubMigrationFiles, runMigrations } from '../../scripts/run-hub-migrations.mjs'
import { createEmptyDatabase, query } from './hub-database.mjs'

const PROJECT = '33333333-3333-4333-8333-333333333333'
const EMPTY = '44444444-4444-4444-8444-444444444444'
const REVISION = '30000000-0000-4000-8000-000000000001'
const SOURCE = 'a'.repeat(40)
const DIGEST = 'd'.repeat(64)

test('Registry Preview migration moves the whole tuple, keeps empty Projects empty and replays without changing identity', async (t) => {
  const { connection, connectionString } = await createEmptyDatabase(t, 'conexus_registry_preview_cutover')
  const migrations = loadHubMigrationFiles()
  await runMigrations({ connectionString, migrations: migrations.filter((migration) => migration.version < '0077'), catalogSnapshot: null })
  const workspace = '11111111-1111-4111-8111-111111111111'
  await query(connection, 'INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1, $2)', [workspace, 'Synthetic'])
  for (const projectId of [PROJECT, EMPTY]) {
    await query(connection, "INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision) VALUES ($1, $2, $3, 'NEW', $4, $5)", [projectId, workspace, projectId === PROJECT ? 'Built' : 'Empty', SOURCE, REVISION])
    await query(connection, 'INSERT INTO builder.project_working_state(project_id) VALUES ($1)', [projectId])
  }
  await query(connection, "INSERT INTO reg.artifact_revision(artifact_revision_id, project_id, source_revision, digest, payload) VALUES ($1, $2, $3, $4, '{}'::jsonb)", [REVISION, PROJECT, SOURCE, DIGEST])
  await query(connection, 'UPDATE builder.project_working_state SET last_preview_source_revision = $2, last_preview_artifact_revision_id = $3, last_preview_artifact_digest = $4 WHERE project_id = $1', [PROJECT, SOURCE, REVISION, DIGEST])

  assert.deepEqual((await runMigrations({ connectionString, migrations })).appliedNow, ['0077'])
  const preview = () => query(connection, 'SELECT project_id, source_revision, artifact_revision_id, digest FROM reg.project_preview ORDER BY project_id')
  const expected = [{ project_id: PROJECT, source_revision: SOURCE, artifact_revision_id: REVISION, digest: DIGEST }]
  assert.deepEqual((await preview()).rows, expected)
  await assert.rejects(query(connection, 'SELECT last_preview_source_revision FROM builder.project_working_state'), { code: '42703' })
  assert.deepEqual((await runMigrations({ connectionString, migrations })).appliedNow, [])
  assert.deepEqual((await preview()).rows, expected)
})
