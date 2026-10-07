import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { hubModuleUrl as built } from './hub-build.mjs'
import { query } from './hub-database.mjs'
import { setupBuilder } from './builder-fixture.mjs'
import { ID } from './project-fixture.mjs'

const { createBuilderStore } = await import(built('builder/store.js'))
const { createBuilderService } = await import(built('builder/service.js'))

const HOUR = 3_600_000
const HUB = '0f000000-0000-4000-8000-000000000a01'
const OTHER = '0f000000-0000-4000-8000-000000000a02'
const BASE = 'a'.repeat(40)
const signal = new AbortController().signal

// A database with one Workspace, the Builder's real store and a real service owned by HUB. A run the
// service works is held at its model check until the test lets it go, so it stays in the service's map.
const leaseHarness = async (t, name) => {
  const { connection: connectionString, database, seedBuilderProject, onCleanup } = await setupBuilder(t, name)
  const account = ID.owner
  const store = createBuilderStore({ database, ownerId: HUB })
  const holds = []
  const checkModel = () => new Promise((_resolve, reject) => { holds.push(reject) })
  const release = () => { for (const reject of holds.splice(0)) reject(new Error('released')) }
  // Stopped and closed before the database is dropped.
  const serviceOver = (over = store) => {
    const service = serviceFor(over)
    onCleanup(async () => { service.stopRuns(); release(); await service.close() })
    return service
  }
  const serviceFor = (over) => createBuilderService({
    store: over,
    registry: {},
    runs: {
      ports: { checkModel, log: () => {} },
      git: { readMain: async () => BASE, mainContains: async () => false },
      conversations: { ownerOf: async () => 'PROJECT' },
      source: {},
      appendDiagnostic: async () => {},
      publishRun: async () => {},
      questionWaitMs: 60_000,
      settleRetryMs: 1,
    },
  })
  const projectIn = () => seedBuilderProject(`p-${randomUUID().slice(0, 6)}`)
  // A run row as a stopped Hub left it, its heartbeat `heartbeatAgoMs` old.
  const seedRun = async ({ state = 'RUNNING', ownerId = null, heartbeatAgoMs = null, createdAgoMs = 0 }) => {
    const projectId = await projectIn()
    const builderRunId = randomUUID()
    await query(connectionString, `
      INSERT INTO builder.builder_run(builder_run_id, project_id, account_id, conversation_id, idempotency_digest, request_digest, base_source_revision, state, phase, started_at, owner_id, heartbeat_at, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CASE WHEN $8 = 'RUNNING' THEN clock_timestamp() END, $10,
        CASE WHEN $11::double precision IS NULL THEN NULL ELSE clock_timestamp() - make_interval(secs => $11::double precision / 1000.0) END,
        clock_timestamp() - make_interval(secs => $12::double precision / 1000.0))`,
    [builderRunId, projectId, account, randomUUID(), builderRunId.replaceAll('-', '').padEnd(64, '0'), 'f'.repeat(64), BASE, state, state === 'RUNNING' ? 'AGENT' : null, ownerId, heartbeatAgoMs, createdAgoMs])
    return { builderRunId, projectId }
  }
  const read = async ({ builderRunId }) =>
    (await query(connectionString, "SELECT state, owner_id, failure_code, (extract(epoch FROM clock_timestamp() - heartbeat_at) * 1000)::int AS beat_age_ms FROM builder.builder_run WHERE builder_run_id = $1", [builderRunId])).rows[0]
  const send = (service, projectId, conversationId, idempotencyKey = randomUUID()) =>
    service.sendBuilderMessage({ accountId: account, projectId, conversationId, idempotencyKey, content: 'Explique o app' })
  return { connectionString, store, serviceOver, projectIn, seedRun, read, send, holds }
}

test('a run the service works is never taken, however old its heartbeat; every other stale run is taken and settled', async (t) => {
  const h = await leaseHarness(t, 'conexus_lease_listed')
  const service = h.serviceOver()
  const projectId = await h.projectIn()
  const { builderRun } = await h.send(service, projectId, '22222222-2222-4222-8222-222222222222')
  await untilHeld(h)
  await query(h.connectionString, "UPDATE builder.builder_run SET heartbeat_at = clock_timestamp() - interval '1 hour' WHERE builder_run_id = $1", [builderRun.builderRunId])
  const foreign = await h.seedRun({ ownerId: OTHER, heartbeatAgoMs: HOUR })
  const lost = await h.seedRun({ ownerId: HUB, heartbeatAgoMs: HOUR })
  const fresh = await h.seedRun({ ownerId: OTHER, heartbeatAgoMs: 1_000 })

  await service.renewLease(signal)

  const live = await h.read(builderRun)
  assert.deepEqual([live.state, live.owner_id, live.beat_age_ms < 5_000], ['RUNNING', HUB, true], 'the listed run keeps its owner and its heartbeat is refreshed')
  const settled = async (run) => { const row = await h.read(run); return [row.state, row.failure_code] }
  assert.deepEqual(await settled(foreign), ['INTERRUPTED', 'HUB_RESTART'], 'a stale run of another owner is settled as a restart')
  assert.deepEqual(await settled(lost), ['FAILED', 'BUILDER_RUN_SETTLE_LOST'], 'a stale run of this Hub that it does not work lost its ending')
  const untouched = await h.read(fresh)
  assert.deepEqual([untouched.state, untouched.owner_id], ['RUNNING', OTHER], 'a fresh heartbeat of another owner is left alone')
})

test('a service with no run still takes and settles a stale run of another owner', async (t) => {
  const h = await leaseHarness(t, 'conexus_lease_empty')
  const service = h.serviceOver()
  const foreign = await h.seedRun({ ownerId: OTHER, heartbeatAgoMs: HOUR })
  await service.renewLease(signal)
  const row = await h.read(foreign)
  assert.deepEqual([row.state, row.failure_code], ['INTERRUPTED', 'HUB_RESTART'])
})

test('a queued run the caller lists stays queued and ownerless, however old, since no beat can touch it', async (t) => {
  const h = await leaseHarness(t, 'conexus_lease_queued')
  const queued = await h.seedRun({ state: 'QUEUED', createdAgoMs: HOUR })
  assert.deepEqual(await h.store.renewRunLease({ liveRunIds: [queued.builderRunId], staleAfterMs: 30_000 }), [])
  const row = await h.read(queued)
  assert.deepEqual([row.state, row.owner_id], ['QUEUED', null])
  assert.deepEqual((await h.store.renewRunLease({ liveRunIds: [], staleAfterMs: 30_000 })).map(({ builderRunId }) => builderRunId), [queued.builderRunId], 'unlisted, the same row is taken')
})

test('a run that enters the service after the pass listed its live runs comes back from the SQL and is not settled', async (t) => {
  const h = await leaseHarness(t, 'conexus_lease_race')
  // The client's retry of an old queued row: the same key returns it, and the service starts it.
  const projectId = await h.projectIn()
  const key = 'retry-key'
  const old = await h.store.createBuilderRun({ accountId: ID.owner, projectId, conversationId: '11111111-1111-4111-8111-111111111111', idempotencyKey: key, content: 'Explique o app', readBase: async () => BASE })
  await query(h.connectionString, "UPDATE builder.builder_run SET created_at = clock_timestamp() - interval '10 minutes' WHERE builder_run_id = $1", [old.builderRunId])
  let service
  // The pass reads its live ids (none), the SQL takes the stale row, and only then does the replay start it.
  const store = { ...h.store, renewRunLease: async (...args) => {
    const taken = await h.store.renewRunLease(...args)
    await h.send(service, projectId, '11111111-1111-4111-8111-111111111111', key)
    return taken
  } }
  service = h.serviceOver(store)

  await service.renewLease(signal)
  await untilHeld(h)

  const row = await h.read(old)
  assert.deepEqual([row.state, row.owner_id, row.failure_code], ['RUNNING', HUB, null], 'the replayed run was claimed and not interrupted by the pass')
})

test('a message to a conversation with a live run is refused to anyone who cannot build in the Project, before the run is reached', async (t) => {
  const h = await leaseHarness(t, 'conexus_send_admission')
  const service = h.serviceOver()
  const projectId = await h.projectIn()
  const { builderRun } = await h.send(service, projectId, '22222222-2222-4222-8222-222222222222')
  await untilHeld(h)
  await query(h.connectionString, "INSERT INTO iam.application(project_id, slug, created_by) VALUES ($1, 'atlas', $2)", [projectId, ID.owner])
  await query(h.connectionString, 'INSERT INTO iam.application_grant(project_id, account_id, granted_by) VALUES ($1, $2, $3)', [projectId, ID.outsider, ID.owner])
  await query(h.connectionString, 'DELETE FROM iam.workspace_membership WHERE account_id = $1', [ID.member])
  const refused = []
  for (const accountId of [ID.outsider, ID.member]) {
    refused.push(await service.sendBuilderMessage({ accountId, projectId, conversationId: '22222222-2222-4222-8222-222222222222', idempotencyKey: randomUUID(), content: 'oi' }).then(() => 'ACCEPTED', (error) => error.id))
  }
  assert.deepEqual(refused, ['PROJECT_NOT_FOUND', 'PROJECT_NOT_FOUND'])
  assert.deepEqual(service.pendingCalls(projectId, '22222222-2222-4222-8222-222222222222'), [])
  assert.equal((await h.read(builderRun)).state, 'RUNNING')
  assert.equal(h.holds.length, 1, 'the run was not touched')
})

test('a source read checks that the account sees the Project before it reads Git: a failing Git port answers 404 to a hidden or missing Project and the named 503 to a visible one', async (t) => {
  const h = await leaseHarness(t, 'conexus_source_order')
  const { Failure } = await import(built('platform/failure.js'))
  const service = createBuilderService({
    store: h.store,
    registry: {},
    runs: {
      ports: {},
      git: { readMain: async () => { throw new Failure('CONEXUS_GIT_FAILED') }, mainContains: async () => false },
      conversations: { ownerOf: async () => 'PROJECT' },
      source: {},
      appendDiagnostic: async () => {},
      publishRun: async () => {},
      questionWaitMs: 60_000,
    },
  })
  const projectId = await h.projectIn()
  const read = (accountId, id) => service.listSourceTree({ accountId, projectId: id, sourceRevision: 'c'.repeat(40) }).then(() => 'READ', (error) => [error.id, error.details?.reason ?? null])
  assert.deepEqual(await read(ID.owner, projectId), ['BUILDER_SOURCE_UNAVAILABLE', 'CONEXUS_GIT_FAILED'])
  assert.deepEqual(await read(ID.outsider, projectId), ['SOURCE_REVISION_NOT_FOUND', null])
  assert.deepEqual(await read(ID.owner, randomUUID()), ['SOURCE_REVISION_NOT_FOUND', null])
})

test('one pass beats the listed runs and takes the stale ones at one instant', async (t) => {
  const h = await leaseHarness(t, 'conexus_lease_instant')
  const listed = await h.seedRun({ ownerId: HUB, heartbeatAgoMs: HOUR })
  const stale = await h.seedRun({ ownerId: OTHER, heartbeatAgoMs: HOUR })
  const taken = await h.store.renewRunLease({ liveRunIds: [listed.builderRunId], staleAfterMs: 30_000 })
  assert.deepEqual(taken.map(({ builderRunId }) => builderRunId), [stale.builderRunId])
  const beats = (await query(h.connectionString, 'SELECT count(DISTINCT heartbeat_at)::integer AS instants FROM builder.builder_run WHERE builder_run_id = ANY($1)', [[listed.builderRunId, stale.builderRunId]])).rows
  assert.deepEqual(beats, [{ instants: 1 }])
})

const untilHeld = async (h) => { for (let i = 0; i < 400 && h.holds.length === 0; i++) await new Promise((wake) => { setTimeout(wake, 5) }) }
