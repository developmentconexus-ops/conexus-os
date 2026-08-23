import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'

const root = resolve(new URL('../../', import.meta.url).pathname)
const path = p => resolve(root, p)
const read = p => readFileSync(path(p), 'utf8')

function requireText(text, needle, message) {
  if (!text.includes(needle)) throw new Error(message)
}

function sliceBetween(text, startNeedle, endNeedle) {
  const start = text.indexOf(startNeedle)
  if (start < 0) return ''
  const end = text.indexOf(endNeedle, start)
  return text.slice(start, end < 0 ? undefined : end)
}

test('F06 preserves the accepted Brain review-content finding and Global-Maximum decision history', () => {
  const product = read('docs/product/contract.md')
  const permissions = read('docs/product/permission-contract.md')
  const finding = read('docs/evidence/4c/w02-brain-review-content-finding.md')
  const assessment = read('docs/evidence/4c/w02-brain-review-content-global-maximum.md')
  const selected = read('docs/evidence/4c/w02-brain-review-content-selected-realization.md')

  for (const accepted of [
    'The Product must visibly distinguish inferred/proposed from confirmed knowledge.',
    'human interview resolves what cannot be inferred',
  ]) requireText(product, accepted, `F06 lost accepted Brain human-review need: ${accepted}`)
  requireText(permissions, 'inspect current Workspace Brain, immutable revisions and health/conformance projections', 'F06 lost brain.read inspectability authority')
  requireText(permissions, 'inspect/review/decide exact KnowledgeProposal subjects', 'F06 lost brain.review authority')

  for (const invariant of [
    'human can inspect the meaning/content represented by the exact source revision',
    'canonical Workspace Brain source remains authority',
    're-entry does not depend on browser-local state',
    'Project Builder / Project Git are not reused as Workspace Brain source authority',
  ]) requireText(finding, invariant, `F06 finding missing invariant: ${invariant}`)

  for (const alternative of [
    'A — show only IDs/digests/source revisions',
    'B — browser reads Workspace Brain Git directly',
    'C — reuse Builder `BLD-08/09` Project-source reads',
    'D — add generic Brain source-tree/file browse/edit operations',
    'E — enrich the existing exact detail reads with a Brain-owned human review projection',
    'F — create a generic shared ReviewProjection Product domain because Baseline also has visual review',
  ]) requireText(assessment, alternative, `F06 assessment missing alternative: ${alternative}`)

  requireText(assessment, 'DECISION EVIDENCE / OPERATOR GATE / NOT PRODUCT AUTHORITY', 'F06 historical assessment must preserve its pre-decision status')
  requireText(selected, 'OPERATOR ACCEPTED / SELECTED REALIZATION', 'F06 selected realization must record operator acceptance')
  requireText(selected, 'reviewText', 'F06 selected realization must name the exact bounded wire property')
})

test('selected F06 realization makes exact Brain detail reads human-reviewable without changing decision identity or Brain topology', () => {
  const ledger = read('docs/product/operation-ledger.md')
  const wire = read('contracts/api/product/brain-paths.yaml')
  const selected = read('docs/evidence/4c/w02-brain-review-content-selected-realization.md')
  const roadmap = read('docs/roadmap.md')

  requireText(selected, 'reviewText -X-> decision identity', 'F06 selected realization must keep presentation content outside decision identity')
  requireText(selected, 'reviewText -X-> source authority', 'F06 selected realization must keep canonical source authority separate')

  requireText(ledger, '4C-F06', 'F06-A Product authority must record the accepted Brain review-content correction')
  requireText(ledger, 'deterministic human-readable', 'F06-A Product authority must define the review projection property')
  requireText(ledger, 'BRN-03', 'F06-A must keep BRN-03 as the revision detail read')
  requireText(ledger, 'BRN-06', 'F06-A must keep BRN-06 as the proposal detail read')

  const revision = sliceBetween(wire, '    BrainRevision:\n', '    BrainDiscoveryCandidate:\n')
  const proposal = sliceBetween(wire, '    KnowledgeProposal:\n', '    BrainHealthState:\n')
  for (const [label, schema] of [['BrainRevision', revision], ['KnowledgeProposal', proposal]]) {
    requireText(schema, 'reviewText:', `F06-B ${label} must expose reviewText`)
    requireText(schema, 'minLength: 1', `F06-B ${label} reviewText must be nonblank`)
  }

  const decide = sliceBetween(wire, 'summary: DecideKnowledgeProposal', '\n  /api/control/workspaces/{workspaceId}/brain/publications:')
  requireText(decide, 'required: [expectedProposalRevision, decision]', 'F06-B BRN-08 decision subject must remain proposalRevision + decision')
  if (decide.includes('reviewText:')) throw new Error('F06-B reviewText must never become BRN-08 decision input')

  const publish = sliceBetween(wire, 'summary: PublishBrainRevision', '\n  /api/control/workspaces/{workspaceId}/brain/health:')
  requireText(publish, 'required: [candidateSourceRevision]', 'F06-B BRN-09 publication subject must remain candidateSourceRevision')
  if (publish.includes('reviewText:')) throw new Error('F06-B reviewText must never become BRN-09 publication input')

  requireText(roadmap, 'F06 OPERATOR ACCEPTED', 'roadmap must project the accepted F06 decision')
  requireText(roadmap, 'F06 SELECTED REALIZATION RED', 'roadmap must expose selected-realization TDD before authority recompile')
})
