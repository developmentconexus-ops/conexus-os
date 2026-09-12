import assert from 'node:assert/strict'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'

const root = resolve(new URL('../../', import.meta.url).pathname)
const script = resolve(root, 'scripts/check-architecture-verification.mjs')
const authorityPaths = [
  'docs/roadmap.md',
  'docs/architecture/index.md',
  'docs/phases/3m-failure-recovery-architecture.md',
  'docs/phases/3n-architecture-verification.md',
  'docs/reference/data-and-persistence.md',
  'docs/reference/integrations-and-gateway.md',
  'docs/reference/managed-execution-qualification.md'
]

const outputOf = result => `${result.stdout ?? ''}\n${result.stderr ?? ''}`
const run = (verificationRoot, { historical = false } = {}) => spawnSync(process.execPath, [script, ...(historical ? ['--historical'] : []), verificationRoot], {
  cwd: root,
  encoding: 'utf8'
})

const fixture = ({ historical = false } = {}) => {
  const target = mkdtempSync(resolve(tmpdir(), 'conexus-3o-closure-'))
  for (const path of authorityPaths) {
    const destination = resolve(target, path)
    mkdirSync(dirname(destination), { recursive: true })
    if (historical && path === 'docs/roadmap.md') {
      writeFileSync(destination, ['3A', '3B–3K', '3L', '3M', '3N', '3O'].map(phase => `| ${phase} | CLOSED | fixture | fixture |`).join('\n') + '\n| C-018 | RATIFIED / OPERATOR RATIFIED | fixture | fixture |\n| Product implementation | BLOCKED | fixture | fixture |\n')
    } else {
      copyFileSync(resolve(root, path), destination)
    }
  }
  return target
}

const set3OStatus = (target, status) => {
  const path = resolve(target, 'docs/roadmap.md')
  const original = readFileSync(path, 'utf8')
  const pattern = /^(\| 3O \| )[^|]+(?= \|)/m
  assert.match(original, pattern, '3O status row missing')
  writeFileSync(path, original.replace(pattern, `$1${status}`))
}

test('default architecture verification does not require a historical 3O status', () => {
  const target = fixture({ historical: true })
  try {
    set3OStatus(target, 'NOT STARTED')
    const result = run(target)
    assert.equal(result.status, 0, outputOf(result))
  } finally {
    rmSync(target, { recursive: true, force: true })
  }
})

test('historical architecture audit admits the operator-authorized 3O CLOSED closure state', () => {
  const target = fixture({ historical: true })
  try {
    set3OStatus(target, 'CLOSED')
    const result = run(target, { historical: true })
    assert.equal(result.status, 0, outputOf(result))
  } finally {
    rmSync(target, { recursive: true, force: true })
  }
})

test('historical architecture audit rejects an illegal post-3N 3O status', () => {
  const target = fixture({ historical: true })
  try {
    set3OStatus(target, 'NOT STARTED')
    const result = run(target, { historical: true })
    const output = outputOf(result)
    assert.notEqual(result.status, 0, `illegal 3O status unexpectedly passed:\n${output}`)
    assert.match(output, /3O must be/)
  } finally {
    rmSync(target, { recursive: true, force: true })
  }
})
