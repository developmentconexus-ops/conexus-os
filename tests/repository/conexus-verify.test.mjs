import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import {
  ALLOWED_ALIASES,
  AFTER_ALL,
  BROWSER_LOAD,
  HUB_CLUSTER_LOCK,
  locksOf,
  verificationConcurrency,
  CANDIDATE_GRAPH,
  DOCS_CHECK_SCOPES,
  DOCS_GRAPH,
  FAST_CHECK_SCOPES,
  SCOPE_MANIFEST,
  assertExecutionEnvironment,
  executionEnvironment,
  failFastOrder,
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

test('every test file the candidate graph names exists on disk', async () => {
  const named = CANDIDATE_GRAPH.flatMap(entry => entry.command.match(/\S+\.test\.mjs/g) ?? [])
  assert.ok(named.length > 0)
  const missing = named.filter(path => !existsSync(resolve(repositoryRoot, path)))
  assert.deepEqual(missing, [])
})

const packageScripts = Object.freeze({
  'conexus:preflight': 'node scripts/conexus-preflight.mjs',
  'repository:check': 'node scripts/check-current-state.mjs',
  verify: 'npm run repository:check',
  'test:one': 'node -e "process.exit(0)"',
  'test:two': 'node -e "process.exit(0)"',
  'r1:g0:generate': 'node scripts/generate-r1-g0.mjs',
  'r1:s1:receipt:record': 'node scripts/record-r1-s1-receipt.mjs',
  'r1:history:foundation-pins': 'node --test --test-concurrency=1 tests/implementation/r1-foundation-pin-history.test.mjs',
})

const EXPECTED_CANDIDATE_SCOPES = Object.freeze([
  'c020-hub-typecheck',
  'c020-web-typecheck',
  'db-role-register',
  'repository-check',
  'repository-import-law',
  'repository-agent-context',
  'contract-projection-check-iam',
  'contract-projection-check-workspace',
  'contract-projection-check-project',
  'contract-projection-check-connector',
  'repository-contract-checks',
  'knip',
  'biome',
  'builder-guidance-neutral',
  'conexus-preflight',
  'web-style',
  'wire-openapi-lint',
  'wire-openapi-bundle',
  'wire-bijection',
  'wire-bijection-gate',
  'wire-carriers',
  'wire-identity-workspace',
  'wire-project',
  'wire-builder',
  'wire-connector',
  'wire-technical-lint',
  'wire-technical-ingress',
  'test-census',
  'hub-baseline',
  'c020-migration-selection',
  'c020-migration-postgres',
  'iam-membership-authority',
  'iam-application-access',
  'iam-installation-administrator',
  'installation-settings-routes',
  'iam-grant-surface-excision',
  'hub-call-site-privileges',
  'connector-postgres',
  'connector-routes',
  'connector-broker',
  'connector-broker-postgres',
  'connector-builder-brief',
  'connector-builder-tool',
  'builder-harness',
  'c020-builder-postgres',
  'c020-builder-request-text-postgres',
  'conexus-git-postgres',
  'factory-dependency-tree',
  'builder-composition',
  'model-account-postgres',
  'google-ai-pro',
  'openai-codex',
  'anthropic',
  'run-runtime',
  'run-recovery-postgres',
  'builder-session-routes',
  'conexus-git',
  'application-data-postgres',
  'application-runner-sandbox',
  'app-runner-http',
  'application-server',
  'application-host',
  'foundation-postgres',
  'project-summary-activity-postgres',
  'project-summary-routes',
  'c020-registry',
  'c020-source-runtime',
  'c020-failure-vocabulary',
  'c020-compiler-runtime',
  'c020-browser',
  'settings-browser',
  'application-access-browser',
  'connector-integrations-browser',
  'c020-e2b-template',
  'c020-compiler-v2',
  'c020-web-build',
  'db-catalog-snapshot',
  'db-baseline-file',
  'hub-postgres-pool',
  'db-role-provision-postgres',
  'hub-build-shared',
  'hub-log-sinks',
  'telemetry',
  'brand-wordmark-csp',
  'builder-tool-sentences',
  'builder-skills-guard',
  'identity-access-http',
  'application-access-http',
  'workspace-membership-http',
  'workspace-http',
  'workspace-reads',
  'project-disclosure',
  'project-command-postgres',
  'project-deletion',
  'project-deletion-postgres',
  'project-browser',
  'project-settings-deletion-browser',
  'project-name',
  'shell-browser-boundary',
  'brand-tokens',
  'preview-form-policy',
  'builder-credential-generation',
  'builder-first-operational-delivery',
  'builder-planning-free-boot',
  'builder-eval',
  'builder-eval-postgres',
  'protected-cluster-coverage',
  'conexus-backup',
  'only-opt-in-skips',
])

test('manifest exposes only the three bounded aliases and exact npm routing', async () => {
  assert.deepEqual(ALLOWED_ALIASES, ['preflight', 'repository', 'final'])
  assert.deepEqual(SCOPE_MANIFEST.preflight, { npmScript: 'conexus:preflight', npmArgs: ['--no-network'] })
  assert.deepEqual(resolveScope('preflight', packageScripts), {
    scope: 'preflight',
    npmScript: 'conexus:preflight',
    npmArgs: ['--no-network'],
    alias: true,
  })
  assert.equal(resolveScope('test:one', packageScripts).alias, false)
  assert.throws(() => resolveScope('not-allowlisted', packageScripts), /unknown verification scope/)
  assert.throws(() => resolveScope('r1:g0:generate', packageScripts), /not permitted as a verification scope/)
  assert.throws(() => resolveScope('r1:s1:receipt:record', packageScripts), /not permitted as a verification scope/)
})

test('--list is deterministic and includes aliases plus explicit npm scripts', async () => {
  const available = listScopes(packageScripts)
  assert.deepEqual(available.aliases.map(alias => alias.scope), ['preflight', 'repository', 'final'])
  assert.deepEqual(available.scripts, ['conexus:preflight', 'r1:history:foundation-pins', 'repository:check', 'test:one', 'test:two', 'verify'])
  assert.deepEqual(available.rejectedScripts, ['r1:g0:generate', 'r1:s1:receipt:record'])
  assert.deepEqual(available.scopes.slice(0, 3), ['preflight', 'repository', 'final'])
  assert.ok(available.scopes.includes('test:one'))
})

test('--scope parsing supports repeated and comma-separated values without network or execution', async () => {
  assert.deepEqual(parseArguments(['--scope', 'repository,final', '--scope=test:one', '--dry-run', '--json']), {
    scopes: ['repository', 'final', 'test:one'],
    list: false,
    dryRun: true,
    json: true,
    help: false,
  })

  const calls = []
  const result = await runVerification({
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

test('with one slot execution is sequential and stops at the first failed npm command', async () => {
  const calls = []
  let ticks = 0
  const result = await runVerification({
    processEnvironment: {},
    scopes: ['test:one', 'test:two', 'verify'],
    packageScripts,
    concurrency: 1,
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

test('the hub build step publishes its directory to the steps after it, and only after it succeeds', async () => {
  const seen = []
  const result = await runVerification({
    processEnvironment: {},
    scopes: ['candidate'],
    packageScripts,
    platform: 'linux',
    concurrency: 1,
    runCommand: (entry, { processEnvironment }) => {
      seen.push([entry.scope, processEnvironment.CONEXUS_HUB_BUILD ?? null])
      return { status: seen.length <= 2 ? 0 : 1 }
    },
  })
  assert.equal(result.exitCode, 1)
  assert.deepEqual(seen.map(([scope]) => scope), ['c020-hub-typecheck', 'c020-web-typecheck', 'db-role-register'])
  assert.equal(seen[0][1], null)
  assert.equal(seen[1][1], resolve(repositoryRoot, 'node_modules/.cache/conexus-hub-build'))
  assert.equal(seen[2][1], seen[1][1])

  const failedBuild = []
  await runVerification({
    processEnvironment: {},
    scopes: ['candidate'],
    packageScripts,
    platform: 'linux',
    concurrency: 1,
    runCommand: (_entry, { processEnvironment }) => {
      failedBuild.push(processEnvironment.CONEXUS_HUB_BUILD ?? null)
      return { status: 1 }
    },
  })
  assert.deepEqual(failedBuild, [null])
})

test('final proof refuses a real Windows execution but remains inspectable as dry-run', async () => {
  const finalEntry = [resolveScope('final', packageScripts)]
  assert.throws(
    () => assertExecutionEnvironment(finalEntry, { platform: 'win32', dryRun: false }),
    /final verification requires Linux/,
  )
  assert.doesNotThrow(() => assertExecutionEnvironment(finalEntry, { platform: 'win32', dryRun: true }))
  assert.doesNotThrow(() => assertExecutionEnvironment(finalEntry, { platform: 'linux', dryRun: false }))
})

test('candidate graph flattens equivalent leaves while preserving distinct proof selections', async () => {
  const scopes = CANDIDATE_GRAPH.map(entry => entry.scope)
  assert.deepEqual(scopes, EXPECTED_CANDIDATE_SCOPES)

  const commands = CANDIDATE_GRAPH.map(entry => entry.command)
  assert.equal(commands.some(command => command.includes('qualification/')), false,
    'the qualification/ probe suite is an explicit audit, not current MVP blocker')
  assert.equal(commands.filter(command => command.includes('tests/implementation/builder-run-invariants-postgres.test.mjs') && command.includes('tests/implementation/builder-run-execution-postgres.test.mjs')).length, 1)
  assert.equal(commands.filter(command => command === 'node --test --test-concurrency=1 tests/implementation/builder-brain-context.test.mjs').length, 0)
  assert.equal(commands.some(command => command.includes('tests/implementation/rb-builder-first-vertical.test.mjs')), false,
    'historical Builder verifier suite is not a current MVP blocker')
  assert.equal(commands.filter(command => command.includes('node scripts/builder-e2b-template.mjs --check')).length, 1,
    'the existing E2B template check remains part of the current Builder proof')
  assert.equal(commands.filter(command => command.startsWith('npx --no-install biome ci .')).length, 1)
  const leavesRunning = (file) => CANDIDATE_GRAPH.filter(entry => entry.command.split(' ').includes(file)).map(({ scope, environmentClass }) => [scope, environmentClass])
  assert.deepEqual(leavesRunning('tests/implementation/connector-fetch.test.mjs'), [['connector-broker', 'static']])
  assert.deepEqual(leavesRunning('tests/implementation/connector-handler-fetch.test.mjs'), [['connector-broker', 'static']])
  assert.deepEqual(leavesRunning('tests/implementation/app-runner-worker.test.mjs'), [['app-runner-http', 'static']])
  assert.deepEqual(leavesRunning('tests/implementation/application-release.test.mjs'), [['app-runner-http', 'static']])
  assert.deepEqual(leavesRunning('tests/implementation/manifest-enum.test.mjs'), [['app-runner-http', 'static']])
  assert.deepEqual(leavesRunning('tests/implementation/builder-submit-plan.test.mjs'), [['builder-harness', 'static']])
  assert.deepEqual(leavesRunning('tests/implementation/builder-project-context.test.mjs'), [['builder-harness', 'static']])
  assert.deepEqual(leavesRunning('tests/implementation/builder-memory.test.mjs'), [['builder-harness', 'static']])
  assert.deepEqual(leavesRunning('tests/implementation/builder-model-stream-recorder.test.mjs'), [['builder-harness', 'static']])
  assert.deepEqual(leavesRunning('tests/implementation/builder-run-operation.test.mjs'), [['builder-harness', 'static']])
  assert.deepEqual(leavesRunning('tests/implementation/builder-sankhya-reader.test.mjs'), [['builder-harness', 'static']])
  assert.deepEqual(leavesRunning('tests/implementation/builder-agent-retry.test.mjs'), [['run-runtime', 'static']])
  assert.deepEqual(leavesRunning('tests/implementation/builder-runaway-step.test.mjs'), [['run-runtime', 'static']])
  assert.deepEqual(leavesRunning('tests/implementation/builder-parallel-tools.test.mjs'), [['run-runtime', 'static']])
  assert.deepEqual(leavesRunning('tests/implementation/builder-run-timing.test.mjs'), [['run-runtime', 'static']])
  assert.deepEqual(leavesRunning('tests/implementation/builder-turn-stall.test.mjs'), [['run-runtime', 'static']])
  assert.deepEqual(leavesRunning('tests/implementation/builder-eval-oracle.test.mjs'), [['builder-eval', 'browser']])
  assert.deepEqual(leavesRunning('tests/implementation/builder-eval-person.test.mjs'), [['builder-eval', 'browser']])
  assert.deepEqual(leavesRunning('tests/implementation/builder-eval-timing.test.mjs'), [['builder-eval', 'browser']])
  assert.deepEqual(leavesRunning('tests/implementation/builder-skill-manifest-vocabulary.test.mjs'), [['builder-skills-guard', 'static']])
  assert.deepEqual(leavesRunning('tests/implementation/builder-plan-sections.test.mjs'), [['c020-browser', 'browser']])
  assert.deepEqual(leavesRunning('tests/implementation/builder-anthropic.test.mjs'), [['anthropic', 'static']])
  assert.deepEqual(leavesRunning('tests/implementation/connector-fetch-postgres.test.mjs'), [['connector-broker-postgres', 'postgres']],
    'a PostgreSQL suite outside a postgres leaf would skip')
  const biomeCommand = CANDIDATE_GRAPH.find(entry => entry.scope === 'biome').command
  assert.equal(biomeCommand, 'npx --no-install biome ci .')
  assert.equal(commands.filter(command => command.startsWith('node node_modules/vite/bin/vite.js build --config apps/web/vite.config.mjs apps/web')).length, 1)
  assert.equal(commands.filter(command => command === 'npm run repository:check').length, 1)
  assert.equal(commands.filter(command => command === 'npm run repository:check:extended').length, 0)
  assert.equal(commands.some(command => /node scripts\/generate-[^ ]+\.mjs/.test(command) && !command.includes('--check')), false)
  assert.equal(commands.some(command => /(?:^|\s|:)r[12](?:[-:]|\b)/.test(command)), false,
    'historical R1/R2 commands are explicit audits, not current Builder proof')
  assert.equal(scopes.some(scope => scope.includes('r1') || scope.includes('r2') || scope.includes('rb')), false)
  const builderCommand = CANDIDATE_GRAPH.find(entry => entry.scope === 'c020-source-runtime').command
  assert.equal(builderCommand.includes('-live.test.mjs'), false,
    'paid live experiments are explicit commands, not inherited flags in default verification')
  const runRuntimeCommand = CANDIDATE_GRAPH.find(entry => entry.scope === 'run-runtime').command
  assert.equal(runRuntimeCommand.includes('tests/implementation/builder-session-tripwire.test.mjs'), true,
    'the tripwire test runs with the run runtime suites')

  const builderBrowser = CANDIDATE_GRAPH.find(entry => entry.scope === 'c020-browser')
  assert.equal(builderBrowser.command.includes('tests/implementation/builder-live-turn.test.mjs'), true)
  const builderEval = CANDIDATE_GRAPH.find(entry => entry.scope === 'builder-eval')
  assert.equal(builderEval.command.includes('tests/implementation/builder-eval-run.test.mjs'), true)
  assert.equal(builderEval.environmentClass, 'browser')
  const appCheck = CANDIDATE_GRAPH.find(entry => entry.scope === 'c020-compiler-runtime')
  assert.equal(appCheck.command.includes('tests/implementation/builder-application-check.test.mjs'), true)
  assert.equal(appCheck.environmentClass, 'browser')
  assert.equal(CANDIDATE_GRAPH.find(entry => entry.scope === 'app-runner-http').command.includes('tests/implementation/app-path-classifier.test.mjs'), true)
  assert.equal(CANDIDATE_GRAPH.find(entry => entry.scope === 'conexus-backup').command.includes('tests/implementation/conexus-backup.test.mjs'), true)

  const result = await runVerification({
    processEnvironment: {},
    scopes: ['candidate'],
    packageScripts,
    dryRun: true,
    runCommand: () => assert.fail('candidate dry-run must not execute commands'),
  })
  assert.equal(result.records.length, CANDIDATE_GRAPH.length)
  assert.deepEqual(result.records.map(record => record.command), commands)
  assert.deepEqual(result.records.map(record => record.environmentClass), CANDIDATE_GRAPH.map(entry => entry.environmentClass))
  assert.deepEqual(result.records.every(record => record.status === 'dry-run'), true)
})

test('candidate graph does not reference the deleted Change-era source-state test', async () => {
  assert.equal(CANDIDATE_GRAPH.some(({ command }) => command.includes('builder-working-source-state.test.mjs')), false)
})

test('a step that never exits is killed and reported by name', async () => {
  const candidate = CANDIDATE_GRAPH.find(entry => entry.environmentClass === 'static')
  const result = await runVerification({
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

  let observed
  await runNpmScript(candidate, {
    root: '/tmp/conexus-verify-test',
    processEnvironment: { PATH: '/fixture/bin' },
    spawn: (_file, _args, options) => {
      observed = options
      return { status: 0 }
    },
  })
  assert.equal(observed.timeout, STEP_TIMEOUT_MS)
  assert.equal(observed.killSignal, 'SIGKILL')
})

test('candidate graph labels execution environments and passes shell argv correctly', async () => {
  const classes = new Set(CANDIDATE_GRAPH.map(entry => entry.environmentClass))
  assert.deepEqual([...classes].sort(), ['browser', 'browser-postgres', 'postgres', 'static'])

  const c020Browser = CANDIDATE_GRAPH.find(entry => entry.scope === 'c020-browser')
  const c020Postgres = CANDIDATE_GRAPH.find(entry => entry.scope === 'c020-builder-postgres')
  assert.equal(c020Browser.environmentClass, 'browser')
  assert.equal(c020Postgres.environmentClass, 'postgres')

  const candidate = CANDIDATE_GRAPH.find(entry => entry.environmentClass === 'static')
  let observed
  await runNpmScript(candidate, {
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
      timeout: STEP_TIMEOUT_MS,
      killSignal: 'SIGKILL',
      env: { PATH: '/fixture/bin' },
    },
  })

  const postgresDefaults = executionEnvironment(c020Postgres, { PATH: '/fixture/bin' })
  assert.deepEqual(postgresDefaults, {
    PATH: '/fixture/bin',
    CONEXUS_TEST_DB_HOST: '127.0.0.1',
    CONEXUS_TEST_DB_PORT: '5432',
    CONEXUS_TEST_DB_NAME: 'conexus_test',
    CONEXUS_TEST_DB_USER: 'postgres',
    CONEXUS_TEST_DB_PASSWORD: 's6-ci-test-only',
  })
  const selectedPostgres = {
    CONEXUS_TEST_DB_HOST: 'db.internal',
    CONEXUS_TEST_DB_PORT: '6543',
    CONEXUS_TEST_DB_NAME: 'selected',
    CONEXUS_TEST_DB_USER: 'runner',
    CONEXUS_TEST_DB_PASSWORD: 'opaque',
  }
  assert.deepEqual(executionEnvironment(c020Postgres, selectedPostgres), selectedPostgres)
  const connectorBrowser = CANDIDATE_GRAPH.find(entry => entry.scope === 'connector-integrations-browser')
  assert.equal(connectorBrowser.environmentClass, 'browser-postgres')
  assert.deepEqual(executionEnvironment(connectorBrowser, { PATH: '/fixture/bin' }), postgresDefaults)
  assert.throws(
    () => executionEnvironment(c020Postgres, { CONEXUS_TEST_DB_HOST: 'db.internal' }),
    /requires either all CONEXUS_TEST_DB_\* values or none/,
  )
})

const REPORTER_OPTIONS = `--test-reporter=spec --test-reporter-destination=stdout --test-reporter=${resolve(repositoryRoot, 'scripts/test-ledger-reporter.mjs')} --test-reporter-destination=stdout`

test('every step records its skips into one fresh ledger per run', async () => {
  const ledger = { root: '/work/conexus-os', file: '/tmp/conexus-test-ledger-fixture.jsonl' }
  const staticStep = CANDIDATE_GRAPH.find(entry => entry.environmentClass === 'static')
  const postgresStep = CANDIDATE_GRAPH.find(entry => entry.environmentClass === 'postgres')
  const instrumentation = {
    CONEXUS_TEST_LEDGER_ROOT: '/work/conexus-os',
    CONEXUS_TEST_LEDGER: '/tmp/conexus-test-ledger-fixture.jsonl',
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

  const runLedgers = async () => {
    const seen = []
    await runVerification({
      scopes: ['candidate'],
      packageScripts,
      platform: 'linux',
      processEnvironment: {},
      runCommand: (_entry, { testLedger }) => { seen.push(testLedger); return { status: 0 } },
    })
    return seen
  }
  const first = await runLedgers()
  const second = await runLedgers()
  assert.equal(first.length, CANDIDATE_GRAPH.length)
  assert.equal(new Set(first).size, 1)
  assert.equal(first[0].root, repositoryRoot)
  assert.equal(dirname(first[0].file), tmpdir())
  assert.match(first[0].file, /conexus-test-ledger-[0-9a-f-]{36}\.jsonl$/)
  assert.notEqual(first[0].file, second[0].file)
  assert.equal(existsSync(first[0].file), false)
  assert.equal(newTestLedger('/work/conexus-os').root, '/work/conexus-os')
})

test('the opt-in skip check runs last', async () => {
  assert.deepEqual(CANDIDATE_GRAPH.at(-1), {
    scope: 'only-opt-in-skips',
    command: 'node scripts/check-test-skips.mjs',
    environmentClass: 'static',
    graph: 'candidate',
    after: AFTER_ALL,
  })
})

test('the cheap static checks run before every browser and PostgreSQL suite, and the Hub build stays first', async () => {
  const scopes = CANDIDATE_GRAPH.map(entry => entry.scope)
  assert.equal(scopes[0], 'c020-hub-typecheck')
  const fast = new Set(FAST_CHECK_SCOPES)
  const lastFast = Math.max(...FAST_CHECK_SCOPES.map(scope => scopes.indexOf(scope)))
  assert.equal(lastFast, FAST_CHECK_SCOPES.length - 1, 'the fast checks are one prefix of the graph')
  const environments = CANDIDATE_GRAPH.slice(0, FAST_CHECK_SCOPES.length).map(entry => entry.environmentClass)
  assert.deepEqual([...new Set(environments)], ['static'])
  const slowStart = CANDIDATE_GRAPH.findIndex(entry => !fast.has(entry.scope))
  assert.equal(CANDIDATE_GRAPH.slice(slowStart).some(entry => fast.has(entry.scope)), false)
  for (const scope of ['biome', 'knip', 'c020-web-typecheck', 'repository-check', 'repository-agent-context', 'contract-projection-check-iam', 'test-census']) {
    assert.ok(scopes.indexOf(scope) < scopes.indexOf('hub-baseline'), `${scope} runs before the first PostgreSQL suite`)
    assert.ok(scopes.indexOf(scope) < scopes.indexOf('c020-browser'), `${scope} runs before the first browser suite`)
  }
})

test('failFastOrder moves the named scopes up in graph order and keeps every step', async () => {
  const steps = ['a', 'b', 'c', 'd', 'e'].map(scope => ({ scope }))
  assert.deepEqual(failFastOrder(steps, ['d', 'b']).map(step => step.scope), ['b', 'd', 'a', 'c', 'e'])
  assert.deepEqual(failFastOrder(steps, []).map(step => step.scope), ['a', 'b', 'c', 'd', 'e'])
})

test('the docs graph is the docs checks, in graph order, and still ends with the skip check', async () => {
  assert.deepEqual(DOCS_GRAPH.map(entry => entry.scope), [
    'repository-check', 'repository-agent-context', 'repository-contract-checks', 'conexus-preflight',
    'wire-openapi-bundle', 'wire-bijection', 'wire-bijection-gate', 'test-census', 'only-opt-in-skips',
  ])
  assert.equal(DOCS_GRAPH.length, DOCS_CHECK_SCOPES.length)
  assert.equal(DOCS_GRAPH.every(entry => entry.environmentClass === 'static'), true)
  const result = await runVerification({ processEnvironment: {}, scopes: ['candidate-docs'], packageScripts, dryRun: true })
  assert.deepEqual(result.records.map(record => record.scope), DOCS_GRAPH.map(entry => entry.scope))
})

test('step summary is a markdown table sorted slowest first with each share of the total', async () => {
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

test('the CI helper tests run in the graph, so the census and the checks see them', async () => {
  const agentContext = CANDIDATE_GRAPH.find(entry => entry.scope === 'repository-agent-context')
  for (const file of ['tests/repository/ci-change-scope.test.mjs', 'tests/repository/ci-install.test.mjs']) {
    assert.equal(agentContext.command.split(' ').includes(file), true, file)
  }
})

const sleep = (ms) => new Promise(resolveSleep => setTimeout(resolveSleep, ms))
const step = (scope, extra = {}) => ({ scope, command: scope, environmentClass: 'static', graph: 'candidate', ...extra })

// A runner that records which steps overlap, so a test reads the schedule instead of the clock.
const scheduleOf = async (steps, { concurrency, fail = null } = {}) => {
  const active = new Set()
  const overlaps = []
  const order = []
  let peak = 0
  const result = await runVerification({
    processEnvironment: {},
    scopes: ['candidate'],
    packageScripts,
    platform: 'linux',
    concurrency,
    graphOverride: steps,
    runCommand: async (entry) => {
      for (const other of active) overlaps.push([other, entry.scope])
      active.add(entry.scope)
      order.push(`start ${entry.scope}`)
      peak = Math.max(peak, active.size)
      await sleep(entry.scope === fail ? 5 : 20)
      active.delete(entry.scope)
      order.push(`end ${entry.scope}`)
      return { status: entry.scope === fail ? 3 : 0 }
    },
  })
  return { result, overlaps, order, peak }
}

test('independent steps overlap up to the concurrency limit and no further', async () => {
  const { peak, result } = await scheduleOf([step('a'), step('b'), step('c'), step('d'), step('e')], { concurrency: 3 })
  assert.equal(peak, 3)
  assert.equal(result.exitCode, 0)
  assert.deepEqual(result.records.map(record => record.scope), ['a', 'b', 'c', 'd', 'e'])
})

test('steps that hold the same lock never overlap, and a blocked step does not hold back the ones behind it', async () => {
  const { overlaps, order } = await scheduleOf([
    step('x1', { locks: ['shared'] }),
    step('x2', { locks: ['shared'] }),
    step('free'),
  ], { concurrency: 3 })
  assert.deepEqual(overlaps.filter(pair => pair.includes('x1') && pair.includes('x2')), [])
  assert.ok(order.indexOf('start free') < order.indexOf('end x1'), 'the free step started while x1 held the lock')
  assert.ok(order.indexOf('start x2') > order.indexOf('end x1'))
})

test('every step that needs PostgreSQL holds the one cluster lock, and no other step does', () => {
  for (const entry of CANDIDATE_GRAPH) {
    const needsPostgres = entry.environmentClass === 'postgres' || entry.environmentClass === 'browser-postgres'
    assert.equal(locksOf(entry).includes(HUB_CLUSTER_LOCK), needsPostgres, entry.scope)
  }
})

test('browser steps share a load budget of two, and no other step spends it', async () => {
  for (const entry of CANDIDATE_GRAPH) {
    const browser = entry.environmentClass === 'browser' || entry.environmentClass === 'browser-postgres'
    assert.equal(locksOf(entry).includes(BROWSER_LOAD), browser, entry.scope)
  }
  const { peak } = await scheduleOf(['a', 'b', 'c', 'd', 'e'].map(scope => step(scope, { locks: [BROWSER_LOAD] })), { concurrency: 4 })
  assert.equal(peak, 2)
})

test('a step runs after what it reads, and the Hub build publisher runs before everything', async () => {
  const { order } = await scheduleOf([
    step('build', { publishes: { X: 'y' } }),
    step('bundle'),
    step('reader', { after: ['bundle'] }),
    step('other'),
  ], { concurrency: 4 })
  assert.deepEqual(order.slice(0, 2), ['start build', 'end build'])
  assert.ok(order.indexOf('start reader') > order.indexOf('end bundle'))
})

test('a step after all runs alone at the end', async () => {
  const { order } = await scheduleOf([step('a'), step('b'), step('last', { after: AFTER_ALL })], { concurrency: 4 })
  assert.deepEqual(order.slice(-2), ['start last', 'end last'])
})

test('the first failure starts nothing new, cancels the running steps and reports its own exit code', async () => {
  const { result, order } = await scheduleOf([step('slow1'), step('boom'), step('slow2'), step('never')], { concurrency: 3, fail: 'boom' })
  assert.equal(result.exitCode, 3)
  assert.equal(result.stopped, true)
  assert.equal(order.includes('start never'), false)
  assert.deepEqual(result.records.map(record => [record.scope, record.status]), [['slow1', 'succeeded'], ['boom', 'failed'], ['slow2', 'succeeded']])
})

test('concurrency comes from the CPU count unless the environment says otherwise', () => {
  assert.equal(verificationConcurrency({}, 4), 4)
  assert.equal(verificationConcurrency({ CONEXUS_VERIFY_CONCURRENCY: '1' }, 4), 1)
  assert.equal(verificationConcurrency({ CONEXUS_VERIFY_CONCURRENCY: 'many' }, 4), 4)
})

test('the wire checks that read the OpenAPI bundle run after the step that writes it', () => {
  const readers = ['wire-bijection', 'wire-bijection-gate', 'wire-carriers', 'wire-identity-workspace', 'wire-project', 'wire-builder', 'wire-connector', 'wire-technical-ingress']
  for (const scope of readers) assert.deepEqual(CANDIDATE_GRAPH.find(entry => entry.scope === scope).after, ['wire-openapi-bundle'], scope)
})

test('the step summary reports wall time beside the added-up step time', () => {
  const summary = renderStepSummary([
    { scope: 'a', status: 'succeeded', durationMs: 6000 },
    { scope: 'b', status: 'succeeded', durationMs: 6000 },
  ], 7000)
  assert.match(summary, /2 steps, 7\.0 s wall time, 12\.0 s of step time added up \(1\.7x\), slowest first\./)
})
