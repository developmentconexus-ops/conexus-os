import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { test } from 'node:test'

const root = resolve(import.meta.dirname, '../..')
test('admission and transaction modes reject forged or mismatched calls', () => {
  const result = spawnSync(process.execPath, [resolve(root, 'node_modules/typescript/bin/tsc'),
    '--noEmit', '--strict', '--skipLibCheck', '--target', 'ES2022', '--module', 'NodeNext',
    '--moduleResolution', 'NodeNext', resolve(root, 'tests/fixtures/admission-negative.ts')],
  { cwd: root, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stdout + result.stderr)
})

test('the Git snapshot helpers reject a Project id, a plain string and an unparsed revision', () => {
  const result = spawnSync(process.execPath, [resolve(root, 'node_modules/typescript/bin/tsc'),
    '--noEmit', '--strict', '--skipLibCheck', '--target', 'ES2022', '--module', 'NodeNext',
    '--moduleResolution', 'NodeNext', resolve(root, 'tests/fixtures/builder-brands-negative.ts')],
  { cwd: root, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stdout + result.stderr)
})
