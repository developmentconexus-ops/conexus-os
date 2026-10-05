import assert from 'node:assert/strict'
import { globSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'

const root = resolve(import.meta.dirname, '../..')

test('grantCreatorMembership is the only statement in the Hub that inserts a workspace membership', () => {
  const writers = globSync('apps/hub/src/**/*.ts', { cwd: root })
    .filter((file) => /INSERT\s+INTO\s+iam\.workspace_membership/i.test(readFileSync(resolve(root, file), 'utf8')))
  assert.deepEqual(writers, ['apps/hub/src/identity-access/admission.ts'])
  const source = readFileSync(resolve(root, writers[0]), 'utf8')
  assert.equal(source.match(/INSERT\s+INTO\s+iam\.workspace_membership/gi)?.length, 1)
})
