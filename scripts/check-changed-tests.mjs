import { execFileSync, spawnSync } from 'node:child_process'
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { executionEnvironment, LEDGER_REPORTER, LEDGER_REPORTER_OPTIONS } from './conexus-verify.mjs'

// A test file a pull request adds or modifies must fail against the base's source. A test that
// already passes there proves nothing about the change. Each changed test runs in two trees built
// the same way: the base with the pull request's tests/ files laid over it, where it must fail, and
// the head, where it must pass. The head run shows that the base failure comes from the source and
// not from the harness. Only an assertion failure on the base counts. Two commit trailers declare a
// file's exception: `Test-Refactor: <path> <reason>` exempts it, and `Test-New-Subject: <path>
// <reason>` accepts that it fails to load on the base because its subject is new.
const RUN_TIMEOUT_MS = 4 * 60 * 1000
const root = process.cwd()

const fail = (message) => {
  process.stderr.write(`${message}\n`)
  process.exit(1)
}
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })

const base = process.env.CONEXUS_PR_BASE_SHA ?? ''
const head = process.env.CONEXUS_PR_HEAD_SHA ?? ''
if (!base && !head) {
  process.stdout.write('no pull request base: CONEXUS_PR_BASE_SHA and CONEXUS_PR_HEAD_SHA are unset, so there are no changed tests to check\n')
  process.exit(0)
}
if (!base || !head) fail('CONEXUS_PR_BASE_SHA and CONEXUS_PR_HEAD_SHA must be set together')
for (const [name, sha] of [['CONEXUS_PR_BASE_SHA', base], ['CONEXUS_PR_HEAD_SHA', head]]) {
  if (spawnSync('git', ['cat-file', '-e', `${sha}^{commit}`], { cwd: root }).status !== 0) fail(`${name} ${sha} is not a commit in this clone`)
}

const mergeBase = git('merge-base', base, head).trim()
const changed = git('diff', '--name-only', '-z', '--diff-filter=AMR', mergeBase, head, '--', 'tests/').split('\0').filter(Boolean)
const changedTests = changed.filter((path) => path.endsWith('.test.mjs'))

const TRAILERS = ['Test-Refactor', 'Test-New-Subject']
const declarations = new Map()
const trailerErrors = []
const trailerFormat = `%(trailers:${TRAILERS.map((key) => `key=${key}`).join(',')})`
for (const line of git('log', `--format=${trailerFormat}`, `${mergeBase}..${head}`).split('\n')) {
  if (!line.trim()) continue
  const [, kind, value] = line.match(/^([^:]+):\s*(.*)$/)
  const [, path, reason] = value.match(/^(\S+)\s+(.+)$/) ?? []
  if (!reason) trailerErrors.push(`error ${kind} needs a path and a reason: "${value}"`)
  else if (!changedTests.includes(path)) trailerErrors.push(`error ${kind} names ${path}, which is not a test file this pull request changes`)
  else if (declarations.has(path) && declarations.get(path).kind !== kind) trailerErrors.push(`error ${path} has both a Test-Refactor and a Test-New-Subject trailer; keep the one that is true`)
  else declarations.set(path, { kind, reason })
}
if (trailerErrors.length > 0) fail(trailerErrors.join('\n'))

if (changedTests.length === 0) {
  process.stdout.write(`no changed test files since ${mergeBase.slice(0, 12)}\n`)
  process.exit(0)
}

const scratch = realpathSync(mkdtempSync(resolve(tmpdir(), 'conexus-changed-tests-')))
process.on('exit', () => rmSync(scratch, { recursive: true, force: true }))

const tree = (name, commit, overlay) => {
  const target = resolve(scratch, name)
  mkdirSync(target)
  const archive = resolve(scratch, `${name}.tar`)
  git('archive', '--format=tar', `--output=${archive}`, commit)
  execFileSync('tar', ['-xf', archive, '-C', target])
  for (const path of overlay) {
    mkdirSync(dirname(resolve(target, path)), { recursive: true })
    writeFileSync(resolve(target, path), execFileSync('git', ['show', `${head}:${path}`], { cwd: root, maxBuffer: 256 * 1024 * 1024 }))
  }
  if (existsSync(resolve(root, 'node_modules'))) symlinkSync(realpathSync(resolve(root, 'node_modules')), resolve(target, 'node_modules'))
  return target
}

// Without CONEXUS_HUB_BUILD each suite compiles the Hub of the tree it runs in, not the head's
// Hub the verify run published. The verify run's ledger stays with the verify run that owns it:
// each run below records into its own ledger, rooted at its own tree.
const { CONEXUS_HUB_BUILD, CONEXUS_TEST_LEDGER, CONEXUS_TEST_LEDGER_ROOT, NODE_OPTIONS = '', ...inherited } = process.env
const nodeOptions = NODE_OPTIONS.replace(LEDGER_REPORTER_OPTIONS, '').trim()
const environment = executionEnvironment({ environmentClass: 'postgres' }, { ...inherited, ...(nodeOptions ? { NODE_OPTIONS: nodeOptions } : {}) })

// The outcome of one file's run. Only an assertion failure shows that the base's source is wrong;
// a load error, a timeout or any other error shows only that the test could not run there.
const outcome = (result, records) => {
  if (result.error?.code === 'ETIMEDOUT') return { kind: 'timeout', where: `when the ${RUN_TIMEOUT_MS / 1000} s run limit killed it` }
  if (result.status === 0) return { kind: 'passed' }
  const failures = records.filter((record) => 'failure' in record)
  const cause = failures.find((record) => record.failure !== 'assertion')
  if (cause) return { kind: cause.failure, where: `in "${cause.name}"` }
  if (failures.length > 0) return { kind: 'assertion' }
  return { kind: 'error', where: `with exit ${result.status ?? result.signal} and no failing test recorded` }
}

const REFUSALS = {
  passed: (path) => `passes on the base, so it proves nothing about this change; if it is a refactor, add a commit trailer "Test-Refactor: ${path} <reason>"`,
  'load-error': (path) => `fails to load on the base, so no assertion ran; if its subject is new in this pull request, add a commit trailer "Test-New-Subject: ${path} <reason>"`,
  timeout: (_path, where) => `times out on the base ${where}, so no assertion failed`,
  error: (_path, where) => `fails on the base ${where} with an error that is not an assertion`,
}

// Output goes to a file, not a pipe: a test's orphaned child holding a pipe open would keep the
// run from returning after its timeout.
const run = (treeRoot, path, label) => {
  const name = `${label}-${path.replaceAll('/', '_')}`
  const log = resolve(scratch, `${name}.log`)
  const ledger = resolve(scratch, `${name}.jsonl`)
  const output = openSync(log, 'w')
  const reporters = ['--test-reporter=spec', '--test-reporter-destination=stdout', `--test-reporter=${LEDGER_REPORTER}`, '--test-reporter-destination=stdout']
  const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...reporters, path], {
    cwd: treeRoot,
    env: { ...environment, CONEXUS_TEST_LEDGER: ledger, CONEXUS_TEST_LEDGER_ROOT: treeRoot },
    stdio: ['ignore', output, output],
    timeout: RUN_TIMEOUT_MS,
    killSignal: 'SIGKILL',
  })
  closeSync(output)
  const records = existsSync(ledger) ? readFileSync(ledger, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)) : []
  return { ...outcome(result, records), log }
}
const tail = (log) => readFileSync(log, 'utf8').trimEnd().split('\n').slice(-20).map((line) => `    ${line}`).join('\n')

const toRun = changedTests.filter((path) => declarations.get(path)?.kind !== 'Test-Refactor')
const baseTree = toRun.length > 0 ? tree('base', mergeBase, changed) : null
const headTree = toRun.length > 0 ? tree('head', head, []) : null

process.stdout.write(`changed tests against the base ${mergeBase.slice(0, 12)}:\n`)
const refused = []
for (const path of changedTests) {
  const declared = declarations.get(path)
  if (declared?.kind === 'Test-Refactor') {
    process.stdout.write(`::notice file=${path}::Test-Refactor: ${declared.reason}\n`)
    process.stdout.write(`exempt: ${path} (${declared.reason})\n`)
    continue
  }
  const onBase = run(baseTree, path, 'base')
  const newSubject = declared?.kind === 'Test-New-Subject'
  const proof = newSubject ? onBase.kind === 'load-error' : onBase.kind === 'assertion'
  if (proof && newSubject) process.stdout.write(`::notice file=${path}::Test-New-Subject: ${declared.reason}\n`)
  process.stdout.write(`${onBase.kind} on base: ${path}${proof && newSubject ? ` (new subject: ${declared.reason})` : ''}\n`)
  if (!proof) {
    if (newSubject) refused.push(`error ${path}: Test-New-Subject says its subject is new, but the file loads on the base (${onBase.kind}); remove the trailer`)
    else {
      process.stdout.write(`${tail(onBase.log)}\n`)
      refused.push(`error ${path}: ${REFUSALS[onBase.kind](path, onBase.where)}`)
    }
    continue
  }
  const onHead = run(headTree, path, 'head')
  if (onHead.kind !== 'passed') {
    process.stdout.write(`${onHead.kind} on head: ${path}\n${tail(onHead.log)}\n`)
    refused.push(`error ${path}: fails in the head tree too, so its failure on the base proves nothing`)
  }
}
if (refused.length > 0) fail(refused.join('\n'))
