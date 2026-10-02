import assert from 'node:assert/strict'
import test from 'node:test'
import { quarantineReason } from '../../scripts/test-skip-reasons.mjs'
import { quarantined } from '../support/quarantine.mjs'

const entries = [
  { test: 'tests/a.test.mjs:flaky', issue: 7, until: '2026-10-10' },
  { test: 'tests/a.test.mjs:old', issue: 8, until: '2026-09-01' },
]

test('a live entry gives the skip reason, on its last day too', () => {
  assert.equal(quarantineReason(entries, 'tests/a.test.mjs', 'flaky', '2026-10-02'), 'opt-in: quarantined, see #7 until 2026-10-10')
  assert.equal(quarantineReason(entries, 'tests/a.test.mjs', 'flaky', '2026-10-10'), 'opt-in: quarantined, see #7 until 2026-10-10')
})

test('a missing or expired entry gives false, so the test runs', () => {
  assert.equal(quarantineReason(entries, 'tests/a.test.mjs', 'other', '2026-10-02'), false)
  assert.equal(quarantineReason(entries, 'tests/a.test.mjs', 'old', '2026-10-02'), false)
  assert.equal(quarantineReason(entries, 'tests/b.test.mjs', 'flaky', '2026-10-02'), false)
})

test('quarantined reads tests/quarantine.json, which ships empty, so every test runs', () => {
  assert.equal(quarantined(import.meta.url, 'a live entry gives the skip reason, on its last day too'), false)
})
