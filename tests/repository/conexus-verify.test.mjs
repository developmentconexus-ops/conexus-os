import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import {
  ALLOWED_ALIASES,
  CANDIDATE_GRAPH,
  SCOPE_MANIFEST,
  assertExecutionEnvironment,
  executionEnvironment,
  listScopes,
  newTestLedger,
  parseArguments,
  resolveScope,
  runVerification,
  runNpmScript,
  repositoryRoot,
  STEP_TIMEOUT_MS,
  timedOut,
} from '../../scripts/conexus-verify.mjs'

test('every test file the candidate graph names exists on disk', () => {
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
  'hub-baseline',
  'c020-migration-selection', 'c020-migration-postgres', 'iam-membership-authority', 'iam-application-access', 'iam-installation-administrator', 'installation-settings-routes', 'iam-grant-surface-excision',
  'hub-call-site-privileges',
  'connector-postgres', 'connector-routes',
  'c020-builder-postgres', 'c020-builder-request-text-postgres', 'factory-binding-postgres', 'factory-dependency-tree', 'factory-composition', 'model-accounts-postgres', 'google-ai-pro', 'factory-runtime', 'factory-recovery-postgres', 'factory-routes', 'factory-provisioning',
  'application-data-postgres', 'application-runner-sandbox', 'application-server', 'application-host',
  'foundation-postgres', 'project-summary-activity-postgres', 'project-summary-routes',
  'c020-registry', 'c020-source-runtime', 'c020-failure-vocabulary', 'c020-compiler-runtime',
  'c020-browser', 'settings-browser', 'application-access-browser', 'c020-e2b-template', 'c020-web-typecheck', 'c020-web-build',
  'db-catalog-snapshot', 'db-baseline-file', 'db-role-register', 'db-role-provision-postgres',
  'repository-check', 'repository-import-law', 'repository-agent-context',
  'contract-projection-check-iam', 'contract-projection-check-workspace', 'contract-projection-check-project', 'contract-projection-check-connector',
  'repository-contract-checks', 'biome-current',
  'identity-access-http', 'application-access-http', 'workspace-membership-http', 'workspace-http', 'workspace-reads', 'project-disclosure',
  'project-command-postgres', 'project-browser', 'project-name', 'shell-browser-boundary', 'brand-tokens', 'web-style', 'preview-form-policy',
  'builder-credential-generation', 'builder-first-operational-delivery', 'builder-planning-free-boot',
  'protected-cluster-coverage',
  'wire-openapi-lint', 'wire-openapi-bundle',
  'wire-bijection', 'wire-bijection-gate', 'wire-carriers', 'wire-identity-workspace',
  'wire-project', 'wire-builder', 'wire-connector',
  'wire-technical-lint', 'wire-technical-ingress',
  'only-opt-in-skips',
])

test('manifest exposes only the three bounded aliases and exact npm routing', () => {
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

test('--list is deterministic and includes aliases plus explicit npm scripts', () => {
  const available = listScopes(packageScripts)
  assert.deepEqual(available.aliases.map(alias => alias.scope), ['preflight', 'repository', 'final'])
  assert.deepEqual(available.scripts, ['conexus:preflight', 'r1:history:foundation-pins', 'repository:check', 'test:one', 'test:two', 'verify'])
  assert.deepEqual(available.rejectedScripts, ['r1:g0:generate', 'r1:s1:receipt:record'])
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
  assert.deepEqual(seen.map(([scope]) => scope), ['c020-hub-typecheck', 'hub-baseline', 'c020-migration-selection'])
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

test('candidate graph flattens equivalent leaves while preserving distinct proof selections', () => {
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
  assert.equal(commands.filter(command => command.startsWith('npx --no-install biome check')).length, 1)
  const biomeCurrentCommand = CANDIDATE_GRAPH.find(entry => entry.scope === 'biome-current').command
  assert.equal(biomeCurrentCommand.includes('apps/hub/src'), true)
  assert.equal(biomeCurrentCommand.includes('apps/web/src'), true)
  assert.equal(biomeCurrentCommand.includes(' packages '), true,
    'biome-current must check the whole packages/ root, not a subset of package subpaths')
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

  const result = runVerification({
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

test('candidate graph does not reference the deleted Change-era source-state test', () => {
  assert.equal(CANDIDATE_GRAPH.some(({ command }) => command.includes('builder-working-source-state.test.mjs')), false)
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
    spawn: (file, args, options) => {
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
  assert.deepEqual([...classes].sort(), ['browser', 'postgres', 'static'])

  const c020Browser = CANDIDATE_GRAPH.find(entry => entry.scope === 'c020-browser')
  const c020Postgres = CANDIDATE_GRAPH.find(entry => entry.scope === 'c020-builder-postgres')
  assert.equal(c020Browser.environmentClass, 'browser')
  assert.equal(c020Postgres.environmentClass, 'postgres')

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
  assert.throws(
    () => executionEnvironment(c020Postgres, { CONEXUS_TEST_DB_HOST: 'db.internal' }),
    /requires either all CONEXUS_TEST_DB_\* values or none/,
  )
})

test('CONEXUS_VERIFY_SKIP_BROWSER skips only browser-tagged candidate steps', () => {
  const browserScopes = CANDIDATE_GRAPH.filter(entry => entry.environmentClass === 'browser').map(entry => entry.scope)
  assert.ok(browserScopes.length > 0, 'fixture assumption: the candidate graph still has browser steps')

  const calls = []
  const result = runVerification({
    scopes: ['candidate'],
    packageScripts,
    platform: 'linux',
    processEnvironment: { CONEXUS_VERIFY_SKIP_BROWSER: '1' },
    runCommand: entry => { calls.push(entry.scope); return { status: 0 } },
  })

  assert.deepEqual(calls.filter(scope => browserScopes.includes(scope)), [])
  assert.equal(calls.length, CANDIDATE_GRAPH.length - browserScopes.length)
  const skipped = result.records.filter(record => record.status === 'skipped')
  assert.deepEqual(skipped.map(record => record.scope), browserScopes)
  assert.ok(skipped.every(record => record.exitCode === null && record.reason === 'no web change'))
  assert.equal(result.exitCode, 0)
})

test('without CONEXUS_VERIFY_SKIP_BROWSER, browser-tagged candidate steps run like any other', () => {
  const browserScopes = CANDIDATE_GRAPH.filter(entry => entry.environmentClass === 'browser').map(entry => entry.scope)
  const calls = []
  const result = runVerification({
    scopes: ['candidate'],
    packageScripts,
    platform: 'linux',
    processEnvironment: {},
    runCommand: entry => { calls.push(entry.scope); return { status: 0 } },
  })

  assert.deepEqual(calls.filter(scope => browserScopes.includes(scope)), browserScopes)
  assert.equal(result.records.some(record => record.status === 'skipped'), false)
})

const REPORTER_OPTIONS = `--test-reporter=spec --test-reporter-destination=stdout --test-reporter=${resolve(repositoryRoot, 'scripts/test-ledger-reporter.mjs')} --test-reporter-destination=stdout`

test('every step records its skips into one fresh ledger per run', () => {
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
