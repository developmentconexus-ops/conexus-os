import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = fileURLToPath(new URL('../../', import.meta.url))
const read = path => readFileSync(resolve(root, path), 'utf8')

test('operator-approved 4D-D(R1) binds independent conformance claims without authorizing implementation', () => {
  const contract = read('docs/evidence/4d/4d-06-r1-foundation-conformance-version-escape-evaluation-contract.md')
  const pinManifest = JSON.parse(read('docs/evidence/4d/4d-r1-foundation-pin-manifest.json'))

  for (const token of [
    'CLOSED / OPERATOR APPROVED / 2026-08-30',
    '4D-D(R1) ONLY',
    'ADOPT CLAIM-MANIFEST CONFORMANCE / ADAPT APPROVED R1 GATES / DEFER UNREACHABLE EVALUATION EXECUTION',
    'PASS | FAIL | NOT_PROVEN | INCONCLUSIVE',
    '11 PASS + 1\nFAIL',
    'zero active escapes',
    'R1 Builder/Worker execution = NOT REACHABLE',
    'APPROVE 4D-D(R1)',
    'Product implementation authority = 0',
  ]) assert.ok(contract.includes(token), `4D-D(R1) contract missing ${token}`)

  const operationIds = [
    'IAM-01', 'IAM-02', 'IAM-03',
    'WS-01', 'WS-02',
    'PRJ-01', 'PRJ-02', 'PRJ-03', 'PRJ-07', 'PRJ-08', 'PRJ-09', 'PRJ-23', 'PRJ-24',
  ]
  for (const id of operationIds) assert.ok(contract.includes(id), `R1 operation missing ${id}`)
  assert.equal(operationIds.length, 13)

  const claimRows = contract.match(/^\| `R1C-\d{2} [A-Z_]+` \|/gm) ?? []
  assert.equal(claimRows.length, 14)
  assert.match(contract, /R1C-13 PROJECT_COGNITION/)
  assert.match(contract, /R1C-14 GIT_SOURCE_CUSTODY/)
  assert.match(contract, /SCF-01\.\.06.*SCF-09.*SCF-11/)
  assert.match(contract, /CON-02\.\.04.*do not instantiate/)
  assert.match(contract, /P01–P12 probes prove that the selected mechanisms can fire/)
  assert.match(contract, /one aggregate compliance score \| `REJECT`/)
  assert.match(contract, /framework-owned conformance plugin\/API \| `REJECT`/)

  assert.equal(pinManifest.status, 'P01_P12_GREEN_OPERATOR_APPROVED')
})
