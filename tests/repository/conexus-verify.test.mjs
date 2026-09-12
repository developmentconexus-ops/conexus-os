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
  'a0-type-safety', 'g0-profile-compiler',
  'r1-s2-generate',
  'r1-s2-http', 'r1-s2-reads', 'import-law',
  'verification-tool-regressions', 'hub-migration-selection', 'r1-s2-live-syntax', 'biome-union',
  'rb-first-postgres-migration-selection', 'hub-migration-postgres', 'r2-p1-postgres',
  'r2-p2-postgres', 'r2-p3-postgres', 'r1-s4-p2-postgres', 'r2-p0-check',
  'r2-p1-check', 'r2-p2-check', 'r2-p3-check', 'r2-p4-check',
  'r2-p4-authority-postgres', 'r2-p5-check', 'r2-p6-brain-revision',
  'r2-p6-brain-revision-postgres', 'r2-p6-web-api', 'r2-p6-ui-surfaces',
  'r2-p6-browser', 'r2-p6-composed-postgres', 'r1-s6-contract-generation', 'r1-s3-git-identity',
  'r1-s6-project-inception', 'r1-s6-project-refinement',
  'r1-s6-baseline-explanation', 'r1-s6-p0-postgres', 'r1-s6-p1-postgres',
  'r1-s6-browser-baseline', 'r1-s6-browser-inception',
  'r1-s6-browser-refinement', 'r1-s6-composed',
  'rb-e2b-template', 'rb-first-source-checks', 'bld-10-preview-projection', 'rb-first-hub-typecheck',
  'rb-first-web-typecheck', 'web-build', 'repository-check', 'repository-hygiene', 'repository-doc-index',
  'repository-architecture', 'wire-openapi-lint', 'wire-openapi-bundle',
  'wire-schema', 'wire-bijection', 'wire-carriers', 'wire-identity-workspace',
  'wire-project', 'wire-builder', 'wire-brain', 'wire-connections',
  'wire-release', 'wire-par', 'wire-gateway', 'wire-mar', 'wire-observability',
  'wire-technical-lint', 'wire-technical-ingress', 'wire-projections',
  'wire-budget', 'wire-whole-4b',
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
  assert.equal(commands.filter(command => command === 'npm run r1:s2:hub:typecheck').length, 1)
  assert.equal(commands.filter(command => command === 'npm run r1:a0:web:typecheck').length, 1)
  assert.equal(commands.filter(command => command === 'npm run r1:s2:import-law').length, 1)
  assert.equal(commands.filter(command => command === 'npm run r2:p4:authority').length, 1,
    'R2-P4 static selection and PostgreSQL authority remain distinct')
  assert.equal(commands.filter(command => command === 'npm run rb:first:postgres').length, 1)
  assert.equal(commands.filter(command => command.includes('node --test --test-concurrency=1 tests/implementation/rb-builder-e2b-template.test.mjs') && command.includes('tests/implementation/rb-builder-first-vertical.test.mjs')).length, 1,
    'RB migration selection and the unpatterned Builder suite remain distinct')
  assert.equal(commands.filter(command => command.includes('node --check scripts/run-hub-migrations.mjs')).length, 1)
  assert.equal(commands.filter(command => command.includes('node scripts/generate-r2-contracts.mjs --check')).length, 1)
  assert.equal(commands.filter(command => command.includes('node scripts/rb-builder-e2b-template.mjs --check')).length, 1)
  assert.equal(commands.filter(command => command.startsWith('npx --no-install biome check')).length, 1)
  assert.equal(commands.filter(command => command.startsWith('node node_modules/vite/bin/vite.js build --config apps/web/vite.config.mjs apps/web')).length, 1)
  assert.equal(commands.filter(command => command === 'npm run repository:check').length, 1)
  assert.equal(commands.filter(command => command === 'npm run repository:check:extended').length, 0)
  assert.equal(commands.some(command => /node scripts\/generate-[^ ]+\.mjs/.test(command) && !command.includes('--check')), false)
  assert.equal(commands.includes('npm run r1:s2:generate'), false)
  assert.equal(commands.filter(command => command === 'npm run r1:s2:check').length, 1)
  assert.equal(commands.filter(command => command === 'node scripts/generate-r1-s3-git-identity.mjs --check').length, 1)
  assert.equal(scopes.some(scope => ['4f-project-cognition-admission', 'r1c14-native', 'r1-rc01-walkthrough', 'r1-rc01-custody'].includes(scope)), false)
  const builderCommand = CANDIDATE_GRAPH.find(entry => entry.scope === 'rb-first-source-checks').command
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

test('candidate graph labels execution environments and passes shell argv correctly', () => {
  const classes = new Set(CANDIDATE_GRAPH.map(entry => entry.environmentClass))
  assert.deepEqual([...classes].sort(), ['browser', 'postgres', 'static'])

  const p4Check = CANDIDATE_GRAPH.find(entry => entry.scope === 'r2-p4-check')
  const p4Authority = CANDIDATE_GRAPH.find(entry => entry.scope === 'r2-p4-authority-postgres')
  assert.equal(p4Check.environmentClass, 'static')
  assert.equal(p4Authority.environmentClass, 'postgres')
  assert.equal(p4Authority.command, 'npm run r2:p4:authority')
  assert.equal(CANDIDATE_GRAPH.find(entry => entry.scope === 'r2-p6-composed-postgres').command.includes('CONEXUS_R2_P4_GIT_LIVE'), false)

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

  const postgresDefaults = executionEnvironment(p4Authority, { PATH: '/fixture/bin' })
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
  assert.deepEqual(executionEnvironment(p4Authority, selectedPostgres), selectedPostgres)
  assert.throws(
    () => executionEnvironment(p4Authority, { CONEXUS_TEST_DB_HOST: 'db.internal' }),
    /requires either all CONEXUS_TEST_DB_\* values or none/,
  )
})
