import assert from 'node:assert/strict'
import test from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { hubModuleUrl } from './hub-build.mjs'

const { createApplicationInvoker } = await import(hubModuleUrl('hosting/application-invoker.js'))

// A runner that never answers until the test releases it, so several invocations can be made to
// overlap on purpose instead of racing the event loop.
const deferredRunner = () => {
  const calls = []
  const waiting = []
  const invoke = (input) => new Promise((resolve) => {
    calls.push(input)
    waiting.push(() => resolve({ status: 200, body: { ok: true } }))
  })
  const release = (count) => { for (let i = 0; i < count; i += 1) waiting.shift()?.() }
  return { invoke, calls, release }
}

const spyInvoke = (result = { status: 200, body: { ok: true } }) => {
  const calls = []
  const invoke = async (input) => { calls.push(input); return result }
  return { invoke, calls }
}

const CALLER = Object.freeze({ accountId: '44444444-4444-4444-8444-444444444444', email: 'ana@example.com', displayName: 'Ana' })

const source = (projectId) => ({ via: 'PREVIEW', accountId: 'acct', projectId })

const call = (invoker, projectId, path = 'conexus-server/handlers/a.mjs', callerLeft = new AbortController().signal) => invoker({
  source: source(projectId), files: [{ path, sha256: 'sha', content: '' }], operation: 'op', input: {}, caller: CALLER, callerLeft,
})

const limits = (overrides) => ({
  globalConcurrency: 4, perProjectConcurrency: 4, admissionQueueTimeoutMs: 10_000, admissionQueueLimit: 16, ...overrides,
})

const admission = (overrides) => {
  const runner = deferredRunner()
  const invoker = createApplicationInvoker({ invoke: runner.invoke, limits: limits(overrides) })
  return { runner, invoker, admissionOrder: () => runner.calls.map((input) => input.files[0].path) }
}

const OK = { status: 200, body: { ok: true } }
const tick = () => new Promise((resolve) => setImmediate(resolve))
const beforeNextTurn = (promise) => Promise.race([promise, new Promise((resolve) => setImmediate(resolve, 'still waiting'))])

const problem = (code, status) => ({ type: `urn:conexus:problem:${code}`, title: code, status, code })

test('a call over its Project\'s limit waits and runs once a slot frees, while another Project\'s call runs at once, and a handed-over slot still counts', async () => {
  const { runner, invoker, admissionOrder } = admission({ globalConcurrency: 5, perProjectConcurrency: 2 })
  const [a, b, c] = ['a', 'b', 'c'].map((path) => call(invoker, 'p1', path))
  await tick()
  assert.deepEqual(admissionOrder(), ['a', 'b'])
  const d = call(invoker, 'p2', 'd')
  await tick()
  assert.deepEqual(admissionOrder(), ['a', 'b', 'd'])
  runner.release(1)
  assert.deepEqual(await a, OK)
  await tick()
  assert.deepEqual(admissionOrder(), ['a', 'b', 'd', 'c'])
  const e = call(invoker, 'p1', 'e')
  await tick()
  assert.deepEqual(admissionOrder(), ['a', 'b', 'd', 'c'])
  runner.release(3)
  assert.deepEqual(await Promise.all([b, c, d]), [OK, OK, OK])
  await tick()
  runner.release(1)
  assert.deepEqual(await e, OK)
  assert.deepEqual(admissionOrder(), ['a', 'b', 'd', 'c', 'e'])
})

test('a call whose wait for its Project expires answers 429 APPLICATION_PROJECT_BUSY without reaching the runner, and leaks no slot', async () => {
  const { runner, invoker, admissionOrder } = admission({ perProjectConcurrency: 2, admissionQueueTimeoutMs: 30 })
  const [a, b, c] = ['a', 'b', 'c'].map((path) => call(invoker, 'p1', path))
  assert.deepEqual(await c, { status: 429, body: problem('APPLICATION_PROJECT_BUSY', 429) })
  runner.release(2)
  assert.deepEqual(await Promise.all([a, b]), [OK, OK])
  const d = call(invoker, 'p1', 'd')
  await tick()
  runner.release(1)
  assert.deepEqual(await d, OK)
  assert.deepEqual(admissionOrder(), ['a', 'b', 'd'])
})

test('a call that finds its Project\'s line full answers 429 APPLICATION_PROJECT_BUSY at once', async () => {
  const { runner, invoker, admissionOrder } = admission({ perProjectConcurrency: 2, admissionQueueLimit: 1 })
  const [a, b, c] = ['a', 'b', 'c'].map((path) => call(invoker, 'p1', path))
  assert.deepEqual(await beforeNextTurn(call(invoker, 'p1', 'd')), { status: 429, body: problem('APPLICATION_PROJECT_BUSY', 429) })
  await tick()
  runner.release(1)
  assert.deepEqual(await a, OK)
  await tick()
  runner.release(2)
  assert.deepEqual(await Promise.all([b, c]), [OK, OK])
  assert.deepEqual(admissionOrder(), ['a', 'b', 'c'])
})

test('a call over the runner\'s limit waits and runs once a slot frees', async () => {
  const { runner, invoker, admissionOrder } = admission({ globalConcurrency: 2, perProjectConcurrency: 1 })
  const a = call(invoker, 'p1', 'a')
  const b = call(invoker, 'p2', 'b')
  const c = call(invoker, 'p3', 'c')
  await tick()
  assert.deepEqual(admissionOrder(), ['a', 'b'])
  runner.release(1)
  assert.deepEqual(await a, OK)
  await tick()
  assert.deepEqual(admissionOrder(), ['a', 'b', 'c'])
  runner.release(2)
  assert.deepEqual(await Promise.all([b, c]), [OK, OK])
})

test('a call whose wait for the runner expires answers 429 APPLICATION_RUNNER_BUSY without reaching the runner, and leaks no slot', async () => {
  const { runner, invoker, admissionOrder } = admission({ globalConcurrency: 2, perProjectConcurrency: 1, admissionQueueTimeoutMs: 30 })
  const a = call(invoker, 'p1', 'a')
  const b = call(invoker, 'p2', 'b')
  const c = call(invoker, 'p3', 'c')
  assert.deepEqual(await c, { status: 429, body: problem('APPLICATION_RUNNER_BUSY', 429) })
  runner.release(2)
  assert.deepEqual(await Promise.all([a, b]), [OK, OK])
  const d = call(invoker, 'p3', 'd')
  await tick()
  runner.release(1)
  assert.deepEqual(await d, OK)
  assert.deepEqual(admissionOrder(), ['a', 'b', 'd'])
})

test('a call that finds the runner\'s line full answers 429 APPLICATION_RUNNER_BUSY at once', async () => {
  const { runner, invoker, admissionOrder } = admission({ globalConcurrency: 2, perProjectConcurrency: 1, admissionQueueLimit: 1 })
  const a = call(invoker, 'p1', 'a')
  const b = call(invoker, 'p2', 'b')
  const c = call(invoker, 'p3', 'c')
  assert.deepEqual(await beforeNextTurn(call(invoker, 'p4', 'd')), { status: 429, body: problem('APPLICATION_RUNNER_BUSY', 429) })
  await tick()
  runner.release(1)
  assert.deepEqual(await a, OK)
  await tick()
  runner.release(2)
  assert.deepEqual(await Promise.all([b, c]), [OK, OK])
  assert.deepEqual(admissionOrder(), ['a', 'b', 'c'])
})

test('a caller that leaves its Project\'s line is refused at once and never reaches the runner, and the line keeps its order', async () => {
  const { runner, invoker, admissionOrder } = admission({ perProjectConcurrency: 1 })
  const leaving = new AbortController()
  const a = call(invoker, 'p1', 'a')
  const b = call(invoker, 'p1', 'b', leaving.signal)
  const c = call(invoker, 'p1', 'c')
  await tick()
  leaving.abort()
  assert.deepEqual(await beforeNextTurn(b), { status: 429, body: problem('APPLICATION_PROJECT_BUSY', 429) })
  runner.release(1)
  assert.deepEqual(await a, OK)
  await tick()
  runner.release(1)
  assert.deepEqual(await c, OK)
  assert.deepEqual(admissionOrder(), ['a', 'c'])
})

test('a caller that leaves the runner\'s line frees its Project slot, and both lines keep their order', async () => {
  const { runner, invoker, admissionOrder } = admission({ globalConcurrency: 1, perProjectConcurrency: 1 })
  const leaving = new AbortController()
  const a = call(invoker, 'p1', 'a')
  const b = call(invoker, 'p2', 'b', leaving.signal)
  const c = call(invoker, 'p2', 'c')
  const d = call(invoker, 'p3', 'd')
  await tick()
  leaving.abort()
  assert.deepEqual(await beforeNextTurn(b), { status: 429, body: problem('APPLICATION_RUNNER_BUSY', 429) })
  runner.release(1)
  assert.deepEqual(await a, OK)
  await tick()
  runner.release(1)
  assert.deepEqual(await d, OK)
  await tick()
  runner.release(1)
  assert.deepEqual(await c, OK)
  assert.deepEqual(admissionOrder(), ['a', 'd', 'c'])
})

test('one deadline covers the wait in the Project\'s line and in the runner\'s line together', async () => {
  const { runner, invoker, admissionOrder } = admission({ globalConcurrency: 1, perProjectConcurrency: 1, admissionQueueTimeoutMs: 400 })
  const a = call(invoker, 'p1', 'a')
  const b = call(invoker, 'p2', 'b')
  const started = performance.now()
  const c = call(invoker, 'p1', 'c')
  await delay(250)
  runner.release(1)
  assert.deepEqual(await a, OK)
  assert.deepEqual(await c, { status: 429, body: problem('APPLICATION_RUNNER_BUSY', 429) })
  assert.ok(performance.now() - started < 550, 'c had 400 ms across both lines, not 400 ms in each')
  runner.release(1)
  assert.deepEqual(await b, OK)
  assert.deepEqual(admissionOrder(), ['a', 'b'])
})

test('a caller admitted from the line that leaves while its call runs keeps its slot to the end, and the next waiter still runs', async () => {
  const { runner, invoker, admissionOrder } = admission({ perProjectConcurrency: 1, admissionQueueTimeoutMs: 1000 })
  const leaving = new AbortController()
  const a = call(invoker, 'p1', 'a')
  const b = call(invoker, 'p1', 'b', leaving.signal)
  const c = call(invoker, 'p1', 'c')
  await tick()
  runner.release(1)
  assert.deepEqual(await a, OK)
  await tick()
  leaving.abort()
  await tick()
  assert.deepEqual(admissionOrder(), ['a', 'b'])
  runner.release(1)
  assert.deepEqual(await b, OK)
  await tick()
  runner.release(1)
  assert.deepEqual(await c, OK)
  assert.deepEqual(admissionOrder(), ['a', 'b', 'c'])
})

test('a caller that left before its call arrived still runs on a free slot, and never waits for one', async () => {
  const { runner, invoker, admissionOrder } = admission({ perProjectConcurrency: 1 })
  const a = call(invoker, 'p1', 'a', AbortSignal.abort())
  await tick()
  assert.deepEqual(await beforeNextTurn(call(invoker, 'p1', 'b', AbortSignal.abort())), { status: 429, body: problem('APPLICATION_PROJECT_BUSY', 429) })
  runner.release(1)
  assert.deepEqual(await a, OK)
  assert.deepEqual(admissionOrder(), ['a'])
})

test('an admission slot is freed for the next request once its call finishes', async () => {
  const { runner, invoker } = admission({ globalConcurrency: 1, perProjectConcurrency: 1 })
  const first = call(invoker, 'p1')
  await tick()
  assert.equal(runner.calls.length, 1)
  runner.release(1)
  assert.equal((await first).status, 200)
  const second = call(invoker, 'p1')
  await tick()
  assert.equal(runner.calls.length, 2, 'the freed slot admitted the next request')
  runner.release(1)
  assert.equal((await second).status, 200)
})

test('the runner call\'s failure answers APPLICATION_RUNNER_UNAVAILABLE with its Project and operation', async () => {
  const unreachable = createApplicationInvoker({ invoke: async () => { throw new Error('socket refused') } })
  await assert.rejects(() => call(unreachable, 'p1'), (error) => error.id === 'APPLICATION_RUNNER_UNAVAILABLE' && error.details.project === 'p1' && error.details.operation === 'op')
})

// The connector port lives exactly as long as one invocation: opened for its source before the
// runner is called, named to the runner beside the input, and closed after the answer or the failure.
const portOpener = () => {
  const events = []
  const openConnectorPort = async (portSource) => {
    events.push(['open', portSource])
    return { socketPath: '/run/hub-connectors/abc.s', close: async () => { events.push(['close']) } }
  }
  return { events, openConnectorPort }
}

test('the connector port is opened for the source, named to the runner and closed after its answer', async () => {
  const ports = portOpener()
  const calls = []
  const invoker = createApplicationInvoker({
    openConnectorPort: ports.openConnectorPort,
    invoke: async (input) => { calls.push(input); ports.events.push(['invoke', input.connectorSocket]); return { status: 200, body: { ok: true } } },
  })
  assert.deepEqual(await call(invoker, 'p1'), { status: 200, body: { ok: true } })
  assert.deepEqual(ports.events, [['open', source('p1')], ['invoke', '/run/hub-connectors/abc.s'], ['close']])
  assert.equal(calls[0].input.connectorSocket, undefined, 'the socket is a platform fact beside the input, never inside it')
})

test('the connector port is closed when the runner fails or times out', async () => {
  const ports = portOpener()
  const invoker = createApplicationInvoker({
    openConnectorPort: ports.openConnectorPort,
    invoke: async () => { throw new Error('APPLICATION_RUNNER_UNAVAILABLE') },
  })
  await assert.rejects(() => call(invoker, 'p1'), /APPLICATION_RUNNER_UNAVAILABLE/)
  assert.deepEqual(ports.events.map(([event]) => event), ['open', 'close'])
})

test('with no connector port the runner is called without a socket', async () => {
  const runner = spyInvoke()
  const invoker = createApplicationInvoker({ invoke: runner.invoke, openConnectorPort: async () => null })
  assert.equal((await call(invoker, 'p1')).status, 200)
  assert.equal(Object.hasOwn(runner.calls[0], 'connectorSocket'), false)
})
