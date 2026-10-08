import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'
import { query } from './hub-database.mjs'
import { setupBuilder } from './builder-fixture.mjs'
import { ID } from './project-fixture.mjs'

const { createBuilderStore } = await import(hubModuleUrl('builder/store.js'))

const source = (letter) => letter.repeat(40)

test('C-020 source inspection admits current subjects and any run with a result', async (t) => {
  const { connection, database, seedBuilderProject } = await setupBuilder(t, 'conexus_source_inspection')
  const store = createBuilderStore({ database, ownerId: randomUUID() })
  const account = ID.owner
  const unauthorized = ID.outsider
  const project = await seedBuilderProject('Project P')
  const otherProject = await seedBuilderProject('Project Q')
  const baseline = source('a'); const runOneResult = source('b'); const preview = source('c')
  const working = source('d')
  const olderRunOnly = source('e'); const unrelated = source('8'); const otherResult = source('9')
  const runOne = randomUUID(); const runTwo = randomUUID(); const responseOnly = randomUUID(); const otherRun = randomUUID()
  await query(connection, 'UPDATE builder.project_working_state SET last_preview_source_revision = $2, last_preview_artifact_revision_id = $3, last_preview_artifact_digest = $4 WHERE project_id = $1',
    [project, preview, randomUUID(), '1'.repeat(64)])
  const insertRun = (id, projectId, revision, kind, createdAt, base) => query(connection, `INSERT INTO builder.builder_run(
    builder_run_id, project_id, account_id, conversation_id, trigger_message_id, idempotency_digest, request_digest,
    base_source_revision, state, result_source_revision, result_kind, created_at
  ) VALUES ($1, $2, $3, $10, $4, $5, $5, $6, 'SUCCEEDED', $7, $8, $9)`, [id, projectId, account, id, id.replaceAll('-', '').padEnd(64, '0'), base, revision, kind, createdAt, projectId])
  await insertRun(runOne, project, runOneResult, 'SOURCE_CHANGED', '2026-09-14T10:00:00Z', olderRunOnly)
  await insertRun(runTwo, project, working, 'SOURCE_CHANGED_BUILD_FAILED', '2026-09-14T11:00:00Z', runOneResult)
  await insertRun(responseOnly, project, null, 'RESPONSE_ONLY', '2026-09-14T12:00:00Z', working)
  await insertRun(otherRun, otherProject, otherResult, 'SOURCE_CHANGED', '2026-09-14T10:00:00Z', source('f'))
  const admit = (revision, subject = project, actor = account, main = working) => store.admitSourceRevision({ accountId: actor, projectId: subject, sourceRevision: revision, readMain: async () => main })
  for (const revision of [working, preview, runOneResult, olderRunOnly]) assert.equal(await admit(revision), true, revision)
  for (const revision of [baseline, unrelated, otherResult]) assert.equal(await admit(revision), false, revision)
  assert.equal(await admit(baseline, project, account, baseline), true)
  assert.equal(await admit(unrelated, project, account, null), false)
  assert.equal(await admit('not-an-oid'), false)
  assert.equal(await admit(working, project, unauthorized), false)

  assert.deepEqual(await store.readLatestCodeChangingBuilderRun({ accountId: account, projectId: project }), {
    builderRunId: runTwo, projectId: project, conversationId: project, baseSourceRevision: runOneResult, resultSourceRevision: working, resultKind: 'SOURCE_CHANGED_BUILD_FAILED',
  })
  await assert.rejects(store.readLatestCodeChangingBuilderRun({ accountId: unauthorized, projectId: project }), { id: 'PROJECT_NOT_FOUND' })
  assert.equal((await store.readLatestCodeChangingBuilderRun({ accountId: account, projectId: otherProject })).builderRunId, otherRun)
  await query(connection, 'DELETE FROM builder.builder_run WHERE project_id = $1', [otherProject])
  await insertRun(otherRun, otherProject, null, 'RESPONSE_ONLY', '2026-09-14T12:00:00Z', source('f'))
  assert.equal(await store.readLatestCodeChangingBuilderRun({ accountId: account, projectId: otherProject }), null)
})

test('source inspection admits base and result revisions of an in-flight code-changing run before settlement', async (t) => {
  const { connection, database, seedBuilderProject } = await setupBuilder(t, 'conexus_source_inspection_inflight')
  const store = createBuilderStore({ database, ownerId: randomUUID() })
  const account = ID.owner
  const unauthorized = ID.outsider
  const project = await seedBuilderProject('Project P')
  const otherProject = await seedBuilderProject('Project Q')
  const noResultProject = await seedBuilderProject('Project R')
  const baseRev = source('1')
  const resultRev = source('2')
  const mainRev = source('7')
  const unrecordedRev = source('3')
  const otherProjectBaseRev = source('4')
  const otherProjectResultRev = source('5')
  const runningWithoutResultBaseRev = source('6')

  const runId = randomUUID()
  const otherRunId = randomUUID()
  const noResultRunId = randomUUID()

  const insertRun = ({ id, projectId, base, result, state }) => query(connection, `INSERT INTO builder.builder_run(
    builder_run_id, project_id, account_id, conversation_id, trigger_message_id, idempotency_digest, request_digest,
    base_source_revision, state, result_source_revision, result_kind, created_at
  ) VALUES ($1, $2, $3, $2, $4, $5, $5, $6, $7, $8, NULL, clock_timestamp())`, [
    id, projectId, account, id, id.replaceAll('-', '').padEnd(64, '0'), base, state, result,
  ])

  await insertRun({ id: runId, projectId: project, base: baseRev, result: resultRev, state: 'RUNNING' })
  await insertRun({ id: otherRunId, projectId: otherProject, base: otherProjectBaseRev, result: otherProjectResultRev, state: 'RUNNING' })
  await insertRun({ id: noResultRunId, projectId: noResultProject, base: runningWithoutResultBaseRev, result: null, state: 'RUNNING' })

  const admit = (revision, subject = project, actor = account, main = mainRev) =>
    store.admitSourceRevision({ accountId: actor, projectId: subject, sourceRevision: revision, readMain: async () => main })

  assert.equal(await admit(baseRev), true)
  assert.equal(await admit(resultRev), true)
  assert.equal(await admit(unrecordedRev), false)
  assert.equal(await admit(otherProjectBaseRev), false)
  assert.equal(await admit(otherProjectResultRev), false)
  assert.equal(await store.admitSourceRevision({ accountId: account, projectId: noResultProject, sourceRevision: runningWithoutResultBaseRev, readMain: async () => mainRev }), false)
  assert.equal(await admit(baseRev, project, unauthorized), false)
})

test('source inspection admits base and result revisions of an older settled run and an interrupted run with a result', async (t) => {
  const { connection, database, seedBuilderProject } = await setupBuilder(t, 'conexus_source_inspection_settled_interrupted')
  const store = createBuilderStore({ database, ownerId: randomUUID() })
  const account = ID.owner
  const project = await seedBuilderProject('Project P')
  const settledBase = source('1')
  const settledResult = source('2')
  const interruptedBase = source('3')
  const interruptedResult = source('4')
  const mainRev = source('5')
  const unrecordedRev = source('6')

  const settledRunId = randomUUID()
  const interruptedRunId = randomUUID()

  const insertRun = ({ id, projectId, base, result, state, kind }) => query(connection, `INSERT INTO builder.builder_run(
    builder_run_id, project_id, account_id, conversation_id, trigger_message_id, idempotency_digest, request_digest,
    base_source_revision, state, result_source_revision, result_kind, created_at
  ) VALUES ($1, $2, $3, $2, $4, $5, $5, $6, $7, $8, $9, clock_timestamp())`, [
    id, projectId, account, id, id.replaceAll('-', '').padEnd(64, '0'), base, state, result, kind,
  ])

  await insertRun({ id: settledRunId, projectId: project, base: settledBase, result: settledResult, state: 'SUCCEEDED', kind: 'SOURCE_CHANGED' })
  await insertRun({ id: interruptedRunId, projectId: project, base: interruptedBase, result: interruptedResult, state: 'INTERRUPTED', kind: null })

  const admit = (revision) => store.admitSourceRevision({ accountId: account, projectId: project, sourceRevision: revision, readMain: async () => mainRev })

  assert.equal(await admit(settledBase), true)
  assert.equal(await admit(settledResult), true)
  assert.equal(await admit(interruptedBase), true)
  assert.equal(await admit(interruptedResult), true)
  assert.equal(await admit(unrecordedRev), false)
})
