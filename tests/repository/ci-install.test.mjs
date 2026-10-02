import assert from 'node:assert/strict'
import test from 'node:test'
import { installWithRetry, isNetworkError } from '../../scripts/ci-install.mjs'

const outcomes = results => {
  const waits = []
  const messages = []
  let calls = 0
  const status = installWithRetry({
    run: () => results[Math.min(calls++, results.length - 1)],
    sleep: ms => waits.push(ms),
    backoffMs: 100,
    log: message => messages.push(message),
  })
  return { status, calls, waits, messages }
}

test('npm network errors are recognised by code', () => {
  for (const code of ['ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN']) {
    assert.equal(isNetworkError(`npm error code ${code}\nnpm error network request failed`), true, code)
  }
  assert.equal(isNetworkError('npm error code EUSAGE\nnpm ci can only install with an existing package-lock.json'), false)
})

test('a network failure is retried with a growing backoff and then succeeds', () => {
  const { status, calls, waits, messages } = outcomes([
    { status: 1, output: 'npm error code ECONNRESET' },
    { status: 1, output: 'npm error code EAI_AGAIN' },
    { status: 0, output: '' },
  ])
  assert.deepEqual({ status, calls, waits }, { status: 0, calls: 3, waits: [100, 200] })
  assert.equal(messages.length, 2)
})

test('a network failure that keeps failing stops after three attempts with its own status', () => {
  const { status, calls } = outcomes([{ status: 1, output: 'npm error code ETIMEDOUT' }])
  assert.deepEqual({ status, calls }, { status: 1, calls: 3 })
})

test('a failure that is not a network error is never retried', () => {
  const { status, calls, waits } = outcomes([{ status: 1, output: 'npm error code EUSAGE' }, { status: 0, output: '' }])
  assert.deepEqual({ status, calls, waits }, { status: 1, calls: 1, waits: [] })
})

test('a first-try success runs once without waiting', () => {
  const { status, calls, waits } = outcomes([{ status: 0, output: '' }])
  assert.deepEqual({ status, calls, waits }, { status: 0, calls: 1, waits: [] })
})
