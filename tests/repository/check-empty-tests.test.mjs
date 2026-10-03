import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'

const script = resolve(import.meta.dirname, '../../scripts/check-empty-tests.mjs')

const run = (files) => {
  const root = mkdtempSync(join(tmpdir(), 'empty-tests-'))
  mkdirSync(join(root, 'tests'))
  for (const [name, text] of Object.entries(files)) writeFileSync(join(root, 'tests', name), text)
  return spawnSync(process.execPath, [script, root], { encoding: 'utf8' })
}

test('a test with an assertion passes', () => {
  const result = run({ 'a.test.mjs': "test('a', () => { assert.equal(1, 1) })\n" })
  assert.equal(result.status, 0)
  assert.equal(result.stdout, 'every test asserts something\n')
})

test('a test with no assertion fails and names its line', () => {
  const result = run({ 'a.test.mjs': "import test from 'node:test'\ntest('a', async () => { await Promise.resolve() })\n" })
  assert.equal(result.status, 1)
  assert.equal(result.stderr, 'tests that assert nothing; assert the observable result:\n  tests/a.test.mjs:2\n')
})

test('a test whose only content is subtests is judged through them', () => {
  const result = run({ 'a.test.mjs': "test('a', async (t) => { await t.test('b', () => { assert.ok(true) }) })\n" })
  assert.equal(result.status, 0)
})

test('an assert helper and a Playwright waitFor count, an unconditional wait does not', () => {
  const result = run({
    'a.test.mjs': "test('a', () => { assertSettled(1) })\ntest('b', async () => { await page.waitForSelector('x') })\ntest('c', async () => { await page.waitForTimeout(5) })\n",
  })
  assert.equal(result.status, 1)
  assert.equal(result.stderr, 'tests that assert nothing; assert the observable result:\n  tests/a.test.mjs:3\n')
})
