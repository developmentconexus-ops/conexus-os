import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(new URL('../../', import.meta.url).pathname)
const path = p => resolve(root, p)
const read = p => readFileSync(path(p), 'utf8')

test('P-02 opens only to authority preflight and stops before P7/P8 until F16-F19 adjudication', () => {
  const evidencePath = 'docs/evidence/4c/p02-authority-feasibility-preflight.md'
  assert.equal(existsSync(path(evidencePath)), true, 'P-02 authority-feasibility preflight Evidence must exist')

  const evidence = read(evidencePath)
  const roadmap = read('docs/roadmap.md')

  for (const token of [
    'P-02 = OPEN / AUTHORITY PREFLIGHT',
    'F16 — Data human identity',
    'F17 — Integration binding selection disclosure',
    'F18 — Brain binding selection disclosure',
    'F19 — AnalyticQuery semantic input catalog',
    'Capabilities = NO UPSTREAM FINDING CURRENTLY',
    'P7 = BLOCKED',
    'P8 = BLOCKED',
  ]) assert.ok(evidence.includes(token), `P-02 preflight Evidence missing: ${token}`)

  assert.ok(roadmap.includes('P-02 = OPEN / AUTHORITY PREFLIGHT / F16-F19 OPERATOR ADJUDICATION / P7 BLOCKED / P8 BLOCKED'), 'roadmap must expose bounded P-02 preflight state')
  assert.ok(roadmap.includes('[P-02 authority preflight](evidence/4c/p02-authority-feasibility-preflight.md)'), 'roadmap must route to P-02 preflight Evidence')
  assert.ok(roadmap.includes('Operator adjudication of P-02 F16-F19 authority correction pack: APPROVE | REVISE'), 'roadmap must stop at operator adjudication')

  assert.doesNotMatch(roadmap, /P-02\s*=\s*LOCKED|P-03\s*=\s*OPEN|P11\s*=\s*ASSEMBLED|4D\s*=\s*OPEN/, 'P-02 preflight must not advance later gates')
})
