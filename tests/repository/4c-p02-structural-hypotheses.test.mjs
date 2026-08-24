import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(new URL('../../', import.meta.url).pathname)
const path = p => resolve(root, p)
const read = p => readFileSync(path(p), 'utf8')

test('P-02 P7 derives four focused Project routes without reopening backend-shaped or generic resource authority', () => {
  const structuralPath = 'docs/evidence/4c/p02-structural-hypotheses.md'
  assert.equal(existsSync(path(structuralPath)), true, 'P-02 P7 structural hypotheses must exist before operator review')

  const structural = read(structuralPath)
  const roadmap = read('docs/roadmap.md')

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
    'P8 = BLOCKED',
  ]) assert.ok(structural.includes(token), `P-02 P7 structural evidence missing: ${token}`)

  assert.ok(roadmap.includes('P-02 = OPEN / AUTHORITY CLOSED / P7 CANDIDATE / OPERATOR REVIEW / P8 BLOCKED'), 'roadmap must route P-02 to operator review after P7 candidate')
  assert.doesNotMatch(roadmap, /P-02\s*=\s*LOCKED|P8\s*=\s*CANDIDATE|P-03\s*=\s*OPEN|P11\s*=\s*ASSEMBLED|4D\s*=\s*OPEN/, 'P7 candidate must not skip P8/operator gates')
})
