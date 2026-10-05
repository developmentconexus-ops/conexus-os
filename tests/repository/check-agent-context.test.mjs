import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const script = resolve(root, 'scripts/check-agent-context.mjs')
const run = candidateRoot => spawnSync(process.execPath, [script, candidateRoot], { encoding: 'utf8' })

const DELIVERY = 'docs/development/delivery.md'
const baseFiles = {
  'package.json': '{"name":"conexus-os","private":true,"scripts":{"repository:check":"node check.mjs","verify":"node verify.mjs"}}\n',
  'AGENTS.md': '# Agents\n\nTrunk is `main`.\nCI runs `npm run verify`.\n',
  [DELIVERY]: '# Delivery\n\n## Merge gate\n\nRead [AGENTS](../../AGENTS.md) and [the gate](#merge-gate).\nRun `npm run repository:check`.\n',
}

const fixture = (context, overrides = {}) => {
  const target = mkdtempSync(resolve(tmpdir(), 'conexus-agent-context-'))
  context.after(() => rmSync(target, { recursive: true, force: true }))
  execFileSync('git', ['init', '--quiet', '-b', 'main'], { cwd: target })
  for (const [path, contents] of Object.entries({ ...baseFiles, ...overrides })) {
    mkdirSync(dirname(resolve(target, path)), { recursive: true })
    writeFileSync(resolve(target, path), contents)
  }
  return target
}
const plant = (candidate, path, line) => appendFileSync(resolve(candidate, path), `${line}\n`)
const lines = count => `${Array.from({ length: count }, (_, index) => `line ${index + 1}`).join('\n')}\n`

test('the real tree passes', () => {
  const result = run(root)
  assert.equal(result.status, 0, result.stdout + result.stderr)
  assert.equal(result.stderr, '')
  assert.match(result.stdout, /^Agent context checks passed \(files=\d+\)\.$/m)
})

test('a clean fixture passes with no findings', context => {
  const result = run(fixture(context))
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout, 'Agent context checks passed (files=2).\n')
})

test('a cited npm script that package.json lacks fails', context => {
  const candidate = fixture(context)
  plant(candidate, DELIVERY, 'Then run `npm run no-such-script`.')
  const result = run(candidate)
  assert.equal(result.status, 1)
  assert.equal(result.stderr, 'error docs/development/delivery.md:7: npm run no-such-script is not a script in package.json\n')
})

test('a relative link to a missing file fails', context => {
  const candidate = fixture(context)
  plant(candidate, DELIVERY, 'See [the old method](repository-method.md).')
  const result = run(candidate)
  assert.equal(result.status, 1)
  assert.equal(result.stderr,
    'error docs/development/delivery.md:7: broken link: repository-method.md (no file at docs/development/repository-method.md)\n')
})

test('a link to a missing heading fails', context => {
  const candidate = fixture(context)
  plant(candidate, 'AGENTS.md', 'See [lanes](docs/development/delivery.md#pick-the-lane).')
  const result = run(candidate)
  assert.equal(result.status, 1)
  assert.equal(result.stderr,
    'error AGENTS.md:5: broken link: docs/development/delivery.md#pick-the-lane (no heading #pick-the-lane in docs/development/delivery.md)\n')
})

test('a workflow with pull_request_target or contents: write fails, and a deleted workflow is ignored', context => {
  const candidate = fixture(context)
  mkdirSync(resolve(candidate, '.github/workflows'), { recursive: true })
  writeFileSync(resolve(candidate, '.github/workflows/a.yml'), 'on: pull_request_target\n')
  writeFileSync(resolve(candidate, '.github/workflows/b.yml'), 'on: push\npermissions:\n  contents: write\n')
  writeFileSync(resolve(candidate, '.github/workflows/c.yml'), 'on: push\npermissions:\n  contents: read\n')
  const result = run(candidate)
  assert.equal(result.status, 1)
  assert.equal(result.stderr, 'error .github/workflows/a.yml: unsafe pull_request_target trigger\nerror .github/workflows/b.yml: workflow has contents: write permission\n')
  execFileSync('git', ['add', '.'], { cwd: candidate })
  rmSync(resolve(candidate, '.github/workflows/a.yml'))
  rmSync(resolve(candidate, '.github/workflows/b.yml'))
  assert.equal(run(candidate).status, 0)
})

test('the root AGENTS.md passes at 60 lines and fails at 61', context => {
  assert.equal(run(fixture(context, { 'AGENTS.md': lines(60) })).status, 0)
  const result = run(fixture(context, { 'AGENTS.md': lines(61) }))
  assert.equal(result.status, 1)
  assert.equal(result.stderr, 'error AGENTS.md: 61 lines exceeds the cap of 60\n')
})

test('a nested AGENTS.md passes at 1800 characters and fails at 1801', context => {
  const nested = 'apps/web/AGENTS.md'
  const atCap = fixture(context, { [nested]: `${'x'.repeat(1799)}\n` })
  const passed = run(atCap)
  assert.equal(passed.status, 0, passed.stderr)
  assert.equal(passed.stdout, 'Agent context checks passed (files=3).\n')
  const failed = run(fixture(context, { [nested]: `${'x'.repeat(1800)}\n` }))
  assert.equal(failed.status, 1)
  assert.equal(failed.stderr, 'error apps/web/AGENTS.md: 1801 characters exceeds the cap of 1800 (about 500 tokens)\n')
})

test('a skill over 90 lines fails, the conexus-development skill included', context => {
  const skill = '.agents/skills/conexus-development/SKILL.md'
  const candidate = fixture(context, { [skill]: lines(91) })
  const result = run(candidate)
  assert.equal(result.status, 1)
  assert.equal(result.stderr, `error ${skill}: 91 lines exceeds the cap of 90\n`)
})

test('the never-list passes at 15 items and fails at 16', context => {
  const shapes = 'docs/development/codebase-principles.md'
  const items = count => `${Array.from({ length: count }, (_, index) => `- **Never do ${index}.** Instead do the other.`).join('\n')}\n`
  assert.equal(run(fixture(context, { [shapes]: items(15) })).status, 0)
  const result = run(fixture(context, { [shapes]: items(16) }))
  assert.equal(result.status, 1)
  assert.equal(result.stderr, `error ${shapes}: 16 never-list items exceeds the cap of 15\n`)
})

test('the vendored Mastra skill is not checked against this package.json', context => {
  const candidate = fixture(context, { '.agents/skills/mastra/SKILL.md': 'Run `npm run dev` in your Mastra project.\n' })
  const result = run(candidate)
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout, 'Agent context checks passed (files=2).\n')
})

test('a guide passes at its byte cap and fails one byte over', context => {
  const guide = 'docs/development/codebase-principles.md'
  assert.equal(run(fixture(context, { [guide]: `${'x'.repeat(8191)}\n` })).status, 0)
  const result = run(fixture(context, { [guide]: `${'x'.repeat(8192)}\n` }))
  assert.equal(result.status, 1)
  assert.equal(result.stderr, `error ${guide}: 8193 bytes exceeds the cap of 8192\n`)
})
