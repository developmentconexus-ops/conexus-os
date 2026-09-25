import { execFileSync, spawnSync } from 'node:child_process'
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { executionEnvironment } from './conexus-verify.mjs'

// A test file a pull request adds or modifies must fail against the base's source. A test that
// already passes there proves nothing about the change. Each changed test runs in two trees built
// the same way: the base with the pull request's tests/ files laid over it, where it must fail, and
// the head, where it must pass. The head run shows that the base failure comes from the source and
// not from the harness. A refactor declares itself per file with a commit trailer
// `Test-Refactor: <path> <reason>`.
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

const exemptions = new Map()
const trailerErrors = []
for (const line of git('log', '--format=%(trailers:key=Test-Refactor,valueonly)', `${mergeBase}..${head}`).split('\n')) {
  const value = line.trim()
  if (!value) continue
  const [, path, reason] = value.match(/^(\S+)\s+(.+)$/) ?? []
  if (!reason) trailerErrors.push(`error Test-Refactor needs a path and a reason: "${value}"`)
  else if (!changedTests.includes(path)) trailerErrors.push(`error Test-Refactor names ${path}, which is not a test file this pull request changes`)
  else exemptions.set(path, reason)
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
// Hub the verify run published. The skip ledger stays with the verify run that owns it.
const { CONEXUS_HUB_BUILD, CONEXUS_TEST_SKIP_LEDGER, CONEXUS_TEST_SKIP_ROOT, ...inherited } = process.env
const environment = executionEnvironment({ environmentClass: 'postgres' }, inherited)

// Output goes to a file, not a pipe: a test's orphaned child holding a pipe open would keep the
// run from returning after its timeout.
const passes = (treeRoot, path, label) => {
  const log = resolve(scratch, `${label}-${path.replaceAll('/', '_')}.log`)
  const output = openSync(log, 'w')
  const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', path], {
    cwd: treeRoot,
    env: environment,
    stdio: ['ignore', output, output],
    timeout: RUN_TIMEOUT_MS,
    killSignal: 'SIGKILL',
  })
  closeSync(output)
  return { passed: result.status === 0, log }
}
const tail = (log) => readFileSync(log, 'utf8').trimEnd().split('\n').slice(-20).map((line) => `    ${line}`).join('\n')

const toRun = changedTests.filter((path) => !exemptions.has(path))
const baseTree = toRun.length > 0 ? tree('base', mergeBase, changed) : null
const headTree = toRun.length > 0 ? tree('head', head, []) : null

process.stdout.write(`changed tests against the base ${mergeBase.slice(0, 12)}:\n`)
const refused = []
for (const path of changedTests) {
  if (exemptions.has(path)) {
    process.stdout.write(`::notice file=${path}::Test-Refactor: ${exemptions.get(path)}\n`)
    process.stdout.write(`exempt: ${path} (${exemptions.get(path)})\n`)
    continue
  }
  const onBase = passes(baseTree, path, 'base')
  if (onBase.passed) {
    process.stdout.write(`passed on base: ${path}\n${tail(onBase.log)}\n`)
    refused.push(`error ${path}: passes on the base, so it proves nothing about this change; if it is a refactor, add a commit trailer "Test-Refactor: ${path} <reason>"`)
    continue
  }
  const onHead = passes(headTree, path, 'head')
  if (!onHead.passed) {
    process.stdout.write(`failed on head too: ${path}\n${tail(onHead.log)}\n`)
    refused.push(`error ${path}: fails in the head tree too, so its failure on the base proves nothing`)
    continue
  }
  process.stdout.write(`failed on base: ${path}\n`)
}
if (refused.length > 0) fail(refused.join('\n'))
