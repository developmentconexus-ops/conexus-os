import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const reporter = resolve(root, 'scripts/test-ledger-reporter.mjs')
const checkSkips = resolve(root, 'scripts/check-test-skips.mjs')

const fixture = (context, prefix, files) => {
  const target = realpathSync(mkdtempSync(resolve(tmpdir(), prefix)))
  context.after(() => rmSync(target, { recursive: true, force: true }))
  for (const [path, contents] of Object.entries(files)) {
    mkdirSync(dirname(resolve(target, path)), { recursive: true })
    writeFileSync(resolve(target, path), contents)
  }
  return target
}

// The calibration runs inside `npm run verify`, whose ledger variables it must not inherit, and
// inside node --test, whose NODE_TEST_CONTEXT would make a nested node --test skip its reporters.
const cleanEnvironment = (extra) => {
  const { CONEXUS_TEST_LEDGER, CONEXUS_TEST_LEDGER_ROOT, NODE_OPTIONS, NODE_TEST_CONTEXT, ...rest } = process.env
  return { ...rest, ...extra }
}

const runWithLedger = (candidate, file) => {
  const ledger = resolve(candidate, 'ledger.jsonl')
  const environment = cleanEnvironment({
    CONEXUS_TEST_LEDGER_ROOT: candidate,
    CONEXUS_TEST_LEDGER: ledger,
    NODE_OPTIONS: `--test-reporter=spec --test-reporter-destination=stdout --test-reporter=${reporter} --test-reporter-destination=stdout`,
  })
  const tests = spawnSync(process.execPath, ['--test', file], { cwd: candidate, encoding: 'utf8', env: environment })
  assert.equal(tests.status, 0, tests.stdout + tests.stderr)
  return spawnSync(process.execPath, [checkSkips], { cwd: candidate, encoding: 'utf8', env: environment })
}

test('a skip without an opt-in reason fails the graph and is named', context => {
  const candidate = fixture(context, 'conexus-skip-refused-', {
    'tests/pg.test.mjs': [
      "import test from 'node:test'",
      "test('reads the database', { skip: 'real PostgreSQL configuration not supplied' }, () => {})",
      "test('runs a browser', { skip: true }, () => {})",
      "test('runs', () => {})",
      '',
    ].join('\n'),
  })
  const result = runWithLedger(candidate, 'tests/pg.test.mjs')
  assert.equal(result.status, 1)
  assert.equal(result.stdout, '')
  assert.equal(result.stderr, [
    '2 skipped test(s) in the verify graph; only a reason starting with "opt-in:" may skip:',
    'tests/pg.test.mjs › reads the database: real PostgreSQL configuration not supplied',
    'tests/pg.test.mjs › runs a browser: no reason given',
    '',
  ].join('\n'))
})

test('an opt-in live skip passes and is listed', context => {
  const candidate = fixture(context, 'conexus-skip-opt-in-', {
    'tests/live.test.mjs': [
      "import test from 'node:test'",
      "test('calls the live service', { skip: 'opt-in: set CONEXUS_LIVE=1' }, () => {})",
      "test('runs', () => {})",
      '',
    ].join('\n'),
  })
  const result = runWithLedger(candidate, 'tests/live.test.mjs')
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stderr, '')
  assert.equal(result.stdout, [
    'opt-in skip: tests/live.test.mjs › calls the live service: opt-in: set CONEXUS_LIVE=1',
    'no skipped test outside opt-in live runs (tests=2, opt-in skips=1)',
    '',
  ].join('\n'))
})

test('a run the reporter never saw fails instead of passing empty', context => {
  const candidate = fixture(context, 'conexus-skip-uninstrumented-', { 'empty.jsonl': '' })
  const missing = spawnSync(process.execPath, [checkSkips], { encoding: 'utf8', env: cleanEnvironment({}) })
  assert.equal(missing.status, 1)
  assert.equal(missing.stderr, 'the runner did not instrument this run: no test ledger at (CONEXUS_TEST_LEDGER unset)\n')

  const ledger = resolve(candidate, 'empty.jsonl')
  const empty = spawnSync(process.execPath, [checkSkips], { encoding: 'utf8', env: cleanEnvironment({ CONEXUS_TEST_LEDGER: ledger }) })
  assert.equal(empty.status, 1)
  assert.equal(empty.stderr, `the test ledger at ${ledger} recorded no test, so the ledger reporter did not run\n`)
})

const nestedRun = [
  "import { spawnSync } from 'node:child_process'",
  "import test from 'node:test'",
  "test('runs the inner suite', () => spawnSync(process.execPath, ['--test', 'tests/inner.test.mjs']))",
  '',
].join('\n')

test('a test that starts a nested node --test is refused with its line', context => {
  const candidate = fixture(context, 'conexus-nested-refused-', { 'tests/outer.test.mjs': nestedRun })
  const result = spawnSync(process.execPath, [checkSkips], { cwd: candidate, encoding: 'utf8', env: cleanEnvironment({}) })
  assert.equal(result.status, 1)
  assert.equal(result.stdout, '')
  assert.equal(result.stderr, [
    'a test starts a nested node --test, whose skips the ledger reporter cannot see; run the file in the verify graph or add it to NESTED_RUN_ALLOWLIST with a reason:',
    "tests/outer.test.mjs:3: test('runs the inner suite', () => spawnSync(process.execPath, ['--test', 'tests/inner.test.mjs']))",
    '',
  ].join('\n'))
})

test('an allowlisted nested node --test passes', context => {
  const candidate = fixture(context, 'conexus-nested-allowed-', {
    'tests/repository/verify-gates.test.mjs': nestedRun,
    'ledger.jsonl': '{"tests":1}\n',
  })
  const result = spawnSync(process.execPath, [checkSkips], { cwd: candidate, encoding: 'utf8', env: cleanEnvironment({ CONEXUS_TEST_LEDGER: resolve(candidate, 'ledger.jsonl') }) })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout, 'no skipped test outside opt-in live runs (tests=1, opt-in skips=0)\n')
})

const checkChanged = resolve(root, 'scripts/check-changed-tests.mjs')
const ADD_BUGGY = 'export const add = (a, b) => a - b\n'
const ADD_FIXED = 'export const add = (a, b) => a + b\n'
const addTest = (name, expression, expected) => [
  "import assert from 'node:assert/strict'",
  "import test from 'node:test'",
  "import { add } from '../src/add.mjs'",
  `test('${name}', () => assert.equal(${expression}, ${expected}))`,
  '',
].join('\n')

const gitIn = (target, ...args) => execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', ...args], { cwd: target, encoding: 'utf8' }).trim()
const commit = (target, files, message) => {
  for (const [path, contents] of Object.entries(files)) {
    mkdirSync(dirname(resolve(target, path)), { recursive: true })
    writeFileSync(resolve(target, path), contents)
  }
  gitIn(target, 'add', '.')
  gitIn(target, 'commit', '--quiet', '-m', message)
  return gitIn(target, 'rev-parse', 'HEAD')
}

// The base ships a subtraction where an addition belongs; its own test only checks 0 + 0.
const pullRequest = (context, headFiles, message = 'head') => {
  const target = fixture(context, 'conexus-changed-tests-', {})
  gitIn(target, 'init', '--quiet', '-b', 'main')
  const base = commit(target, { 'src/add.mjs': ADD_BUGGY, 'tests/add.test.mjs': addTest('adds zeros', 'add(0, 0)', 0) }, 'base')
  const head = commit(target, headFiles, message)
  return { target, base, head }
}
const runChanged = ({ target, base, head }) => spawnSync(process.execPath, [checkChanged], {
  cwd: target,
  encoding: 'utf8',
  env: cleanEnvironment({ CONEXUS_PR_BASE_SHA: base, CONEXUS_PR_HEAD_SHA: head }),
})
// The log tail under a refused file carries timings, so only the verdict lines are compared.
const verdicts = stdout => stdout.split('\n').filter(line => !line.startsWith('    '))

test('a new test that fails on the buggy base and passes on the fix is accepted', context => {
  const pr = pullRequest(context, { 'src/add.mjs': ADD_FIXED, 'tests/add-sum.test.mjs': addTest('adds', 'add(2, 3)', 5) })
  const result = runChanged(pr)
  assert.equal(result.status, 0, result.stdout + result.stderr)
  assert.equal(result.stderr, '')
  assert.equal(result.stdout, `changed tests against the base ${pr.base.slice(0, 12)}:\nassertion on base: tests/add-sum.test.mjs\n`)
})

test('a new test that already passes on the base is refused by name', context => {
  const pr = pullRequest(context, { 'tests/add-again.test.mjs': addTest('adds zeros again', 'add(0, 0)', 0) })
  const result = runChanged(pr)
  assert.equal(result.status, 1)
  assert.deepEqual(verdicts(result.stdout), [`changed tests against the base ${pr.base.slice(0, 12)}:`, 'passed on base: tests/add-again.test.mjs', ''])
  assert.equal(result.stderr,
    'error tests/add-again.test.mjs: passes on the base, so it proves nothing about this change; if it is a refactor, add a commit trailer "Test-Refactor: tests/add-again.test.mjs <reason>"\n')
})

test('a Test-Refactor trailer exempts that file and shows its reason to the reviewer', context => {
  const pr = pullRequest(context, { 'tests/add.test.mjs': addTest('adds two zeros', 'add(0, 0)', 0) },
    'rename the test\n\nTest-Refactor: tests/add.test.mjs renames the test only')
  const result = runChanged(pr)
  assert.equal(result.status, 0, result.stdout + result.stderr)
  assert.equal(result.stderr, '')
  assert.equal(result.stdout, [
    `changed tests against the base ${pr.base.slice(0, 12)}:`,
    '::notice file=tests/add.test.mjs::Test-Refactor: renames the test only',
    'exempt: tests/add.test.mjs (renames the test only)',
    '',
  ].join('\n'))
})

test('a Test-Refactor trailer for a file the pull request did not change is refused', context => {
  const pr = pullRequest(context, { 'src/add.mjs': ADD_FIXED, 'tests/add-sum.test.mjs': addTest('adds', 'add(2, 3)', 5) },
    'fix add\n\nTest-Refactor: tests/add.test.mjs stale marker')
  const result = runChanged(pr)
  assert.equal(result.status, 1)
  assert.equal(result.stdout, '')
  assert.equal(result.stderr, 'error Test-Refactor names tests/add.test.mjs, which is not a test file this pull request changes\n')
})

test('a test that fails in the head tree too proves nothing and is refused', context => {
  const pr = pullRequest(context, { 'tests/add-wrong.test.mjs': addTest('adds wrongly', 'add(2, 3)', 7) })
  const result = runChanged(pr)
  assert.equal(result.status, 1)
  assert.deepEqual(verdicts(result.stdout), [`changed tests against the base ${pr.base.slice(0, 12)}:`, 'assertion on base: tests/add-wrong.test.mjs', 'assertion on head: tests/add-wrong.test.mjs', ''])
  assert.equal(result.stderr, 'error tests/add-wrong.test.mjs: fails in the head tree too, so its failure on the base proves nothing\n')
})

const SUBTRACT = 'export const subtract = (a, b) => a - b\n'
const subtractTest = [
  "import assert from 'node:assert/strict'",
  "import test from 'node:test'",
  "import { subtract } from '../src/subtract.mjs'",
  "test('subtracts', () => assert.equal(subtract(5, 3), 2))",
  '',
].join('\n')

test('a test whose subject is missing on the base fails to load there and is refused', context => {
  const pr = pullRequest(context, { 'src/subtract.mjs': SUBTRACT, 'tests/subtract.test.mjs': subtractTest })
  const result = runChanged(pr)
  assert.equal(result.status, 1)
  assert.deepEqual(verdicts(result.stdout), [`changed tests against the base ${pr.base.slice(0, 12)}:`, 'load-error on base: tests/subtract.test.mjs', ''])
  assert.equal(result.stderr,
    'error tests/subtract.test.mjs: fails to load on the base, so no assertion ran; if its subject is new in this pull request, add a commit trailer "Test-New-Subject: tests/subtract.test.mjs <reason>"\n')
})

test('a Test-New-Subject trailer accepts a load error on the base and shows its reason', context => {
  const pr = pullRequest(context, { 'src/subtract.mjs': SUBTRACT, 'tests/subtract.test.mjs': subtractTest },
    'add subtract\n\nTest-New-Subject: tests/subtract.test.mjs src/subtract.mjs is new')
  const result = runChanged(pr)
  assert.equal(result.status, 0, result.stdout + result.stderr)
  assert.equal(result.stderr, '')
  assert.equal(result.stdout, [
    `changed tests against the base ${pr.base.slice(0, 12)}:`,
    '::notice file=tests/subtract.test.mjs::Test-New-Subject: src/subtract.mjs is new',
    'load-error on base: tests/subtract.test.mjs (new subject: src/subtract.mjs is new)',
    '',
  ].join('\n'))
})

test('a Test-New-Subject trailer on a file that loads on the base is refused', context => {
  const pr = pullRequest(context, { 'src/add.mjs': ADD_FIXED, 'tests/add-sum.test.mjs': addTest('adds', 'add(2, 3)', 5) },
    'fix add\n\nTest-New-Subject: tests/add-sum.test.mjs add is new')
  const result = runChanged(pr)
  assert.equal(result.status, 1)
  assert.deepEqual(verdicts(result.stdout), [`changed tests against the base ${pr.base.slice(0, 12)}:`, 'assertion on base: tests/add-sum.test.mjs', ''])
  assert.equal(result.stderr, 'error tests/add-sum.test.mjs: Test-New-Subject says its subject is new, but the file loads on the base (assertion); remove the trailer\n')
})

const addScenario = (name, options, body) => [
  "import test from 'node:test'",
  "import { add } from '../src/add.mjs'",
  `test('${name}', ${options}() => ${body})`,
  '',
].join('\n')

test('a test that times out on the base is refused as a timeout', context => {
  const pr = pullRequest(context, {
    'src/add.mjs': ADD_FIXED,
    'tests/add-wait.test.mjs': addScenario('waits for the sum', '{ timeout: 200 }, ', 'new Promise(resolve => { if (add(2, 3) === 5) resolve() })'),
  })
  const result = runChanged(pr)
  assert.equal(result.status, 1)
  assert.deepEqual(verdicts(result.stdout), [`changed tests against the base ${pr.base.slice(0, 12)}:`, 'timeout on base: tests/add-wait.test.mjs', ''])
  assert.equal(result.stderr, 'error tests/add-wait.test.mjs: times out on the base in "waits for the sum", so no assertion failed\n')
})

test('a test that throws a TypeError on the base is refused as an error', context => {
  const pr = pullRequest(context, {
    'src/add.mjs': ADD_FIXED,
    'tests/add-read.test.mjs': addScenario('reads the sum', '', '{ if (add(2, 3) !== 5) null.value }'),
  })
  const result = runChanged(pr)
  assert.equal(result.status, 1)
  assert.deepEqual(verdicts(result.stdout), [`changed tests against the base ${pr.base.slice(0, 12)}:`, 'error on base: tests/add-read.test.mjs', ''])
  assert.equal(result.stderr, 'error tests/add-read.test.mjs: fails on the base in "reads the sum" with an error that is not an assertion\n')
})

test('without a pull request there is nothing to check, and half a pull request is an error', context => {
  const pr = pullRequest(context, { 'src/add.mjs': ADD_FIXED })
  const none = runChanged({ target: pr.target, base: '', head: '' })
  assert.equal(none.status, 0)
  assert.equal(none.stdout, 'no pull request base: CONEXUS_PR_BASE_SHA and CONEXUS_PR_HEAD_SHA are unset, so there are no changed tests to check\n')

  const half = runChanged({ target: pr.target, base: pr.base, head: '' })
  assert.equal(half.status, 1)
  assert.equal(half.stderr, 'CONEXUS_PR_BASE_SHA and CONEXUS_PR_HEAD_SHA must be set together\n')

  const noTests = runChanged(pr)
  assert.equal(noTests.status, 0)
  assert.equal(noTests.stdout, `no changed test files since ${pr.base.slice(0, 12)}\n`)
})
