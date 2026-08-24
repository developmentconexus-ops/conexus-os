import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(new URL('../../', import.meta.url).pathname)
const path = p => resolve(root, p)
const read = p => readFileSync(path(p), 'utf8')

test('P-02 preserves approved F16-F19 authority and advances only to structural P7 after the bounded recompile', () => {
  const preflightPath = 'docs/evidence/4c/p02-authority-feasibility-preflight.md'
  const selectedPath = 'docs/evidence/4c/p02-f16-f19-selected-correction-contract.md'
  const planPath = 'docs/evidence/4c/p02-f16-f19-recompile-plan.md'
  const proofPath = 'docs/evidence/4c/p02-f16-f19-recompile-proof.md'
  const surfacePath = 'docs/evidence/4c/p02-project-surface-rebaseline.md'
  for (const p of [preflightPath, selectedPath, planPath, proofPath, surfacePath]) {
    assert.equal(existsSync(path(p)), true, `required P-02 authority artifact missing: ${p}`)
  }

  const selected = read(selectedPath)
  const proof = read(proofPath)
  const roadmap = read('docs/roadmap.md')
  for (const token of [
    'F16 = OPERATOR SELECTED',
    'F17 = OPERATOR SELECTED / NARROWED',
    'F18 = OPERATOR SELECTED / NARROWED',
    'F19 = OPERATOR SELECTED / ONE READ',
    'N_platform 116 → 117',
    'wire 116↔116 → 117↔117',
  ]) assert.ok(selected.includes(token), `selected P-02 correction contract missing: ${token}`)

  for (const token of [
    'Verify #883', 'Verify #885', 'Verify #886', 'Verify #888',
    'Verify #889', 'Verify #892', 'Verify #893', 'Verify #897',
    '117 ↔ 117', 'Brain = 12', 'ordinary Permissions = 25',
  ]) assert.ok(proof.includes(token), `P-02 recompile proof missing: ${token}`)

  assert.ok(roadmap.includes('F16–F18 GREEN = Verify #885/#888/#892 SUCCESS'), 'roadmap must preserve exact hardened F16-F18 GREEN proofs')
  assert.ok(roadmap.includes('F19 whole-wire GREEN = Verify #897 SUCCESS / 117↔117 / Brain=12 / Permissions=25'), 'roadmap must preserve exact F19/whole-wire GREEN proof')
  assert.ok(roadmap.includes('P-02 = OPEN / AUTHORITY CLOSED / P7 NEXT / P8 BLOCKED'), 'roadmap must advance only to P7 after recompile closure')
  assert.ok(roadmap.includes('4A = CLOSED / N_platform=117'), 'roadmap must project the current 117-operation Product census')
  assert.ok(roadmap.includes('4B = CLOSED / 117↔117'), 'roadmap must project current whole-wire closure')

  assert.doesNotMatch(roadmap, /P-02\s*=\s*LOCKED|P8\s*=\s*CANDIDATE|P-03\s*=\s*OPEN|P11\s*=\s*ASSEMBLED|4D\s*=\s*OPEN/, 'P-02 authority closure must not skip P7/P8/operator gates')
})
