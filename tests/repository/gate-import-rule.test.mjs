import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'

const root = resolve(import.meta.dirname, '../..')
const MESSAGE = 'A gate is opened only by identity-access/admission.ts.'

const lint = (file) => {
  const result = spawnSync(resolve(root, 'node_modules/.bin/biome'), ['lint', '--colors=off', file], { cwd: root, encoding: 'utf8' })
  return result.stdout + result.stderr
}

test('openGate is importable by admission.ts only', () => {
  const probe = 'apps/hub/src/workspace/gate-import-probe.ts'
  try {
    writeFileSync(resolve(root, probe), "import { openGate } from '../platform/db.js'\n\nexport const opened = openGate\n")
    assert.ok(lint(probe).includes(MESSAGE))
  } finally {
    rmSync(resolve(root, probe), { force: true })
  }
  assert.ok(!lint('apps/hub/src/identity-access/admission.ts').includes(MESSAGE))
})
