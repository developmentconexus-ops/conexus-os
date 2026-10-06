import assert from 'node:assert/strict'
import { globSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'

const root = resolve(import.meta.dirname, '../..')
const MAY_CALL_SYSTEM = [
  'apps/hub/src/builder/conversation-store.ts',
  'apps/hub/src/builder/model-account/accounts.ts',
  'apps/hub/src/builder/run-lease.ts',
  'apps/hub/src/builder/run-reads.ts',
  'apps/hub/src/builder/run-lifecycle.ts',
  'apps/hub/src/project/deletion.ts',
]

test('only the project purge and the Builder executor open a system transaction', () => {
  const callers = globSync('apps/hub/src/**/*.ts', { cwd: root })
    .filter((file) => file !== 'apps/hub/src/platform/db.ts')
    .filter((file) => /\.system\(/.test(readFileSync(resolve(root, file), 'utf8')))
    .sort()
  const unexpected = callers.filter((file) => !MAY_CALL_SYSTEM.includes(file))
  assert.deepEqual(unexpected, [])
})

test('the project purge functions are named only by the project deletion', () => {
  const files = globSync('apps/hub/src/**/*.ts', { cwd: root })
    .filter((file) => /purge_project/.test(readFileSync(resolve(root, file), 'utf8')))
  assert.deepEqual(files, ['apps/hub/src/project/deletion.ts'])
})
