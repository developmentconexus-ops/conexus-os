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
  const target = mkdtempSync(resolve(tmpdir(), 'conexus-3n-'))
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

const mutate = (target, path, from, to) => {
  const absolute = resolve(target, path)
  const original = readFileSync(absolute, 'utf8')
  assert.ok(original.includes(from), `fixture mutation target missing in ${path}`)
  writeFileSync(absolute, original.replace(from, to))
}

const expectRejected = (target, pattern, options) => {
  const result = run(target, options)
  const output = outputOf(result)
  assert.notEqual(result.status, 0, `negative control unexpectedly passed:\n${output}`)
  assert.match(output, pattern)
}

test('historical 3N audit rejects deletion from accepted section-46 coverage', () => {
  const target = fixture({ historical: true })
  try {
    mutate(
      target,
      'docs/architecture/index.md',
      'FIRST_BUILD | Gateway idempotency/reconciliation scope accepted when deliberately under-declared\n',
      ''
    )
    expectRejected(target, /section-46 minimum falsifier count changed/, { historical: true })
  } finally {
    rmSync(target, { recursive: true, force: true })
  }
})

test('historical 3N audit rejects resurrection of superseded monetary reservation wording', () => {
  const target = fixture({ historical: true })
  try {
    mutate(
      target,
      'docs/architecture/index.md',
      'FIRST_BUILD | provider/model execution escaping finite server-derived call/step/retry/fallback bounds\n',
      'FIRST_BUILD | provider call occurring without spend reservation\n'
    )
    expectRejected(target, /superseded model-spend reservation wording/, { historical: true })
  } finally {
    rmSync(target, { recursive: true, force: true })
  }
})

test('historical 3N audit rejects a first-production falsifier moved to first-build', () => {
  const target = fixture({ historical: true })
  try {
    mutate(
      target,
      'docs/phases/3n-architecture-verification.md',
      '| 3N-V25 | FIRST_PRODUCTION | FIRST_PRODUCTION | restore without positive generation continuity opening normal PROD |',
      '| 3N-V25 | FIRST_BUILD | FIRST_BUILD | restore without positive generation continuity opening normal PROD |'
    )
    expectRejected(target, /3N-V25 routing differs from architecture authority/, { historical: true })
  } finally {
    rmSync(target, { recursive: true, force: true })
  }
})

test('historical 3N audit rejects loss of a current 3M obligation', () => {
  const target = fixture({ historical: true })
  try {
    mutate(target, 'docs/phases/3m-failure-recovery-architecture.md', 'unknown preservation, ', '')
    expectRejected(target, /3N-routed obligation intake differs from current owners/, { historical: true })
  } finally {
    rmSync(target, { recursive: true, force: true })
  }
})

test('historical 3N audit rejects loss of CR-1 joint proof routing', () => {
  const target = fixture({ historical: true })
  try {
    mutate(target, 'docs/reference/data-and-persistence.md', '3N/3O must prove both sides together', 'FIRST_BUILD must prove both sides together')
    expectRejected(target, /CR-1 current 3N routing is missing/, { historical: true })
  } finally {
    rmSync(target, { recursive: true, force: true })
  }
})

test('historical 3N audit rejects deletion of current UX proof coverage', () => {
  const target = fixture({ historical: true })
  try {
    mutate(
      target,
      'docs/phases/3n-architecture-verification.md',
      '| Builder UX progressive disclosure / platform machinery not primary workflow | FIRST_BUILD |',
      ''
    )
    expectRejected(target, /downstream proof-family coverage missing/, { historical: true })
  } finally {
    rmSync(target, { recursive: true, force: true })
  }
})

test('historical 3N audit admits operator-ratified C-018 after 3O closure', () => {
  const target = fixture({ historical: true })
  try {
    const result = run(target, { historical: true })
    assert.equal(result.status, 0, outputOf(result))
  } finally {
    rmSync(target, { recursive: true, force: true })
  }
})

test('historical 3N audit rejects C-018 ratification review before 3O closure', () => {
  const target = fixture({ historical: true })
  try {
    mutate(
      target,
      'docs/roadmap.md',
      '| C-018 | RATIFIED / OPERATOR RATIFIED |',
      '| C-018 | OPEN / RATIFICATION REVIEW |'
    )
    mutate(target, 'docs/roadmap.md', '| 3O | CLOSED |', '| 3O | OPEN / ACTIVE |')
    expectRejected(target, /C-018 must remain NOT RATIFIED until 3O closure/, { historical: true })
  } finally {
    rmSync(target, { recursive: true, force: true })
  }
})

test('historical 3N audit rejects operator-ratified C-018 before 3O closure', () => {
  const target = fixture({ historical: true })
  try {
    mutate(target, 'docs/roadmap.md', '| 3O | CLOSED |', '| 3O | OPEN / ACTIVE |')
    expectRejected(target, /C-018 ratification requires 3N and 3O CLOSED/, { historical: true })
  } finally {
    rmSync(target, { recursive: true, force: true })
  }
})
