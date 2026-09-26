import assert from 'node:assert/strict'
import test from 'node:test'
import {
  EXEMPT_TESTS,
  checkTestCensus,
  collectReachableTests,
} from '../../scripts/check-test-census.mjs'

test('collectReachableTests finds tests in direct commands and package scripts', () => {
  const candidateGraph = [
    { command: 'node --test tests/implementation/a.test.mjs tests/implementation/b.test.mjs' },
    { command: 'npm run test:custom' },
  ]
  const packageScripts = {
    'test:custom': 'node --test tests/repository/c.test.mjs && npm run test:nested',
    'test:nested': 'node --test tests/implementation/d.test.mjs',
  }

  const reachable = collectReachableTests(candidateGraph, packageScripts)
  assert.equal(reachable.has('tests/implementation/a.test.mjs'), true)
  assert.equal(reachable.has('tests/implementation/b.test.mjs'), true)
  assert.equal(reachable.has('tests/repository/c.test.mjs'), true)
  assert.equal(reachable.has('tests/implementation/d.test.mjs'), true)
  assert.equal(reachable.has('tests/implementation/unrelated.test.mjs'), false)
})

test('checkTestCensus passes when all committed tests are reachable or exempt', () => {
  const committedTests = [
    'tests/implementation/a.test.mjs',
    'tests/implementation/b.test.mjs',
    'tests/implementation/builder-e2b-live.test.mjs',
  ]
  const candidateGraph = [
    { command: 'node --test tests/implementation/a.test.mjs' },
    { command: 'node --test tests/implementation/b.test.mjs' },
  ]

  const result = checkTestCensus({
    root: '.',
    candidateGraph,
    packageScripts: {},
    committedTests,
  })

  assert.equal(result.unreached.length, 0)
  assert.equal(result.total, 3)
})

test('checkTestCensus reports any committed test not in candidate graph or exempt list', () => {
  const committedTests = [
    'tests/implementation/a.test.mjs',
    'tests/implementation/orphaned.test.mjs',
    'tests/implementation/builder-e2b-live.test.mjs',
  ]
  const candidateGraph = [
    { command: 'node --test tests/implementation/a.test.mjs' },
  ]

  const result = checkTestCensus({
    root: '.',
    candidateGraph,
    packageScripts: {},
    committedTests,
  })

  assert.deepEqual(result.unreached, ['tests/implementation/orphaned.test.mjs'])
})

test('live suites remain exempt in EXEMPT_TESTS', () => {
  assert.ok(EXEMPT_TESTS.includes('tests/implementation/builder-e2b-live.test.mjs'))
  assert.ok(EXEMPT_TESTS.includes('tests/implementation/builder-factory-e2b-live.test.mjs'))
  assert.ok(EXEMPT_TESTS.includes('tests/implementation/builder-production-composed-live.test.mjs'))
})
