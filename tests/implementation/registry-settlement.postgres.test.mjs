import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { OWNER } from './builder-fixture.mjs'
import { hubModuleUrl } from './hub-build.mjs'
import { query } from './hub-database.mjs'
import { PASSWORD, ID } from './project-fixture.mjs'
import { B, CURRENT_PIN, D_E, F, P, PNG_T2, SOURCE_E, deferred, world } from './registry-fixture.mjs'
import { waitUntilBackends, waitUntilBlocked } from './race.mjs'

const { createBuilderStore } = await import(hubModuleUrl('builder/store.js'))
const { settleTakenOverCandidate } = await import(hubModuleUrl('builder/run/admit.js'))

const pausingRetain = (registry, { reached, release }) => ({
  ...registry,
  retain: async (proof, sealed) => {
    const retained = await registry.retain(proof, sealed)
    reached.resolve()
    await release.promise
    return retained
  },
})

const pausingTransaction = (database, { reached, release }) => ({
  ...database,
  transaction: (accountId, work) => database.transaction(accountId, async (gate) => {
    const result = await work(gate)
    reached.resolve()
    await release.promise
    return result
  }),
})

const SUCCEEDED_WITH_POINTER = { state: 'SUCCEEDED', digest: D_E, source: SOURCE_E }

test('a cancellation request and a settlement race in both lock orders: the run ends SUCCEEDED with its pointer and neither deadlocks', async (t) => {
  const { connection, database, seedBuilderProject, registry, runFor, sealFor, runRow, pointer } = await world(t, 'conexus_settlement_cancel_race')
  const settleOf = (store, projectId, builderRunId) => store.settleBuilderRunBuild({ builderRunId, kind: 'BUILT', sealed: sealFor(projectId, builderRunId, [F]) })
  const outcome = async (projectId, builderRunId) => ({ state: (await runRow(builderRunId)).state, ...(({ digest, source }) => ({ digest, source }))(await pointer(projectId)) })

  const settlingFirst = await seedBuilderProject('Atlas', ID.workspace, P)
  const firstRun = await runFor(settlingFirst)
  const held = { reached: deferred(), release: deferred() }
  const holder = createBuilderStore({ database, ownerId: OWNER, registry: pausingRetain(registry, held) })
  const settling = settleOf(holder, settlingFirst, firstRun)
  await held.reached.promise
  const plain = createBuilderStore({ database, ownerId: OWNER, registry })
  const cancelling = plain.requestBuilderRunCancellation({ accountId: ID.owner, projectId: settlingFirst, builderRunId: firstRun })
  await waitUntilBlocked(connection)
  held.release.resolve()
  const first = await Promise.allSettled([settling, cancelling])
  assert.deepEqual(first.map((result) => result.status), ['fulfilled', 'fulfilled'])
  assert.deepEqual(await outcome(settlingFirst, firstRun), SUCCEEDED_WITH_POINTER)

  const cancellingFirst = await seedBuilderProject('Borealis', ID.workspace, B)
  const secondRun = await runFor(cancellingFirst)
  const pause = { reached: deferred(), release: deferred() }
  const canceller = createBuilderStore({ database: pausingTransaction(database, pause), ownerId: OWNER, registry })
  const cancel = canceller.requestBuilderRunCancellation({ accountId: ID.owner, projectId: cancellingFirst, builderRunId: secondRun })
  await pause.reached.promise
  const settle = settleOf(plain, cancellingFirst, secondRun)
  await waitUntilBlocked(connection)
  pause.release.resolve()
  const second = await Promise.allSettled([cancel, settle])
  assert.deepEqual(second.map((result) => result.status), ['fulfilled', 'fulfilled'])
  assert.deepEqual(await outcome(cancellingFirst, secondRun), SUCCEEDED_WITH_POINTER)
  assert.equal((await runRow(secondRun)).cancellation_requested, true)
})

test('a member removed after the candidate does not stop the settlement, and the Preview advances', async (t) => {
  const { connection, seedBuilderProject, runFor, settle, runRow, pointer } = await world(t, 'conexus_settlement_member_removed')
  const projectId = await seedBuilderProject('Atlas', ID.workspace, P)
  const builderRunId = await runFor(projectId, { accountId: ID.member })
  await query(connection, 'DELETE FROM iam.workspace_membership WHERE account_id = $1', [ID.member])
  await settle(projectId, builderRunId)
  assert.equal((await runRow(builderRunId)).state, 'SUCCEEDED')
  assert.equal((await pointer(projectId)).digest, D_E)
})

test('a deletion started while a run is RUNNING answers PROJECT_BUSY and the settlement commits', async (t) => {
  const { deletion, seedBuilderProject, runFor, settle, runRow, rows } = await world(t, 'conexus_settlement_busy')
  const projectId = await seedBuilderProject('Atlas', ID.workspace, P)
  const builderRunId = await runFor(projectId)
  await assert.rejects(deletion.deleteProject({ accountId: ID.owner, projectId, confirmName: 'Atlas' }), { id: 'PROJECT_BUSY' })
  await settle(projectId, builderRunId)
  assert.equal((await runRow(builderRunId)).state, 'SUCCEEDED')
  assert.deepEqual(await rows(projectId), { revisions: 1, thumbnails: 0 })
})

test('a deletion that meets a settlement in flight waits for it, then purges every registry row, and neither deadlocks', async (t) => {
  const { connection, database, seedBuilderProject, registry, deletion, runFor, sealFor, runRow, rows } = await world(t, 'conexus_settlement_purge_race')
  const projectId = await seedBuilderProject('Atlas', ID.workspace, P)
  const builderRunId = await runFor(projectId)
  const held = { reached: deferred(), release: deferred() }
  const holder = createBuilderStore({ database, ownerId: OWNER, registry: pausingRetain(registry, held) })
  const settling = holder.settleBuilderRunBuild({ builderRunId, kind: 'BUILT', sealed: sealFor(projectId, builderRunId, [F], { thumbnail: { bytes: PNG_T2 } }) })
  await held.reached.promise
  const deleting = deletion.deleteProject({ accountId: ID.owner, projectId, confirmName: 'Atlas' })
  await waitUntilBlocked(connection)
  held.release.resolve()
  const results = await Promise.allSettled([settling, deleting])
  assert.deepEqual(results.map((result) => result.status), ['fulfilled', 'fulfilled'])
  assert.deepEqual(await rows(projectId), { revisions: 0, thumbnails: 0 })
  assert.equal(await runRow(builderRunId), undefined)
})

test('a settlement that arrives after the purge is refused and leaves no registry row', async (t) => {
  const { deletion, seedBuilderProject, runFor, settle, rows } = await world(t, 'conexus_settlement_after_purge')
  const projectId = await seedBuilderProject('Atlas', ID.workspace, P)
  const builderRunId = await runFor(projectId, { state: 'INTERRUPTED' })
  await deletion.deleteProject({ accountId: ID.owner, projectId, confirmName: 'Atlas' })
  await assert.rejects(settle(projectId, builderRunId), { id: 'BUILDER_RUN_TRANSITION_REFUSED' })
  assert.deepEqual(await rows(projectId), { revisions: 0, thumbnails: 0 })
})

async function backendCount(connection) {
  const rows = await query(connection, "SELECT count(*)::integer AS n FROM pg_stat_activity WHERE datname = $1 AND usename = 'hub_runtime'", [connection.database])
  return rows.rows[0].n
}

test('a process killed after the runner and before the commit leaves nothing, and the takeover ends the run FAILED with the last Preview kept', async (t) => {
  const { connection, database, onCleanup, seedBuilderProject, registry, runFor, runRow, rows, pointer } = await world(t, 'conexus_settlement_crash')
  const projectId = await seedBuilderProject('Atlas', ID.workspace, P)
  const builderRunId = await runFor(projectId)
  const directory = mkdtempSync(resolve(tmpdir(), 's1-crash-'))
  onCleanup(() => rmSync(directory, { recursive: true, force: true }))
  const passwordFile = resolve(directory, 'password')
  writeFileSync(passwordFile, PASSWORD)
  chmodSync(passwordFile, 0o600)
  const backendsBefore = await backendCount(connection)
  const child = spawnSync(process.execPath, [resolve(import.meta.dirname, 'registry-crash-child.mjs')], {
    env: { ...process.env, CRASH_INPUT: JSON.stringify({
      connection: { host: connection.host, port: connection.port, database: connection.database },
      passwordFile,
      ownerId: OWNER,
      build: { projectId, executionId: builderRunId, sourceRevision: SOURCE_E, templateRef: CURRENT_PIN.templateRef, recipeSha256: CURRENT_PIN.recipeSha256 },
      fileSha256: F.sha256,
      thumbnail: [...PNG_T2],
    }) },
    encoding: 'utf8',
  })
  assert.equal(child.signal, 'SIGKILL', child.stderr)
  assert.equal((await runRow(builderRunId)).state, 'RUNNING')
  assert.deepEqual(await rows(projectId), { revisions: 0, thumbnails: 0 })
  assert.deepEqual(await pointer(projectId), { source: null, revision: null, digest: null })

  await waitUntilBackends(connection, { role: 'hub_runtime', count: backendsBefore })
  const sweeper = createBuilderStore({ database, ownerId: '0f000000-0000-4000-8000-000000000001', registry })
  const taken = await sweeper.renewRunLease({ liveRunIds: [], staleAfterMs: 0 })
  assert.deepEqual(taken.map((run) => run.builderRunId), [builderRunId])
  await settleTakenOverCandidate({ store: sweeper, git: { mainContains: async () => true } }, { ...taken[0], candidateRevision: SOURCE_E })
  const ended = await runRow(builderRunId)
  assert.deepEqual([ended.state, ended.result_kind, ended.failure_code], ['FAILED', 'SOURCE_CHANGED_BUILD_FAILED', 'BUILDER_PREVIEW_NOT_BUILT'])
  assert.deepEqual(await rows(projectId), { revisions: 0, thumbnails: 0 })
  assert.deepEqual(await pointer(projectId), { source: null, revision: null, digest: null })
})

test('a failure after the revision insert, or after the thumbnail insert, rolls the whole settlement back', async (t) => {
  const { connection, seedBuilderProject, runFor, settle, runRow, rows, pointer } = await world(t, 'conexus_settlement_rollback')
  const projectId = await seedBuilderProject('Atlas', ID.workspace, P)
  await query(connection, `CREATE FUNCTION public.refuse_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'INJECTED_FAULT'; END $$`)
  for (const [table, source] of [['reg.artifact_revision', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'], ['reg.application_thumbnail', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb']]) {
    await query(connection, `CREATE CONSTRAINT TRIGGER injected AFTER INSERT ON ${table} DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION public.refuse_insert()`)
    const builderRunId = await runFor(projectId, { candidate: source, result: source })
    await assert.rejects(settle(projectId, builderRunId, [F], { sourceRevision: source, thumbnail: { bytes: PNG_T2 } }), (error) => /INJECTED_FAULT/.test(String(error.cause?.message ?? error.message)), table)
    assert.deepEqual(await rows(projectId), { revisions: 0, thumbnails: 0 }, table)
    assert.deepEqual(await pointer(projectId), { source: null, revision: null, digest: null }, table)
    assert.equal((await runRow(builderRunId)).state, 'RUNNING', table)
    await query(connection, `DROP TRIGGER injected ON ${table}`)
    await query(connection, "UPDATE builder.builder_run SET state = 'FAILED', result_kind = NULL, failure_code = 'INTERNAL_UNEXPECTED', finished_at = now() WHERE builder_run_id = $1", [builderRunId])
  }
})

test('a thumbnail of 512000 bytes is retained and one of 512001 bytes is dropped while the build still settles', async (t) => {
  const { seedBuilderProject, runFor, settle, runRow, rows } = await world(t, 'conexus_settlement_thumbnail_edges')
  const png = (length) => Uint8Array.from({ length }, (_, index) => PNG_T2[index] ?? 0)
  const kept = await seedBuilderProject('Atlas', ID.workspace, P)
  const keptRun = await runFor(kept)
  await settle(kept, keptRun, [F], { thumbnail: { bytes: png(512000) } })
  const dropped = await seedBuilderProject('Borealis', ID.workspace, B)
  const droppedRun = await runFor(dropped)
  await settle(dropped, droppedRun, [F], { thumbnail: { bytes: png(512001) } })
  assert.deepEqual([await rows(kept), await rows(dropped)], [{ revisions: 1, thumbnails: 1 }, { revisions: 1, thumbnails: 0 }])
  assert.deepEqual([(await runRow(keptRun)).state, (await runRow(droppedRun)).state], ['SUCCEEDED', 'SUCCEEDED'])
})
