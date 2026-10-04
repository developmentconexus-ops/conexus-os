import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'
import { takeHubLogs } from './hub-log-capture.mjs'

const { sweepIdleMachines } = await import(hubModuleUrl('builder/idle-machine-sweep.js'))
const { e2bConversationSandboxes } = await import(hubModuleUrl('builder/conversation-sandboxes.js'))

const DAY = 86_400_000
const NOW = Date.UTC(2026, 9, 2)
const machine = (conversationId, providerSandboxId, days) => ({ conversationId, providerSandboxId, idleSince: new Date(NOW - days * DAY) })

const sweepOnce = (ports) => sweepIdleMachines(ports, new AbortController().signal)

const eventLine = (log) => (code, fields = {}) => log.push([code, ...Object.values(fields)].join(':'))
const failureLine = ({ message, fields }) => `${message}:${fields['exception.type']}`

const sweepWith = ({ machines, open = [], failKill = [] }) => {
  const killed = []
  const log = []
  takeHubLogs()
  const cache = e2bConversationSandboxes({
    apiKey: 'test-key', templateId: 'conexus:template', idleMs: 300_000,
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
    log: eventLine(log),
    now: () => NOW,
  })
  return { sweep, killed, log }
}

test('#423 machines idle 6 and 8 days: only the older is deleted, and one line says which', async () => {
  const { sweep, killed, log } = sweepWith({ machines: [machine('conv-6', 'ivm-6', 6), machine('conv-8', 'ivm-8', 8)] })
  assert.equal(await sweep(), 1)
  assert.deepEqual(killed, ['ivm-8'])
  assert.deepEqual(log, ['BUILDER_IDLE_MACHINE_DELETED:conv-8:ivm-8:8'])
})

test('#423 a machine idle exactly 7 days is deleted, and one idle a millisecond less is kept', async () => {
  const { sweep, killed } = sweepWith({ machines: [machine('conv-7', 'ivm-7', 7), machine('conv-edge', 'ivm-edge', 7 - 1 / DAY)] })
  await sweep()
  assert.deepEqual(killed, ['ivm-7'])
})

test('#423 the machine of a conversation with a queued, running or waiting run is never deleted, however old', async () => {
  const { sweep, killed, log } = sweepWith({
    machines: [machine('conv-active', 'ivm-active', 30), machine('conv-waiting', 'ivm-waiting', 30), machine('conv-idle', 'ivm-idle', 30)],
    open: ['conv-active', 'conv-waiting'],
  })
  await sweep()
  assert.deepEqual(killed, ['ivm-idle'])
  assert.deepEqual(log, ['BUILDER_IDLE_MACHINE_DELETED:conv-idle:ivm-idle:30'])
})

test('#423 a kill that fails is not logged as a deletion, and the next sweep tries the machine again', async () => {
  const { sweep, killed, log } = sweepWith({ machines: [machine('conv-a', 'ivm-a', 9), machine('conv-b', 'ivm-b', 9)], failKill: ['ivm-a'] })
  assert.equal(await sweep(), 1)
  assert.deepEqual(killed, ['ivm-b'])
  assert.deepEqual(takeHubLogs().map(failureLine), ['BUILDER_SANDBOX_KILL_FAILED:Error'])
  assert.deepEqual(log, ['BUILDER_IDLE_MACHINE_DELETED:conv-b:ivm-b:9'])
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

test('closing the signal before the kill stops a sweep before it kills anything', async () => {
  const killed = []
  const stop = new AbortController()
  const swept = sweepIdleMachines({
    listPaused: async () => {
      stop.abort()
      return [machine('c1', 'sbx-1', 30)]
    },
    openRunConversations: async () => new Set(),
    kill: async (ids) => { killed.push(...ids); return ids },
    log: () => {},
    now: () => NOW,
  }, stop.signal)
  assert.equal(await swept, 0)
  assert.deepEqual(killed, [])
})
