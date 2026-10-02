import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'

const { IDLE_MACHINE_MAX_AGE_MS, scheduleIdleMachineSweep, sweepIdleMachines } = await import(hubModuleUrl('builder/idle-machine-sweep.js'))
const { e2bConversationSandboxes } = await import(hubModuleUrl('builder/run-runtime.js'))

const DAY = 86_400_000
const NOW = Date.UTC(2026, 9, 2)
const machine = (conversationId, providerSandboxId, days) => ({ conversationId, providerSandboxId, idleSince: new Date(NOW - days * DAY) })

// The production sandbox cache with E2B's kill stubbed out, so a sweep's kill is the real killRecorded.
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
  const sweep = () => sweepIdleMachines({
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

test('#423 a machine idle exactly 7 days is deleted, and the limit is 7 days', async () => {
  assert.equal(IDLE_MACHINE_MAX_AGE_MS, 7 * DAY)
  const { sweep, killed } = sweepWith({ machines: [machine('conv-7', 'ivm-7', 7)] })
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
  await sweepIdleMachines({
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
