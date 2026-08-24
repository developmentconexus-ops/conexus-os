import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(new URL('../../', import.meta.url).pathname)
const path = p => resolve(root, p)
const read = p => readFileSync(path(p), 'utf8')

test('P-02 preserves approved F16-F19 authority and closure proof through later block progression', () => {
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
    'Verify #889', 'Verify #892', 'Verify #893', 'Verify #897', 'Verify #900',
    '117 ↔ 117', 'Brain = 12', 'ordinary Permissions = 25',
    'P7 = NEXT', 'P8 = BLOCKED',
  ]) assert.ok(proof.includes(token), `P-02 recompile proof missing: ${token}`)
})
