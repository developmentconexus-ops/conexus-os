import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { findAccessViolations, PREDICATES } from '../../scripts/check-access-owner.mjs'

const repository = resolve(import.meta.dirname, '../..')
const fixtures = resolve(repository, 'scripts/fixtures/check-access-owner')
const fixtureNames = readdirSync(fixtures)

test('every predicate has a fixture that fails with exactly that predicate', () => {
  const named = new Set(fixtureNames.map((name) => name.split('.')[0]))
  for (const predicate of PREDICATES) assert.ok(named.has(predicate), `${predicate} has no fixture`)
  for (const name of fixtureNames.filter((item) => !item.startsWith('clean-'))) {
    const predicate = name.split('.')[0]
    const found = new Set(findAccessViolations(resolve(fixtures, name)).map((item) => item.predicate))
    assert.deepEqual([...found], [predicate], name)
  }
})

test('a key typed as a string literal is read as that literal, and the owner files are exempt', () => {
  for (const name of fixtureNames.filter((item) => item.startsWith('clean-'))) {
    assert.deepEqual(findAccessViolations(resolve(fixtures, name)), [], name)
  }
})

test('a fixture reports the file and the enclosing symbol, with no line number', () => {
  assert.deepEqual(findAccessViolations(resolve(fixtures, 'COOKIE_WRITE')), [
    { predicate: 'COOKIE_WRITE', file: 'apps/hub/src/x/routes.ts', symbol: 'write: setCookie' },
  ])
})

test('the repository has no violation', () => {
  assert.deepEqual(findAccessViolations(repository), [])
})
