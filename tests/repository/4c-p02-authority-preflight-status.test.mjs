import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(new URL('../../', import.meta.url).pathname)
const path = p => resolve(root, p)
const read = p => readFileSync(path(p), 'utf8')

test('P-02 preserves approved F16-F19 authority, records F16-F18 GREEN and stops at F19 RED before P7/P8', () => {
  const preflightPath = 'docs/evidence/4c/p02-authority-feasibility-preflight.md'
  const selectedPath = 'docs/evidence/4c/p02-f16-f19-selected-correction-contract.md'
  const planPath = 'docs/evidence/4c/p02-f16-f19-recompile-plan.md'
  for (const p of [preflightPath, selectedPath, planPath]) assert.equal(existsSync(path(p)), true, `required P-02 authority artifact missing: ${p}`)

  const selected = read(selectedPath)
  const roadmap = read('docs/roadmap.md')
  for (const token of [
    'F16 = OPERATOR SELECTED',
    'F17 = OPERATOR SELECTED / NARROWED',
    'F18 = OPERATOR SELECTED / NARROWED',
    'F19 = OPERATOR SELECTED / ONE READ',
    'N_platform 116 → 117',
    'wire 116↔116 → 117↔117',
  ]) assert.ok(selected.includes(token), `selected P-02 correction contract missing: ${token}`)

  assert.ok(roadmap.includes('F16–F18 GREEN = Verify #885/#888/#892 SUCCESS'), 'roadmap must preserve exact hardened F16-F18 GREEN proofs')
  assert.ok(roadmap.includes('P-02 = OPEN / F16-F18 GREEN / F19 RED NEXT / P7+P8 BLOCKED'), 'roadmap must expose F19 as the next selected RED')
  assert.ok(roadmap.includes('Run F19 selected RED.'), 'roadmap must route exact next action to F19 RED')
  assert.ok(roadmap.includes('116↔116'), 'roadmap must preserve current wire census before F19')

  assert.doesNotMatch(roadmap, /N_platform=117|117↔117|P-02\s*=\s*LOCKED|P-03\s*=\s*OPEN|P11\s*=\s*ASSEMBLED|4D\s*=\s*OPEN/, 'F19 opening must not pretend 117 closure or advance later gates')
})
