import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(new URL('../../', import.meta.url).pathname)
const path = p => resolve(root, p)
const read = p => readFileSync(path(p), 'utf8')

test('P-02 preserves preflight/spec evidence and opens only the approved F16-F19 recompile before P7/P8', () => {
  const preflightPath = 'docs/evidence/4c/p02-authority-feasibility-preflight.md'
  const selectedPath = 'docs/evidence/4c/p02-f16-f19-selected-correction-contract.md'
  const planPath = 'docs/evidence/4c/p02-f16-f19-recompile-plan.md'
  assert.equal(existsSync(path(preflightPath)), true, 'P-02 authority-feasibility preflight Evidence must remain present')
  assert.equal(existsSync(path(selectedPath)), true, 'operator-selected P-02 F16-F19 written contract must exist')
  assert.equal(existsSync(path(planPath)), true, 'operator-approved P-02 bounded recompile plan must exist')

  const preflight = read(preflightPath)
  const selected = read(selectedPath)
  const plan = read(planPath)
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
  ]) assert.ok(preflight.includes(token), `P-02 preflight Evidence missing: ${token}`)

  for (const token of [
    'F16 = OPERATOR SELECTED',
    'F17 = OPERATOR SELECTED / NARROWED',
    'F18 = OPERATOR SELECTED / NARROWED',
    'F19 = OPERATOR SELECTED / ONE READ',
    'BRN-13 GetProjectAnalyticQueryCatalog',
    'N_platform 116 → 117',
    'wire 116↔116 → 117↔117',
    'ordinary Permissions 25 → 25',
    'P7 = BLOCKED',
    'P8 = BLOCKED',
  ]) assert.ok(selected.includes(token), `selected P-02 correction contract missing: ${token}`)

  for (const token of [
    'Goal:',
    'Task 1: Open the selected recompile and prove F16 RED→GREEN',
    'Task 2: Prove F17 Project binding disclosure RED→GREEN',
    'Task 3: Prove F18 Brain binding selection disclosure RED→GREEN',
    'Task 4: Add BRN-13 and prove F19 + `117↔117` census RED→GREEN',
  ]) assert.ok(plan.includes(token), `P-02 recompile plan missing: ${token}`)

  assert.ok(roadmap.includes('P-02 = OPEN / F16-F19 APPROVED / RECOMPILE ACTIVE / P7+P8 BLOCKED'), 'roadmap must expose approved bounded recompile state')
  assert.ok(roadmap.includes('[P-02 selected correction contract](evidence/4c/p02-f16-f19-selected-correction-contract.md)'), 'roadmap must retain the selected correction authority route')
  assert.ok(roadmap.includes('Run F16 selected RED.'), 'roadmap must route the exact next action to F16 RED')
  assert.ok(roadmap.includes('116↔116'), 'roadmap must preserve current wire census until recompile is proven GREEN')

  assert.doesNotMatch(roadmap, /N_platform=117|117↔117|P-02\s*=\s*LOCKED|P-03\s*=\s*OPEN|P11\s*=\s*ASSEMBLED|4D\s*=\s*OPEN/, 'recompile opening must not pretend 117 closure or advance later gates')
})
