import assert from 'node:assert/strict'
import test from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'

const { createApplicationInvoker } = await import(hubModuleUrl('mar/application-invoker.js'))

const bytes = (length) => new Uint8Array(length)

// A `readFile` that never resolves until the test releases it, so several invocations can be made to
// overlap on purpose instead of racing the event loop.
const deferredReader = () => {
  const calls = []
  const waiting = []
  const readFile = (input) => new Promise((resolve) => {
    calls.push(input)
    waiting.push(() => resolve({ path: input.path, sha256: 'sha', bytes: bytes(16) }))
  })
  const release = (count) => { for (let i = 0; i < count; i += 1) waiting.shift()?.() }
  return { readFile, calls, release }
}

const immediateReader = (fileBytes) => {
  const calls = []
  const readFile = async (input) => { calls.push(input); return { path: input.path, sha256: 'sha', bytes: fileBytes } }
  return { readFile, calls }
}

const spyInvoke = (result = { status: 200, body: { ok: true } }) => {
  const calls = []
  const invoke = async (input) => { calls.push(input); return result }
  return { invoke, calls }
}

const CALLER = Object.freeze({ accountId: '44444444-4444-4444-8444-444444444444', email: 'ana@example.com', displayName: 'Ana' })

const source = (projectId) => ({ via: 'PREVIEW', accountId: 'acct', projectId, sourceRevision: 'rev', artifactRevisionId: 'artifact' })

const call = (invoker, projectId, path = 'conexus-server/handlers/a.mjs') => invoker({
  source: source(projectId), serverFiles: [path], operation: 'op', input: {}, caller: CALLER,
})

test('the global bound admits up to its limit and refuses the rest with 429, without reading their files', async () => {
  const reader = deferredReader()
  const runner = spyInvoke()
  const invoker = createApplicationInvoker({
    readFile: reader.readFile, invoke: runner.invoke,
    limits: { globalConcurrency: 2, perProjectConcurrency: 2, maxServerTreeBytes: 1_000_000 },
  })
  // Four distinct Projects so only the global bound, not the per-Project one, can be at play.
  const results = Promise.all(['p1', 'p2', 'p3', 'p4'].map((projectId) => call(invoker, projectId)))
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(reader.calls.length, 2, 'only the admitted requests reached the file reader')
  reader.release(2)
  const settled = await results
  const statuses = settled.map((reply) => reply.status).sort()
  assert.deepEqual(statuses, [200, 200, 429, 429])
  const refused = settled.filter((reply) => reply.status === 429)
  assert.deepEqual(refused.map((reply) => reply.body), [{ error: { code: 'APPLICATION_RUNNER_BUSY' } }, { error: { code: 'APPLICATION_RUNNER_BUSY' } }])
  assert.equal(runner.calls.length, 2, 'the runner was invoked only for the admitted requests')
})

test('the per-Project bound refuses one Preview flooding requests, without reading the refused ones, while other Projects are unaffected', async () => {
  const reader = deferredReader()
  const runner = spyInvoke()
  const invoker = createApplicationInvoker({
    readFile: reader.readFile, invoke: runner.invoke,
    limits: { globalConcurrency: 5, perProjectConcurrency: 2, maxServerTreeBytes: 1_000_000 },
  })
  const flood = Promise.all([1, 2, 3, 4].map(() => call(invoker, 'flooding-project')))
  const other = call(invoker, 'other-project')
  await new Promise((resolve) => setImmediate(resolve))
  // 2 admitted for the flooding Project, 1 for the other Project: 3 reads total.
  assert.equal(reader.calls.length, 3)
  reader.release(3)
  const floodResults = await flood
  const otherResult = await other
  assert.equal(otherResult.status, 200, 'a different Project is not starved by one Preview flooding requests')
  const statuses = floodResults.map((reply) => reply.status).sort()
  assert.deepEqual(statuses, [200, 200, 429, 429])
  const refused = floodResults.filter((reply) => reply.status === 429)
  assert.deepEqual(refused.map((reply) => reply.body), [{ error: { code: 'APPLICATION_PROJECT_BUSY' } }, { error: { code: 'APPLICATION_PROJECT_BUSY' } }])
})

test('an admission slot is freed for the next request once its call finishes', async () => {
  const reader = deferredReader()
  const runner = spyInvoke()
  const invoker = createApplicationInvoker({
    readFile: reader.readFile, invoke: runner.invoke,
    limits: { globalConcurrency: 1, perProjectConcurrency: 1, maxServerTreeBytes: 1_000_000 },
  })
  const first = call(invoker, 'p1')
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(reader.calls.length, 1)
  reader.release(1)
  assert.equal((await first).status, 200)
  const second = call(invoker, 'p1')
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(reader.calls.length, 2, 'the freed slot admitted the next request')
  reader.release(1)
  assert.equal((await second).status, 200)
})

test('a server tree over the total byte limit is refused as soon as the running total crosses it, without reading the remaining files or reaching the runner', async () => {
  const reader = immediateReader(bytes(600))
  const runner = spyInvoke()
  const invoker = createApplicationInvoker({
    readFile: reader.readFile, invoke: runner.invoke,
    limits: { globalConcurrency: 4, perProjectConcurrency: 4, maxServerTreeBytes: 1000 },
  })
  const result = await invoker({
    source: source('p1'),
    // 600 bytes each: the running total crosses 1000 on the second file, so the third is never read.
    serverFiles: ['conexus-server/a.mjs', 'conexus-server/b.mjs', 'conexus-server/c.mjs'], operation: 'op', input: {}, caller: CALLER,
  })
  assert.equal(reader.calls.length, 2, 'the read stopped as soon as the total crossed the limit, not after the whole tree')
  assert.deepEqual(result, { status: 413, body: { error: { code: 'SERVER_TREE_TOO_LARGE' } } })
  assert.equal(runner.calls.length, 0, 'the runner never receives an over-limit tree')
})

test('a server tree at or under the total byte limit reaches the runner', async () => {
  const reader = immediateReader(bytes(400))
  const runner = spyInvoke()
  const invoker = createApplicationInvoker({
    readFile: reader.readFile, invoke: runner.invoke,
    limits: { globalConcurrency: 4, perProjectConcurrency: 4, maxServerTreeBytes: 1000 },
  })
  const result = await invoker({
    source: source('p1'),
    serverFiles: ['conexus-server/a.mjs', 'conexus-server/b.mjs'], operation: 'op', input: {}, caller: CALLER,
  })
  assert.equal(result.status, 200)
  assert.equal(runner.calls.length, 1)
  assert.deepEqual(runner.calls[0].files.map((file) => file.path), ['conexus-server/a.mjs', 'conexus-server/b.mjs'])
  assert.deepEqual(runner.calls[0].caller, { accountId: '44444444-4444-4444-8444-444444444444', email: 'ana@example.com', displayName: 'Ana' })
})

test('a missing file still refuses by throwing, as the Preview API layer expects', async () => {
  const runner = spyInvoke()
  const invoker = createApplicationInvoker({
    readFile: async () => null, invoke: runner.invoke,
    limits: { globalConcurrency: 4, perProjectConcurrency: 4, maxServerTreeBytes: 1000 },
  })
  await assert.rejects(
    () => invoker({ source: source('p1'), serverFiles: ['x'], operation: 'op', input: {}, caller: CALLER }),
    /APPLICATION_SERVER_FILE_MISSING/,
  )
})
