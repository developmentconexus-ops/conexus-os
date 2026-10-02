import assert from 'node:assert/strict'
import test from 'node:test'
import { checkRatchet, findWeakTests } from '../../scripts/check-weak-tests.mjs'

const names = (source) => findWeakTests(source, 'fixture.test.mjs').map(({ name, line, reason }) => [name, line, reason])

test('a test whose every assertion is truthiness, a bare match, or a non-literal comparison is weak-only', () => {
  const source = [
    "test('truthy', () => { assert.ok(value) })",
    "test('bare includes', () => { assert.ok(text.includes('x')) })",
    "test('bare match', () => { assert.match(text, /x/) })",
    "test('non-literal', () => { assert.equal(a, b) })",
    "test('empty', () => {})",
  ].join('\n')
  assert.deepEqual(names(source), [
    ['truthy', 1, 'weak-only'],
    ['bare includes', 2, 'weak-only'],
    ['bare match', 3, 'weak-only'],
    ['non-literal', 4, 'weak-only'],
    ['empty', 5, 'no assertion'],
  ])
})

test('one literal comparison, a throws, a helper named assert*, or a waitFor makes a test strong', () => {
  const source = [
    "test('literal', () => { assert.ok(x); assert.equal(a, 'x') })",
    "test('literal array', () => { assert.deepEqual(a, ['x', 1, { k: true }]) })",
    "test('throws', () => { assert.throws(() => f(), /boom/) })",
    "test('helper', () => { assertSomething(a) })",
    "test('browser', async () => { await page.getByText('x').waitFor() })",
  ].join('\n')
  assert.deepEqual(names(source), [])
})

test('the ratchet passes at or below the recorded count and fails above it', () => {
  assert.equal(checkRatchet(10, 10).ok, true)
  assert.equal(checkRatchet(9, 10).ok, true)
  assert.equal(checkRatchet(11, 10).ok, false)
})
