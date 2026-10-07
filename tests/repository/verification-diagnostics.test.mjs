import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { executionEnvironment, newTestLedger, runVerification } from '../../scripts/conexus-verify.mjs'

test('groups consume a supplied build, while a full candidate still compiles it', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'conexus-shared-build-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  writeFileSync(join(root, 'server.js'), '')
  const build = join(root, 'app-check')
  mkdirSync(build)
  writeFileSync(join(build, 'main.mjs'), '')
  const processEnvironment = { CONEXUS_HUB_BUILD: root }
  for (const group of ['browser', 'postgres', 'rest', 'live', 'backup']) {
    const commands = []
    const result = runVerification({
      scopes: ['candidate'], group, processEnvironment,
      runCommand: (entry, options) => {
        commands.push(entry.scope)
        assert.equal(options.processEnvironment.CONEXUS_HUB_BUILD, root)
        return { status: 0 }
      },
    })
    assert.equal(result.exitCode, 0)
    assert.equal(commands.includes('hub-typecheck'), false)
    assert.equal(commands.at(-1), 'only-opt-in-skips')
  }
  const full = runVerification({ scopes: ['candidate'], processEnvironment, dryRun: true })
  assert.equal(full.records[0].scope, 'hub-typecheck')
  const local = runVerification({ scopes: ['candidate'], group: 'browser', processEnvironment: {}, dryRun: true })
  assert.equal(local.records[0].scope, 'hub-typecheck')
  const preparation = runVerification({ scopes: ['candidate-build'], processEnvironment: {}, dryRun: true })
  assert.deepEqual(preparation.records.map(record => record.scope), ['hub-typecheck'])
  rmSync(join(build, 'main.mjs'))
  assert.throws(() => runVerification({ scopes: ['candidate'], group: 'rest', processEnvironment }), /shared Hub build is missing app-check\/main.mjs/)
})

test('a failed assertion is reported while the next test is still running', { timeout: 5000 }, async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'conexus-diagnostics-'))
  const fixture = join(root, 'failure.test.mjs')
  const ledger = newTestLedger(root)
  writeFileSync(fixture, `
    import test from 'node:test'
    test('first failure', async (t) => {
      await t.test('reporter calibration', { skip: 'opt-in: temporary reporter fixture' }, () => {})
      throw new Error('FIRST_ACTIONABLE_ASSERTION')
    })
    test('unfinished test', async () => {
      const timer = setInterval(() => {}, 1000)
      try { await new Promise(() => {}) } finally { clearInterval(timer) }
    })
  `)
  const env = executionEnvironment({ environmentClass: 'static' }, process.env, ledger)
  delete env.NODE_TEST_CONTEXT
  const child = spawn(process.execPath, ['--test', fixture], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  t.after(async () => {
    if (child.exitCode === null) {
      const closed = new Promise(resolve => child.once('close', resolve))
      child.kill('SIGKILL')
      await closed
    }
    rmSync(root, { recursive: true, force: true })
    rmSync(ledger.file, { force: true })
  })
  let output = ''
  await new Promise((resolve, reject) => {
    child.on('error', reject)
    child.once('exit', code => reject(new Error(`test process exited before reporting its assertion: ${code}`)))
    child.stdout.on('data', chunk => {
      output += chunk
      if (/error: '?FIRST_ACTIONABLE_ASSERTION'?/.test(output)) resolve()
    })
  })
  assert.match(output, /not ok 1 - first failure/)
  assert.match(output, /error: '?FIRST_ACTIONABLE_ASSERTION'?/)
  assert.equal(child.exitCode, null, 'the diagnostic does not depend on the suite finishing')
  const records = readFileSync(ledger.file, 'utf8').trim().split('\n').map(line => JSON.parse(line))
  assert.deepEqual(records, [{ file: 'failure.test.mjs', name: 'reporter calibration', skip: 'opt-in: temporary reporter fixture' }])
})
