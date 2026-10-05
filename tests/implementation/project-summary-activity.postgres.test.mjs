import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { query } from './hub-database.mjs'
import { HEAD, ID, setupProjects } from './project-fixture.mjs'

const insertProject = (connection, projectId, workspaceId, name, createdAt) => query(connection, `INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision, created_at)
  VALUES ($1, $2, $3, 'NEW', $4, $5, $6)`, [projectId, workspaceId, name, HEAD, randomUUID(), createdAt])
const insertRun = (connection, projectId, state, resultKind, createdAt) => query(connection, `INSERT INTO builder.builder_run(builder_run_id, project_id, account_id, conversation_id, idempotency_digest, request_digest, base_source_revision, state, result_kind, created_at)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`, [randomUUID(), projectId, ID.owner, `conexus-builder:${projectId}`, randomUUID().replaceAll('-', '').repeat(2), '1'.repeat(64), HEAD, state, resultKind, createdAt])

test('the project cards sort by latest activity, fall back to creation, and stay inside the workspace', async (t) => {
  const { connection, store } = await setupProjects(t, 'conexus_prj_cards')
  const [stale, running, ready, elsewhere] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()]
  await insertProject(connection, stale, ID.workspace, 'Stale Project', '2026-01-01T00:00:00Z')
  await insertProject(connection, running, ID.workspace, 'Running Project', '2026-01-02T00:00:00Z')
  await insertProject(connection, ready, ID.workspace, 'Ready Project', '2026-01-03T00:00:00Z')
  await insertProject(connection, elsewhere, ID.otherWorkspace, 'Cross Workspace', '2026-01-04T00:00:00Z')
  await query(connection, 'INSERT INTO builder.project_working_state(project_id) VALUES ($1)', [running])
  await query(connection, 'INSERT INTO builder.project_working_state(project_id, last_preview_source_revision, last_preview_artifact_revision_id, last_preview_artifact_digest) VALUES ($1, $2, $3, $4)', [ready, HEAD, randomUUID(), 'b'.repeat(64)])
  await insertRun(connection, running, 'RUNNING', null, '2026-02-01T00:00:00Z')
  await insertRun(connection, ready, 'SUCCEEDED', 'SOURCE_CHANGED', '2026-02-02T00:00:00Z')
  await insertRun(connection, ready, 'FAILED', 'SOURCE_CHANGED_BUILD_FAILED', '2026-02-03T00:00:00Z')

  const cards = await store.listProjectSummariesWithActivity({ accountId: ID.member, workspaceId: ID.workspace })
  assert.deepEqual(cards, [
    { projectId: ready, name: 'Ready Project', archived: false, lastActivityAt: '2026-02-03T00:00:00.000Z', latestRun: { state: 'FAILED', resultKind: 'SOURCE_CHANGED_BUILD_FAILED' }, hasPreview: true, deleting: false },
    { projectId: running, name: 'Running Project', archived: false, lastActivityAt: '2026-02-01T00:00:00.000Z', latestRun: { state: 'RUNNING', resultKind: null }, hasPreview: false, deleting: false },
    { projectId: stale, name: 'Stale Project', archived: false, lastActivityAt: '2026-01-01T00:00:00.000Z', latestRun: null, hasPreview: false, deleting: false },
  ])
  assert.deepEqual(await store.listProjectSummariesWithActivity({ accountId: ID.member, workspaceId: ID.otherWorkspace }), [])
  assert.deepEqual(await store.listProjectSummariesWithActivity({ accountId: ID.outsider, workspaceId: ID.workspace }), [])
})

test('a tombstoned project shows no run or preview, and a purged one reaches the administrator only until it completes', async (t) => {
  const { connection, store, seedProject, settleRun } = await setupProjects(t, 'conexus_prj_cards_tomb')
  const projectId = await seedProject('Atlas')
  await settleRun(projectId)
  await query(connection, 'UPDATE builder.project_working_state SET last_preview_source_revision = $2, last_preview_artifact_revision_id = $3, last_preview_artifact_digest = $4 WHERE project_id = $1', [projectId, HEAD, randomUUID(), 'b'.repeat(64)])
  const cardsOf = (accountId) => store.listProjectSummariesWithActivity({ accountId, workspaceId: ID.workspace })
  await query(connection, `INSERT INTO project.project_deletion(project_id, workspace_id, name, requested_by) VALUES ($1, $2, 'Atlas', $3)`, [projectId, ID.workspace, ID.administrator])
  const [tombstoned] = await cardsOf(ID.memberAdministrator)
  assert.deepEqual({ latestRun: tombstoned.latestRun, hasPreview: tombstoned.hasPreview, deleting: tombstoned.deleting }, { latestRun: null, hasPreview: false, deleting: true })
  assert.deepEqual(await cardsOf(ID.administrator), [])
  assert.deepEqual(await cardsOf(ID.member), [])

  await query(connection, 'DELETE FROM builder.builder_run WHERE project_id = $1', [projectId])
  await query(connection, 'DELETE FROM builder.project_working_state WHERE project_id = $1', [projectId])
  await query(connection, 'DELETE FROM builder.project_repository WHERE project_id = $1', [projectId])
  await query(connection, 'DELETE FROM project.project WHERE project_id = $1', [projectId])
  assert.deepEqual(await cardsOf(ID.administrator), [])
  await query(connection, 'UPDATE project.project_deletion SET purged_at = now() WHERE project_id = $1', [projectId])
  const [purged] = await cardsOf(ID.administrator)
  assert.deepEqual({ projectId: purged.projectId, name: purged.name, archived: purged.archived, latestRun: purged.latestRun, hasPreview: purged.hasPreview, deleting: purged.deleting },
    { projectId, name: 'Atlas', archived: false, latestRun: null, hasPreview: false, deleting: true })
  assert.deepEqual(await cardsOf(ID.member), [])
  await query(connection, 'UPDATE project.project_deletion SET completed_at = clock_timestamp() WHERE project_id = $1', [projectId])
  assert.deepEqual(await cardsOf(ID.administrator), [])
})
