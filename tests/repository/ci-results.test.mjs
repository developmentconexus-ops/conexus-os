import assert from 'node:assert/strict'
import test from 'node:test'
import { requiredFailures } from '../../scripts/check-ci-results.mjs'

const all = () => ({ checks: { result: 'success', outputs: { docs_only: 'false', full_live: 'true', backup: 'true', template: 'true', style: 'true' } }, group: { result: 'success' }, integration: { result: 'success' }, backup: { result: 'success' } })

test('full qualification requires every expected job, and rejects cancellation, failure and absence', () => {
  assert.deepEqual(requiredFailures(all()), [])
  for (const job of ['checks', 'group', 'integration', 'backup']) {
    for (const result of ['cancelled', 'failure', 'skipped', undefined]) {
      const needs = all()
      needs[job] = { ...needs[job], result }
      assert.deepEqual(requiredFailures(needs), [`${job}: ${result ?? 'missing'}`])
    }
  }
})

test('isolated PRs may omit qualification, but missing scope never grants an omission', () => {
  const needs = all()
  needs.checks.outputs.full_live = 'false'
  needs.checks.outputs.backup = 'false'
  delete needs.integration
  delete needs.backup
  assert.deepEqual(requiredFailures(needs), [])
  delete needs.checks.outputs.full_live
  assert.deepEqual(requiredFailures(needs), ['missing or invalid change classification'])
  assert.deepEqual(requiredFailures({}), ['missing or invalid change classification'])
})

test('docs-only still requires a successful checks job', () => {
  const needs = all()
  needs.checks.outputs.docs_only = 'true'
  delete needs.group
  delete needs.integration
  delete needs.backup
  assert.deepEqual(requiredFailures(needs), [])
  needs.checks.result = 'cancelled'
  assert.deepEqual(requiredFailures(needs), ['checks: cancelled'])
})
