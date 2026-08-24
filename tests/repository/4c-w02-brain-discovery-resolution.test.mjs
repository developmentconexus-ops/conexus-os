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

test('operator-accepted F05 makes BRN-07 caller-expressible for Discovery-backed human resolution without changing Brain ownership', () => {
  const product = read('docs/product/contract.md')
  const ledger = read('docs/product/operation-ledger.md')
  const finding = read('docs/evidence/4c/w02-brain-discovery-resolution-finding.md')
  const assessment = read('docs/evidence/4c/w02-brain-discovery-resolution-global-maximum.md')

  requireText(assessment, 'OPERATOR ACCEPTED', 'F05 selected realization must record operator acceptance before Product authority changes')
  requireText(assessment, 'CURRENT STRUCTURE CONFIRMED', 'F05 must preserve the accepted Global-Maximum outcome')

  for (const law of [
    'machine proposes',
    'human interview resolves what cannot be inferred',
    'reviewed publication becomes Brain authority',
  ]) requireText(product, law, `F05 Product precondition lost: ${law}`)

  for (const invariant of [
    'Discovery-backed',
    'exact discovery candidate',
    'explicit human resolution',
    'Brain owner materializes',
    'candidateSourceRevision',
    'source-backed',
  ]) requireText(ledger, invariant, `F05-A operation authority missing law: ${invariant}`)

  requireText(ledger, '`BRN-07` | `SubmitKnowledgeProposal`', 'F05 must preserve BRN-07 as the proposal-intake operation')

  for (const forbidden of [
    'ResolveBrainDiscoveryCandidate',
    'BrainDraft',
    'DiscoverySession',
  ]) {
    if (ledger.includes(`| \`${forbidden}\``) || product.includes(`## ${forbidden}`)) {
      throw new Error(`F05 must not create ${forbidden} Product authority`)
    }
  }

  for (const invariant of [
    'human can explicitly resolve/confirm/correct the relevant discovery meaning',
    'frontend never becomes Brain source authority',
    'Project Builder / Project Git never silently owns Workspace Brain meaning',
  ]) requireText(finding, invariant, `F05 finding lost invariant: ${invariant}`)
})

test('selected F05 wire preserves source-backed BRN-07 and adds an exclusive Discovery-backed intake that returns the same KnowledgeProposal', () => {
  const wire = read('contracts/api/product/brain-paths.yaml')

  const discoverySlice = sliceBetween(
    wire,
    'summary: StartBrainDiscovery',
    '\n  /api/control/workspaces/{workspaceId}/brain/proposals:',
  )
  requireText(discoverySlice, "$ref: '#/components/schemas/BrainDiscoveryResult'", 'F05-B BRN-04 must still return BrainDiscoveryResult')

  const candidateSchema = sliceBetween(wire, '    BrainDiscoveryCandidate:\n', '    BrainDiscoveryResult:\n')
  for (const field of ['candidateRef', 'hypothesis', 'provenanceRefs']) {
    requireText(candidateSchema, `${field}:`, `F05-B discovery candidate lost ${field}`)
  }
  if (/\n\s+candidateSourceRevision:/.test(candidateSchema)) {
    throw new Error('F05-B BRN-04 must remain read-only and must not materialize candidateSourceRevision before human resolution')
  }

  const submitSlice = sliceBetween(
    wire,
    'summary: SubmitKnowledgeProposal',
    '\n  /api/control/workspaces/{workspaceId}/brain/proposals/{proposalId}:',
  )
  requireText(submitSlice, 'oneOf:', 'F05-B BRN-07 must expose mutually exclusive source-backed and Discovery-backed input forms')
  requireText(submitSlice, "$ref: '#/components/schemas/SourceBackedKnowledgeProposalInput'", 'F05-B BRN-07 must preserve source-backed submission')
  requireText(submitSlice, "$ref: '#/components/schemas/DiscoveryBackedKnowledgeProposalInput'", 'F05-B BRN-07 must add Discovery-backed submission')
  requireText(submitSlice, "$ref: '#/components/schemas/KnowledgeProposal'", 'F05-B both BRN-07 input forms must return the same durable KnowledgeProposal')

  const sourceBacked = sliceBetween(wire, '    SourceBackedKnowledgeProposalInput:\n', '    DiscoveryBackedKnowledgeProposalInput:\n')
  requireText(sourceBacked, 'required: [candidateSourceRevision, provenanceRefs]', 'F05-B source-backed input must preserve exact source revision + provenance')
  for (const field of ['candidateSourceRevision:', 'provenanceRefs:']) requireText(sourceBacked, field, `F05-B source-backed input missing ${field}`)
  if (/discoveryCandidateRef:|humanResolution:/.test(sourceBacked)) throw new Error('F05-B source-backed input must not absorb Discovery semantics')

  const discoveryBacked = sliceBetween(wire, '    DiscoveryBackedKnowledgeProposalInput:\n', '    KnowledgeProposal:\n')
  requireText(discoveryBacked, 'required: [discoveryCandidateRef, humanResolution]', 'F05-B Discovery-backed input must bind exact candidate + explicit human resolution')
  requireText(discoveryBacked, 'discoveryCandidateRef:', 'F05-B Discovery-backed input missing exact discovery candidate reference')
  requireText(discoveryBacked, 'humanResolution:', 'F05-B Discovery-backed input missing caller-expressible human resolution')
  requireText(discoveryBacked, 'minLength: 1', 'F05-B human resolution must be non-blank')
  if (/\n\s+provenanceRefs:/.test(discoveryBacked)) {
    throw new Error('F05-B Discovery-backed browser input must not smuggle provenance; Brain must re-resolve it from the exact discovery candidate')
  }
  if (/\n\s+candidateSourceRevision:/.test(discoveryBacked)) {
    throw new Error('F05-B Discovery-backed browser input must not manufacture Brain source revision authority')
  }

  const proposalSchema = sliceBetween(wire, '    KnowledgeProposal:\n', '    BrainHealthState:\n')
  for (const field of ['candidateSourceRevision:', 'provenanceRefs:', 'hypothesisState:', 'reviewState:']) {
    requireText(proposalSchema, field, `F05-B durable KnowledgeProposal lost ${field}`)
  }

  const decideSlice = sliceBetween(
    wire,
    'summary: DecideKnowledgeProposal',
    '\n  /api/control/workspaces/{workspaceId}/brain/publications:',
  )
  requireText(decideSlice, 'enum: [APPROVE, REJECT]', 'F05-B BRN-08 must remain the exact human proposal decision gate')

  const publishSlice = sliceBetween(
    wire,
    'summary: PublishBrainRevision',
    '\n  /api/control/workspaces/{workspaceId}/brain/health:',
  )
  requireText(publishSlice, 'required: [candidateSourceRevision]', 'F05-B BRN-09 must remain exact reviewed-candidate publication authority')
})
