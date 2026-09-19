import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'

const root = resolve(new URL('../../', import.meta.url).pathname)
const read = p => readFileSync(resolve(root, p), 'utf8')

function requireText(text, needle, message) {
  if (!text.includes(needle)) throw new Error(message)
}

function sliceBetween(text, startNeedle, endNeedle) {
  const start = text.indexOf(startNeedle)
  if (start < 0) return ''
  const end = text.indexOf(endNeedle, start)
  return text.slice(start, end < 0 ? undefined : end)
}

test('P-03 preserves the operator-accepted F24-F26 selected realization', () => {
  const evidence = read('docs/evidence/4c/p03-authority-feasibility-and-structural-hypotheses.md')
  for (const token of [
    '4C-F24 = OPERATOR ACCEPTED',
    '4C-F25 = OPERATOR ACCEPTED',
    '4C-F26 = OPERATOR ACCEPTED',
    'SELECTED REALIZATION',
    'P8 BLOCKED',
  ]) requireText(evidence, token, `P-03 accepted decision Evidence missing ${token}`)
})

// F24 asserted a bounded PRJ-20 alternate discovery route (agent.trigger.manage) and a PRJ-21
// authored-detail read that were never bundled into the Product OAS and had no current census
// row (operation-ledger.md section 5). An independent verification of PR #103 confirmed both as
// contract for a surface never built, and a later unit deleted PRJ-16/17/18/19/20/21/22/29 from
// contracts/api/product/project-paths.yaml along with their now-orphaned component schemas and
// the wire gate rows that named them live. F24 has no surviving subject to assert, for the same
// reason F25/F26 were removed above.
//
// scripts/check-wire-project-agent-catalog.mjs still reads PRJ-20/21/22 from the bundle and is
// itself unreachable from any npm script or CANDIDATE_GRAPH entry; it is dead code left for a
// separate cleanup unit, not deleted here because it sits outside this change's write scope.

test('P-03 preserves the REVISE history and closes the operator-approved lock with F27-F30 handoffs', () => {
  const evidence = read('docs/evidence/4c/p03-authority-feasibility-and-structural-hypotheses.md')
  const inventory = read('docs/evidence/4c/candidate-screen-surface-inventory.md')
  const phase = read('docs/phases/4c-frontend-interaction-and-authority-realization.md')
  const blueprint = read('docs/development/blueprint-harness-design.md')

  for (const token of [
    'P-03 LOCKED / OPERATOR APPROVED / P9 EXACT TRACE CLOSED / P10 CONSOLIDATED',
    'operator walkthrough = REVISE',
    'F30 = OPERATOR APPROVED / 4A/4B GREEN',
    'P-01 Agent Studio delta = RE-LOCKED / OPERATOR APPROVED',
    'P-03 = LOCKED / P9 EXACT TRACE CLOSED / P10 CONSOLIDATED',
  ]) requireText(evidence, token, `P-03 owner missing ${token}`)

  for (const token of [
    '## 14. Operator walkthrough REVISE — F27–F29',
    '4C-F27 — Published-App Agent interaction and decision continuity',
    '4C-F28 — Agent authoring inspectability and handoff',
    '4C-F29 — future Published-App Agent Experience Paved Road',
    '## 15. 4C-F30 — Agent Studio has no truthful structured authoring wire',
    '## 17. Operator LOCK closure',
    'P-01 Agent Studio delta = RE-LOCKED / OPERATOR APPROVED',
    'P-03 P8 = LOCKED / OPERATOR APPROVED',
  ]) requireText(evidence, token, `consolidated P-03 owner missing ${token}`)

  requireText(inventory, 'Accepted `4C-F27` binds the later PA-01 block', 'PA-01 inventory must absorb F27')
  requireText(phase, 'accepted `4C-F29` walkthrough finding', '4C owner must hand F29 to 4D')
  requireText(blueprint, 'Accepted `4C-F29` adds a concrete future Published-App Agent experience consumer', '4D owner must absorb F29')
})

test('F30 recompiles complete Agent definition and typed Change draft without direct Agent/runtime authority', () => {
  const evidence = read('docs/evidence/4c/p03-authority-feasibility-and-structural-hypotheses.md')
  const builder = read('contracts/api/product/builder-paths.yaml')
  const project = read('contracts/api/product/project-paths.yaml')
  const ledger = read('docs/product/operation-ledger.md')
  const permissions = read('docs/product/permission-contract.md')

  for (const token of [
    'No browser-reachable Product operation can submit an exact structured Agent edit',
    'Project definition read + Builder Change draft = SELECTED / OPERATOR APPROVED',
    'same candidate agent/v1',
    'BLD-18 GetChangeProductAgentDraft',
    'BLD-19 CreateChangeProductAgentDraft',
    'BLD-20 ReviseChangeProductAgentDraft',
    'expectedDraftRevision',
  ]) requireText(evidence, token, `F30 missing ${token}`)

  const createChange = sliceBetween(builder, 'summary: CreateChange', '/api/control/projects/{projectId}/changes/{changeId}:')
  requireText(createChange, 'required: [intent]', 'BLD-03 currently accepts only human intent')
  if (/agentDefinition|agentDraft|structuredAgent/i.test(createChange)) {
    throw new Error('F30 must not overload BLD-03 prose intent with structured Agent authority')
  }

  // The ProductAgentDefinition schema this test once inspected lived only on PRJ-21
  // (GetProjectProductAgent), which a later unit deleted from project-paths.yaml along with
  // PRJ-16/17/18/19/20/22/29: contract for a surface never built and confirmed unbundled by an
  // independent verification of PR #103. `project` above is still read for the CreateChange
  // assertion; the deleted schema has no surviving subject to assert here.

  for (const token of ['x-conexus-4a-id: BLD-18', 'x-conexus-4a-id: BLD-19', 'x-conexus-4a-id: BLD-20', 'IdempotencyKey', 'EXPLICIT_REVISION', 'candidateSubjectDigest']) {
    requireText(builder, token, `F30 Builder wire missing ${token}`)
  }
  requireText(ledger, 'N_platform 122 → 125', 'F30 must close the exact operation census delta')
  requireText(permissions, 'creates no `agent.manage`', 'F30 must reject a parallel Agent-management Permission')
})
