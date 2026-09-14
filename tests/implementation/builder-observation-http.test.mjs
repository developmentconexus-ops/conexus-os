import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const root = resolve(import.meta.dirname, '../..')
const cache = resolve(root, 'node_modules/.cache')
mkdirSync(cache, { recursive: true })
const build = mkdtempSync(resolve(cache, 'builder-observation-http-'))
test.after(() => rmSync(build, { recursive: true, force: true }))
const compiled = spawnSync(process.execPath, [resolve(root, 'node_modules/typescript/bin/tsc'), '--project', resolve(root, 'apps/hub/tsconfig.json'), '--noEmit', 'false', '--outDir', build], { cwd: root, encoding: 'utf8' })
if (compiled.status !== 0) throw new Error(compiled.stdout || compiled.stderr)
const { createHttpApp } = await import(pathToFileURL(resolve(build, 'http/app.js')).href)
const { registerBuilderRoutes } = await import(pathToFileURL(resolve(build, 'builder/routes.js')).href)
const { createBuilderService } = await import(pathToFileURL(resolve(build, 'builder/service.js')).href)
const projectId = '11111111-1111-4111-8111-111111111111'
const changeId = '22222222-2222-4222-8222-222222222222'
const accountId = '33333333-3333-4333-8333-333333333333'
const path = `/protocol/projects/${projectId}/builder-changes/${changeId}/stream`
const deferred = () => Promise.withResolvers()

test('legacy observation survives browser cancellation and scopes the frozen Change adapter', async () => {
  const coding = deferred()
  const started = deferred()
  let executes = 0
  let input
  let firstInput
  const claim = { projectId, changeId, actorRunId: 'actor', admissionToken: 'private-token', workUnitId: 'unit', baseSourceRevision: 'a'.repeat(40) }
  const service = createBuilderService({
    store: {
      createChange: async () => ({ projectId, changeId, state: 'QUEUED' }),
      claimChange: async () => claim,
      bindSandbox: async () => {}, settleResult: async () => {}, failRun: async () => {},
      close: async () => {},
    },
    source: { prepareSource: async () => Buffer.from('controlled source'), admitCandidate: async () => ({}), prepareCandidate: async () => ({ bundle: Buffer.from('candidate'), changedFiles: [] }) },
    runtime: { kind: 'REMOTE_E2B', execute: async (request) => {
      executes += 1
      input = request
      firstInput ??= request
      request.observe({ kind: 'TEXT_START', blockId: 'one' })
      request.observe({ kind: 'TEXT_DELTA', blockId: 'one', text: 'Primeiro' })
      started.resolve()
      await coding.promise
      request.observe({ kind: 'TEXT_END', blockId: 'one' })
      return { ...claim, actorRunId: request.actorRunId, sandboxId: 'sandbox', candidateSourceRevision: 'b'.repeat(40), resultBundle: Buffer.from('result'), summary: 'result' }
    } },
    verifier: { kind: 'REMOTE_E2B', verify: async () => ({ ...claim, sandboxId: 'verifier', report: {} }) },
    compiler: {}, applicationArtifacts: {},
  })
  try {
    assert.equal(typeof service.observeChange, 'function')
    await service.createChange({ accountId, projectId, intent: 'controlled', idempotencyKey: 'one' })
    await started.promise
    assert.equal(service.observeChange({ projectId: 'another', changeId }), null)
    const first = service.observeChange({ projectId, changeId }).getReader()
    assert.match((await first.read()).value, /CODING/)
    await first.cancel()
    await service.createChange({ accountId, projectId, intent: 'controlled', idempotencyKey: 'one' })
    assert.equal(executes, 1)
    assert.equal(input.signal?.aborted ?? false, false)
    coding.resolve()
    await new Promise(resolve => setImmediate(resolve))
    firstInput.observe({ kind: 'TEXT_DELTA', blockId: 'one', text: 'late stale output' })
    const reader = service.observeChange({ projectId, changeId }).getReader()
    const frames = []
    for (;;) { const result = await reader.read(); if (result.done) break; frames.push(JSON.parse(result.value.slice(6))) }
    assert.deepEqual(frames.map(({ sequence }) => sequence), [1, 2, 3, 4, 5, 6, 7])
    assert.deepEqual(frames.map(({ event }) => event.kind), ['PHASE', 'TEXT_START', 'TEXT_DELTA', 'TEXT_END', 'PHASE', 'OBSERVATION_UNAVAILABLE', 'OBSERVATION_END'])
    assert.deepEqual(frames.filter(({ event }) => event.kind === 'TEXT_START').map(({ event }) => event.blockId), ['one'])
    assert.equal(frames[2].event.text, 'Primeiro')
    assert.equal(JSON.stringify(frames).includes('private-token'), false)
    assert.equal(JSON.stringify(frames).includes('late stale output'), false)
    assert.equal(executes, 1)
  } finally { coding.resolve(); await service.close() }
})

test('HTTP observation authenticates containment before attachment and rechecks before every disclosure', async () => {
  let authenticated = false
  let permitted = true
  let attachments = 0
  let controller
  const reads = []
  const app = await createHttpApp({ registerRoutes: (server) => registerBuilderRoutes(server, {
    origin: 'http://localhost',
    resolveCurrentSession: async () => authenticated ? { account: { accountId } } : null,
    store: { readSnapshot: async (input) => { reads.push(input); return permitted ? { change: { projectId, changeId } } : null } },
    service: { observeChange: () => { attachments += 1; return new ReadableStream({ start(value) { controller = value } }) } },
  }) })
  try {
    const address = await app.listen({ host: '127.0.0.1', port: 0 })
    assert.equal((await fetch(address + path)).status, 401)
    assert.equal(attachments, 0)
    authenticated = true
    permitted = false
    assert.equal((await fetch(address + path)).status, 404)
    assert.equal(attachments, 0)
    permitted = true
    const responsePromise = fetch(address + path)
    while (!controller) await new Promise(resolve => setImmediate(resolve))
    controller.enqueue('data: first\n\n')
    const response = await responsePromise
    assert.equal(response.status, 200)
    assert.match(response.headers.get('content-type'), /text\/event-stream/)
    const reader = response.body.getReader()
    assert.equal(new TextDecoder().decode((await reader.read()).value), 'data: first\n\n')
    permitted = false
    controller.enqueue('data: must-not-be-disclosed\n\n')
    const end = await reader.read()
    assert.equal(end.done, true)
    assert.ok(reads.length >= 3)
    assert.deepEqual(reads[0], { accountId, projectId, changeId, requireSource: false })
  } finally { await app.close() }
})

test('observation capacity evicts completed feeds first and active observation expires without canceling work', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const claimGate = deferred()
  let claims = 0
  const service = createBuilderService({
    store: {
      createChange: async (input) => ({ projectId, changeId: input.idempotencyKey, state: 'QUEUED' }),
      claimChange: async (id) => { claims += 1; if (id !== 'finished') await claimGate.promise; throw new Error('controlled claim failure') },
      close: async () => {},
    },
    source: {}, runtime: { kind: 'REMOTE_E2B' }, verifier: { kind: 'REMOTE_E2B' }, compiler: {}, applicationArtifacts: {},
  })
  const create = (idempotencyKey) => service.createChange({ projectId, accountId, intent: 'controlled', idempotencyKey })
  try {
    await create('first-active')
    await create('finished')
    await new Promise(resolve => setImmediate(resolve))
    const completed = service.observeChange({ projectId, changeId: 'finished' }).getReader()
    assert.equal(JSON.parse((await completed.read()).value.slice(6)).event.code, 'RUNTIME_FAILED')
    assert.equal(JSON.parse((await completed.read()).value.slice(6)).event.kind, 'OBSERVATION_END')
    assert.equal((await completed.read()).done, true)
    for (let index = 0; index < 15; index += 1) await create(`active-${index}`)
    assert.equal(service.observeChange({ projectId, changeId: 'finished' }), null)
    const first = service.observeChange({ projectId, changeId: 'first-active' })
    assert.notEqual(first, null)
    await first.cancel()
    t.mock.timers.tick(60 * 60_000)
    assert.equal(service.observeChange({ projectId, changeId: 'first-active' }), null)
    assert.equal(claims, 17)
  } finally { claimGate.resolve(); await service.close() }
})
