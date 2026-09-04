import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = fileURLToPath(new URL('../../', import.meta.url))
const read = path => readFileSync(resolve(root, path), 'utf8')

test('independent planning review converges on bounded compression without authorizing execution', () => {
  const brief = read('docs/evidence/4d/4d-planning-acceleration-independent-review-brief.md')
  const proposal = read('docs/evidence/4d/4d-planning-acceleration-convergence-proposal.md')
  const adjudication = read('docs/evidence/4d/4d-planning-acceleration-independent-review-adjudication.md')
  const selection = read('docs/evidence/4d/4d-05-rf01-profile-compiler-selection.md')
  const phase = read('docs/phases/4d-project-paved-road-and-runtime-realization.md')
  const roadmap = read('docs/roadmap.md')
  const index = read('docs/index.md')

  for (const token of [
    'Planning Acceleration and Executability Independent Review Brief',
    'MUST CLOSE BEFORE FIRST CODE',
    'MUST CLOSE BEFORE ITS SLICE',
    'PRESERVE SEAM ONLY',
    'DEFER UNTIL OPERATING EVIDENCE',
    'OVER-STOPPING',
    'UNDER-STOPPING',
  ]) assert.ok(brief.includes(token), `review brief missing ${token}`)

  for (const token of [
    'REVISION 2 / OPERATOR RATIFIED / 2026-08-29',
    'bounding Evidence map',
    'R1 FOUNDATION BATCH',
    'exact Node/G0',
    'operator **probe grant**',
    'c02r pattern',
    '4D-D conformance/version/upgrade contract',
    'Full-composition 4E',
    'first operational Budget',
  ]) assert.ok(proposal.includes(token), `convergence proposal missing ${token}`)

  for (const token of [
    'REVIEW COMPLETE / BOUNDED PROGRAM COMPRESSION / OPERATOR RATIFIED / 2026-08-29',
    'Claude Code `2.1.220`',
    '`gemini-3.1-pro-high`',
    'PRODUCT / PLAN GAP / SURVIVES',
    'METHOD FINDING IN REPOSITORY-LOCAL PHASE-4 PROGRAM / SURVIVES',
    'DIRECTED DIVERGENCE / RESOLVED',
    'LOCAL EXECUTION GAP / SURVIVES BOUNDEDLY',
    '35–55',
    '13–17',
    'INDEPENDENT FINAL CONVERGENCE      = YES',
    'TERMINAL VERDICT                  = BOUNDED PROGRAM COMPRESSION',
    'IMPLEMENTATION AUTHORITY           = 0',
  ]) assert.ok(adjudication.includes(token), `Lead adjudication missing ${token}`)

  assert.match(selection, /RF-12A reopens RF-01 if schema-validation\/canonicalization admission proves/)
  assert.match(phase, /Mutable status and exact next action.*owned only by/s)
  assert.match(roadmap, /BOUNDED PROGRAM COMPRESSION OPERATOR RATIFIED/)
  assert.match(index, /Phase-4 planning acceleration review/)
})
