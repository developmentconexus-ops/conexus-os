import assert from 'node:assert/strict'
import { globSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'

const root = resolve(import.meta.dirname, '../..')
const MAY_CALL_SYSTEM = [
  'apps/hub/src/identity-access/application-access.ts',
  'apps/hub/src/identity-access/expiry.ts',
  'apps/hub/src/builder/conversation-store.ts',
  'apps/hub/src/builder/model-account/accounts.ts',
  'apps/hub/src/builder/run-lease.ts',
  'apps/hub/src/builder/run-reads.ts',
  'apps/hub/src/builder/run-lifecycle.ts',
  'apps/hub/src/project/deletion.ts',
]

test('only the project purge, the Builder executor and the IAM presence check and expiry open a system transaction', () => {
  const callers = globSync('apps/hub/src/**/*.ts', { cwd: root })
    .filter((file) => file !== 'apps/hub/src/platform/db.ts')
    .filter((file) => /\.system\(/.test(readFileSync(resolve(root, file), 'utf8')))
    .sort()
  const unexpected = callers.filter((file) => !MAY_CALL_SYSTEM.includes(file))
  assert.deepEqual(unexpected, [])
})

test('no SQL purge_project function is named: the project purge is TypeScript ports', () => {
  const files = globSync('apps/hub/src/**/*.ts', { cwd: root })
    .filter((file) => /purge_project/.test(readFileSync(resolve(root, file), 'utf8')))
  assert.deepEqual(files, [])
})
