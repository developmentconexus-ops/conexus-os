import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ALLOWED_ALIASES,
  CANDIDATE_GRAPH,
  SCOPE_MANIFEST,
  assertExecutionEnvironment,
  executionEnvironment,
  listScopes,
  parseArguments,
  resolveScope,
  runVerification,
  runNpmScript,
} from '../../scripts/conexus-verify.mjs'

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
  'c020-migration-selection', 'c020-migration-postgres', 'iam-membership-authority', 'iam-grant-surface-excision',
  'c020-builder-postgres', 'c020-mastra-lifecycle',
  'foundation-postgres', 'c020-registry', 'c020-source-runtime', 'c020-compiler-runtime',
  'c020-browser', 'c020-e2b-template', 'c020-hub-typecheck', 'c020-web-typecheck', 'c020-web-build',
  'db-role-register', 'db-role-provision-postgres',
  'repository-check', 'repository-import-law', 'repository-hygiene', 'repository-doc-index', 'repository-architecture',
  'repository-architecture-unit', 'repository-contract-checks', 'biome-current',
  'identity-access-http', 'workspace-membership-http', 'workspace-http', 'workspace-reads', 'project-disclosure', 'project-source-recovery',
  'project-command-postgres', 'project-browser', 'shell-browser-boundary',
  'builder-credential-generation', 'builder-first-operational-delivery', 'builder-planning-free-boot',
  'claude-account', 'claude-account-web-api', 'protected-cluster-coverage',
  'wire-openapi-lint', 'wire-openapi-bundle',
  'wire-bijection', 'wire-carriers', 'wire-identity-workspace',
  'wire-project', 'wire-builder',
  'wire-technical-lint', 'wire-technical-ingress',
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
  assert.equal(commands.filter(command => command.includes('qualification/4d/mastra-builder-capability')).length, 1)
  assert.equal(commands.filter(command => command.includes('tests/implementation/builder-run-invariants-postgres.test.mjs') && command.includes('tests/implementation/builder-run-execution-postgres.test.mjs')).length, 1)
  assert.equal(commands.filter(command => command === 'node --test --test-concurrency=1 tests/implementation/builder-brain-context.test.mjs').length, 0)
  assert.equal(commands.some(command => command.includes('tests/implementation/rb-builder-first-vertical.test.mjs')), false,
    'historical Builder verifier suite is not a current MVP blocker')
  assert.equal(commands.filter(command => command.includes('node scripts/builder-e2b-template.mjs --check')).length, 1,
    'the existing E2B template check remains part of the current Builder proof')
  assert.equal(commands.filter(command => command.startsWith('npx --no-install biome check')).length, 1)
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

test('candidate graph labels execution environments and passes shell argv correctly', () => {
  const classes = new Set(CANDIDATE_GRAPH.map(entry => entry.environmentClass))
  assert.deepEqual([...classes].sort(), ['browser', 'postgres', 'static'])

  const c020Browser = CANDIDATE_GRAPH.find(entry => entry.scope === 'c020-browser')
  const c020Postgres = CANDIDATE_GRAPH.find(entry => entry.scope === 'c020-builder-postgres')
  assert.equal(c020Browser.environmentClass, 'browser')
  assert.equal(c020Postgres.environmentClass, 'postgres')

  const candidate = CANDIDATE_GRAPH[0]
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
    options: { cwd: '/tmp/conexus-verify-test', windowsHide: true, stdio: 'inherit', env: { PATH: '/fixture/bin' } },
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
