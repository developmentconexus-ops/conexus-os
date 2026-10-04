import assert from 'node:assert/strict'
import test from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'
import { takeHubLogs } from './hub-log-capture.mjs'

const { startJobs } = await import(hubModuleUrl('platform/jobs.js'))

const settle = () => new Promise((done) => { setImmediate(done) })
const mockTimers = (t) => t.mock.timers.enable({ apis: ['setTimeout'] })

test('a job runs one pass at start and the next one its interval after the previous pass settles', async (t) => {
  mockTimers(t)
  const passes = []
  let release
  const jobs = startJobs([{
    name: 'slow', everyMs: 1_000,
    run: async () => { passes.push('start'); await new Promise((resolve) => { release = resolve }); passes.push('end') },
  }])
  await settle()
  t.mock.timers.tick(5_000)
  await settle()
  assert.deepEqual(passes, ['start'], 'the interval counts from the end of a pass, so a slow pass never overlaps itself')
  release()
  await settle()
  t.mock.timers.tick(999)
  await settle()
  assert.deepEqual(passes, ['start', 'end'])
  t.mock.timers.tick(1)
  await settle()
  assert.deepEqual(passes, ['start', 'end', 'start'])
  release()
  await jobs.close()
})

test('each job keeps its own interval', async (t) => {
  mockTimers(t)
  const passes = []
  const jobs = startJobs([
    { name: 'fast', everyMs: 10, run: async () => { passes.push('fast') } },
    { name: 'slow', everyMs: 25, run: async () => { passes.push('slow') } },
  ])
  await settle()
  for (const tick of [10, 10, 5]) {
    t.mock.timers.tick(tick)
    await settle()
  }
  assert.deepEqual(passes, ['fast', 'slow', 'fast', 'fast', 'slow'])
  await jobs.close()
})

test('a rejected pass writes one JOB_FAILED line naming the job, and the next pass runs', async (t) => {
  mockTimers(t)
  takeHubLogs()
  let passes = 0
  const jobs = startJobs([{ name: 'flaky', everyMs: 10, run: async () => { passes += 1; if (passes === 1) throw new Error('DATABASE_DOWN') } }])
  await settle()
  t.mock.timers.tick(10)
  await settle()
  await jobs.close()
  const lines = takeHubLogs().map(({ level, message, fields }) => [level, message, fields['failure.details.job'], fields['exception.type']])
  assert.deepEqual({ lines, passes }, { lines: [['error', 'JOB_FAILED', 'flaky', 'Error']], passes: 2 })
})

test('closing aborts the signal, waits for the pass in flight and arms nothing after it', async (t) => {
  mockTimers(t)
  const events = []
  let release
  let signal
  const jobs = startJobs([{
    name: 'draining', everyMs: 10,
    run: async (given) => { signal = given; events.push('start'); await new Promise((resolve) => { release = resolve }); events.push(`end aborted=${given.aborted}`) },
  }])
  await settle()
  const closing = jobs.close().then(() => { events.push('closed') })
  await settle()
  assert.deepEqual({ events, aborted: signal.aborted }, { events: ['start'], aborted: true })
  release()
  await closing
  t.mock.timers.tick(1_000)
  await settle()
  assert.deepEqual(events, ['start', 'end aborted=true', 'closed'])
  await jobs.close()
})

test('closing between passes clears the armed timer', async (t) => {
  mockTimers(t)
  let passes = 0
  const jobs = startJobs([{ name: 'idle', everyMs: 10, run: async () => { passes += 1 } }])
  await settle()
  await jobs.close()
  t.mock.timers.tick(1_000)
  await settle()
  assert.equal(passes, 1)
})
