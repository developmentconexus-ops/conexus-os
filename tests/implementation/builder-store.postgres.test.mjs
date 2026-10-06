import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import pg from 'pg'
import { z } from 'zod'
import { hubModuleUrl } from './hub-build.mjs'
import { loginPoolOf, query } from './hub-database.mjs'
import { OWNER, setupBuilder } from './builder-fixture.mjs'
import { HEAD, ID } from './project-fixture.mjs'
import { waitUntilBlocked } from './race.mjs'

const { createBuilderStore } = await import(hubModuleUrl('builder/store.js'))
const { purgeProjectBuilder } = await import(hubModuleUrl('builder/project-ports.js'))
const { admitAccount, admitSystem } = await import(hubModuleUrl('identity-access/admission.js'))
const { sql } = await import(hubModuleUrl('platform/db.js'))

const CANDIDATE = 'b'.repeat(40)
const OTHER = 'c'.repeat(40)
const TEXT = 'Crie um contador até 100'
const pending = (promise) => {
  const state = { settled: false }
  promise.then(() => { state.settled = true }, () => { state.settled = true })
  return state
}

// The columns a test is about, read once from the row and compared with a literal.
const fields = (actual, ...keys) => Object.fromEntries(keys.map((key) => [key, actual[key]]))

const harness = async (t, name) => {
  const fixture = await setupBuilder(t, name)
  const store = createBuilderStore({ database: fixture.database, ownerId: OWNER })
  const start = (projectId, { accountId = ID.owner, key = randomUUID(), content = TEXT, conversationId = '33333333-3333-4333-8333-333333333333', readBase = async () => HEAD } = {}) =>
    store.createBuilderRun({ accountId, projectId, conversationId, idempotencyKey: key, content, readBase })
  const row = async (builderRunId) => (await query(fixture.connection, `SELECT state, phase, owner_id, failure_code, result_kind, candidate_revision, result_source_revision, sandbox_id, trigger_message_id,
    cancellation_requested_at IS NOT NULL AS cancellation_requested, cancellation_reason, finished_at IS NOT NULL AS finished FROM builder.builder_run WHERE builder_run_id = $1`, [builderRunId])).rows[0]
  const working = async (projectId) => (await query(fixture.connection, `SELECT current_state, last_preview_source_revision, last_preview_artifact_revision_id, last_preview_artifact_digest
    FROM builder.project_working_state WHERE project_id = $1`, [projectId])).rows[0]
  const running = async (projectId, options) => {
    const created = await start(projectId, options)
    await store.claimBuilderRun({ builderRunId: created.builderRunId })
    return created.builderRunId
  }
  return { ...fixture, store, start, row, working, running }
}

test('a run start records the base the Hub read while holding the Project, replays by key and keeps one open run per Project', async (t) => {
  const { connection, store, start, seedBuilderProject } = await harness(t, 'conexus_builder_start')
  const projectId = await seedBuilderProject('Atlas')
  const created = await start(projectId, { key: 'k' })
  assert.deepEqual({ state: created.state, phase: created.phase, baseSourceRevision: created.baseSourceRevision, requestText: created.requestText, resultKind: created.resultKind, cancellationRequested: created.cancellationRequested },
    { state: 'QUEUED', phase: null, baseSourceRevision: HEAD, requestText: TEXT, resultKind: null, cancellationRequested: false })
  assert.equal((await query(connection, 'SELECT request_text FROM builder.builder_run WHERE builder_run_id = $1', [created.builderRunId])).rows[0].request_text, TEXT)
  assert.equal((await start(projectId, { key: 'k' })).builderRunId, created.builderRunId)
  await assert.rejects(start(projectId, { key: 'k', content: 'Outro pedido' }), { id: 'IDEMPOTENCY_CONFLICT' })
  await assert.rejects(start(projectId, { key: 'k', conversationId: '44444444-4444-4444-8444-444444444444' }), { id: 'IDEMPOTENCY_CONFLICT' })
  await assert.rejects(start(projectId, { key: 'other' }), { id: 'PROJECT_BUSY' })
  const elsewhere = await start(await seedBuilderProject('Borealis'), { key: 'k' })
  assert.notEqual(elsewhere.builderRunId, created.builderRunId)

  await store.requestBuilderRunCancellation({ accountId: ID.owner, projectId, builderRunId: created.builderRunId })
  assert.equal((await start(projectId, { key: 'k' })).state, 'INTERRUPTED', 'a replay answers the run as it stands')
  assert.equal((await start(projectId, { key: 'next' })).state, 'QUEUED', 'a closed run frees the Project')
})

test('a run start refuses an outsider, an inactive account and a Project without its Builder rows', async (t) => {
  const { connection, store, start, seedBuilderProject, seedProject } = await harness(t, 'conexus_builder_start_refused')
  const projectId = await seedBuilderProject('Atlas')
  await assert.rejects(start(projectId, { accountId: ID.outsider }), { id: 'PROJECT_BUILD_DENIED' })
  await assert.rejects(start(projectId, { accountId: ID.administrator }), { id: 'PROJECT_BUILD_DENIED' })
  const bare = await seedProject('Bare')
  await query(connection, 'DELETE FROM builder.project_repository WHERE project_id = $1', [bare])
  await assert.rejects(start(bare), (error) => error.id === 'INTERNAL_UNEXPECTED' && error.details.invariant === 'BUILDER_PROJECT_ROWS_MISSING')
  await query(connection, 'UPDATE iam.account SET active = false WHERE account_id = $1', [ID.member])
  await assert.rejects(start(projectId, { accountId: ID.member }), { id: 'ACCOUNT_INACTIVE' })
  assert.equal((await query(connection, 'SELECT count(*)::integer AS count FROM builder.builder_run')).rows[0].count, 0)
  assert.equal(await store.readBuilderRun({ accountId: ID.owner, projectId }), null)
})

test('two starts with one key make one run, and a start that holds the Project makes the next wait for it', async (t) => {
  const { connection, start, seedBuilderProject } = await harness(t, 'conexus_builder_start_race')
  const same = await seedBuilderProject('Same')
  const [a, b] = await Promise.all([start(same, { key: 'k' }), start(same, { key: 'k' })])
  assert.equal(a.builderRunId, b.builderRunId)
  assert.equal((await query(connection, 'SELECT count(*)::integer AS count FROM builder.builder_run WHERE project_id = $1', [same])).rows[0].count, 1)

  const held = await seedBuilderProject('Held')
  let release
  const gate = new Promise((resolve) => { release = resolve })
  let entered
  const reading = new Promise((resolve) => { entered = resolve })
  const first = start(held, { key: 'one', readBase: async () => { entered(); await gate; return HEAD } })
  await reading
  const second = start(held, { key: 'two' })
  const secondState = pending(second)
  second.catch(() => undefined)
  await waitUntilBlocked(connection)
  assert.equal(secondState.settled, false)
  release()
  assert.equal((await first).state, 'QUEUED')
  await assert.rejects(second, { id: 'PROJECT_BUSY' })
})

test('cancelling a queued run closes it, cancelling a running run marks it, and cancelling twice keeps the first mark', async (t) => {
  const { connection, store, start, running, row, seedBuilderProject } = await harness(t, 'conexus_builder_cancel')
  const queued = await start(await seedBuilderProject('Queued'))
  const cancelledQueued = await store.requestBuilderRunCancellation({ accountId: ID.owner, projectId: queued.projectId, builderRunId: queued.builderRunId })
  assert.deepEqual({ state: cancelledQueued.state, phase: cancelledQueued.phase, cancellationRequested: cancelledQueued.cancellationRequested }, { state: 'INTERRUPTED', phase: null, cancellationRequested: true })
  assert.equal((await row(queued.builderRunId)).cancellation_reason, 'USER_CANCELLED')

  const projectId = await seedBuilderProject('Running')
  const builderRunId = await running(projectId)
  await store.setBuilderRunPhase({ builderRunId, phase: 'AGENT', actor: { via: 'executor' } })
  const mark = await store.requestBuilderRunCancellation({ accountId: ID.owner, projectId, builderRunId })
  assert.deepEqual({ state: mark.state, phase: mark.phase, cancellationRequested: mark.cancellationRequested }, { state: 'RUNNING', phase: null, cancellationRequested: true })
  const stamp = async () => (await query(connection, 'SELECT cancellation_requested_at::text AS stamped, cancellation_reason FROM builder.builder_run WHERE builder_run_id = $1', [builderRunId])).rows[0]
  const first = await stamp()
  await store.requestBuilderRunCancellation({ accountId: ID.owner, projectId, builderRunId })
  assert.deepEqual(await stamp(), { stamped: first.stamped, cancellation_reason: 'USER_CANCELLED' }, 'the first mark stays')
  assert.equal(await store.setBuilderRunPhase({ builderRunId, phase: 'AGENT', actor: { via: 'executor' } }), null, 'a requested stop refuses the next phase')

  await assert.rejects(store.requestBuilderRunCancellation({ accountId: ID.member, projectId, builderRunId }), { id: 'BUILDER_RUN_NOT_FOUND' })
  await assert.rejects(store.requestBuilderRunCancellation({ accountId: ID.owner, projectId, builderRunId: randomUUID() }), { id: 'BUILDER_RUN_NOT_FOUND' })
  await assert.rejects(store.requestBuilderRunCancellation({ accountId: ID.outsider, projectId, builderRunId }), { id: 'PROJECT_BUILD_DENIED' })
})

test('every exit from RUNNING leaves a null phase, a response ends as RESPONSE_ONLY and a build failure keeps the last Preview', async (t) => {
  const { connection, store, running, row, working, seedBuilderProject } = await harness(t, 'conexus_builder_phase')
  const executor = { via: 'executor' }
  const failing = await running(await seedBuilderProject('Failing'))
  assert.equal((await store.setBuilderRunPhase({ builderRunId: failing, phase: 'AGENT', actor: executor })).phase, 'AGENT')
  assert.equal((await row(failing)).phase, 'AGENT')
  await store.failBuilderRun({ builderRunId: failing, failureCode: 'BUILDER_SOURCE_ADMISSION_FAILED' })
  assert.deepEqual(fields(await row(failing), 'state', 'phase', 'failure_code', 'finished'), { state: 'FAILED', phase: null, failure_code: 'BUILDER_SOURCE_ADMISSION_FAILED', finished: true })

  const interrupted = await running(await seedBuilderProject('Interrupted'))
  await store.setBuilderRunPhase({ builderRunId: interrupted, phase: 'WAITING', actor: executor })
  await store.interruptBuilderRun({ builderRunId: interrupted, failureCode: 'BUILDER_QUESTION_EXPIRED' })
  assert.deepEqual(fields(await row(interrupted), 'state', 'phase', 'failure_code', 'cancellation_reason', 'finished'), { state: 'INTERRUPTED', phase: null, failure_code: 'BUILDER_QUESTION_EXPIRED', cancellation_reason: 'BUILDER_QUESTION_EXPIRED', finished: true })

  const responseOnly = await running(await seedBuilderProject('Response'))
  await store.setBuilderRunPhase({ builderRunId: responseOnly, phase: 'AGENT', actor: executor })
  await store.settleBuilderRun({ builderRunId: responseOnly })
  assert.deepEqual(fields(await row(responseOnly), 'state', 'phase', 'result_kind', 'result_source_revision', 'finished'), { state: 'SUCCEEDED', phase: null, result_kind: 'RESPONSE_ONLY', result_source_revision: null, finished: true })

  const projectId = await seedBuilderProject('Built')
  const preview = { revision: randomUUID(), digest: 'd'.repeat(64) }
  await query(connection, "UPDATE builder.project_working_state SET current_state = 'PREVIEW_READY', last_preview_source_revision = $2, last_preview_artifact_revision_id = $3, last_preview_artifact_digest = $4 WHERE project_id = $1", [projectId, HEAD, preview.revision, preview.digest])
  const built = await running(projectId)
  await store.recordBuilderRunCandidate({ builderRunId: built, accountId: ID.owner, sourceRevision: CANDIDATE })
  assert.equal((await row(built)).phase, 'SOURCE_ADMISSION')
  await store.advanceBuilderRunSource({ builderRunId: built, sourceRevision: CANDIDATE })
  await store.settleBuilderRunBuild({ kind: 'FAILED', builderRunId: built, sourceRevision: CANDIDATE, failureCode: 'BUILDER_PREVIEW_NOT_BUILT' })
  assert.deepEqual(fields(await row(built), 'state', 'phase', 'result_kind', 'result_source_revision', 'failure_code', 'finished'), { state: 'FAILED', phase: null, result_kind: 'SOURCE_CHANGED_BUILD_FAILED', result_source_revision: CANDIDATE, failure_code: 'BUILDER_PREVIEW_NOT_BUILT', finished: true })
  assert.deepEqual(await working(projectId), { current_state: 'BUILD_FAILED', last_preview_source_revision: HEAD, last_preview_artifact_revision_id: preview.revision, last_preview_artifact_digest: preview.digest })
})

test('every ending writes the same final columns once: state, null phase, result, failure and finish time, and a stop keeps the first cancellation mark', async (t) => {
  const { store, running, start, row, seedBuilderProject } = await harness(t, 'conexus_builder_end_run')
  const columns = ['state', 'phase', 'result_kind', 'failure_code', 'cancellation_reason', 'finished']
  const ended = async (builderRunId) => fields(await row(builderRunId), ...columns)

  const response = await running(await seedBuilderProject('Response'))
  await store.settleBuilderRun({ builderRunId: response })
  assert.deepEqual(await ended(response), { state: 'SUCCEEDED', phase: null, result_kind: 'RESPONSE_ONLY', failure_code: null, cancellation_reason: null, finished: true })

  const failedRun = await running(await seedBuilderProject('Failed'))
  await store.failBuilderRun({ builderRunId: failedRun, failureCode: 'BUILDER_CHECK_FAILED' })
  assert.deepEqual(await ended(failedRun), { state: 'FAILED', phase: null, result_kind: null, failure_code: 'BUILDER_CHECK_FAILED', cancellation_reason: null, finished: true })

  const stopProject = await seedBuilderProject('Stopped')
  const stopped = await running(stopProject)
  await store.requestBuilderRunCancellation({ accountId: ID.owner, projectId: stopProject, builderRunId: stopped })
  await store.interruptBuilderRun({ builderRunId: stopped, failureCode: 'HUB_RESTART' })
  assert.deepEqual(await ended(stopped), { state: 'INTERRUPTED', phase: null, result_kind: null, failure_code: 'HUB_RESTART', cancellation_reason: 'USER_CANCELLED', finished: true }, 'the first cancellation reason stays')

  const queuedProject = await seedBuilderProject('Queued')
  const queued = await start(queuedProject)
  await store.requestBuilderRunCancellation({ accountId: ID.owner, projectId: queuedProject, builderRunId: queued.builderRunId })
  assert.deepEqual(await ended(queued.builderRunId), { state: 'INTERRUPTED', phase: null, result_kind: null, failure_code: 'USER_CANCELLED', cancellation_reason: 'USER_CANCELLED', finished: true })

  await assert.rejects(store.failBuilderRun({ builderRunId: failedRun, failureCode: 'BUILDER_CHECK_FAILED' }), { id: 'BUILDER_RUN_NOT_ADMITTED' })
  assert.equal((await ended(failedRun)).state, 'FAILED', 'an ended run is not ended again')
})

test('a run records one candidate, advances only to it, settles as a response only without one, and records each payer once', async (t) => {
  const { connection, store, running, row, seedBuilderProject } = await harness(t, 'conexus_builder_steps')
  const projectId = await seedBuilderProject('Atlas')
  const builderRunId = await running(projectId)
  assert.equal((await row(builderRunId)).state, 'RUNNING')
  await assert.rejects(store.claimBuilderRun({ builderRunId }), { id: 'BUILDER_RUN_NOT_ADMITTED' })

  await store.bindBuilderRunMessage({ builderRunId, projectId, accountId: ID.owner, messageId: 'mastra-message-1' })
  await store.bindBuilderRunMessage({ builderRunId, projectId, accountId: ID.owner, messageId: 'mastra-message-1' })
  await assert.rejects(store.bindBuilderRunMessage({ builderRunId, projectId, accountId: ID.owner, messageId: 'other' }), { id: 'BUILDER_RUN_TRANSITION_REFUSED', details: { transition: 'message bind' } })
  await store.bindBuilderRunSandbox({ builderRunId, sandboxId: 'sandbox-1' })
  await assert.rejects(store.bindBuilderRunSandbox({ builderRunId, sandboxId: 'sandbox-2' }), { id: 'BUILDER_RUN_TRANSITION_REFUSED', details: { transition: 'sandbox bind' } })

  const payer = randomUUID()
  const otherPayer = randomUUID()
  for (const modelAccountId of [payer, payer, otherPayer]) await store.recordBuilderRunModelAccount({ builderRunId, accountId: ID.owner, modelAccountId })
  assert.deepEqual((await query(connection, 'SELECT model_account_id FROM builder.builder_run_model_account WHERE builder_run_id = $1 ORDER BY model_account_id', [builderRunId])).rows.map((entry) => entry.model_account_id), [payer, otherPayer].sort())

  await assert.rejects(store.advanceBuilderRunSource({ builderRunId, sourceRevision: CANDIDATE }), { id: 'BUILDER_RUN_TRANSITION_REFUSED', details: { transition: 'source settlement' } })
  await store.recordBuilderRunCandidate({ builderRunId, accountId: ID.owner, sourceRevision: CANDIDATE })
  await store.recordBuilderRunCandidate({ builderRunId, accountId: ID.owner, sourceRevision: CANDIDATE })
  await assert.rejects(store.recordBuilderRunCandidate({ builderRunId, accountId: ID.owner, sourceRevision: OTHER }), { id: 'BUILDER_RUN_TRANSITION_REFUSED', details: { transition: 'candidate' } })
  await assert.rejects(store.settleBuilderRun({ builderRunId }), { id: 'BUILDER_RUN_TRANSITION_REFUSED', details: { transition: 'settlement' } })
  await assert.rejects(store.advanceBuilderRunSource({ builderRunId, sourceRevision: OTHER }), { id: 'BUILDER_RUN_TRANSITION_REFUSED', details: { transition: 'source settlement' } })
  await store.advanceBuilderRunSource({ builderRunId, sourceRevision: CANDIDATE })
  await store.advanceBuilderRunSource({ builderRunId, sourceRevision: CANDIDATE })
  await assert.rejects(store.settleBuilderRunBuild({ kind: 'FAILED', builderRunId, sourceRevision: OTHER, failureCode: 'BUILDER_PREVIEW_NOT_BUILT' }), { id: 'BUILDER_RUN_TRANSITION_REFUSED', details: { transition: 'build settlement' } })
  await store.settleBuilderRunBuild({ kind: 'FAILED', builderRunId, sourceRevision: CANDIDATE, failureCode: 'BUILDER_PREVIEW_NOT_BUILT' })
  assert.deepEqual(fields(await row(builderRunId), 'state', 'trigger_message_id', 'sandbox_id', 'candidate_revision', 'result_source_revision'), { state: 'FAILED', trigger_message_id: 'mastra-message-1', sandbox_id: 'sandbox-1', candidate_revision: CANDIDATE, result_source_revision: CANDIDATE })
  await assert.rejects(store.recordBuilderRunModelAccount({ builderRunId, accountId: ID.owner, modelAccountId: payer }), { id: 'BUILDER_RUN_NOT_ADMITTED' })
})

test('removing the author before the candidate refuses the write and leaves the run as it was, while the executor still settles', async (t) => {
  const { connection, store, running, row, seedBuilderProject } = await harness(t, 'conexus_builder_revoked')
  const projectId = await seedBuilderProject('Atlas')
  const builderRunId = await running(projectId, { accountId: ID.member })
  await query(connection, 'DELETE FROM iam.workspace_membership WHERE account_id = $1', [ID.member])
  const before = await row(builderRunId)
  await assert.rejects(store.recordBuilderRunCandidate({ builderRunId, accountId: ID.member, sourceRevision: CANDIDATE }), { id: 'PROJECT_BUILD_DENIED' })
  assert.deepEqual(await row(builderRunId), before)
  await store.settleBuilderRun({ builderRunId })
  assert.equal((await row(builderRunId)).state, 'SUCCEEDED')
})

test('a queued run ends unclaimed only while still queued and unowned, and a claim by a removed author never reaches RUNNING', async (t) => {
  const { connection, store, start, row, seedBuilderProject } = await harness(t, 'conexus_builder_unclaimed')
  const lost = await start(await seedBuilderProject('Lost'))
  await store.endUnclaimedBuilderRun({ builderRunId: lost.builderRunId, projectId: lost.projectId, ending: { state: 'FAILED', resultKind: null, failureCode: 'BUILDER_RUN_NOT_ADMITTED' } })
  assert.deepEqual(fields(await row(lost.builderRunId), 'state', 'failure_code', 'phase', 'finished'), { state: 'FAILED', failure_code: 'BUILDER_RUN_NOT_ADMITTED', phase: null, finished: true })

  const cancelled = await start(await seedBuilderProject('Cancelled'))
  await store.requestBuilderRunCancellation({ accountId: ID.owner, projectId: cancelled.projectId, builderRunId: cancelled.builderRunId })
  await store.endUnclaimedBuilderRun({ builderRunId: cancelled.builderRunId, projectId: cancelled.projectId, ending: { state: 'FAILED', resultKind: null, failureCode: 'BUILDER_RUN_NOT_ADMITTED' } })
  assert.deepEqual(fields(await row(cancelled.builderRunId), 'state', 'failure_code', 'finished'), { state: 'INTERRUPTED', failure_code: 'USER_CANCELLED', finished: true })

  const stopped = await start(await seedBuilderProject('Stopped'))
  await store.endUnclaimedBuilderRun({ builderRunId: stopped.builderRunId, projectId: stopped.projectId, ending: { state: 'INTERRUPTED', resultKind: null, failureCode: 'HUB_RESTART' } })
  assert.deepEqual(fields(await row(stopped.builderRunId), 'state', 'phase', 'failure_code', 'cancellation_requested', 'cancellation_reason', 'finished'), { state: 'INTERRUPTED', phase: null, failure_code: 'HUB_RESTART', cancellation_requested: true, cancellation_reason: 'HUB_RESTART', finished: true })

  const claimed = await start(await seedBuilderProject('Claimed'))
  await store.claimBuilderRun({ builderRunId: claimed.builderRunId })
  await store.endUnclaimedBuilderRun({ builderRunId: claimed.builderRunId, projectId: claimed.projectId, ending: { state: 'FAILED', resultKind: null, failureCode: 'BUILDER_RUN_NOT_ADMITTED' } })
  await store.endUnclaimedBuilderRun({ builderRunId: claimed.builderRunId, projectId: claimed.projectId, ending: { state: 'INTERRUPTED', resultKind: null, failureCode: 'HUB_RESTART' } })
  assert.equal((await row(claimed.builderRunId)).state, 'RUNNING', 'zero rows changed')

  const revoked = await start(await seedBuilderProject('Revoked'), { accountId: ID.member })
  await query(connection, 'DELETE FROM iam.workspace_membership WHERE account_id = $1', [ID.member])
  await assert.rejects(store.claimBuilderRun({ builderRunId: revoked.builderRunId }), { id: 'BUILDER_RUN_NOT_ADMITTED' })
  assert.equal((await row(revoked.builderRunId)).state, 'QUEUED')
})

test('a claim and a cancellation race to one terminal row without a deadlock', async (t) => {
  const { store, start, row, seedBuilderProject } = await harness(t, 'conexus_builder_claim_race')
  for (const name of ['One', 'Two', 'Three']) {
    const created = await start(await seedBuilderProject(name))
    const outcomes = await Promise.allSettled([
      store.claimBuilderRun({ builderRunId: created.builderRunId }),
      store.requestBuilderRunCancellation({ accountId: ID.owner, projectId: created.projectId, builderRunId: created.builderRunId }),
    ])
    assert.deepEqual(outcomes.filter((outcome) => outcome.status === 'rejected').map((outcome) => outcome.reason.id).filter((id) => id !== 'BUILDER_RUN_NOT_ADMITTED'), [])
    const settled = await row(created.builderRunId)
    assert.ok(['INTERRUPTED', 'RUNNING'].includes(settled.state), settled.state)
    assert.equal(settled.cancellation_requested, true)
    assert.equal(settled.phase, null)
  }
})

test('the lists and reads answer a member their Project only, newest first, and name the open conversations', async (t) => {
  const { store, seedRun, seedBuilderProject, connection } = await harness(t, 'conexus_builder_reads')
  const projectId = await seedBuilderProject('Atlas')
  const otherProject = await seedBuilderProject('Borealis')
  const old = await seedRun(projectId, { state: 'SUCCEEDED', createdAgoMs: 3000, owner: null })
  const middle = await seedRun(projectId, { state: 'FAILED', accountId: ID.member, createdAgoMs: 2000, owner: null })
  const newest = await seedRun(projectId, { state: 'RUNNING', phase: 'AGENT', createdAgoMs: 1000, conversationId: '55555555-5555-4555-8555-555555555555' })
  await seedRun(otherProject, { state: 'QUEUED', conversationId: '66666666-6666-4666-8666-666666666666' })
  await seedRun(otherProject, { state: 'SUCCEEDED', createdAgoMs: 5000, owner: null })
  assert.deepEqual((await store.listBuilderRuns({ accountId: ID.owner, projectId })).map((run) => run.builderRunId), [newest, old], 'the list is the account runs only')
  assert.deepEqual((await store.listBuilderRuns({ accountId: ID.member, projectId })).map((run) => run.builderRunId), [middle])
  assert.equal((await store.readBuilderRun({ accountId: ID.member, projectId })).builderRunId, newest, 'the latest read may be another author run')
  assert.deepEqual([...await store.readOpenRunConversations()].sort(), ['55555555-5555-4555-8555-555555555555', '66666666-6666-4666-8666-666666666666'])
  for (const hidden of [ID.outsider, ID.administrator]) {
    assert.deepEqual(await store.listBuilderRuns({ accountId: hidden, projectId }), [])
    assert.equal(await store.readBuilderRun({ accountId: hidden, projectId }), null)
  }
  await query(connection, "INSERT INTO iam.application(project_id, slug, created_by) VALUES ($1, 'atlas', $2)", [projectId, ID.owner])
  await query(connection, 'INSERT INTO iam.application_grant(project_id, account_id, granted_by) VALUES ($1, $2, $3)', [projectId, ID.outsider, ID.owner])
  assert.deepEqual(await store.listBuilderRuns({ accountId: ID.outsider, projectId }), [], 'an application grant is not Builder access')
  await query(connection, 'UPDATE builder.project_working_state SET last_preview_source_revision = $2, last_preview_artifact_revision_id = $3, last_preview_artifact_digest = $4 WHERE project_id = $1', [projectId, HEAD, '30000000-0000-4000-8000-000000000001', 'e'.repeat(64)])
  assert.deepEqual(await store.readPreviewSubject({ accountId: ID.member, projectId }), { lastPreviewSourceRevision: HEAD, lastPreviewArtifactRevisionId: '30000000-0000-4000-8000-000000000001', lastPreviewArtifactDigest: 'e'.repeat(64) })
  assert.equal(await store.readPreviewSubject({ accountId: ID.outsider, projectId }), null)
})

test('a conversation session and its sandbox belong to the run Project, and a purge removes them with the run', async (t) => {
  const { database, connection, store, seedRun, seedBuilderProject } = await harness(t, 'conexus_builder_conversations')
  const projectId = await seedBuilderProject('Atlas')
  const otherProject = await seedBuilderProject('Borealis')
  const conversationId = randomUUID()
  const foreign = randomUUID()
  const builderRunId = await seedRun(projectId, { conversationId })
  const foreignRun = await seedRun(otherProject, { conversationId: foreign })
  const session = async (id) => (await query(connection, 'SELECT project_id, mirror_head, synced_main, provider_sandbox_id, last_turn_ended_at IS NOT NULL AS ended FROM builder.conversation_session WHERE conversation_id = $1', [id])).rows

  await store.recordConversationSession({ builderRunId, conversationId, mirrorHead: CANDIDATE, syncedMain: HEAD, turnEnded: false })
  assert.deepEqual(await session(conversationId), [{ project_id: projectId, mirror_head: CANDIDATE, synced_main: HEAD, provider_sandbox_id: null, ended: false }])
  await store.recordConversationSession({ builderRunId, conversationId, mirrorHead: OTHER, turnEnded: true })
  assert.deepEqual(await session(conversationId), [{ project_id: projectId, mirror_head: OTHER, synced_main: HEAD, provider_sandbox_id: null, ended: true }])
  await assert.rejects(store.recordConversationSession({ builderRunId, conversationId: foreign, mirrorHead: OTHER, turnEnded: true }), { id: 'BUILDER_CONVERSATION_SESSION_REFUSED' })
  assert.deepEqual(await session(foreign), [])

  assert.equal(await store.readConversationSandbox({ accountId: ID.owner, projectId, conversationId }), null)
  await store.recordConversationSandbox({ builderRunId, conversationId, providerSandboxId: 'ivm1first' })
  await store.recordConversationSandbox({ builderRunId, conversationId, providerSandboxId: 'ivm2second' })
  await assert.rejects(store.recordConversationSandbox({ builderRunId, conversationId, providerSandboxId: 'not an id' }), { id: 'BUILDER_CONVERSATION_SESSION_REFUSED' })
  await assert.rejects(store.recordConversationSandbox({ builderRunId, conversationId: foreign, providerSandboxId: 'ivm3third' }), { id: 'BUILDER_CONVERSATION_SESSION_REFUSED' })
  assert.equal(await store.readConversationSandbox({ accountId: ID.member, projectId, conversationId }), 'ivm2second')
  assert.equal(await store.readConversationSandbox({ accountId: ID.member, projectId: otherProject, conversationId }), null)
  assert.equal(await store.readConversationSandbox({ accountId: ID.outsider, projectId, conversationId }), null)
  await store.recordConversationSandbox({ builderRunId: foreignRun, conversationId: foreign, providerSandboxId: 'ivm4other' })
  assert.deepEqual(await store.readProjectSandboxes(projectId), ['ivm2second'])

  await store.recordBuilderRunModelAccount({ builderRunId, accountId: ID.owner, modelAccountId: randomUUID() })
  await database.system('project-purge', async (gate) => purgeProjectBuilder(await admitSystem(gate, 'project-purge'), projectId))
  const left = async (table) => (await query(connection, `SELECT count(*)::integer AS count FROM ${table} WHERE project_id = $1`, [projectId])).rows[0].count
  assert.deepEqual({ runs: await left('builder.builder_run'), working: await left('builder.project_working_state'), repository: await left('builder.project_repository'), sessions: await left('builder.conversation_session'), payers: (await query(connection, 'SELECT count(*)::integer AS count FROM builder.builder_run_model_account WHERE builder_run_id = $1', [builderRunId])).rows[0].count },
    { runs: 0, working: 0, repository: 0, sessions: 0, payers: 0 })
  assert.equal((await query(connection, 'SELECT count(*)::integer AS count FROM builder.conversation_session WHERE project_id = $1', [otherProject])).rows[0].count, 1, 'the other Project keeps its session')
})

// One statement per table and verb: `valid` is a statement the role's grant covers, `forbidden` each one it does not.
const WALL = {
  'builder.builder_run': { key: 'builder_run_id', touch: 'state' },
  'builder.project_working_state': { key: 'project_id', touch: 'updated_at' },
  'builder.project_repository': { key: 'project_id', touch: 'created_at' },
  'builder.conversation_session': { key: 'conversation_id', touch: 'provider_sandbox_id' },
  'builder.builder_run_model_account': { key: 'builder_run_id', touch: 'model_account_id' },
}
const BUILDER_TABLES = Object.keys(WALL)
const READER_TABLES = ['builder.builder_run', 'builder.project_working_state', 'builder.conversation_session']

const inRole = async (connection, role, statements) => {
  const client = new pg.Client(connection)
  await client.connect()
  try {
    const codes = []
    for (const statement of statements) {
      await client.query('BEGIN')
      await client.query(`SET LOCAL ROLE ${role}`)
      try {
        await client.query(statement.text, statement.values ?? [])
        codes.push(null)
      } catch (error) {
        codes.push(error.code)
      } finally {
        await client.query('ROLLBACK')
      }
    }
    return codes
  } finally {
    await client.end()
  }
}

test('the wall on the Builder tables: hub_runtime holds none after a commit, a rollback and a throw, the reader reads three and writes none, the command role writes only what its grant names', async (t) => {
  const { connection, openRuntimeDatabase, seedRun, seedBuilderProject } = await harness(t, 'conexus_builder_wall')
  const projectId = await seedBuilderProject('Atlas')
  const conversationId = randomUUID()
  const builderRunId = await seedRun(projectId, { conversationId })
  await query(connection, 'INSERT INTO builder.conversation_session(conversation_id, project_id) VALUES ($1, $2)', [conversationId, projectId])
  await query(connection, 'INSERT INTO builder.builder_run_model_account(builder_run_id, model_account_id) VALUES ($1, $2)', [builderRunId, randomUUID()])
  const keys = { 'builder.builder_run': builderRunId, 'builder.project_working_state': projectId, 'builder.project_repository': projectId, 'builder.conversation_session': conversationId, 'builder.builder_run_model_account': builderRunId }

  const single = openRuntimeDatabase({ max: 1 })
  const pool = await loginPoolOf(single)
  const backendInTransaction = async (gate) => (await backendOf((await admitAccount(gate)).tx)).pid
  const backendOf = (tx) => tx.one(z.object({ pid: z.number() }), sql`SELECT pg_backend_pid()::integer AS pid`, 'INTERNAL_UNEXPECTED')
  const backends = []
  // Every probe runs on one client taken out of the pool and handed back whole, so a refusal is the privilege of the
  // connection the transactions ran on and never of a replacement.
  const refusedOnEveryTable = async (when) => {
    const client = await pool.connect()
    try {
      backends.push((await client.query('SELECT pg_backend_pid()::integer AS pid')).rows[0].pid)
      for (const table of BUILDER_TABLES) await assert.rejects(client.query(`SELECT count(*) FROM ${table}`), { code: '42501' }, `${table} ${when}`)
      assert.deepEqual((await client.query('SELECT current_user AS who')).rows, [{ who: 'hub_runtime' }], when)
    } finally {
      client.release()
    }
  }
  await refusedOnEveryTable('before any transaction')
  backends.push(await single.transaction(ID.owner, backendInTransaction))
  await refusedOnEveryTable('after a commit')
  await assert.rejects(single.transaction(ID.owner, async (gate) => { backends.push(await backendInTransaction(gate)); throw new Error('rolled back') }), { message: 'rolled back' })
  await refusedOnEveryTable('after a throw')
  backends.push((await single.read(ID.owner, backendOf)).pid)
  await refusedOnEveryTable('after a read')
  assert.equal(new Set(backends).size, 1, 'one backend served every transaction and every probe')
  assert.equal(backends.length, 7)

  const where = (table) => `WHERE ${WALL[table].key} = $1`
  const verbs = (table) => ({
    select: { text: `SELECT 1 FROM ${table} ${where(table)}`, values: [keys[table]] },
    share: { text: `SELECT 1 FROM ${table} ${where(table)} FOR SHARE`, values: [keys[table]] },
    lock: { text: `SELECT 1 FROM ${table} ${where(table)} FOR UPDATE`, values: [keys[table]] },
    update: { text: `UPDATE ${table} SET ${WALL[table].touch} = ${WALL[table].touch} ${where(table)}`, values: [keys[table]] },
    delete: { text: `DELETE FROM ${table} ${where(table)}`, values: [keys[table]] },
  })
  const reader = {}
  for (const table of BUILDER_TABLES) {
    const v = verbs(table)
    reader[table] = await inRole(connection, 'hub_reader', [v.select, v.share, v.lock, v.update, v.delete])
  }
  assert.deepEqual(reader, {
    'builder.builder_run': [null, '42501', '42501', '42501', '42501'],
    'builder.project_working_state': [null, '42501', '42501', '42501', '42501'],
    'builder.project_repository': ['42501', '42501', '42501', '42501', '42501'],
    'builder.conversation_session': [null, '42501', '42501', '42501', '42501'],
    'builder.builder_run_model_account': ['42501', '42501', '42501', '42501', '42501'],
  })
  assert.equal(READER_TABLES.length, 3)
  const inserts = {
    'builder.builder_run': "INSERT INTO builder.builder_run(builder_run_id, project_id, account_id, conversation_id, idempotency_digest, request_digest, base_source_revision) VALUES (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), repeat('a', 64), repeat('b', 64), repeat('a', 40))",
    'builder.project_working_state': 'INSERT INTO builder.project_working_state(project_id) VALUES (gen_random_uuid())',
    'builder.project_repository': 'INSERT INTO builder.project_repository(project_id) VALUES (gen_random_uuid())',
    'builder.conversation_session': 'INSERT INTO builder.conversation_session(conversation_id, project_id) VALUES (gen_random_uuid(), gen_random_uuid())',
    'builder.builder_run_model_account': 'INSERT INTO builder.builder_run_model_account(builder_run_id, model_account_id) VALUES (gen_random_uuid(), gen_random_uuid())',
  }
  assert.deepEqual(await inRole(connection, 'hub_reader', Object.values(inserts).map((text) => ({ text }))), ['42501', '42501', '42501', '42501', '42501'], 'the reader inserts into none')

  const command = {}
  for (const table of BUILDER_TABLES) {
    const v = verbs(table)
    command[table] = await inRole(connection, 'hub_command', [v.select, v.share, v.lock, v.update, v.delete])
  }
  assert.deepEqual(command, {
    'builder.builder_run': [null, null, null, null, null],
    'builder.project_working_state': [null, null, null, null, null],
    'builder.project_repository': [null, '42501', '42501', '42501', null],
    'builder.conversation_session': [null, null, null, null, '42501'],
    'builder.builder_run_model_account': [null, '42501', '42501', '42501', '42501'],
  })
  const moved = await inRole(connection, 'hub_command', [
    { text: 'UPDATE builder.builder_run SET project_id = $1 WHERE builder_run_id = $2', values: [randomUUID(), builderRunId] },
    { text: 'UPDATE builder.builder_run SET account_id = $1 WHERE builder_run_id = $2', values: [ID.member, builderRunId] },
    { text: 'UPDATE builder.conversation_session SET project_id = $1 WHERE conversation_id = $2', values: [randomUUID(), conversationId] },
    { text: 'UPDATE builder.project_working_state SET project_id = $1 WHERE project_id = $2', values: [randomUUID(), projectId] },
  ])
  assert.deepEqual(moved, ['42501', '42501', '42501', '42501'], 'no grant moves a row to another Project or account')
  const [runInsert] = await inRole(connection, 'hub_command', [{ text: inserts['builder.builder_run'] }])
  assert.equal(runInsert, '23503', 'a run for a Project that does not exist is refused by its key')

  await query(connection, 'DELETE FROM builder.builder_run WHERE project_id = $1', [projectId])
  await query(connection, 'DELETE FROM builder.project_working_state WHERE project_id = $1', [projectId])
  await query(connection, 'DELETE FROM builder.project_repository WHERE project_id = $1', [projectId])
  assert.equal((await query(connection, 'SELECT count(*)::integer AS count FROM builder.conversation_session WHERE conversation_id = $1', [conversationId])).rows[0].count, 0, 'the repository delete cascades the session')
})

test('the working state refuses a state, a revision and a digest outside their shapes', async (t) => {
  const { connection, seedBuilderProject } = await harness(t, 'conexus_builder_working_checks')
  const projectId = await seedBuilderProject('Atlas')
  for (const [column, value] of [['current_state', 'UNKNOWN'], ['last_preview_source_revision', 'bad'], ['last_preview_artifact_digest', 'bad']]) {
    await assert.rejects(query(connection, `UPDATE builder.project_working_state SET ${column} = $1 WHERE project_id = $2`, [value, projectId]), { code: '23514' }, column)
  }
})
