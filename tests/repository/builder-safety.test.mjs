import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'

function candidate(t, files) {
  const root = mkdtempSync(join(tmpdir(), 'builder-safety-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(join(root, 'scripts'))
  copyFileSync(resolve(import.meta.dirname, '../../scripts/check-builder-safety.mjs'), join(root, 'scripts/check-builder-safety.mjs'))
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: root }).status, 0)
  return spawnSync(process.execPath, ['scripts/check-builder-safety.mjs'], { cwd: root, encoding: 'utf8' })
}

test('Mastra internals and run authority remain confined to their owners', t => {
  assert.equal(candidate(t, { 'apps/hub/src/builder/mastra-leftovers.ts': 'deleteWorkflowRunById()', 'apps/hub/src/builder/run-context.ts': "ctx.getRaw('conexusBuilderRunId')" }).status, 0)
  const internals = candidate(t, { 'apps/hub/src/builder/other.ts': 'deleteWorkflowRunById()' })
  assert.equal(internals.status, 1)
  assert.match(internals.stderr, /uses Mastra internals outside their owner/)
  const authority = candidate(t, { 'apps/hub/src/builder/other.ts': "ctx.getRaw('conexusBuilderRunId')" })
  assert.equal(authority.status, 1)
  assert.match(authority.stderr, /reads run authority outside run-context/)
})

test('unnamed, broad, package and unjustified unsafe assertion suppressions are refused', t => {
  for (const [path, line] of [
    ['apps/hub/src/a.ts', '// biome-ignore lint/nursery: works'],
    ['apps/hub/src/a.mts', '// biome-ignore-all lint/nursery/noUnsafeTypeAssertion: debt'],
    ['apps/hub/src/a.cts', '// biome-ignore lint/nursery/noUnsafeTypeAssertion: exempt works'],
    ['packages/contract/src/a.ts', '// biome-ignore lint/nursery/noUnsafeTypeAssertion: debt'],
  ]) assert.equal(candidate(t, { [path]: line }).status, 1, line)
  assert.equal(candidate(t, { 'apps/hub/src/a.ts': '// biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: named owning wave' }).status, 0)
})

test('configuration cannot disable the unsafe assertion rule', t => {
  for (const linter of [{ enabled: false }, { rules: { nursery: { noUnsafeTypeAssertion: 'off' } } }]) {
    const result = candidate(t, { 'biome.json': JSON.stringify({ overrides: [{ linter }] }) })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /turns noUnsafeTypeAssertion off/)
  }
})
