import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(new URL('../../', import.meta.url).pathname)
const path = p => resolve(root, p)
const read = p => readFileSync(path(p), 'utf8')

test('P-02 preserves preflight evidence and stops at selected F16-F19 written-spec review before recompile/P7/P8', () => {
  const preflightPath = 'docs/evidence/4c/p02-authority-feasibility-preflight.md'
  const selectedPath = 'docs/evidence/4c/p02-f16-f19-selected-correction-contract.md'
  assert.equal(existsSync(path(preflightPath)), true, 'P-02 authority-feasibility preflight Evidence must remain present')
  assert.equal(existsSync(path(selectedPath)), true, 'operator-selected P-02 F16-F19 written contract must exist')

  const preflight = read(preflightPath)
  const selected = read(selectedPath)
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
    'OPERATOR SELECTED / SPEC WRITTEN / 4A+4B RECOMPILE NOT STARTED',
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

  assert.ok(roadmap.includes('P-02 = OPEN / F16-F19 SELECTED / SPEC REVIEW / 4A+4B NOT RECOMPILED / P7+P8 BLOCKED'), 'roadmap must expose selected written-spec review without pretending recompile')
  assert.ok(roadmap.includes('[P-02 selected correction contract](evidence/4c/p02-f16-f19-selected-correction-contract.md)'), 'roadmap must route to selected P-02 correction contract')
  assert.ok(roadmap.includes('Review P-02 F16–F19 written spec: APPROVE | REVISE'), 'roadmap must stop at written-spec review')

  assert.doesNotMatch(roadmap, /N_platform=117|117↔117|P-02\s*=\s*LOCKED|P-03\s*=\s*OPEN|P11\s*=\s*ASSEMBLED|4D\s*=\s*OPEN/, 'written-spec review must not pretend the selected 4A/4B recompile or advance later gates')
})
