import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { query } from './hub-database.mjs'
import { HEAD, ID, setupProjects } from './project-fixture.mjs'

const insertProject = (connection, projectId, workspaceId, name, createdAt) => query(connection, `INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision, created_at)
  VALUES ($1, $2, $3, 'NEW', $4, $5, $6)`, [projectId, workspaceId, name, HEAD, randomUUID(), createdAt])
const insertRun = (connection, projectId, state, resultKind, createdAt) => query(connection, `INSERT INTO builder.builder_run(builder_run_id, project_id, account_id, conversation_id, idempotency_digest, request_digest, base_source_revision, state, result_kind, created_at)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`, [randomUUID(), projectId, ID.owner, projectId, randomUUID().replaceAll('-', '').repeat(2), '1'.repeat(64), HEAD, state, resultKind, createdAt])

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
    { projectId: ready, name: 'Ready Project', state: 'live', archived: false, lastActivityAt: '2026-02-03T00:00:00.000Z', latestRun: { state: 'FAILED', resultKind: 'SOURCE_CHANGED_BUILD_FAILED' }, hasPreview: true },
    { projectId: running, name: 'Running Project', state: 'live', archived: false, lastActivityAt: '2026-02-01T00:00:00.000Z', latestRun: { state: 'RUNNING', resultKind: null }, hasPreview: false },
    { projectId: stale, name: 'Stale Project', state: 'live', archived: false, lastActivityAt: '2026-01-01T00:00:00.000Z', latestRun: null, hasPreview: false },
  ])
  await assert.rejects(store.listProjectSummariesWithActivity({ accountId: ID.member, workspaceId: ID.otherWorkspace }), { id: 'WORKSPACE_NOT_FOUND' })
  await assert.rejects(store.listProjectSummariesWithActivity({ accountId: ID.outsider, workspaceId: ID.workspace }), { id: 'WORKSPACE_NOT_FOUND' })
})

test('a deleting project card exposes only the identity and state', async (t) => {
  const { connection, store, seedProject } = await setupProjects(t, 'conexus_prj_cards_tomb')
  const projectId = await seedProject('Atlas')
  const cardsOf = (accountId) => store.listProjectSummariesWithActivity({ accountId, workspaceId: ID.workspace })
  await query(connection, `INSERT INTO project.project_deletion(project_id, workspace_id, name, requested_by) VALUES ($1, $2, 'Atlas', $3)`, [projectId, ID.workspace, ID.owner])
  assert.deepEqual(await cardsOf(ID.owner), [{ projectId, name: 'Atlas', state: 'deleting' }])
  assert.deepEqual(await cardsOf(ID.member), [{ projectId, name: 'Atlas', state: 'deleting' }])
  await assert.rejects(cardsOf(ID.administrator), { id: 'WORKSPACE_NOT_FOUND' })
  await assert.rejects(cardsOf(ID.outsider), { id: 'WORKSPACE_NOT_FOUND' })
})
