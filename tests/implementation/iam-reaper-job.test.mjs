import assert from 'node:assert/strict'
import test from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'
import { takeHubLogs } from './hub-log-capture.mjs'

const { iamReaperJob } = await import(hubModuleUrl('identity-access/reaper.js'))

const signal = new AbortController().signal
const poolAnswering = (rows) => {
  const calls = []
  return { calls, query: async (sql, values) => { calls.push([sql, values]); return { rows } } }
}

test('the reaper job calls iam.reap_expired once per pass with the time of the pass and a batch of 500', async () => {
  const pool = poolAnswering([])
  const job = iamReaperJob(pool)
  const before = Date.now()
  await job.run(signal)
  const [[sql, [now, limit]]] = pool.calls
  assert.deepEqual({ name: job.name, everyMs: job.everyMs, sql, limit, nowIsDate: now instanceof Date && now.getTime() >= before }, {
    name: 'iam-reaper', everyMs: 300_000, sql: 'SELECT relation, action, removed FROM iam.reap_expired($1, $2)', limit: 500, nowIsDate: true,
  })
})

test('the reaper job writes one IAM_EXPIRED_REAPED line for each rule that removed or ended a row, and none for the rest', async () => {
  takeHubLogs()
  await iamReaperJob(poolAnswering([
    { relation: 'iam.handoff', action: 'DELETED', removed: 0 },
    { relation: 'iam.host_session', action: 'ENDED', removed: 3 },
    { relation: 'iam.oidc_transaction', action: 'DELETED', removed: 12 },
  ])).run(signal)
  assert.deepEqual(takeHubLogs().map(({ level, message, fields }) => [level, message, fields]), [
    ['info', 'IAM_EXPIRED_REAPED', { relation: 'iam.host_session', action: 'ENDED', removed: 3 }],
    ['info', 'IAM_EXPIRED_REAPED', { relation: 'iam.oidc_transaction', action: 'DELETED', removed: 12 }],
  ])
})

test('an answer that is not a relation, an action and a count rejects the pass, for the executor to log', async () => {
  await assert.rejects(iamReaperJob(poolAnswering([{ relation: 'iam.handoff', action: 'PURGED', removed: 1 }])).run(signal))
  await assert.rejects(iamReaperJob(poolAnswering([{ relation: 'iam.handoff', action: 'DELETED', removed: -1 }])).run(signal))
})
