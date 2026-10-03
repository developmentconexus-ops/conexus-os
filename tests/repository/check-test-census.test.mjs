import assert from 'node:assert/strict'
import test from 'node:test'
import {
  browserTestsOutsideBrowserSteps,
  checkTestCensus,
  collectReachableTests,
  unreachedMessage,
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

test('the unreached report names each file and CANDIDATE_GRAPH', () => {
  const message = unreachedMessage(['tests/implementation/orphaned.test.mjs'])
  assert.match(message, /1 committed test file\(s\) are not reachable from CANDIDATE_GRAPH or exempt/)
  assert.match(message, /tests\/implementation\/orphaned\.test\.mjs/)
})

test('collectReachableTests finds *.spec.mjs files too', () => {
  const reachable = collectReachableTests([{ command: 'npx playwright test tests/implementation/x.spec.mjs' }], {})
  assert.equal(reachable.has('tests/implementation/x.spec.mjs'), true)
})

test('a *.spec.mjs outside the graph and the exempt list is unreached', () => {
  const result = checkTestCensus({
    root: '.',
    candidateGraph: [],
    packageScripts: {},
    committedTests: ['tests/implementation/stray.spec.mjs', 'tests/implementation/builder-e2b-live.test.mjs'],
  })
  assert.deepEqual(result.unreached, ['tests/implementation/stray.spec.mjs'])
})

const sources = {
  'tests/implementation/direct.test.mjs': "import { chromium } from 'playwright'\n",
  'tests/implementation/scoped.test.mjs': "import { expect } from '@playwright/test'\n",
  'tests/implementation/plain.test.mjs': "import assert from 'node:assert/strict'\n",
}
const readText = (path) => {
  if (!Object.hasOwn(sources, path)) throw new Error(`no such file ${path}`)
  return sources[path]
}

test('browserTestsOutsideBrowserSteps names a test that imports Playwright, in a static step', () => {
  const candidateGraph = [
    { scope: 'rest-step', environmentClass: 'static', command: 'node --test tests/implementation/direct.test.mjs tests/implementation/scoped.test.mjs tests/implementation/plain.test.mjs' },
  ]
  assert.deepEqual(browserTestsOutsideBrowserSteps({ candidateGraph, packageScripts: {}, readText }), [
    { test: 'tests/implementation/direct.test.mjs', step: 'rest-step', environmentClass: 'static' },
    { test: 'tests/implementation/scoped.test.mjs', step: 'rest-step', environmentClass: 'static' },
  ])
})

test('browserTestsOutsideBrowserSteps accepts a Playwright test in a browser, browser-postgres or live step', () => {
  const candidateGraph = ['browser', 'browser-postgres', 'live'].map((environmentClass) => ({
    scope: environmentClass,
    environmentClass,
    command: 'node --test tests/implementation/direct.test.mjs tests/implementation/scoped.test.mjs',
  }))
  assert.deepEqual(browserTestsOutsideBrowserSteps({ candidateGraph, packageScripts: {}, readText }), [])
})

test('a test run only by an optional package script is reached, and one left out of it is not', () => {
  const committedTests = ['tests/implementation/lab-a.test.mjs', 'tests/implementation/lab-b.test.mjs']
  const packageScripts = { 'lab:run': 'node --test tests/implementation/lab-a.test.mjs' }
  const result = checkTestCensus({ root: '.', candidateGraph: [], packageScripts, committedTests, optionalScripts: ['lab:run'] })
  assert.deepEqual(result.unreached, ['tests/implementation/lab-b.test.mjs'])
})
