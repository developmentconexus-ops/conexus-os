import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { resolve } from 'node:path'

test('a failed assertion is reported while the next test is still running', { timeout: 5000 }, async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'conexus-diagnostics-'))
  const fixture = join(root, 'failure.test.mjs')
  const ledger = { file: join(root, 'ledger.jsonl') }
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
  const reporter = resolve(import.meta.dirname, '../../scripts/test-ledger-reporter.mjs')
  const env = { ...process.env, CONEXUS_TEST_LEDGER: ledger.file, CONEXUS_TEST_LEDGER_ROOT: root, NODE_OPTIONS: `--test-reporter=tap --test-reporter-destination=stdout --test-reporter=${reporter} --test-reporter-destination=stdout` }
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
