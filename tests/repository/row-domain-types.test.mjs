import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { test } from 'node:test'

const root = resolve(import.meta.dirname, '../..')
test('actual row boundary types reject illegal variants and mismatched branded identities', () => {
  const result = spawnSync(process.execPath, [resolve(root, 'node_modules/typescript/bin/tsc'),
    '--noEmit', '--strict', '--skipLibCheck', '--target', 'ES2022', '--module', 'NodeNext',
    '--moduleResolution', 'NodeNext', resolve(root, 'tests/fixtures/row-domain-negative.ts')],
  { cwd: root, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stdout + result.stderr)
})
