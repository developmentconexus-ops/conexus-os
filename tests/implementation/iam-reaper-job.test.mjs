import assert from 'node:assert/strict'
import test from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'
import { takeHubLogs } from './hub-log-capture.mjs'

const { iamReaperJob } = await import(hubModuleUrl('identity-access/reaper.js'))

const signal = new AbortController().signal
const poolAnswering = (rows) => ({ query: async () => ({ rows }) })

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
  await assert.rejects(iamReaperJob(poolAnswering([{ relation: 'iam.handoff', action: 'PURGED', removed: 1 }])).run(signal), { name: 'ZodError' })
  await assert.rejects(iamReaperJob(poolAnswering([{ relation: 'iam.handoff', action: 'DELETED', removed: -1 }])).run(signal), { name: 'ZodError' })
})
