import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'

const root = resolve(import.meta.dirname, '../..')
const MESSAGE = 'A gate is opened only by identity-access/admission.ts and authentication.ts.'
const BIND = 'An account is bound to an authentication gate only by identity-access/authentication.ts.'
const RECEIPT = 'A receipt is made only by receiptOf in identity-access/admission.ts.'

const lint = (file) => {
  const result = spawnSync(resolve(root, 'node_modules/.bin/biome'), ['lint', '--colors=off', file], { cwd: root, encoding: 'utf8' })
  return result.stdout + result.stderr
}

test('openGate is importable by admission.ts and authentication.ts only', () => {
  const probe = 'apps/hub/src/workspace/gate-import-probe.ts'
  try {
    writeFileSync(resolve(root, probe), "import { openGate } from '../platform/db.js'\n\nexport const opened = openGate\n")
    assert.ok(lint(probe).includes(MESSAGE))
  } finally {
    rmSync(resolve(root, probe), { force: true })
  }
  assert.ok(!lint('apps/hub/src/identity-access/admission.ts').includes(MESSAGE))
})

const probe = (path, text) => {
  try {
    writeFileSync(resolve(root, path), text)
    return lint(path)
  } finally {
    rmSync(resolve(root, path), { force: true })
  }
}

test('bindAccount is importable by authentication.ts only', () => {
  const text = "import { bindAccount } from '../platform/db.js'\n\nexport const bound = bindAccount\n"
  assert.ok(probe('apps/hub/src/workspace/bind-import-probe.ts', text).includes(BIND))
  assert.ok(lint('apps/hub/src/identity-access/authentication.ts').includes(BIND) === false)
  assert.ok(probe('apps/hub/src/identity-access/sessions-bind-probe.ts', text).includes(BIND))
})

test('receipted is importable by admission.ts only', () => {
  const text = "import { receipted } from '../platform/receipt.js'\n\nexport const made = receipted\n"
  assert.ok(probe('apps/hub/src/workspace/receipt-import-probe.ts', text).includes(RECEIPT))
  assert.ok(probe('apps/hub/src/identity-access/authentication-receipt-probe.ts', text).includes(RECEIPT))
  assert.ok(!lint('apps/hub/src/identity-access/admission.ts').includes(RECEIPT))
})

test('a pg import fires in every Hub source file except the database edge, and openGate beside it still fires', () => {
  const PG = 'Only the database edge may import pg.'
  const probe = (path, text) => {
    try {
      writeFileSync(resolve(root, path), text)
      return lint(path)
    } finally {
      rmSync(resolve(root, path), { force: true })
    }
  }
  const both = "import pg from 'pg'\nimport { openGate } from '../platform/db.js'\n\nexport const used = [pg, openGate]\n"
  const output = probe('apps/hub/src/workspace/pg-import-probe.ts', both)
  assert.ok(output.includes(PG), output)
  assert.ok(output.includes(MESSAGE), output)
  assert.ok(probe('apps/hub/src/identity-access/pg-import-probe.ts', "import pg from 'pg'\n\nexport const used = pg\n").includes(PG))
  assert.ok(!probe('apps/hub/src/project/store.ts.probe.ts', "import { sql } from '../platform/db.js'\n\nexport const used = sql\n").includes(PG))
  assert.ok(lint('apps/hub/src/platform/db.ts').includes(PG) === false)
})
