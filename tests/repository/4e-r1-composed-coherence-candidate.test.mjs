import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = fileURLToPath(new URL('../../', import.meta.url))
const read = path => readFileSync(resolve(root, path), 'utf8')

test('4E R1 composes a usable Account-to-approved-Baseline Product slice without later-tranche leakage', () => {
  const candidate = read('docs/evidence/4e/4e-r1-composed-coherence-candidate.md')
  const roadmap = read('docs/roadmap.md')
  const index = read('docs/index.md')

  for (const token of [
    'CLOSED / OPERATOR APPROVED / INDEPENDENT CONVERGENCE CLEAR',
    'R1 / 13 OPERATIONS / ACCOUNT → APPROVED PROJECT BASELINE',
    'All `13/13` R1 operations have one necessary consumer',
    'First-use success',
    'Normal return and refinement',
    'Honest failure/recovery',
    'operation coverage = 13/13',
    'later-tranche leakage = 0',
    'This is `DEFER SAFELY`, with a concrete trigger',
    'APPROVE 4E(R1) COMPOSED COHERENCE',
    'Implementation authority:** `0`',
  ]) assert.ok(candidate.includes(token), `4E R1 candidate missing ${token}`)

  for (const id of ['IAM-01', 'IAM-02', 'IAM-03', 'WS-01', 'WS-02', 'PRJ-01', 'PRJ-02', 'PRJ-03', 'PRJ-07', 'PRJ-08', 'PRJ-09', 'PRJ-23', 'PRJ-24']) {
    assert.match(candidate, new RegExp(`\\b${id}\\b`), `4E R1 candidate missing ${id}`)
  }
  assert.match(candidate, /Keycloak authenticates; Conexus authorizes/)
  assert.match(candidate, /ProjectMastra proposes\/explains; Project creates\/approves truth/)
  assert.match(candidate, /R1C-13 cognition \+ R1C-14 Git custody/)
  assert.match(candidate, /sole configured bootstrap identity derives F1 `platform_operator`/)
  assert.match(candidate, /Safe exact repin\/response-boundary proof is due\s+before the first root dependency or real provider call/)
  assert.match(index, /Operator-approved 4E\(R1\) composed Product coherence/)
  assert.match(roadmap, /4E — Whole-System Coherence & Golden Flows \| CLOSED\(R1\) \/ OPERATOR APPROVED/)
  assert.match(roadmap, /Product implementation.*BLOCKED/)
})
