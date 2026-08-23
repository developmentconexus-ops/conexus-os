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

function propertyNames(schemaSlice) {
  const start = schemaSlice.indexOf('      properties:\n')
  if (start < 0) return []
  const lines = schemaSlice.slice(start + '      properties:\n'.length).split('\n')
  const names = []
  for (const line of lines) {
    const match = line.match(/^        ([A-Za-z][A-Za-z0-9]*):\s*$/)
    if (match) names.push(match[1])
  }
  return names
}

test('F06 proves exact Brain detail reads carry identity/state but not yet human-reviewable source-bound content', () => {
  const product = read('docs/product/contract.md')
  const permissions = read('docs/product/permission-contract.md')
  const wire = read('contracts/api/product/brain-paths.yaml')
  const finding = read('docs/evidence/4c/w02-brain-review-content-finding.md')

  for (const accepted of [
    'The Product must visibly distinguish inferred/proposed from confirmed knowledge.',
    'human interview resolves what cannot be inferred',
  ]) requireText(product, accepted, `F06 lost accepted Brain human-review need: ${accepted}`)
  requireText(permissions, 'inspect current Workspace Brain, immutable revisions and health/conformance projections', 'F06 lost brain.read inspectability authority')
  requireText(permissions, 'inspect/review/decide exact KnowledgeProposal subjects', 'F06 lost brain.review authority')

  const revision = sliceBetween(wire, '    BrainRevision:\n', '    BrainDiscoveryCandidate:\n')
  const proposal = sliceBetween(wire, '    KnowledgeProposal:\n', '    BrainHealthState:\n')
  const revisionProps = propertyNames(revision).sort()
  const proposalProps = propertyNames(proposal).sort()

  const expectedRevision = ['availability', 'brainDigest', 'brainRevisionId', 'sourceRevision'].sort()
  const expectedProposal = ['candidateSourceRevision', 'hypothesisState', 'proposalId', 'proposalRevision', 'provenanceRefs', 'reviewState'].sort()
  if (revisionProps.join(',') !== expectedRevision.join(',')) throw new Error(`F06 current-state premise changed for BrainRevision: ${revisionProps.join(',')}`)
  if (proposalProps.join(',') !== expectedProposal.join(',')) throw new Error(`F06 current-state premise changed for KnowledgeProposal: ${proposalProps.join(',')}`)

  for (const invariant of [
    'human can inspect the meaning/content represented by the exact source revision',
    'canonical Workspace Brain source remains authority',
    're-entry does not depend on browser-local state',
    'Project Builder / Project Git are not reused as Workspace Brain source authority',
  ]) requireText(finding, invariant, `F06 finding missing invariant: ${invariant}`)
})

test('F06 remains a Global-Maximum decision rather than a preselected review field or source API', () => {
  const assessment = read('docs/evidence/4c/w02-brain-review-content-global-maximum.md')
  const roadmap = read('docs/roadmap.md')

  for (const section of [
    'Root Cause',
    'Target Invariant',
    'Credible Alternatives',
    'Global Maximum',
    'Essential vs Accidental Complexity',
    'YAGNI / Future Cost',
    'Reopen triggers',
  ]) requireText(assessment, section, `F06 assessment missing ${section}`)

  for (const alternative of [
    'A — show only IDs/digests/source revisions',
    'B — browser reads Workspace Brain Git directly',
    'C — reuse Builder `BLD-08/09` Project-source reads',
    'D — add generic Brain source-tree/file browse/edit operations',
    'E — enrich the existing exact detail reads with a Brain-owned human review projection',
    'F — create a generic shared ReviewProjection Product domain because Baseline also has visual review',
  ]) requireText(assessment, alternative, `F06 assessment missing alternative: ${alternative}`)

  requireText(assessment, 'DECISION EVIDENCE / OPERATOR GATE / NOT PRODUCT AUTHORITY', 'F06 assessment must remain non-authoritative before operator decision')
  requireText(roadmap, 'F06 OPERATOR GATE', 'roadmap must expose the current F06 decision gate')
})
