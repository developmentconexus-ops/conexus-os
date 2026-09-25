import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
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
    '2 skipped or todo test(s) in the verify graph; only a reason starting with "opt-in:" may leave a test unexecuted:',
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
    'no unexecuted test outside opt-in live runs (tests=2, opt-in skips=1, opt-in todos=0)',
    '',
  ].join('\n'))
})

test('a todo without an opt-in reason fails the graph, bodyless or not', context => {
  const candidate = fixture(context, 'conexus-todo-refused-', {
    'tests/todo.test.mjs': [
      "import test from 'node:test'",
      "test.todo('handles the empty cart')",
      "test('handles a refund', { todo: 'not written yet' }, () => {})",
      "test('runs', () => {})",
      '',
    ].join('\n'),
  })
  const result = runWithLedger(candidate, 'tests/todo.test.mjs')
  assert.equal(result.status, 1)
  assert.equal(result.stdout, '')
  assert.equal(result.stderr, [
    '2 skipped or todo test(s) in the verify graph; only a reason starting with "opt-in:" may leave a test unexecuted:',
    'tests/todo.test.mjs › handles the empty cart: no reason given (todo)',
    'tests/todo.test.mjs › handles a refund: not written yet (todo)',
    '',
  ].join('\n'))
})

test('an opt-in todo passes and is listed', context => {
  const candidate = fixture(context, 'conexus-todo-opt-in-', {
    'tests/todo.test.mjs': [
      "import test from 'node:test'",
      "test('calls the live service', { todo: 'opt-in: set CONEXUS_LIVE=1' })",
      "test('runs', () => {})",
      '',
    ].join('\n'),
  })
  const result = runWithLedger(candidate, 'tests/todo.test.mjs')
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stderr, '')
  assert.equal(result.stdout, [
    'opt-in todo: tests/todo.test.mjs › calls the live service: opt-in: set CONEXUS_LIVE=1 (todo)',
    'no unexecuted test outside opt-in live runs (tests=2, opt-in skips=0, opt-in todos=1)',
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
  assert.equal(result.stdout, 'no unexecuted test outside opt-in live runs (tests=1, opt-in skips=0, opt-in todos=0)\n')
})
