import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = fileURLToPath(new URL('../../', import.meta.url))
const read = path => readFileSync(resolve(root, path), 'utf8')
const operationPattern = /(?:IAM|WS|PRJ|BLD|BRN|CON|REL|PAR|GW|MAR|OBS)-\d{2}/g

test('compressed Phase-4 program bounds 128 operations and opens one R1 foundation batch', () => {
  const operationLedger = read('docs/product/operation-ledger.md')
  const map = read('docs/evidence/4d/4d-r1-operation-reachability-map.md')
  const batch = read('docs/evidence/4d/4d-r1-foundation-batch.md')
  const program = read('docs/phases/4-implementation-readiness-program.md')
  const phase = read('docs/phases/4d-project-paved-road-and-runtime-realization.md')
  const roadmap = read('docs/roadmap.md')
  const index = read('docs/index.md')

  const canonicalIds = [...new Set(operationLedger.split(/\r?\n/)
    .filter(line => /^\| `(?:IAM|WS|PRJ|BLD|BRN|CON|REL|PAR|GW|MAR|OBS)-\d{2}` \|/.test(line))
    .flatMap(line => line.match(operationPattern) ?? []))].sort()
  const mappedIds = [...new Set(map.match(operationPattern) ?? [])].sort()
  assert.equal(canonicalIds.length, 128)
  assert.deepEqual(mappedIds, canonicalIds)

  const expectedBuckets = { R1: 13, R2: 20, RB: 18, R5: 5, R6: 7, R7: 4, CURRENT_LATER: 24, NOT_INSTANTIATED: 37 }
  const bucketIds = []
  for (const [bucket, expectedCount] of Object.entries(expectedBuckets)) {
    const match = map.match(new RegExp('### `' + bucket + '` — ' + expectedCount + '\\n\\n```text\\n([\\s\\S]*?)\\n```'))
    assert.ok(match, `reachability map missing exact ${bucket} block`)
    const ids = match[1].match(operationPattern) ?? []
    assert.equal(ids.length, expectedCount, `${bucket} bucket count drift`)
    assert.equal(new Set(ids).size, ids.length, `${bucket} contains duplicate operation`)
    bucketIds.push(...ids)
  }
  assert.equal(bucketIds.length, 128)
  assert.equal(new Set(bucketIds).size, 128, 'operation appears in more than one reachability bucket')
  assert.deepEqual([...bucketIds].sort(), canonicalIds)

  for (const token of [
    '`R1` | 13', '`R2` | 20', '`RB` | 18', '`R3` | 0', '`R4` | 0',
    '`R5` | 5', '`R6` | 7', '`R7` | 4', '`CURRENT_LATER` | 24',
    '`NOT_INSTANTIATED` | 37', '**128**', '67 / 128', '61 / 128',
    'owns no Product meaning',
  ]) assert.ok(map.includes(token), `reachability map missing ${token}`)

  for (const token of [
    'SELECTION CLOSED / INDEPENDENT REVIEW CONVERGED / OPERATOR APPROVED / 2026-08-30',
    'BOUNDED PROGRAM COMPRESSION / OPERATOR RATIFIED',
    'R1F-01', 'R1F-02', 'R1F-03', 'R1F-04', 'R1F-05', 'R1F-06', 'R1F-07',
    'independent outcomes', 'explicit operator R1 execution grant request',
    'No probe, code, dependency installation',
  ]) assert.ok(batch.includes(token), `R1 foundation batch missing ${token}`)

  for (const token of [
    'Tranche-scoped incremental eligibility',
    'implementation eligible only for T',
    'all other tranches remain BLOCKED',
    'Full-composition 4E',
    'operator probe grant',
    'first operational Budget Analyzer',
  ]) assert.ok(program.includes(token), `Phase-4 program missing ${token}`)

  assert.doesNotMatch(phase, /^> \*\*Status:/m)
  assert.match(phase, /Mutable status and exact next action.*owned only by/s)
  assert.match(roadmap, /BOUNDED PROGRAM COMPRESSION OPERATOR RATIFIED/)
  assert.match(roadmap, /OPERATION MAP 128↔128 CANDIDATE \/ R1 FOUNDATION SELECTION CLOSED \+ OPERATOR APPROVED \/ R1 PROBE GRANT OPERATOR APPROVED \/ R1F-A01\+R1F-E01 CORRECTED \/ P01\.\.P12 EVIDENCE OPERATOR APPROVED/)
  assert.match(roadmap, /\| Product implementation \| BLOCKED \| Tranche-scoped law ratified:/)
  assert.match(index, /R1 operation reachability bounding map/)
  assert.match(index, /R1 Foundation Batch/)
})
