import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { hubModuleUrl as built } from './hub-build.mjs'
import { buildHubDatabase, query, testPool } from './hub-database.mjs'

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
  const { connectionString, connection, onCleanup } = await buildHubDatabase(t, name)
  const account = randomUUID()
  const workspaceId = randomUUID()
  await query(connectionString, "INSERT INTO iam.account(account_id, issuer, external_subject, display_name) VALUES ($1, 'https://lease.test', $2, 'Owner')", [account, account])
  await query(connectionString, "INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1, 'Lease')", [workspaceId])
  await query(connectionString, "INSERT INTO iam.workspace_membership(account_id, workspace_id, role) VALUES ($1, $2, 'owner')", [account, workspaceId])
  const store = createBuilderStore({
    executorPool: testPool({ ...connection, max: 4, options: '-c role=hub_builder_executor' }),
    ingressPool: testPool({ ...connection, max: 2, options: '-c role=hub_builder_ingress' }),
  })
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
    applicationArtifacts: {},
    runs: {
      ports: { checkModel, log: () => {} },
      git: { readMain: async () => BASE, mainContains: async () => false },
      conversations: { ownerOf: async () => 'PROJECT' },
      source: {},
      appendDiagnostic: async () => {},
      publishRun: async () => {},
      questionWaitMs: 60_000,
      settleRetryMs: 1,
      ownerId: HUB,
    },
  })
  const projectIn = async () => {
    const projectId = randomUUID()
    await query(connectionString, "INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision) VALUES ($1, $2, $3, 'NEW', $4, $3)", [projectId, workspaceId, `p-${projectId.slice(0, 6)}`, BASE])
    await query(connectionString, 'SELECT builder.register_project_repository($1)', [projectId])
    return projectId
  }
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
  const { builderRun } = await h.send(service, projectId, 'conv-live')
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
  assert.deepEqual(await h.store.renewRunLease(HUB, [queued.builderRunId], 30_000), [])
  const row = await h.read(queued)
  assert.deepEqual([row.state, row.owner_id], ['QUEUED', null])
  assert.deepEqual((await h.store.renewRunLease(HUB, [], 30_000)).map(({ builderRunId }) => builderRunId), [queued.builderRunId], 'unlisted, the same row is taken')
})

test('a run that enters the service after the pass listed its live runs comes back from the SQL and is not settled', async (t) => {
  const h = await leaseHarness(t, 'conexus_lease_race')
  // The client's retry of an old queued row: the same key returns it, and the service starts it.
  const projectId = await h.projectIn()
  const key = 'retry-key'
  const old = await h.store.createBuilderRun({ accountId: (await query(h.connectionString, 'SELECT account_id FROM iam.account LIMIT 1')).rows[0].account_id, projectId, conversationId: 'conv-race', idempotencyKey: key, content: 'Explique o app', readBase: async () => BASE })
  await query(h.connectionString, "UPDATE builder.builder_run SET created_at = clock_timestamp() - interval '10 minutes' WHERE builder_run_id = $1", [old.builderRunId])
  let service
  // The pass reads its live ids (none), the SQL takes the stale row, and only then does the replay start it.
  const store = { ...h.store, renewRunLease: async (...args) => {
    const taken = await h.store.renewRunLease(...args)
    await h.send(service, projectId, 'conv-race', key)
    return taken
  } }
  service = h.serviceOver(store)

  await service.renewLease(signal)
  await untilHeld(h)

  const row = await h.read(old)
  assert.deepEqual([row.state, row.owner_id, row.failure_code], ['RUNNING', HUB, null], 'the replayed run was claimed and not interrupted by the pass')
})

const untilHeld = async (h) => { for (let i = 0; i < 400 && h.holds.length === 0; i++) await new Promise((wake) => { setTimeout(wake, 5) }) }
