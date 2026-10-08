import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'

const { RunRow } = await import(hubModuleUrl('builder/run-row.js'))
const { CardRow, DetailRow, ListRow } = await import(hubModuleUrl('project/rows.js'))
const id = '11111111-1111-4111-8111-111111111111'
const projectId = '22222222-2222-4222-8222-222222222222'
const conversationId = '33333333-3333-4333-8333-333333333333'
const revision = 'a'.repeat(40)
const createdAt = '2026-01-01T00:00:00.000Z'
const row = {
  builder_run_id: id, project_id: projectId, conversation_id: conversationId,
  base_source_revision: revision, request_text: 'Build a notebook', created_at: new Date(createdAt), cancellation_requested: false,
}
const endings = [
  { state: 'QUEUED', phase: null, resultSourceRevision: null, resultKind: null, failureCode: null },
  { state: 'RUNNING', phase: 'PREPARING', resultSourceRevision: null, resultKind: null, failureCode: null },
  { state: 'RUNNING', phase: null, resultSourceRevision: revision, resultKind: null, failureCode: null },
  { state: 'SUCCEEDED', phase: null, resultSourceRevision: null, resultKind: 'RESPONSE_ONLY', failureCode: null },
  { state: 'SUCCEEDED', phase: null, resultSourceRevision: revision, resultKind: 'SOURCE_CHANGED', failureCode: null },
  { state: 'FAILED', phase: null, resultSourceRevision: null, resultKind: null, failureCode: 'DATABASE_BUSY' },
  { state: 'FAILED', phase: null, resultSourceRevision: revision, resultKind: 'SOURCE_CHANGED_BUILD_FAILED', failureCode: 'BUILDER_CHECK_FAILED' },
  ...['USER_CANCELLED', 'HUB_RESTART', 'BUILDER_QUESTION_EXPIRED'].map((failureCode) => ({ state: 'INTERRUPTED', phase: null, resultSourceRevision: null, resultKind: null, failureCode })),
]
function stored(ending) {
  return { ...row, state: ending.state, phase: ending.phase, result_source_revision: ending.resultSourceRevision, result_kind: ending.resultKind, failure_code: ending.failureCode }
}

test('the run database boundary rejects impossible state, result, phase and failure combinations', () => {
  for (const change of [
    { state: 'SUCCEEDED', result_kind: null, failure_code: 'DATABASE_BUSY' },
    { state: 'QUEUED', result_source_revision: revision },
    { state: 'RUNNING', result_kind: 'SOURCE_CHANGED' },
    { state: 'FAILED', failure_code: null },
    { state: 'FAILED', result_kind: 'RESPONSE_ONLY' },
    { state: 'INTERRUPTED', failure_code: null },
    { state: 'INTERRUPTED', phase: 'PREPARING' },
    { state: 'UNKNOWN_STATE' },
    { builder_run_id: 'unparsed-id' },
    { request_text: 'x'.repeat(20_001) },
  ]) {
    assert.equal(RunRow.safeParse({ ...stored(endings[0]), ...change }).success, false, JSON.stringify(change))
  }
})

test('legal run variants retain the exact public summary payload at the database boundary', () => {
  for (const ending of endings) {
    assert.deepEqual(RunRow.parse(stored(ending)), {
      builderRunId: id, projectId, conversationId, baseSourceRevision: revision,
      requestText: 'Build a notebook', createdAt, cancellationRequested: false, ...ending,
    })
  }
})

const project = { project_id: projectId, workspace_id: id, name: 'Notebook' }
const card = { ...project, state: 'live', archived: false, last_activity_at: createdAt, has_preview: true }

test('Project database boundaries keep current live and deleting list, detail and activity payloads', () => {
  const identity = { projectId, workspaceId: id, name: 'Notebook' }
  assert.deepEqual(ListRow.parse({ ...project, state: 'live', archived: false }), { ...identity, state: 'live', archived: false })
  assert.deepEqual(DetailRow.parse({ ...project, state: 'live', archived: false, project_revision: conversationId }), { ...identity, state: 'live', archived: false, projectRevision: conversationId })
  for (const schema of [ListRow, DetailRow]) {
    assert.deepEqual(schema.parse({ ...project, state: 'deleting', archived: null, project_revision: null }), { ...identity, state: 'deleting' })
  }
  assert.deepEqual(CardRow.parse({ ...card, run_state: null, run_result_kind: null }), { projectId, name: 'Notebook', state: 'live', archived: false, lastActivityAt: createdAt, latestRun: null, hasPreview: true })
  for (const ending of endings) {
    assert.deepEqual(CardRow.parse({ ...card, run_state: ending.state, run_result_kind: ending.resultKind }), { projectId, name: 'Notebook', state: 'live', archived: false, lastActivityAt: createdAt, latestRun: { state: ending.state, resultKind: ending.resultKind }, hasPreview: true })
  }
  assert.deepEqual(CardRow.parse({ ...card, state: 'deleting', archived: null, run_state: null, run_result_kind: null }), { projectId, name: 'Notebook', state: 'deleting' })
})

test('Project activity rejects unknown vocabulary and impossible latest run variants at the boundary', () => {
  for (const [state, resultKind] of [
    ['UNKNOWN', null], ['RUNNING', 'UNKNOWN'], ['SUCCEEDED', null],
    ['QUEUED', 'SOURCE_CHANGED'], ['FAILED', 'RESPONSE_ONLY'], [null, 'SOURCE_CHANGED'],
  ]) {
    assert.equal(CardRow.safeParse({ ...card, run_state: state, run_result_kind: resultKind }).success, false)
  }
  assert.equal(ListRow.safeParse({ ...project, state: 'live', archived: null }).success, false)
  assert.equal(DetailRow.safeParse({ ...project, state: 'live', archived: false, project_revision: 'invalid' }).success, false)
})
