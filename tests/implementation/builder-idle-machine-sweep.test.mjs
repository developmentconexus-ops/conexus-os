import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'

const { scheduleIdleMachineSweep } = await import(hubModuleUrl('builder/idle-machine-sweep.js'))
const { e2bConversationSandboxes } = await import(hubModuleUrl('builder/run-runtime.js'))

const DAY = 86_400_000
const NOW = Date.UTC(2026, 9, 2)
const machine = (conversationId, providerSandboxId, days) => ({ conversationId, providerSandboxId, idleSince: new Date(NOW - days * DAY) })

// The production sandbox cache with E2B's kill stubbed out, so a sweep's kill is the real killRecorded.
// The schedule's boot pass lists nothing, so the tick is the one sweep that sees the machines.
const sweepOnce = async (ports) => {
  let listed = 0
  const schedule = scheduleIdleMachineSweep({ ...ports, listPaused: async () => (listed++ === 0 ? [] : ports.listPaused()) }, 3_600_000)
  try { return await schedule.tick() } finally { await schedule.close() }
}

const sweepWith = ({ machines, open = [], failKill = [] }) => {
  const killed = []
  const log = []
  const cache = e2bConversationSandboxes({
    apiKey: 'test-key', templateId: 'conexus:template', log: (line) => log.push(line),
    killProvider: async (id) => {
      if (failKill.includes(id)) throw new Error('E2B_TIMEOUT')
      killed.push(id)
      return true
    },
  })
  const sweep = () => sweepOnce({
    listPaused: async () => machines,
    openRunConversations: async () => new Set(open),
    kill: cache.killRecorded,
    log: (line) => log.push(line),
    now: () => NOW,
  })
  return { sweep, killed, log }
}

test('#423 machines idle 6 and 8 days: only the older is deleted, and one line says which', async () => {
  const { sweep, killed, log } = sweepWith({ machines: [machine('conv-6', 'ivm-6', 6), machine('conv-8', 'ivm-8', 8)] })
  assert.equal(await sweep(), 1)
  assert.deepEqual(killed, ['ivm-8'])
  assert.deepEqual(log, ['BUILDER_IDLE_MACHINE_DELETED:conv-8:ivm-8:8d'])
})

test('#423 a machine idle exactly 7 days is deleted, and one idle a millisecond less is kept', async () => {
  const { sweep, killed } = sweepWith({ machines: [machine('conv-7', 'ivm-7', 7), machine('conv-edge', 'ivm-edge', 7 - 1 / DAY)] })
  await sweep()
  assert.deepEqual(killed, ['ivm-7'])
})

test('#423 the machine of a conversation with a queued, running or parked run is never deleted, however old', async () => {
  const { sweep, killed, log } = sweepWith({
    machines: [machine('conv-active', 'ivm-active', 30), machine('conv-parked', 'ivm-parked', 30), machine('conv-idle', 'ivm-idle', 30)],
    open: ['conv-active', 'conv-parked'],
  })
  await sweep()
  assert.deepEqual(killed, ['ivm-idle'])
  assert.deepEqual(log, ['BUILDER_IDLE_MACHINE_DELETED:conv-idle:ivm-idle:30d'])
})

test('#423 a kill that fails is not logged as a deletion, and the next sweep tries the machine again', async () => {
  const { sweep, killed, log } = sweepWith({ machines: [machine('conv-a', 'ivm-a', 9), machine('conv-b', 'ivm-b', 9)], failKill: ['ivm-a'] })
  assert.equal(await sweep(), 1)
  assert.deepEqual(killed, ['ivm-b'])
  assert.deepEqual(log, ['BUILDER_SANDBOX_KILL_FAILED:ivm-a:E2B_TIMEOUT', 'BUILDER_IDLE_MACHINE_DELETED:conv-b:ivm-b:9d'])
})

test('#423 a sweep with nothing idle never reads the runs', async () => {
  let reads = 0
  await sweepOnce({
    listPaused: async () => [machine('conv-1', 'ivm-1', 1)],
    openRunConversations: async () => { reads += 1; return new Set() },
    kill: async () => { throw new Error('not called') },
    log: () => { throw new Error('not called') },
    now: () => NOW,
  })
  assert.equal(reads, 0)
})

test('#423 a sweep that fails is logged with its code and the schedule keeps running', async () => {
  const log = []
  let calls = 0
  const schedule = scheduleIdleMachineSweep({
    listPaused: async () => { calls += 1; throw new Error('E2B_UNREACHABLE') },
    openRunConversations: async () => new Set(),
    kill: async () => [],
    log: (line) => log.push(line),
  }, 5)
  await new Promise((wake) => { setTimeout(wake, 60) })
  schedule.close()
  assert.ok(calls >= 2, 'it swept at boot and again on the timer')
  assert.equal(log[0], 'BUILDER_IDLE_MACHINE_SWEEP_FAILED:E2B_UNREACHABLE')
})

test('closing the schedule waits for the sweep in flight, so the database can close after it', async () => {
  const events = []
  const schedule = scheduleIdleMachineSweep({
    listPaused: async () => {
      await new Promise((release) => { setTimeout(release, 50) })
      events.push('listed')
      return []
    },
    openRunConversations: async () => new Set(),
    kill: async () => [],
    log: () => {},
  })
  await schedule.close()
  events.push('closed')
  assert.deepEqual(events, ['listed', 'closed'])
})

test('closing the schedule stops a sweep before it kills anything', async () => {
  const killed = []
  let release
  const listed = new Promise((resolve) => { release = resolve })
  const schedule = scheduleIdleMachineSweep({
    listPaused: async () => {
      await listed
      return [machine('c1', 'sbx-1', 30)]
    },
    openRunConversations: async () => new Set(),
    kill: async (ids) => { killed.push(...ids); return ids },
    log: () => {},
  })
  const closing = schedule.close()
  release()
  await closing
  assert.deepEqual(killed, [])
})
