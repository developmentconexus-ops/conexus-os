import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(new URL('../../', import.meta.url).pathname)
const path = p => resolve(root, p)
const read = p => readFileSync(path(p), 'utf8')

test('operator-approved F16-F19 retain their bounded 117-operation closure proof through later P-02 progression', () => {
  const proofPath = 'docs/evidence/4c/p02-f16-f19-recompile-proof.md'
  const surfacePath = 'docs/evidence/4c/p02-project-surface-rebaseline.md'
  assert.equal(existsSync(path(proofPath)), true, 'P-02 recompile proof must exist')
  assert.equal(existsSync(path(surfacePath)), true, 'P-02 bounded surface rebaseline must exist')

  const ledger = read('docs/product/operation-ledger.md')
  const rootOas = read('contracts/api/product/openapi.yaml')
  const proof = read(proofPath)
  const surfaces = read(surfacePath)

  for (const token of ['4C-F16', '4C-F17', '4C-F18', '4C-F19', '`BRN-13` | `GetProjectAnalyticQueryCatalog`']) {
    assert.ok(ledger.includes(token), `current Product authority lost accepted P-02 correction: ${token}`)
  }
  assert.ok(rootOas.includes('/api/control/projects/{projectId}/analytic-query-catalog:'), 'canonical Product OAS must retain BRN-13')
  assert.ok(rootOas.includes('brain-paths.yaml#/paths/~1api~1control~1projects~1{projectId}~1analytic-query-catalog'), 'BRN-13 root path must resolve to canonical Brain wire')

  for (const token of ['117 ↔ 117', 'Brain = 12', 'ordinary Permissions = 25', 'semantic owners = unchanged', 'durable record classes = unchanged', 'P7 = NEXT', 'P8 = BLOCKED']) {
    assert.ok(proof.includes(token), `historical whole recompile proof missing: ${token}`)
  }
  for (const token of ['PRJ-S11', 'PRJ-S12', 'PRJ-S14', 'PRJ-S15', 'PRJ-S19', 'P8 = BLOCKED']) {
    assert.ok(surfaces.includes(token), `bounded P-02 surface rebaseline missing: ${token}`)
  }
})
