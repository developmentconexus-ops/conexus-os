import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const admission = readFileSync(resolve(repositoryRoot, 'apps/hub/src/mar/admission.ts'), 'utf8')

test('R3 MAR adapter pins the selected runtime tuple and disables hidden lifecycle', () => {
  assert.match(admission, /pg-boss/)
  assert.match(admission, /schema: 'mar'/)
  assert.match(admission, /createSchema: false/)
  assert.match(admission, /migrate: false/)
  assert.match(admission, /schedule: false/)
  assert.match(admission, /retryLimit: 0/)
  assert.match(admission, /supervise: false/)
  assert.match(admission, /useListenNotify: false/)
})

test('R3 MAR admission co-admits owner truth and queue projection in one client transaction', () => {
  assert.match(admission, /BEGIN/)
  assert.match(admission, /mar\.admit_job_run\(/)
  assert.match(admission, /db: transactionDatabase\(client\)/)
  assert.match(admission, /MAR_QUEUE_PROJECTION_NOT_CREATED/)
  assert.match(admission, /COMMIT/)
  assert.match(admission, /ROLLBACK/)
  assert.doesNotMatch(admission, /mar\.job_run\s*\)?\s*\.(?:insert|update|delete)/i)
})
