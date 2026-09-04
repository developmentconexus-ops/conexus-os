import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ALLOWED_ALIASES,
  SCOPE_MANIFEST,
  assertExecutionEnvironment,
  listScopes,
  parseArguments,
  resolveScope,
  runVerification,
} from '../../scripts/conexus-verify.mjs'

const packageScripts = Object.freeze({
  'conexus:preflight': 'node scripts/conexus-preflight.mjs',
  'repository:check': 'node scripts/check-current-state.mjs',
  verify: 'npm run repository:check',
  'test:one': 'node -e "process.exit(0)"',
  'test:two': 'node -e "process.exit(0)"',
  'r1:g0:generate': 'node scripts/generate-r1-g0.mjs',
  'r1:s1:receipt:record': 'node scripts/record-r1-s1-receipt.mjs',
})

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
  assert.deepEqual(available.scripts, ['conexus:preflight', 'repository:check', 'test:one', 'test:two', 'verify'])
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
