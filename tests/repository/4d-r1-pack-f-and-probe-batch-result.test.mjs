import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = fileURLToPath(new URL('../../', import.meta.url))
const read = path => readFileSync(resolve(root, path), 'utf8')

test('Pack F closes P11/P12 and whole R1 Foundation Evidence remains implementation-deny-only', () => {
  const pack = read('docs/evidence/4d/4d-r1-pack-f-gates-result.md')
  const batch = read('docs/evidence/4d/4d-r1-foundation-probe-batch-result.md')
  const results = JSON.parse(read('qualification/4d/r1-foundation/evidence/pack-f-results.json'))
  const gates = JSON.parse(read('qualification/4d/r1-foundation/evidence/pack-f-gate-results.json'))
  const optional = JSON.parse(read('qualification/4d/r1-foundation/evidence/pack-f-optional-native.json'))
  const cleanup = JSON.parse(read('qualification/4d/r1-foundation/evidence/pack-f-cleanup.json'))

  for (const token of [
    'CLOSED / PACK F PASS / `R1F-P11/P12` GREEN / P01..P12 ALL GREEN',
    'seven distinct gates each fired RED and then GREEN',
    'native host delta explicit/non-authoritative',
  ]) assert.ok(pack.includes(token), `Pack F result missing ${token}`)

  for (const token of [
    'P01..P12 ALL GREEN / OPERATOR APPROVED / IMPLEMENTATION BLOCKED',
    '`R1F-A01`', '`R1F-E01`', 'enableNonRepudiationChecks',
    'Product implementation = 0', 'R1 tranche execution = 0',
    'APPROVE R1 FOUNDATION PROBE EVIDENCE',
  ]) assert.ok(batch.includes(token), `probe batch result missing ${token}`)

  assert.equal(results.results.find(row => row.id === 'R1F-P11').verdict, 'PASS')
  assert.equal(results.results.find(row => row.id === 'R1F-P12').verdict, 'PASS')
  assert.equal(results.foundationProbeVerdicts, 'P01_THROUGH_P12_PASS')
  assert.equal(gates.redCount, 7)
  assert.equal(gates.greenCount, 7)
  assert.equal(gates.cases.every(value => value.verdict === 'PASS'), true)
  assert.equal(optional.absentOnLinuxX64, 33)
  assert.equal(optional.authority, 'NON_AUTHORITATIVE_DEVELOPER_HOST_DELTA')
  assert.equal(cleanup.verdict, 'PASS')
  assert.equal(cleanup.container, 'ABSENT')

})
