import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import pg from 'pg'
import { assertRoleInvariants } from '../../scripts/hub-catalog.mjs'
import { hubModuleUrl } from './hub-build.mjs'
import { buildHubDatabase, query } from './hub-database.mjs'
import { setupBuilder } from './builder-fixture.mjs'
import { ID } from './project-fixture.mjs'

const { createBuilderStore } = await import(hubModuleUrl('builder/store.js'))

const BASE = 'a'.repeat(40)
const send = (store, accountId, projectId, key) => store.createBuilderRun({ accountId, projectId, conversationId: projectId, idempotencyKey: key, content: 'pedido', readBase: async () => BASE })

test('a member of the Workspace reads, creates and builds every Project in it', async (t) => {
  const { database, seedBuilderProject } = await setupBuilder(t, 'conexus_excision_member')
  const store = createBuilderStore({ database, ownerId: randomUUID() })
  const projectId = await seedBuilderProject('Owned')

  // The member did not create this Project and holds no row naming it, yet reads it, because the
  // Workspace is the boundary.
  const created = await send(store, ID.member, projectId, 'one')
  assert.equal(created.state, 'QUEUED')
  assert.deepEqual((await store.listBuilderRuns({ accountId: ID.member, projectId })).map((run) => run.builderRunId), [created.builderRunId])
  assert.equal(await store.admitSourceRevision({ accountId: ID.member, projectId, sourceRevision: BASE, readMain: async () => BASE }), true)
  assert.deepEqual(await store.readPreviewSubject({ accountId: ID.member, projectId }), { lastPreviewSourceRevision: null, lastPreviewArtifactRevisionId: null, lastPreviewArtifactDigest: null })

  assert.deepEqual(await store.listBuilderRuns({ accountId: ID.outsider, projectId }), [])
  assert.equal(await store.admitSourceRevision({ accountId: ID.outsider, projectId, sourceRevision: BASE, readMain: async () => BASE }), false)
  assert.equal(await store.readPreviewSubject({ accountId: ID.outsider, projectId }), null)
  await assert.rejects(send(store, ID.outsider, projectId, 'two'), { id: 'PROJECT_NOT_FOUND' })
  await assert.rejects(store.requestBuilderRunCancellation({ accountId: ID.outsider, projectId, builderRunId: created.builderRunId }), { id: 'PROJECT_NOT_FOUND' })
})

test('removing the member stops the next claim and still records the work already done', async (t) => {
  const { connection, database, seedBuilderProject } = await setupBuilder(t, 'conexus_excision_removal')
  const store = createBuilderStore({ database, ownerId: randomUUID() })
  const running = await seedBuilderProject('Running')
  const queued = await seedBuilderProject('Queued')
  const runningRun = await send(store, ID.member, running, 'one')
  const queuedRun = await send(store, ID.member, queued, 'two')
  assert.equal((await store.claimBuilderRun({ builderRunId: runningRun.builderRunId })).state, 'RUNNING')

  await query(connection, 'DELETE FROM iam.workspace_membership WHERE workspace_id = $1 AND account_id = $2', [ID.workspace, ID.member])

  await assert.rejects(store.claimBuilderRun({ builderRunId: queuedRun.builderRunId }), { id: 'BUILDER_RUN_NOT_ADMITTED' })

  await assert.rejects(store.settleBuilderRun({ builderRunId: runningRun.builderRunId }), { id: 'BUILDER_RUN_NOT_ADMITTED' })
  await store.failBuilderRun({ builderRunId: runningRun.builderRunId, failureCode: 'BUILDER_RUN_NOT_ADMITTED' })
  assert.deepEqual((await query(connection, 'SELECT state, result_kind FROM builder.builder_run WHERE builder_run_id = $1', [runningRun.builderRunId])).rows,
    [{ state: 'FAILED', result_kind: null }])

})

test('an inactive account is refused everywhere, including Preview and source read', async (t) => {
  const { connection, database, seedBuilderProject } = await setupBuilder(t, 'conexus_excision_dormant')
  const store = createBuilderStore({ database, ownerId: randomUUID() })
  const projectId = await seedBuilderProject('Dormant')
  const admits = () => store.admitSourceRevision({ accountId: ID.member, projectId, sourceRevision: BASE, readMain: async () => BASE })

  assert.equal(await admits(), true)
  await query(connection, 'UPDATE iam.account SET active = false WHERE account_id = $1', [ID.member])

  assert.equal(await admits(), false)
  assert.equal(await store.readPreviewSubject({ accountId: ID.member, projectId }), null)
  assert.equal(await store.readBuilderRun({ accountId: ID.member, projectId }), null)
  await assert.rejects(send(store, ID.member, projectId, 'one'), { id: 'ACCOUNT_INACTIVE' })
})

test('the runner refuses a database where PUBLIC may execute a Hub function', async (t) => {
  const { connection } = await buildHubDatabase(t, 'conexus_excision_public')

  // Held open only for this body: the fixture's DROP DATABASE WITH (FORCE) would otherwise
  // terminate it first and report a connection failure instead of the assertion.
  const client = new pg.Client(connection)
  await client.connect()
  try {
    await assertRoleInvariants(client)
    await client.query('GRANT EXECUTE ON FUNCTION iam.lock_administrators() TO PUBLIC')
    await assert.rejects(assertRoleInvariants(client),
      /MIGRATION_FUNCTION_PUBLIC_EXECUTE_REFUSED:iam\.lock_administrators\(\)/)
  } finally {
    await client.end()
  }
})
