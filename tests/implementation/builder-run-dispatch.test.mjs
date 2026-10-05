import assert from 'node:assert/strict'
import test from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'

const { createBuilderService } = await import(hubModuleUrl('builder/service.js'))
const { settleAdmittedSource } = await import(hubModuleUrl('builder/run/admit.js'))
const { logger } = await import(hubModuleUrl('platform/logger.js'))
const { Failure } = await import(hubModuleUrl('platform/failure.js'))

const runId = '88888888-8888-4888-8888-888888888888'
const projectId = '99999999-9999-4999-8999-999999999999'
const accountId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const conversationId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const base = 'a'.repeat(40)

// The service around a run whose model check is the test's: what happens before the run reaches a
// sandbox is the service's and the run's ending, which these tests drive. A conversation is the
// Project's when its thread is; these tests name the missing one through the conversation id.
const makeRuns = ({ checkModel, appendDiagnostic, publishRun } = {}) => ({
  ports: { checkModel: checkModel ?? (async () => {}), log: () => {} },
  publishRun: publishRun ?? (async () => {}),
  conversations: {
    ownerOf: async (_projectId, conversation) => (conversation === 'conv-missing' ? 'NONE' : 'PROJECT'),
  },
  git: { readMain: async () => base, mainContains: async () => false },
  appendDiagnostic: appendDiagnostic ?? (async () => {}),
  source: {
    listSourceTree: async () => { throw new Error('not reached') },
    readSourceFile: async () => { throw new Error('not reached') },
  },
  questionWaitMs: 60_000,
  settleRetryMs: 1,
})

// The one run's row as the database holds it, and every write the run made to it.
const makeStore = (calls, overrides = {}) => {
  const row = { builderRunId: runId, projectId, conversationId, state: 'QUEUED', phase: null, baseSourceRevision: base, resultSourceRevision: null, resultKind: null, failureCode: null, requestText: null }
  return {
    row,
    admitBuilder: async () => {},
    createBuilderRun: async (input) => { row.requestText = input.content; return { ...row } },
    claimBuilderRun: async () => { calls.push('claim'); return { ...Object.assign(row, { state: 'RUNNING' }) } },
    setBuilderRunPhase: async ({ phase }) => { calls.push(['phase', phase]); return { ...Object.assign(row, { phase }) } },
    readBuilderRun: async () => ({ ...row }),
    failBuilderRun: async ({ failureCode: code }) => { calls.push(['fail', code]); Object.assign(row, { state: 'FAILED', phase: null, failureCode: code }) },
    interruptBuilderRun: async ({ failureCode: code }) => { calls.push(['interrupt', code]); Object.assign(row, { state: 'INTERRUPTED', phase: null, failureCode: code }) },
    requestBuilderRunCancellation: async () => { calls.push('request-cancellation'); return { ...Object.assign(row, { cancellationRequested: true }) } },
    close: async () => {},
    ...overrides,
  }
}

// A model check that holds the run until the test lets it go, so a stop lands while it works.
const held = () => {
  let reached
  let release
  const atCheck = new Promise((resolve) => { reached = resolve })
  const checkModel = () => { reached(); return new Promise((_resolve, reject) => { release = reject }) }
  return { checkModel, atCheck, release: () => release(new Error('released')) }
}

const send = (service, idempotencyKey = 'key', conversation = conversationId) =>
  service.sendBuilderMessage({ accountId, projectId, idempotencyKey, content: 'Explique o app', conversationId: conversation })

test('a message hands the store a base read from main in the Conexus Git', async () => {
  const main = '9'.repeat(40)
  const reads = []
  const store = {
    admitBuilder: async () => {},
    createBuilderRun: async (input) => ({ builderRunId: runId, projectId, conversationId, state: 'SUCCEEDED', phase: null, baseSourceRevision: await input.readBase(), resultSourceRevision: null, resultKind: 'RESPONSE_ONLY', failureCode: null }),
    close: async () => {},
  }
  const runs = { ...makeRuns(), git: { readMain: async (id) => { reads.push(id); return main }, mainContains: async () => false } }
  const service = createBuilderService({ store, runs, applicationArtifacts: {} })
  const { builderRun, created } = await send(service)
  await service.close()
  assert.equal(builderRun.baseSourceRevision, main)
  assert.equal(created, true)
  assert.deepEqual(reads, [projectId])
})

test('a failure before the agent keeps the request on the run and fails it with its own code', async () => {
  const calls = []
  const store = makeStore(calls)
  const service = createBuilderService({
    store, runs: makeRuns({ checkModel: async () => { throw new Failure('BUILDER_MODEL_NOT_SELECTED') } }), applicationArtifacts: {},
  })
  const { builderRun } = await send(service)
  await service.close()
  assert.equal(builderRun.requestText, 'Explique o app')
  assert.deepEqual(calls, ['claim', ['phase', 'PREPARING'], ['fail', 'BUILDER_MODEL_NOT_SELECTED']])
})

test('a stop records the request, stops the run and interrupts it once as the person\'s', async () => {
  const calls = []
  const hold = held()
  const service = createBuilderService({ store: makeStore(calls), runs: makeRuns({ checkModel: hold.checkModel }), applicationArtifacts: {} })
  await send(service)
  await hold.atCheck
  await service.cancelBuilderRun({ accountId, projectId, builderRunId: runId })
  hold.release()
  await service.close()
  assert.deepEqual(calls.filter((call) => call !== 'claim' && call[0] !== 'phase'), ['request-cancellation', ['interrupt', 'USER_CANCELLED']])
})

test('a Hub that stops its runs interrupts a working one as HUB_RESTART, never as the person\'s stop', async () => {
  const calls = []
  const hold = held()
  const service = createBuilderService({ store: makeStore(calls), runs: makeRuns({ checkModel: hold.checkModel }), applicationArtifacts: {} })
  await send(service)
  await hold.atCheck
  service.stopRuns()
  hold.release()
  await service.close()
  assert.deepEqual(calls.at(-1), ['interrupt', 'HUB_RESTART'])
})

test('a browser following the conversation is handed the run as the builder-session read serves it: at each phase, at a stop request, and once settled', async () => {
  const published = []
  const hold = held()
  const service = createBuilderService({
    store: makeStore([]),
    runs: makeRuns({ checkModel: hold.checkModel, publishRun: async (run) => { published.push([run.state, run.phase, run.cancellationRequested === true]) } }),
    applicationArtifacts: {},
  })
  await send(service)
  await hold.atCheck
  await service.cancelBuilderRun({ accountId, projectId, builderRunId: runId })
  hold.release()
  await service.close()
  assert.deepEqual(published, [
    ['RUNNING', 'PREPARING', false],
    ['RUNNING', 'PREPARING', true],
    ['INTERRUPTED', null, true],
  ])
})

test('a phase the database refuses, as it does once a stop is requested, interrupts the run instead of failing it', async () => {
  const calls = []
  const store = makeStore(calls, { setBuilderRunPhase: async ({ phase }) => { calls.push(['phase', phase]); return null }, readBuilderRun: async () => ({ builderRunId: runId, projectId, conversationId, state: 'RUNNING', cancellationRequested: true }) })
  const service = createBuilderService({ store, runs: makeRuns(), applicationArtifacts: {} })
  await send(service)
  await service.close()
  assert.deepEqual(calls, ['claim', ['phase', 'PREPARING'], ['interrupt', 'USER_CANCELLED']])
})

test("a conversation that is not the Project's is refused before a run exists", async () => {
  const created = []
  const store = {
    admitBuilder: async () => {},
    createBuilderRun: async (input) => { created.push(input.conversationId); throw new Error('STOP_AFTER_CREATE') },
    close: async () => {},
  }
  const service = createBuilderService({ store, runs: makeRuns(), applicationArtifacts: {} })
  const attempt = (conversation) => send(service, conversation, conversation).catch((error) => error.message)
  assert.deepEqual([await attempt(conversationId), await attempt('conv-missing')], ['STOP_AFTER_CREATE', 'CONVERSATION_NOT_FOUND'])
  assert.deepEqual(created, [conversationId])
  await service.close()
})

// A run that fails, a store whose failBuilderRun throws `failures` times before it writes, and the
// lines the Hub logged. The store's lease takes the run over once the Hub no longer lists it as live.
const settleHarness = async ({ failures }) => {
  const lines = []
  const originalError = logger.error
  logger.error = (fields, code) => lines.push(`${code}:${fields['builder.run_id']}:${fields['exception.type']}`)
  const written = []
  let refused = 0
  const store = makeStore([], {
    failBuilderRun: async ({ failureCode: code }) => {
      if (refused < failures) { refused += 1; throw new Failure('BUILDER_RUN_TRANSITION_REFUSED') }
      written.push(code)
    },
    renewRunLease: async ({ liveRunIds: liveIds }) => (liveIds.includes(runId) || written.length > 0 ? [] : [{ builderRunId: runId, projectId, conversationId, candidateRevision: null, resultSourceRevision: null, previousOwnerId: owner }]),
  })
  const service = createBuilderService({
    store, runs: makeRuns({ checkModel: async () => { throw new Failure('BUILDER_MODEL_INCOMPLETE') } }), applicationArtifacts: {},
  })
  await send(service)
  const until = async (done) => { for (let i = 0; i < 400 && !done(); i++) await new Promise((wake) => { setTimeout(wake, 5) }) }
  return { service, written, lines, until, restore: () => { logger.error = originalError } }
}

test('a failed run whose settle write fails once ends settled after the retry, with only the failure logged', async () => {
  const h = await settleHarness({ failures: 1 })
  await h.until(() => h.written.length > 0)
  await h.service.close()
  h.restore()
  assert.deepEqual(h.written, ['BUILDER_MODEL_INCOMPLETE'])
  assert.deepEqual(h.lines.filter((line) => !line.startsWith('BUILDER_MODEL_INCOMPLETE')), [])
})

test('a settle write that keeps failing is logged with a code, and once the run is no longer live a lease pass settles the row', async () => {
  const h = await settleHarness({ failures: 3 })
  await h.until(() => h.lines.some((line) => line.startsWith('BUILDER_RUN_SETTLE_FAILED')))
  for (let pass = 0; pass < 100 && h.written.length === 0; pass++) {
    await h.service.renewLease(new AbortController().signal)
    await new Promise((wake) => { setTimeout(wake, 5) })
  }
  await h.service.close()
  h.restore()
  assert.deepEqual(h.lines.filter((line) => line.startsWith('BUILDER_RUN_SETTLE_FAILED')), [`BUILDER_RUN_SETTLE_FAILED:${runId}:Error`])
  assert.deepEqual(h.written, ['BUILDER_RUN_SETTLE_LOST'])
})

test('near the heap limit a new run is refused before any row exists; at the limit the run starts', async (t) => {
  const rows = []
  const warnings = []
  t.mock.method(logger, 'warn', (fields, code) => { if (code === 'BUILDER_RUN_HEAP_PRESSURE') warnings.push(`${code}:${fields.ratio.toFixed(3)}`) })
  let ratio = 0.86
  const store = makeStore([])
  const createBuilderRun = store.createBuilderRun
  store.createBuilderRun = async (input) => { rows.push('row'); return createBuilderRun(input) }
  const service = createBuilderService({
    store,
    runs: { ...makeRuns({ checkModel: async () => { throw new Failure('BUILDER_MODEL_NOT_SELECTED') } }), heapUsedRatio: () => ratio },
    applicationArtifacts: {},
  })
  await assert.rejects(send(service), { message: 'BUILDER_CAPACITY_FULL' })
  assert.deepEqual({ rows, warnings }, { rows: [], warnings: ['BUILDER_RUN_HEAP_PRESSURE:0.860'] })
  ratio = 0.85
  assert.equal((await send(service)).builderRun.state, 'QUEUED')
  await service.close()
  assert.deepEqual(rows, ['row'], 'at the threshold the run is created')
})

// The admitted source's settlement, from `main` holding the candidate to the run's last write.
const admitted = 'c'.repeat(40)
const admittedRun = { accountId, projectId, conversationId, builderRunId: runId }
const settle = async ({ applicationBuild, applicationArtifacts = {}, applicationServer }) => {
  const calls = []
  const store = {
    advanceBuilderRunSource: async ({ sourceRevision: revision }) => calls.push(['advance', revision]),
    settleBuilderRunBuild: async (input) => calls.push(['build-settle', input.failureCode ?? null, input.artifactRevisionId ?? null]),
  }
  const outcome = await settleAdmittedSource({
    store, applicationArtifacts, applicationServer,
    appendDiagnostic: async (note) => calls.push(['note', note.code, note.outcome, note.detail]),
    finalizing: async () => calls.push(['phase', 'FINALIZING']),
  }, admittedRun, admitted, applicationBuild).then(() => 'SETTLED', (error) => error.message)
  return { calls, outcome }
}
const compiled = (files = []) => ({ projectId, executionId: runId, sourceRevision: admitted, templateRef: 'x', recipeSha256: 'y', files })
const withServerTree = () => compiled([{ path: 'conexus-server/manifest.json', mediaType: 'application/json', bytes: new Uint8Array(), sha256: 'a'.repeat(64) }])
const retained = { retainApplication: async () => ({ artifactRevisionId: '77777777-7777-4777-8777-777777777777', artifactDigest: 'd'.repeat(64) }) }

test('an admitted source advances, retains its build and settles the Preview', async () => {
  const { calls, outcome } = await settle({ applicationBuild: { kind: 'BUILT', compiledApplication: compiled() }, applicationArtifacts: retained })
  assert.equal(outcome, 'SETTLED')
  assert.deepEqual(calls, [['advance', admitted], ['phase', 'FINALIZING'], ['build-settle', null, '77777777-7777-4777-8777-777777777777']])
})

test('a page that did not render still advances the source, and settles the build failure with a note for the agent', async () => {
  const { calls } = await settle({
    applicationBuild: { kind: 'UNRENDERED', code: 'APPLICATION_SMOKE_FAILED', detail: 'boot failed:\nBOOT_NO_ROOT_CHILD nada na tela' },
    applicationArtifacts: { retainApplication: async () => { throw new Error('must not retain a build-failed compile') } },
  })
  assert.deepEqual(calls, [
    ['advance', admitted], ['phase', 'FINALIZING'], ['build-settle', 'APPLICATION_SMOKE_FAILED', null],
    ['note', 'APPLICATION_SMOKE_FAILED', 'BUILD_FAILED', 'boot failed:\nBOOT_NO_ROOT_CHILD nada na tela'],
  ])
})

test("a source-shape refusal from the application server settles with the runner's own code, as a build failure the agent can read", async () => {
  const { calls, outcome } = await settle({
    applicationBuild: { kind: 'BUILT', compiledApplication: withServerTree() }, applicationArtifacts: retained,
    applicationServer: { prepare: async () => { throw new Failure('SERVER_TREE_REFUSED', { cause: 'SERVER_TREE_REFUSED' }) } },
  })
  assert.equal(outcome, 'SERVER_TREE_REFUSED')
  assert.deepEqual(calls, [
    ['advance', admitted], ['phase', 'FINALIZING'], ['build-settle', 'SERVER_TREE_REFUSED', null],
    ['note', 'SERVER_TREE_REFUSED', 'BUILD_FAILED', 'SERVER_TREE_REFUSED'],
  ])
})

test('a platform-side prepare fault settles as a platform failure, not a build failure, and still carries its reason', async () => {
  const { calls } = await settle({
    applicationBuild: { kind: 'BUILT', compiledApplication: withServerTree() }, applicationArtifacts: retained,
    applicationServer: { prepare: async () => { throw new Failure('APPLICATION_SERVER_REFUSED', { cause: 'connect ECONNREFUSED 127.0.0.1:5432' }) } },
  })
  assert.deepEqual(calls, [
    ['advance', admitted], ['phase', 'FINALIZING'], ['build-settle', 'APPLICATION_SERVER_REFUSED', null],
    ['note', 'APPLICATION_SERVER_REFUSED', 'PLATFORM_FAILED', 'connect ECONNREFUSED 127.0.0.1:5432'],
  ])
})
