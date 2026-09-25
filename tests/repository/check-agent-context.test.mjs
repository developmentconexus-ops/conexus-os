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
  'package.json': '{"name":"fixture","scripts":{"repository:check":"node check.mjs","verify":"node verify.mjs"}}\n',
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
  assert.match(result.stdout, /^Agent context checks passed \(files=\d+, warnings=\d+\)\.$/m)
})

test('a clean fixture passes with no findings', context => {
  const result = run(fixture(context))
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout, 'Agent context checks passed (files=2, warnings=0).\n')
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

test('a trunk other than main fails', context => {
  const candidate = fixture(context)
  plant(candidate, DELIVERY, 'Open pull requests against `analysis/internal-mvp`.')
  const result = run(candidate)
  assert.equal(result.status, 1)
  assert.equal(result.stderr, 'error docs/development/delivery.md:7: names `analysis/internal-mvp` as the trunk; the trunk is `main`\n')
})

test('only the root AGENTS.md may tell a reader to run npm run verify', context => {
  const candidate = fixture(context)
  plant(candidate, DELIVERY, 'Do not run `npm run verify` locally.')
  assert.equal(run(candidate).status, 0)
  plant(candidate, DELIVERY, 'Run `npm run verify` before you push.')
  const result = run(candidate)
  assert.equal(result.status, 1)
  assert.equal(result.stderr, 'error docs/development/delivery.md:8: only the root AGENTS.md may tell a reader to run npm run verify\n')
})

test('the root AGENTS.md over 60 lines only warns', context => {
  const result = run(fixture(context, { 'AGENTS.md': lines(61) }))
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout, 'warning AGENTS.md: 61 lines exceeds the cap of 60 (enforced once M6 rewrites the root AGENTS.md)\n'
    + 'Agent context checks passed (files=2, warnings=1).\n')
})

test('a nested AGENTS.md passes at 1800 characters and fails at 1801', context => {
  const nested = 'apps/web/AGENTS.md'
  const atCap = fixture(context, { [nested]: `${'x'.repeat(1799)}\n` })
  const passed = run(atCap)
  assert.equal(passed.status, 0, passed.stderr)
  assert.equal(passed.stdout, 'Agent context checks passed (files=3, warnings=0).\n')
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

test('the vendored Mastra skill is not checked against this package.json', context => {
  const candidate = fixture(context, { '.agents/skills/mastra/SKILL.md': 'Run `npm run dev` in your Mastra project.\n' })
  const result = run(candidate)
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout, 'Agent context checks passed (files=2, warnings=0).\n')
})
