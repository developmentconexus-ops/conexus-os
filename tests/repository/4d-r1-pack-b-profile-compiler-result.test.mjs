import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = fileURLToPath(new URL('../../', import.meta.url))
const read = path => readFileSync(resolve(root, path), 'utf8')

test('Pack B proves strict admission, RFC8785 and bounded compiler mechanics without Product authority', () => {
  const result = read('docs/evidence/4d/4d-r1-pack-b-profile-compiler-result.md')
  const roadmap = read('docs/roadmap.md')
  const observed = JSON.parse(read('qualification/4d/r1-foundation/evidence/pack-b-observed.json'))
  const results = JSON.parse(read('qualification/4d/r1-foundation/evidence/pack-b-results.json'))
  const negatives = JSON.parse(read('qualification/4d/r1-foundation/evidence/pack-b-negative-controls.json'))
  const cleanup = JSON.parse(read('qualification/4d/r1-foundation/evidence/pack-b-cleanup.json'))
  const compiler = read('qualification/4d/r1-foundation/profile-compiler/compiler.mjs')
  const admission = read('qualification/4d/r1-foundation/profile-compiler/admission.mjs')

  for (const token of [
    'CLOSED / PACK B PASS / `R1F-P03/P04` GREEN',
    'APP-OWNED', 'PROTECTED_DRIFT', 'PLAN_DIGEST_MISMATCH',
    'production compiler', '`RF01-P01..P14`',
  ]) assert.ok(result.includes(token), `Pack B result missing ${token}`)

  assert.equal(results.results.find(row => row.id === 'R1F-P03').verdict, 'PASS')
  assert.equal(results.results.find(row => row.id === 'R1F-P04').verdict, 'PASS')
  assert.equal(results.packVerdict, 'PASS')
  assert.equal(negatives.controls.length, 20)
  assert.equal(negatives.controls.every(control => control.verdict === 'PASS'), true)
  assert.equal(cleanup.verdict, 'PASS')
  for (const key of ['profileDigest', 'inputDigest', 'manifestDigest', 'treeDigest', 'planDigest', 'receiptDigest']) {
    assert.match(observed[key], /^[a-f0-9]{64}$/)
  }

  for (const token of ['PLAN_DIGEST_MISMATCH', 'GENERATION_LOCKED', 'STALE_PLAN', 'INJECTED_FAILURE', 'SEED_ONCE_PRESERVE']) {
    assert.ok(compiler.includes(token), `compiler harness missing ${token}`)
  }
  for (const token of ['INVALID_UTF8', 'BOM_FORBIDDEN', 'DUPLICATE_KEY', 'LONE_SURROGATE', 'UNSAFE_INTEGER', 'FLOAT_FORBIDDEN']) {
    assert.ok(admission.includes(token), `admission harness missing ${token}`)
  }

  assert.match(roadmap, /R1F-A01\+R1F-E01 CORRECTED \/ P01\.\.P12 EVIDENCE OPERATOR APPROVED \/ 4D-D\(R1\) FOUNDATION CLAIMS PRESERVED/)
  assert.match(result, /Product implementation, push, PR and merge\s+remain unauthorized\./)
  assert.match(roadmap, /Product implementation = R1 INTEGRATED \/ R2 INTEGRATED \/ RB NEXT PLANNED BUT NOT OPEN \/ R3\+ BLOCKED/)
})
