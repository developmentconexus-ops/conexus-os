import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(new URL('../../', import.meta.url).pathname)
const read = p => readFileSync(resolve(root, p), 'utf8')

test('F19 adds one binding-bound analytic semantic-input catalog without widening AnalyticQuery into SQL or natural-language planning', () => {
  const ledger = read('docs/product/operation-ledger.md')
  const permissions = read('docs/product/permission-contract.md')
  const wire = read('contracts/api/product/brain-paths.yaml')

  for (const token of ['4C-F19', 'BRN-13', 'GetProjectAnalyticQueryCatalog', 'F19 new operations = 1', 'Brain 11 → 12', 'N_platform 116 → 117']) {
    assert.ok(ledger.includes(token), `operation ledger missing F19 token: ${token}`)
  }
  assert.ok(permissions.includes('BRN-13'), 'permission contract must map BRN-13')
  assert.match(wire, /\/api\/control\/projects\/\{projectId\}\/analytic-query-catalog:/, 'BRN-13 must be a Project-context Control Plane read')
  for (const token of ['x-conexus-4a-id: BRN-13', 'summary: GetProjectAnalyticQueryCatalog', 'projectBindingDigest', 'datasetSemanticId', 'selectableSemantics', 'semanticId', 'label']) {
    assert.ok(wire.includes(token), `BRN-13 wire missing ${token}`)
  }
  assert.doesNotMatch(wire, /rawSql|physicalTable|joinTopology|semanticSearch|naturalLanguageQuestion/, 'F19 must not widen the analytic regime')
})
