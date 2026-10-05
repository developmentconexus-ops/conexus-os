import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, matchesGlob, resolve } from 'node:path'
import test from 'node:test'
import {
  ALLOWED_ALIASES,
  CANDIDATE_GRAPH,
  DOCS_CHECK_SCOPES,
  DOCS_GRAPH,
  QUICK_GRAPH,
  VERIFY_GROUPS,
  graphForGroup,
  groupsOf,
  loadPackageScripts,
  SCOPE_MANIFEST,
  assertExecutionEnvironment,
  executionEnvironment,
  listScopes,
  newTestLedger,
  parseArguments,
  renderStepSummary,
  resolveScope,
  runVerification,
  runNpmScript,
  repositoryRoot,
  STEP_TIMEOUT_MS,
  timedOut,
} from '../../scripts/conexus-verify.mjs'

const committedTests = () => execFileSync('git', ['ls-files', 'tests'], { cwd: repositoryRoot, encoding: 'utf8' })
  .split('\n')
  .filter(path => path.endsWith('.test.mjs') && !path.startsWith('tests/manual/'))
  .sort()

const workflowGroups = () => readFileSync(resolve(repositoryRoot, '.github/workflows/verify.yml'), 'utf8')
  .match(/group: \[([^\]]+)\]/)[1]
  .split(',')
  .map(name => name.trim())

const testGlobsOf = (command, scripts) => {
  const expanded = command.replace(/^npm run (\S+)$/, (_, name) => scripts[name] ?? '')
  if (!expanded.startsWith('node --test')) return []
  return [...expanded.matchAll(/'([^']+)'|(\S+)/g)]
    .map(([, quoted, bare]) => quoted ?? bare)
    .filter(word => word.endsWith('.test.mjs'))
}

const globsPerGroup = (groups) => {
  const scripts = loadPackageScripts()
  return Object.fromEntries(groups.map(group => [
    group,
    graphForGroup(CANDIDATE_GRAPH, group).flatMap(step => testGlobsOf(step.command ?? `npm run ${step.npmScript ?? ''}`, scripts)),
  ]))
}

const groupsRunning = (path, globsByGroup) => Object.entries(globsByGroup)
  .filter(([, globs]) => globs.some(glob => matchesGlob(path, glob)))
  .map(([group]) => group)

const PLAYWRIGHT_IMPORT = /^[^'"\n]*\b(?:from|import)\s*\(?\s*['"](?:@playwright\/test|playwright(?:-core)?)['"]/m

test('the workflow runs the four groups and each runs the tests its name places in it', () => {
  assert.deepEqual(workflowGroups(), ['browser', 'postgres', 'rest', 'live'])
  const globs = globsPerGroup(workflowGroups())
  assert.deepEqual(groupsRunning('tests/implementation/a.postgres.test.mjs', globs), ['postgres'])
  assert.deepEqual(groupsRunning('tests/implementation/a.browser.test.mjs', globs), ['browser'])
  assert.deepEqual(groupsRunning('tests/implementation/a.test.mjs', globs), ['rest'])
  assert.deepEqual(groupsRunning('tests/repository/a.test.mjs', globs), ['rest'])
  assert.deepEqual(groupsRunning('tests/live/a.test.mjs', globs), ['live'])
  assert.deepEqual(groupsRunning('tests/manual/a.test.mjs', globs), [])
})

const unplaced = (paths, globs) => paths.filter(path => groupsRunning(path, globs).length !== 1)

const browserTestsOutsideBrowser = (paths, sourceOf, globs) => paths
  .filter(path => PLAYWRIGHT_IMPORT.test(sourceOf(path)))
  .filter(path => !groupsRunning(path, globs).every(group => group === 'browser' || group === 'live'))

const readSource = path => readFileSync(resolve(repositoryRoot, path), 'utf8')

test('every committed test file runs in exactly one group of the workflow', () => {
  const tests = committedTests()
  assert.ok(tests.length > 100)
  assert.deepEqual(unplaced(tests, globsPerGroup(workflowGroups())), [])
})

test('a test in a folder no group runs is unplaced', () => {
  const globs = globsPerGroup(workflowGroups())
  assert.deepEqual(
    unplaced(['tests/newfolder/a.test.mjs', 'tests/implementation/nested/a.test.mjs', 'tests/implementation/a.test.mjs'], globs),
    ['tests/newfolder/a.test.mjs', 'tests/implementation/nested/a.test.mjs'],
  )
})

test('every committed test that imports Playwright runs in the browser or live group', () => {
  const tests = committedTests()
  assert.ok(tests.filter(path => PLAYWRIGHT_IMPORT.test(readSource(path))).length >= 8, 'the guard sees the browser tests')
  assert.deepEqual(browserTestsOutsideBrowser(tests, readSource, globsPerGroup(workflowGroups())), [])
})

test('a Playwright test without the .browser suffix is caught', () => {
  const globs = globsPerGroup(workflowGroups())
  const source = () => "import { chromium } from 'playwright'"
  assert.deepEqual(browserTestsOutsideBrowser(['tests/implementation/preview.test.mjs', 'tests/implementation/preview-browser.test.mjs'], source, globs), [
    'tests/implementation/preview.test.mjs',
    'tests/implementation/preview-browser.test.mjs',
  ])
  assert.deepEqual(browserTestsOutsideBrowser(['tests/implementation/preview.browser.test.mjs', 'tests/live/preview.test.mjs'], source, globs), [])
})

const packageScripts = Object.freeze({
  'conexus:preflight': 'node scripts/conexus-preflight.mjs',
  'repository:check': 'node scripts/check-agent-context.mjs',
  verify: 'npm run repository:check',
  'test:one': 'node -e "process.exit(0)"',
  'test:two': 'node -e "process.exit(0)"',
  'generate:fixture': 'node scripts/generate-fixture.mjs',
  'record:receipt': 'node scripts/record-receipt.mjs',
  'test:history': 'node --test --test-concurrency=1 tests/implementation/history.test.mjs',
})

const EXPECTED_CANDIDATE_SCOPES = Object.freeze([
  'hub-typecheck',
  'web-typecheck',
  'biome',
  'knip',
  'repository-check',
  'import-law-check',
  'access-owner-check',
  'census-builder-run',
  'census-boundaries',
  'enforced-by-check',
  'generators',
  'contract-check',
  'e2b-template-check',
  'web-style',
  'wire-openapi-lint',
  'wire-bijection',
  'wire-technical-lint',
  'web-build',
  'repository-tests',
  'implementation-tests',
  'db-catalog-snapshot',
  'function-callers',
  'db-baseline-file',
  'postgres-tests',
  'browser-tests',
  'live-builder',
  'only-opt-in-skips',
])

test('manifest exposes only the three bounded aliases and exact npm routing', () => {
  assert.deepEqual(ALLOWED_ALIASES, ['preflight', 'repository', 'final'])
  assert.deepEqual(SCOPE_MANIFEST.preflight, { npmScript: 'conexus:preflight', npmArgs: [] })
  assert.deepEqual(resolveScope('preflight', packageScripts), {
    scope: 'preflight',
    npmScript: 'conexus:preflight',
    npmArgs: [],
    alias: true,
  })
  assert.equal(resolveScope('test:one', packageScripts).alias, false)
  assert.throws(() => resolveScope('not-allowlisted', packageScripts), /unknown verification scope/)
  assert.throws(() => resolveScope('generate:fixture', packageScripts), /not permitted as a verification scope/)
  assert.throws(() => resolveScope('record:receipt', packageScripts), /not permitted as a verification scope/)
})

test('--list is deterministic and includes aliases plus explicit npm scripts', () => {
  const available = listScopes(packageScripts)
  assert.deepEqual(available.aliases.map(alias => alias.scope), ['preflight', 'repository', 'final'])
  assert.deepEqual(available.scripts, ['conexus:preflight', 'repository:check', 'test:history', 'test:one', 'test:two', 'verify'])
  assert.deepEqual(available.rejectedScripts, ['generate:fixture', 'record:receipt'])
  assert.deepEqual(available.scopes.slice(0, 3), ['preflight', 'repository', 'final'])
  assert.ok(available.scopes.includes('test:one'))
})

test('--scope parsing supports repeated and comma-separated values without network or execution', () => {
  assert.deepEqual(parseArguments(['--scope', 'repository,final', '--scope=test:one', '--dry-run', '--json']), {
    scopes: ['repository', 'final', 'test:one'],
    list: false,
    dryRun: true,
    json: true,
    help: false,
    group: null,
  })

  const calls = []
  const result = runVerification({
    processEnvironment: {},
    scopes: ['repository', 'final', 'test:one'],
    packageScripts,
    dryRun: true,
    runCommand: entry => calls.push(entry),
  })
  assert.deepEqual(calls, [])
  assert.deepEqual(result.records.map(record => record.status), ['dry-run', 'dry-run', 'dry-run'])
  assert.deepEqual(result.records.map(record => record.exitCode), [null, null, null])
  assert.ok(result.records[0].command.includes('npm run repository:check'))
  assert.equal(result.exitCode, 0)
})

test('execution is sequential and stops at the first failed npm command', () => {
  const calls = []
  let ticks = 0
  const result = runVerification({
    processEnvironment: {},
    scopes: ['test:one', 'test:two', 'verify'],
    packageScripts,
    clock: () => ++ticks,
    runCommand: entry => {
      calls.push(entry.npmScript)
      return calls.length === 1 ? { status: 17 } : { status: 0 }
    },
  })

  assert.deepEqual(calls, ['test:one'])
  assert.equal(result.stopped, true)
  assert.equal(result.exitCode, 17)
  assert.equal(result.records.length, 1)
  assert.deepEqual(result.records[0], {
    scope: 'test:one',
    command: 'npm run test:one',
    status: 'failed',
    exitCode: 17,
    durationMs: 1,
  })
})

test('the hub build step publishes its directory to the steps after it, and only after it succeeds', () => {
  const seen = []
  const result = runVerification({
    processEnvironment: {},
    scopes: ['candidate'],
    packageScripts,
    platform: 'linux',
    runCommand: (entry, { processEnvironment }) => {
      seen.push([entry.scope, processEnvironment.CONEXUS_HUB_BUILD ?? null])
      return { status: seen.length <= 2 ? 0 : 1 }
    },
  })
  assert.equal(result.exitCode, 1)
  assert.deepEqual(seen.map(([scope]) => scope), ['hub-typecheck', 'web-typecheck', 'biome'])
  assert.equal(seen[0][1], null)
  assert.equal(seen[1][1], resolve(repositoryRoot, 'node_modules/.cache/conexus-hub-build'))
  assert.equal(seen[2][1], seen[1][1])

  const failedBuild = []
  runVerification({
    processEnvironment: {},
    scopes: ['candidate'],
    packageScripts,
    platform: 'linux',
    runCommand: (_entry, { processEnvironment }) => {
      failedBuild.push(processEnvironment.CONEXUS_HUB_BUILD ?? null)
      return { status: 1 }
    },
  })
  assert.deepEqual(failedBuild, [null])
})

test('final proof refuses a real Windows execution but remains inspectable as dry-run', () => {
  const finalEntry = [resolveScope('final', packageScripts)]
  assert.throws(
    () => assertExecutionEnvironment(finalEntry, { platform: 'win32', dryRun: false }),
    /final verification requires Linux/,
  )
  assert.doesNotThrow(() => assertExecutionEnvironment(finalEntry, { platform: 'win32', dryRun: true }))
  assert.doesNotThrow(() => assertExecutionEnvironment(finalEntry, { platform: 'linux', dryRun: false }))
})

test('candidate graph is the static checks, then one node --test per group by glob', () => {
  const scopes = CANDIDATE_GRAPH.map(entry => entry.scope)
  assert.deepEqual(scopes, EXPECTED_CANDIDATE_SCOPES)
  const command = (scope) => CANDIDATE_GRAPH.find(entry => entry.scope === scope).command
  assert.equal(command('repository-tests'), "node --test 'tests/repository/!(*.browser|*.postgres).test.mjs'")
  assert.equal(command('implementation-tests'), "node --test 'tests/implementation/!(*.browser|*.postgres).test.mjs' 'tests/implementation/access/*.test.mjs'")
  assert.equal(command('postgres-tests'), "node --test --test-concurrency=1 'tests/implementation/*.postgres.test.mjs'")
  assert.equal(command('browser-tests'), "node --test --test-concurrency=1 'tests/implementation/*.browser.test.mjs'")
  assert.equal(command('biome'), 'npx --no-install biome ci . --error-on-warnings')
  const commands = CANDIDATE_GRAPH.map(entry => entry.command)
  assert.equal(commands.some(text => /\.test\.mjs(?!')/.test(text)), false, 'no step names a test file; the globs do')
  assert.equal(commands.filter(text => /node scripts\/generate-[^ ]+\.mjs/.test(text)).length, 0, 'the generators run as the one generators step')
  assert.equal(command('generators'), 'npm run generate')
  assert.equal(commands.some(text => text.includes('qualification/')), false)
  assert.equal(commands.filter(text => text.includes('-live.test.mjs')).length, 0, 'paid live runs are explicit commands')
})

test('the workflow ends every group on the dirty tree check that makes the generators a check', () => {
  const workflow = readFileSync(resolve(repositoryRoot, '.github/workflows/verify.yml'), 'utf8')
  assert.match(workflow, /git status --porcelain\)" \]/)
  assert.ok(workflow.indexOf('--scope candidate --group') < workflow.indexOf('git status --porcelain'))
})

const workflowSteps = (file) => readFileSync(resolve(repositoryRoot, `.github/workflows/${file}`), 'utf8')
  .split(/\n {6}- /)
  .slice(1)

test('each group sets up only what it needs', () => {
  const steps = workflowSteps('verify.yml')
  const setupOf = (name) => steps.find(step => step.includes(`name: ${name}`))
  const ifLine = (name) => setupOf(name).split('\n').find(line => line.trim().startsWith('if:'))
  const gatedTo = (name) => ['browser', 'postgres', 'rest', 'live'].filter(group => ifLine(name).includes(`'${group}'`))
  assert.deepEqual(gatedTo('Install Playwright Chromium'), ['browser', 'live'])
  assert.deepEqual(gatedTo('Start the Hub PostgreSQL'), ['browser', 'postgres'])
  assert.deepEqual(gatedTo('Start the Applications PostgreSQL test cluster'), ['postgres'])
  assert.deepEqual(gatedTo('Rootless sandbox for the application runner suite'), ['postgres'])
  assert.equal(readFileSync(resolve(repositoryRoot, '.github/workflows/verify.yml'), 'utf8').includes('services:'), false)
})

test('the aprovo gate runs on the same pull request events in its own workflow', () => {
  const workflow = readFileSync(resolve(repositoryRoot, '.github/workflows/aprovo-gate.yml'), 'utf8')
  assert.match(workflow, /types: \[opened, synchronize, reopened, edited, labeled, unlabeled\]/)
  assert.match(workflow, /node scripts\/check-aprovo-gate\.mjs --base "origin\/\$\{\{ github\.base_ref \}\}"/)
  assert.equal(readFileSync(resolve(repositoryRoot, '.github/workflows/verify.yml'), 'utf8').includes('check-aprovo-gate'), false)
})

test('the static checks run before every test step, and the Hub build stays first', () => {
  const scopes = CANDIDATE_GRAPH.map(entry => entry.scope)
  assert.equal(scopes[0], 'hub-typecheck')
  const isSuite = entry => entry.command.startsWith('node --test') || entry.scope === 'live-builder'
  const firstTest = CANDIDATE_GRAPH.findIndex(isSuite)
  const lastStatic = Math.max(...CANDIDATE_GRAPH.filter(entry => entry.environmentClass === 'static' && !isSuite(entry) && entry.scope !== 'only-opt-in-skips').map(entry => scopes.indexOf(entry.scope)))
  assert.ok(lastStatic < firstTest)
})


test('a step that never exits is killed and reported by name', () => {
  const candidate = CANDIDATE_GRAPH.find(entry => entry.environmentClass === 'static')
  const result = runVerification({
    processEnvironment: {},
    scopes: ['test:one'],
    packageScripts,
    runCommand: () => ({ status: null, signal: 'SIGKILL', error: Object.assign(new Error('spawnSync bash ETIMEDOUT'), { code: 'ETIMEDOUT' }) }),
    clock: () => 0,
  })
  assert.equal(result.records[0].status, 'failed')
  assert.equal(result.records[0].error, 'step exceeded 600s and was killed')
  assert.equal(result.records[0].command, 'npm run test:one')
  assert.equal(result.exitCode, 1)
  assert.equal(result.stopped, true)
  assert.ok(timedOut({ status: null, signal: 'SIGKILL', error: new Error('x') }))
  assert.equal(timedOut({ status: 1 }), false)
  assert.equal(STEP_TIMEOUT_MS, 600000)

  // No step inherits stdin, so a child that waits for input reads end-of-file instead of hanging.
  let observed
  runNpmScript(candidate, {
    root: '/tmp/conexus-verify-test',
    processEnvironment: { PATH: '/fixture/bin' },
    spawn: (_file, _args, options) => {
      observed = options
      return { status: 0 }
    },
  })
  assert.deepEqual(observed.stdio, ['ignore', 'inherit', 'inherit'])
  assert.equal(observed.timeout, STEP_TIMEOUT_MS)
  assert.equal(observed.killSignal, 'SIGKILL')
})

test('candidate graph labels execution environments and passes shell argv correctly', () => {
  const classes = new Set(CANDIDATE_GRAPH.map(entry => entry.environmentClass))
  assert.deepEqual([...classes].sort(), ['browser', 'live', 'postgres', 'static'])

  const browserStep = CANDIDATE_GRAPH.find(entry => entry.scope === 'browser-tests')
  const postgresStep = CANDIDATE_GRAPH.find(entry => entry.scope === 'postgres-tests')
  assert.equal(browserStep.environmentClass, 'browser')
  assert.equal(postgresStep.environmentClass, 'postgres')

  const candidate = CANDIDATE_GRAPH.find(entry => entry.environmentClass === 'static')
  let observed
  runNpmScript(candidate, {
    root: '/tmp/conexus-verify-test',
    processEnvironment: { PATH: '/fixture/bin' },
    spawn: (file, args, options) => {
      observed = { file, args, options }
      return { status: 0, stdout: '', stderr: '' }
    },
  })
  assert.deepEqual(observed, {
    file: 'bash',
    args: ['-lc', candidate.command],
    options: {
      cwd: '/tmp/conexus-verify-test',
      windowsHide: true,
      stdio: ['ignore', 'inherit', 'inherit'],
      timeout: STEP_TIMEOUT_MS,
      killSignal: 'SIGKILL',
      env: { PATH: '/fixture/bin', CONEXUS_VERIFY_STEP_CLASS: 'static' },
    },
  })

  const postgresDefaults = executionEnvironment(postgresStep, { PATH: '/fixture/bin' })
  assert.deepEqual(postgresDefaults, {
    PATH: '/fixture/bin',
    CONEXUS_TEST_DB_HOST: '127.0.0.1',
    CONEXUS_TEST_DB_PORT: '5432',
    CONEXUS_TEST_DB_NAME: 'conexus_test',
    CONEXUS_TEST_DB_USER: 'postgres',
    CONEXUS_TEST_DB_PASSWORD: 's6-ci-test-only',
    CONEXUS_VERIFY_STEP_CLASS: 'postgres',
  })
  const selectedPostgres = {
    CONEXUS_TEST_DB_HOST: 'db.internal',
    CONEXUS_TEST_DB_PORT: '6543',
    CONEXUS_TEST_DB_NAME: 'selected',
    CONEXUS_TEST_DB_USER: 'runner',
    CONEXUS_TEST_DB_PASSWORD: 'opaque',
  }
  assert.deepEqual(executionEnvironment(postgresStep, selectedPostgres), { ...selectedPostgres, CONEXUS_VERIFY_STEP_CLASS: 'postgres' })
  assert.deepEqual(executionEnvironment(browserStep, { PATH: '/fixture/bin' }), { ...postgresDefaults, CONEXUS_VERIFY_STEP_CLASS: 'browser' })
  assert.throws(
    () => executionEnvironment(postgresStep, { CONEXUS_TEST_DB_HOST: 'db.internal' }),
    /requires either all CONEXUS_TEST_DB_\* values or none/,
  )
})

const REPORTER_OPTIONS = `--test-reporter=spec --test-reporter-destination=stdout --test-reporter=${resolve(repositoryRoot, 'scripts/test-ledger-reporter.mjs')} --test-reporter-destination=stdout`

test('every step records its skips into one fresh ledger per run', () => {
  const ledger = { root: '/work/conexus-os', file: '/tmp/conexus-test-ledger-fixture.jsonl' }
  const staticStep = CANDIDATE_GRAPH.find(entry => entry.environmentClass === 'static')
  const postgresStep = CANDIDATE_GRAPH.find(entry => entry.environmentClass === 'postgres')
  const instrumentation = {
    CONEXUS_TEST_LEDGER_ROOT: '/work/conexus-os',
    CONEXUS_TEST_LEDGER: '/tmp/conexus-test-ledger-fixture.jsonl',
    CONEXUS_VERIFY_STEP_CLASS: 'static',
  }

  assert.deepEqual(executionEnvironment(staticStep, { PATH: '/fixture/bin' }, ledger), {
    PATH: '/fixture/bin',
    ...instrumentation,
    NODE_OPTIONS: REPORTER_OPTIONS,
  })
  assert.deepEqual(executionEnvironment(staticStep, { NODE_OPTIONS: '--max-old-space-size=4096' }, ledger), {
    ...instrumentation,
    NODE_OPTIONS: `--max-old-space-size=4096 ${REPORTER_OPTIONS}`,
  })
  assert.deepEqual(executionEnvironment(staticStep, { NODE_OPTIONS: REPORTER_OPTIONS }, ledger), {
    ...instrumentation,
    NODE_OPTIONS: REPORTER_OPTIONS,
  })
  assert.deepEqual(executionEnvironment(postgresStep, {}, ledger), {
    ...instrumentation,
    CONEXUS_VERIFY_STEP_CLASS: 'postgres',
    NODE_OPTIONS: REPORTER_OPTIONS,
    CONEXUS_TEST_DB_HOST: '127.0.0.1',
    CONEXUS_TEST_DB_PORT: '5432',
    CONEXUS_TEST_DB_NAME: 'conexus_test',
    CONEXUS_TEST_DB_USER: 'postgres',
    CONEXUS_TEST_DB_PASSWORD: 's6-ci-test-only',
  })

  let observed
  runNpmScript(staticStep, {
    root: '/work/conexus-os',
    processEnvironment: { PATH: '/fixture/bin' },
    testLedger: ledger,
    spawn: (_file, _args, options) => { observed = options.env },
  })
  assert.deepEqual(observed, { PATH: '/fixture/bin', ...instrumentation, NODE_OPTIONS: REPORTER_OPTIONS })

  const runLedgers = () => {
    const seen = []
    runVerification({
      scopes: ['candidate'],
      packageScripts,
      platform: 'linux',
      processEnvironment: {},
      runCommand: (_entry, { testLedger }) => { seen.push(testLedger); return { status: 0 } },
    })
    return seen
  }
  const first = runLedgers()
  const second = runLedgers()
  assert.equal(first.length, CANDIDATE_GRAPH.length)
  assert.equal(new Set(first).size, 1)
  assert.equal(first[0].root, repositoryRoot)
  assert.equal(dirname(first[0].file), tmpdir())
  assert.match(first[0].file, /conexus-test-ledger-[0-9a-f-]{36}\.jsonl$/)
  assert.notEqual(first[0].file, second[0].file)
  assert.equal(existsSync(first[0].file), false)
  assert.equal(newTestLedger('/work/conexus-os').root, '/work/conexus-os')
})

test('the opt-in skip check runs last', () => {
  assert.deepEqual(CANDIDATE_GRAPH.at(-1), {
    scope: 'only-opt-in-skips',
    command: 'node scripts/check-test-skips.mjs',
    environmentClass: 'static',
    graph: 'candidate',
  })
})



test('the docs graph is the docs checks, in graph order, and still ends with the skip check', () => {
  assert.deepEqual(DOCS_GRAPH.map(entry => entry.scope), ['repository-check', 'wire-bijection', 'repository-tests', 'only-opt-in-skips'])
  assert.equal(DOCS_GRAPH.length, DOCS_CHECK_SCOPES.length)
  assert.equal(DOCS_GRAPH.every(entry => entry.environmentClass === 'static'), true)
  const result = runVerification({ processEnvironment: {}, scopes: ['candidate-docs'], packageScripts, dryRun: true })
  assert.deepEqual(result.records.map(record => record.scope), DOCS_GRAPH.map(entry => entry.scope))
})

test('the quick graph is only static checks, no test suite', () => {
  assert.equal(QUICK_GRAPH.every(entry => entry.environmentClass === 'static'), true)
  assert.equal(QUICK_GRAPH.some(entry => entry.command.startsWith('node --test')), false)
  const result = runVerification({ processEnvironment: {}, scopes: ['candidate-quick'], packageScripts, dryRun: true })
  assert.deepEqual(result.records.map(record => record.scope), QUICK_GRAPH.map(entry => entry.scope))
  assert.deepEqual(QUICK_GRAPH.map(entry => entry.scope).slice(0, 3), ['hub-typecheck', 'web-typecheck', 'biome'])
})

test('step summary is a markdown table sorted slowest first with each share of the total', () => {
  const summary = renderStepSummary([
    { scope: 'quick', status: 'succeeded', durationMs: 1000 },
    { scope: 'slow', status: 'succeeded', durationMs: 7500 },
    { scope: 'broken', status: 'failed', durationMs: 1500 },
  ])
  assert.equal(summary, [
    '### Verification step timings',
    '',
    '3 steps, 10.0 s in total, slowest first.',
    '',
    '| Step | Status | Seconds | Share |',
    '| --- | --- | ---: | ---: |',
    '| slow | succeeded | 7.5 | 75.0% |',
    '| broken | failed | 1.5 | 15.0% |',
    '| quick | succeeded | 1.0 | 10.0% |',
    '',
  ].join('\n'))
})


test('every graph step belongs to exactly one group, except the two every group runs', () => {
  const shared = ['hub-typecheck', 'only-opt-in-skips']
  for (const entry of CANDIDATE_GRAPH) {
    const groups = groupsOf(entry)
    assert.ok(groups.every(group => VERIFY_GROUPS.includes(group)), `${entry.scope} has a known group`)
    assert.equal(groups.length, shared.includes(entry.scope) ? VERIFY_GROUPS.length : 1, entry.scope)
  }
  const owned = VERIFY_GROUPS.flatMap(group => graphForGroup(CANDIDATE_GRAPH, group).map(entry => entry.scope).filter(scope => !shared.includes(scope)))
  assert.deepEqual([...owned].sort(), CANDIDATE_GRAPH.map(entry => entry.scope).filter(scope => !shared.includes(scope)).sort())
  assert.equal(new Set(owned).size, owned.length)
})

test('a group runs the Hub build first and the skip check last, and keeps graph order between', () => {
  for (const group of VERIFY_GROUPS) {
    const scopes = graphForGroup(CANDIDATE_GRAPH, group).map(entry => entry.scope)
    assert.equal(scopes[0], 'hub-typecheck', group)
    assert.equal(scopes.at(-1), 'only-opt-in-skips', group)
  }
  assert.deepEqual(graphForGroup(CANDIDATE_GRAPH, 'browser').map(entry => entry.scope), ['hub-typecheck', 'browser-tests', 'only-opt-in-skips'])
  assert.deepEqual(graphForGroup(CANDIDATE_GRAPH, 'postgres').map(entry => entry.scope), ['hub-typecheck', 'db-catalog-snapshot', 'function-callers', 'db-baseline-file', 'postgres-tests', 'only-opt-in-skips'])
  assert.equal(graphForGroup(CANDIDATE_GRAPH, 'rest').every(entry => entry.environmentClass === 'static'), true)
  assert.deepEqual(graphForGroup(CANDIDATE_GRAPH, 'live').map(entry => entry.scope), ['hub-typecheck', 'live-builder', 'only-opt-in-skips'])
})

test('--group narrows the candidate graph and refuses an unknown group', async () => {
  assert.equal(parseArguments(['--scope', 'candidate', '--group', 'browser']).group, 'browser')
  assert.equal(parseArguments(['--scope', 'candidate', '--group=rest']).group, 'rest')
  assert.throws(() => parseArguments(['--scope', 'candidate', '--group', 'slow']), /--group must be one of browser, postgres, rest, live/)
  const result = runVerification({ processEnvironment: {}, scopes: ['candidate'], packageScripts, dryRun: true, group: 'postgres' })
  assert.deepEqual(result.records.map(record => record.scope), graphForGroup(CANDIDATE_GRAPH, 'postgres').map(entry => entry.scope))
})
