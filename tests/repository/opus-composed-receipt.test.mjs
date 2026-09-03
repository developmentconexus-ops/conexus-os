import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { parseTestSummary } from '../../scripts/record-r1-project-opus-composed-proof-receipt.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const script = readFileSync(resolve(repositoryRoot, 'scripts/record-r1-project-opus-composed-proof-receipt.mjs'), 'utf8')

const passingOutput = `✔ production Project composition completes the S6 browser journey on PostgreSQL 17.10 (39865.755989ms)
ℹ tests 1
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ duration_ms 39865.755989
`

test('Opus composed receipt parser accepts only the exact 1/1 PASS proof', () => {
  assert.deepEqual(parseTestSummary(passingOutput), {
    tests: 1,
    pass: 1,
    fail: 0,
    cancelled: 0,
    skipped: 0,
    durationMs: 39865.755989,
    name: 'production Project composition completes the S6 browser journey on PostgreSQL 17.10',
  })
  assert.throws(() => parseTestSummary(passingOutput.replace('ℹ fail 0', 'ℹ fail 1')), /NOT_EXACT_1_OF_1_PASS/)
  assert.throws(() => parseTestSummary(passingOutput.replace('ℹ tests 1\n', '')), /MISSING_TESTS_SUMMARY/)
})

test('Opus composed receipt producer owns an exact ephemeral local PostgreSQL execution', () => {
  assert.match(script, /postgres:17\.10-bookworm@sha256:9b18b78397054fce88a9552e9d5a3ad5bb7fd258c5b3cc1c5028e46373d6ea8f/)
  assert.match(script, /'--pull=never'/)
  assert.match(script, /'--tmpfs', '\/var\/lib\/postgresql\/data:rw,noexec,nosuid,size=256m'/)
  assert.match(script, /'--publish', '127\.0\.0\.1::5432'/)
  assert.match(script, /if \(test\.status !== 0\) fail/)
  assert.ok(script.indexOf('parseTestSummary(test.stdout)') < script.indexOf('renameSync(temporaryReceipt, receiptPath)'))
})
