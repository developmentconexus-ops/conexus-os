import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(new URL('../../', import.meta.url).pathname)
const path = p => resolve(root, p)
const read = p => readFileSync(path(p), 'utf8')

test('P-01 density falsifier advances only to focused revised P8 operator walkthrough', () => {
  const evidencePath = 'docs/evidence/4c/p01-p8-focused-build-session-revision.md'
  assert.equal(existsSync(path(evidencePath)), true, 'focused P8 revision Evidence must exist')
  const evidence = read(evidencePath)
  const roadmap = read('docs/roadmap.md')

  for (const token of [
    'OPERATOR ACCEPTED / P8 FOCUSED REVISED CANDIDATE / NOT LOCKED',
    'Build Overview != Focused Build Session',
    'Preview + Conexus = default focused work',
    'Plan / Findings / Evidence / Details = on-demand inspector',
    'simple by default + inspectable by design',
    '02a07c7f8fd654a75eb066ee914247f0160a64f8',
    'Verify #829',
    'Verify #831',
  ]) assert.ok(evidence.includes(token), `focused revision Evidence missing: ${token}`)

  assert.ok(roadmap.includes('P-01 = OPEN / F14 GREEN / P7 OPERATOR APPROVED / P8 FOCUSED REVISED CANDIDATE / OPERATOR WALKTHROUGH / NOT LOCKED'), 'roadmap must expose focused revised P8 current state')
  assert.ok(roadmap.includes('P8 focused artifact blob = 02a07c7f8fd654a75eb066ee914247f0160a64f8'), 'roadmap must pin exact focused P8 blob')
  assert.ok(roadmap.includes('P8 focus selected RED = Verify #829 / 110 tests / 109 pass / 1 exact expected failure'), 'roadmap must pin selected focus RED')
  assert.ok(roadmap.includes('P8 focused checkpoint = Verify #831 SUCCESS'), 'roadmap must pin focused GREEN checkpoint')
  assert.ok(roadmap.includes('Operator walkthrough/adjudication of focused P-01 P8 artifact: APPROVE | REVISE'), 'roadmap must stop at focused walkthrough gate')

  assert.doesNotMatch(roadmap, /P-01\s*=\s*LOCKED/, 'focused revision must not lock P-01')
  assert.doesNotMatch(roadmap, /P-02\+?\s*=\s*OPEN|P11\s*=\s*ASSEMBLED|4D\s*=\s*OPEN/, 'focused revision must not advance later blocks')
})
