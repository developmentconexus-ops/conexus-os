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

test('current 3N architecture verification contract is green', () => {
  const result = run(root)
  assert.equal(result.status, 0, outputOf(result))
})

test('3N owner guard rejects semantic-owner drift', () => {
  const target = fixture()
  try {
    mutate(target, 'docs/architecture/index.md', '| **Workspace** |', '| **Generic Recovery** |')
    expectRejected(target, /semantic owner set changed/)
  } finally {
    rmSync(target, { recursive: true, force: true })
  }
})

test('3N owner guard rejects loss of owner-local recovery law', () => {
  const target = fixture()
  try {
    mutate(target, 'docs/architecture/index.md', 'recovery meaning remains owner-local; no generic Recovery owner/FSM exists', 'recovery may use a generic Recovery owner')
    expectRejected(target, /owner-local recovery law is missing/)
  } finally {
    rmSync(target, { recursive: true, force: true })
  }
})

test('3N dependency guard rejects L7 orchestration drift', () => {
  const target = fixture()
  try {
    mutate(target, 'docs/architecture/index.md', 'PromoteRelease\n```', '```')
    expectRejected(target, /L7 orchestration set changed/)
  } finally {
    rmSync(target, { recursive: true, force: true })
  }
})

test('3N dependency guard rejects loss of the single domain inversion', () => {
  const target = fixture()
  try {
    mutate(target, 'docs/architecture/index.md', 'There is exactly one domain dependency inversion:', 'There may be domain dependency inversions:')
    expectRejected(target, /single domain dependency inversion projection changed/)
  } finally {
    rmSync(target, { recursive: true, force: true })
  }
})

test('3N dependency guard rejects infrastructure-boundary drift', () => {
  const target = fixture()
  try {
    mutate(target, 'docs/architecture/index.md', '`GitInfra`', '`GenericInfra`')
    expectRejected(target, /infrastructure boundary set changed/)
  } finally {
    rmSync(target, { recursive: true, force: true })
  }
})

test('3N data-closure guard rejects loss of a durable record class', () => {
  const target = fixture()
  try {
    mutate(target, 'docs/reference/data-and-persistence.md', 'audit_record / operational_event\n', 'audit_record\n')
    expectRejected(target, /durable record inventory count changed/)
  } finally {
    rmSync(target, { recursive: true, force: true })
  }
})

test('3N data-closure guard rejects an undeclared record schema', () => {
  const target = fixture()
  try {
    mutate(target, 'docs/reference/data-and-persistence.md', 'obs: audit_record / operational_event\n', 'xyz: audit_record / operational_event\n')
    expectRejected(target, /durable record schema closure changed/)
  } finally {
    rmSync(target, { recursive: true, force: true })
  }
})

test('3N FK guard rejects an endpoint outside the current schema and record inventory', () => {
  const target = fixture()
  try {
    mutate(
      target,
      'docs/reference/data-and-persistence.md',
      '| 16 | `att.attachment.project_id → prj.project(id)` |',
      '| 16 | `xyz.invented_record.nope_id → nowhere.missing(id)` |'
    )
    expectRejected(target, /Tier-2 FK endpoint is outside current data closure/)
  } finally {
    rmSync(target, { recursive: true, force: true })
  }
})

test('current Gateway guard rejects loss of the external-effect budget projection', () => {
  const target = fixture()
  try {
    mutate(target, 'docs/reference/integrations-and-gateway.md', 'external-effect unit/budget authority', 'effect budget authority')
    expectRejected(target, /gw\.budget_counter lacks current Gateway consumer\/invariant projection/)
  } finally {
    rmSync(target, { recursive: true, force: true })
  }
})

test('3N checker reports an unreadable explicit verification root without a stack trace', () => {
  const missing = resolve(tmpdir(), `conexus-3n-missing-${Date.now()}`)
  const result = run(missing)
  const output = outputOf(result)
  assert.notEqual(result.status, 0)
  assert.match(output, /unable to read verification file/)
  assert.doesNotMatch(output, /node:fs|ENOENT.*at /s)
})
