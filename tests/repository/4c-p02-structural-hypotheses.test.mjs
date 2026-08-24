import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(new URL('../../', import.meta.url).pathname)
const path = p => resolve(root, p)
const read = p => readFileSync(path(p), 'utf8')

test('P-02 preserves its P7 candidate and operator approval history without coupling to mutable P8 revision wording', () => {
  const structuralPath = 'docs/evidence/4c/p02-structural-hypotheses.md'
  const approvalPath = 'docs/evidence/4c/p02-p7-approval-p8-candidate.md'
  const p8Path = 'docs/evidence/4c/p02-project-resources-functional-wireframe.html'
  for (const p of [structuralPath, approvalPath, p8Path]) assert.equal(existsSync(path(p)), true, `P-02 evidence missing: ${p}`)

  const structural = read(structuralPath)
  const approval = read(approvalPath)

  for (const token of [
    'P7 CANDIDATE / OPERATOR REVIEW REQUIRED / P8 BLOCKED / NOT LOCKED',
    'A — Four focused Project routes',
    'PRJ-S11', 'PRJ-S12', 'PRJ-S13', 'PRJ-S14', 'PRJ-S15', 'PRJ-S19',
    'dataResourceId != name',
    'BRN-13 GetProjectAnalyticQueryCatalog',
    'BRN-12 RunAnalyticQuery',
    'connection.use -X-> generic connection.read',
    'brain.bind -X-> generic brain.read',
    'PRESENT-IN-AUTHORITY',
    'B — One Project Resources hub',
    'C — Backend-owner-first resource console',
  ]) assert.ok(structural.includes(token), `P-02 P7 candidate Evidence missing: ${token}`)

  for (const token of [
    'P7 OPERATOR APPROVED',
    'P8 REVISED CANDIDATE',
    'OPERATOR WALKTHROUGH REQUIRED',
    'NOT LOCKED',
    'A — Four focused Project routes',
    'Verify #905 = EXPECTED RED',
    'Verify #907 = SUCCESS',
    'repository tests = 128 / 128',
    'bootstrap_bytes = 20403 / 20480',
    '4A ↔ OAS = 117 ↔ 117',
    'Verify #913 = EXPECTED RED',
  ]) assert.ok(approval.includes(token), `P-02 approval/P8 Evidence missing: ${token}`)

  assert.doesNotMatch(approval, /P-02\s*=\s*LOCKED|P8\s*=\s*LOCKED|P-03\+?\s*=\s*OPEN|P11\s*=\s*ASSEMBLED|4D\s*=\s*OPEN/, 'P7 approval/P8 candidate must not skip later gates')
})
