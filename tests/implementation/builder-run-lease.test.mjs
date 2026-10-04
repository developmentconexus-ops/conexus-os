import assert from 'node:assert/strict'
import test from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'
import { takeHubLogs } from './hub-log-capture.mjs'

const { scheduleRunLease } = await import(hubModuleUrl('builder/run-lease.js'))
const { createBuilderService } = await import(hubModuleUrl('builder/service.js'))

const wait = (ms) => new Promise((wake) => { setTimeout(wake, ms) })

test('the lease sweeps at boot, beats every interval and sweeps after every third beat', async () => {
  const events = []
  const lease = scheduleRunLease({
    heartbeat: async () => { events.push('beat') },
    sweep: async () => { events.push('sweep') },
    log: (line) => { events.push(line) },
  }, 20)
  for (let tries = 0; tries < 200 && events.length < 6; tries++) await wait(10)
  await lease.close()
  assert.deepEqual(events.slice(0, 6), ['beat', 'sweep', 'beat', 'beat', 'beat', 'sweep'])
})

test('closing the lease waits for the pass in flight and skips its sweep, so the run store can close after it', async () => {
  const events = []
  let release
  const beating = new Promise((resolve) => { release = resolve })
  const lease = scheduleRunLease({
    heartbeat: async () => { await beating; events.push('beat') },
    sweep: async () => { events.push('sweep') },
    log: () => {},
  }, 60_000)
  const closing = lease.close().then(() => { events.push('closed') })
  release()
  await closing
  assert.deepEqual(events, ['beat', 'closed'])
})

test('a failed pass is logged with a code and the next one runs', async () => {
  takeHubLogs()
  let passes = 0
  const lease = scheduleRunLease({
    heartbeat: async () => { passes += 1; if (passes === 1) throw new Error('DATABASE_DOWN') },
    sweep: async () => {},
  }, 10)
  for (let tries = 0; tries < 200 && passes < 2; tries++) await wait(10)
  await lease.close()
  const lines = takeHubLogs().map(({ level, message, fields }) => [level, message, fields['exception.type']])
  assert.deepEqual({ lines, ranAgain: passes >= 2 }, { lines: [['error', 'BUILDER_RUN_LEASE_FAILED', 'Error']], ranAgain: true })
})

test('a sweep still in flight never runs beside another, while the beats go on', async () => {
  const events = []
  const finishes = []
  let held = true
  const lease = scheduleRunLease({
    heartbeat: async () => { events.push('beat') },
    sweep: async () => {
      events.push('sweep')
      if (held) await new Promise((finish) => { finishes.push(finish) })
    },
    log: () => {},
  }, 60_000)
  for (let tries = 0; tries < 200 && finishes.length === 0; tries++) await wait(5)
  await Promise.race([lease.tick(true), wait(100)])
  await Promise.race([lease.tick(true), wait(100)])
  const whileSweeping = [...events]
  held = false
  for (const finish of finishes) finish()
  await wait(5)
  await lease.tick(true)
  await lease.close()
  assert.deepEqual({ whileSweeping, after: events.slice(whileSweeping.length) }, { whileSweeping: ['beat', 'sweep', 'beat', 'beat'], after: ['beat', 'sweep'] })
})

test('a run this Hub took over and could not settle is taken again and settled as first classed, not as an ending of its own it lost', async () => {
  const ownerId = '0f000000-0000-4000-8000-0000000000aa'
  const calls = []
  let takes = 0
  let interrupts = 0
  let settled = false
  const service = createBuilderService({
    store: {
      heartbeatBuilderRuns: async () => {},
      takeOverStaleBuilderRuns: async () => (settled ? [] : [{
        builderRunId: '0f000000-0000-4000-8000-0000000000bb', projectId: '0f000000-0000-4000-8000-0000000000cc', conversationId: 'conv-taken',
        candidateRevision: null, resultSourceRevision: null,
        previousOwnerId: takes++ === 0 ? '0f000000-0000-4000-8000-0000000000dd' : ownerId,
      }]),
      interruptBuilderRun: async (_id, reason) => {
        calls.push(['interrupt', reason])
        if (interrupts++ === 0) throw new Error('DATABASE_DOWN')
        settled = true
      },
      failBuilderRun: async (_id, code) => { calls.push(['fail', code]); settled = true },
      close: async () => {},
    },
    applicationArtifacts: {},
    runs: {
      ports: {},
      git: { readMain: async () => 'a'.repeat(40), mainContains: async () => false },
      conversations: { ownerOf: async () => 'PROJECT' },
      source: {},
      appendDiagnostic: async () => {},
      publishRun: async () => {},
      questionWaitMs: 60_000,
      ownerId,
    },
  })
  await service.sweep()
  await service.sweep()
  await service.sweep()
  await service.close()
  assert.deepEqual(calls, [['interrupt', 'HUB_RESTART'], ['interrupt', 'HUB_RESTART']])
})
