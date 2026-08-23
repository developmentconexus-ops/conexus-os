import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'

const root = resolve(new URL('../../', import.meta.url).pathname)
const path = p => resolve(root, p)
const read = p => readFileSync(path(p), 'utf8')

function requireText(text, needle, message) {
  if (!text.includes(needle)) throw new Error(message)
}

test('F05 proves the accepted Brain human-resolution journey is not caller-expressible in the current discovery-to-proposal wire', () => {
  const product = read('docs/product/contract.md')
  const wire = read('contracts/api/product/brain-paths.yaml')
  const finding = read('docs/evidence/4c/w02-brain-discovery-resolution-finding.md')
  const assessment = read('docs/evidence/4c/w02-brain-discovery-resolution-global-maximum.md')

  for (const law of [
    'machine proposes',
    'human interview resolves what cannot be inferred',
    'reviewed publication becomes Brain authority',
  ]) requireText(product, law, `F05 Product precondition lost: ${law}`)

  const discoveryStart = wire.indexOf('summary: StartBrainDiscovery')
  const proposalsRoute = wire.indexOf('\n  /api/control/workspaces/{workspaceId}/brain/proposals:', discoveryStart)
  const discoverySlice = wire.slice(discoveryStart, proposalsRoute)
  requireText(discoverySlice, '$ref: \'#/components/schemas/BrainDiscoveryResult\'', 'F05 BRN-04 must still return BrainDiscoveryResult')

  const candidateStart = wire.indexOf('    BrainDiscoveryCandidate:\n')
  const resultStart = wire.indexOf('    BrainDiscoveryResult:\n', candidateStart)
  const candidateSchema = wire.slice(candidateStart, resultStart)
  for (const field of ['candidateRef', 'hypothesis', 'provenanceRefs']) {
    requireText(candidateSchema, `${field}:`, `F05 discovery candidate lost ${field}`)
  }

  const submitStart = wire.indexOf('summary: SubmitKnowledgeProposal')
  const proposalDetailRoute = wire.indexOf('\n  /api/control/workspaces/{workspaceId}/brain/proposals/{proposalId}:', submitStart)
  const submitSlice = wire.slice(submitStart, proposalDetailRoute)
  requireText(submitSlice, 'required: [candidateSourceRevision, provenanceRefs]', 'F05 current BRN-07 precondition changed before operator decision')
  if (/humanResolution:|reviewFeedback:|discoveryCandidateRef:/.test(submitSlice)) {
    throw new Error('F05 must remain solution-neutral before operator accepts a selected proposal-intake realization')
  }

  for (const invariant of [
    'human can explicitly resolve/confirm/correct the relevant discovery meaning',
    'frontend never becomes Brain source authority',
    'Project Builder / Project Git never silently owns Workspace Brain meaning',
  ]) requireText(finding, invariant, `F05 finding missing invariant: ${invariant}`)

  for (const alternative of [
    'A — require the browser human to provide a pre-existing `candidateSourceRevision`',
    'B — make BRN-04 automatically create one Brain `candidateSourceRevision` per discovered hypothesis',
    'C — enrich existing BRN-07 with a Discovery-backed proposal-intake mode',
    'D — add a separate `ResolveBrainDiscoveryCandidate` operation',
    'E — reuse Builder Change / Project Git',
    'F — create a durable `BrainDraft`, `DiscoverySession`, interview-thread or generic Brain editor domain',
  ]) requireText(assessment, alternative, `F05 Global-Maximum comparison missing: ${alternative}`)

  requireText(assessment, 'CURRENT STRUCTURE CONFIRMED', 'F05 assessment must state the current Global-Maximum outcome')
  requireText(assessment, 'recommended realization = enrich BRN-07 with Discovery-backed proposal intake', 'F05 leading realization must remain explicit Decision Evidence')
})
