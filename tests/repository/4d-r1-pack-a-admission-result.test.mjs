import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = fileURLToPath(new URL('../../', import.meta.url))
const read = path => readFileSync(resolve(root, path), 'utf8')

test('Pack A preserves the firing falsifier and passes after the bounded R1F-A01 correction', () => {
  const result = read('docs/evidence/4d/4d-r1-pack-a-admission-result.md')
  const evidence = JSON.parse(read('qualification/4d/r1-foundation/evidence/results.json'))
  const supplyChain = JSON.parse(read('qualification/4d/r1-foundation/admission/supply-chain.json'))
  const cleanup = JSON.parse(read('qualification/4d/r1-foundation/evidence/cleanup.json'))
  const rerun = JSON.parse(read('qualification/4d/r1-foundation/evidence/rerun-results.json'))
  const rerunSupplyChain = JSON.parse(read('qualification/4d/r1-foundation/admission/rerun-supply-chain.json'))
  const rerunCleanup = JSON.parse(read('qualification/4d/r1-foundation/evidence/rerun-cleanup.json'))
  const lock = JSON.parse(read('qualification/4d/r1-foundation/package-lock.json'))

  for (const token of [
    'CLOSED / `R1F-A01` CORRECTED / PACK A PASS / P01+P02 GREEN',
    'GHSA-8gh8-hqwg-xf34',
    'Ajv 8.20.0',
    'adds no dependency',
    'historical `npx --yes` commands',
    'No P03–P12 probe ran',
    'APPROVE R1F-A01 MINIMAL CORRECTION',
    'Historical first-run FAIL Evidence remains immutable',
  ]) assert.ok(result.includes(token), `Pack A result missing ${token}`)

  assert.equal(evidence.results.find(row => row.id === 'R1F-P01').verdict, 'PASS')
  assert.equal(evidence.results.find(row => row.id === 'R1F-P02').verdict, 'FAIL')
  assert.equal(evidence.batchVerdict, 'STOP_R1F07_REOPEN_REQUIRED')
  assert.equal(supplyChain.npmAudit.high, 2)
  assert.equal(supplyChain.npmAudit.finding.directPackage, 'ajv-cli@5.0.0')
  assert.equal(cleanup.verdict, 'PASS')
  assert.equal(rerun.results.find(row => row.id === 'R1F-P01').verdict, 'PASS')
  assert.equal(rerun.results.find(row => row.id === 'R1F-P02').verdict, 'PASS')
  assert.equal(rerun.packVerdict, 'PASS')
  assert.equal(rerunSupplyChain.npmAudit.total, 0)
  assert.equal(rerunCleanup.verdict, 'PASS')
  assert.equal(lock.lockfileVersion, 3)
  assert.equal(Object.keys(lock.packages).length - 1, 224)
})
