import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { after, before, test } from 'node:test'

const root = resolve(import.meta.dirname, '../..')
const MESSAGE = 'A gate is opened only by identity-access/admission.ts.'
const PG = 'Only the database edge may import pg.'

let sandboxDir

before(() => {
  sandboxDir = mkdtempSync(resolve(tmpdir(), 'gate-rule-sandbox-'))
  const repoBiomeConfig = JSON.parse(readFileSync(resolve(root, 'biome.json'), 'utf8'))
  repoBiomeConfig.vcs = { ...(repoBiomeConfig.vcs || {}), enabled: false }
  writeFileSync(resolve(sandboxDir, 'biome.json'), JSON.stringify(repoBiomeConfig, null, 2))
  symlinkSync(resolve(root, 'biome'), resolve(sandboxDir, 'biome'), 'dir')
})

after(() => {
  if (sandboxDir) {
    rmSync(sandboxDir, { force: true, recursive: true })
  }
})

const lint = (path, text) => {
  const full = resolve(sandboxDir, path)
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, text)
  const result = spawnSync(resolve(root, 'node_modules/.bin/biome'), ['lint', '--colors=off', path], {
    cwd: sandboxDir,
    encoding: 'utf8',
  })
  return result.stdout + result.stderr
}

const lintReal = (path) => {
  const result = spawnSync(resolve(root, 'node_modules/.bin/biome'), ['lint', '--colors=off', path], {
    cwd: root,
    encoding: 'utf8',
  })
  return result.stdout + result.stderr
}

test('openGate is importable by admission.ts only', () => {
  const probe = 'apps/hub/src/workspace/gate-import-probe.ts'
  const probeCode = "import { openGate } from '../platform/db.js'\n\nexport const opened = openGate\n"
  assert.ok(lint(probe, probeCode).includes(MESSAGE))

  const admissionCode = "import { openGate } from '../platform/db.js'\n\nexport const opened = openGate\n"
  assert.ok(!lint('apps/hub/src/identity-access/admission.ts', admissionCode).includes(MESSAGE))
  assert.ok(!lintReal('apps/hub/src/identity-access/admission.ts').includes(MESSAGE))
})

test('a pg import fires in every Hub source file except the database edge, and openGate beside it still fires', () => {
  const both = "import pg from 'pg'\nimport { openGate } from '../platform/db.js'\n\nexport const used = [pg, openGate]\n"
  const output = lint('apps/hub/src/workspace/pg-import-probe.ts', both)
  assert.ok(output.includes(PG), output)
  assert.ok(output.includes(MESSAGE), output)

  assert.ok(lint('apps/hub/src/identity-access/pg-import-probe.ts', "import pg from 'pg'\n\nexport const used = pg\n").includes(PG))
  assert.ok(!lint('apps/hub/src/project/store.ts.probe.ts', "import { sql } from '../platform/db.js'\n\nexport const used = sql\n").includes(PG))
  assert.ok(lint('apps/hub/src/platform/db.ts', "import pg from 'pg'\n\nexport const used = pg\n").includes(PG) === false)
  assert.ok(lintReal('apps/hub/src/platform/db.ts').includes(PG) === false)
})
