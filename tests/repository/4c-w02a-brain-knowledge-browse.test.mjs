import { existsSync, readFileSync } from 'node:fs'
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

test('W-02A P9 preserves the F07 structured knowledge-browse finding and Global-Maximum decision history', () => {
  const findingPath = 'docs/evidence/4c/w02a-brain-knowledge-browse-finding.md'
  const gmPath = 'docs/evidence/4c/w02a-brain-knowledge-browse-global-maximum.md'
  if (!existsSync(path(findingPath))) throw new Error('F07 Brain knowledge-browse finding must exist')
  if (!existsSync(path(gmPath))) throw new Error('F07 Global-Maximum assessment must exist')

  const html = read('docs/evidence/4c/w02a-brain-functional-wireframe.html')
  const finding = read(findingPath)
  const gm = read(gmPath)

  requireText(html, 'data-domain-id="commercial"', 'approved P8 must still prove domain navigation')
  requireText(html, 'data-concept-id', 'approved P8 must still prove concept navigation')
  requireText(html, 'Search organizational knowledge', 'approved P8 must still prove knowledge findability')

  for (const law of [
    'F07 = OPEN / MATERIAL P9 FINDING',
    'frontend must not parse reviewText into Brain semantic authority',
    'Knowledge → Domain → Concept',
    'exact sourceRevision',
    'P8 operator approval remains valid as UX direction',
  ]) requireText(finding, law, `F07 finding missing law: ${law}`)

  for (const alternative of [
    'A — frontend parses reviewText / rendered DOM',
    'B — browser reads Workspace Brain Git directly',
    'C — reuse AnalyticQuery / vector-RAG search as Brain catalog authority',
    'D — enrich the existing exact Brain revision read with a structured source-bound browse/review projection',
    'E — add dedicated Brain knowledge list/detail/search operations now',
    'F — generic cross-owner ReviewProjection Product domain',
  ]) requireText(gm, alternative, `F07 Global-Maximum assessment missing alternative: ${alternative}`)

  requireText(gm, 'LEADING GLOBAL-MAXIMUM CANDIDATE = D', 'F07 decision history must preserve the selected leading candidate')
})

test('selected F07 realization keeps BRN-03 as owner and makes exact published knowledge structurally browseable', () => {
  const selectedPath = 'docs/evidence/4c/w02a-brain-knowledge-browse-selected-realization.md'
  if (!existsSync(path(selectedPath))) throw new Error('F07 selected realization must exist after operator acceptance')

  const selected = read(selectedPath)
  const ledger = read('docs/product/operation-ledger.md')
  const wire = read('contracts/api/product/brain-paths.yaml')
  const checker = read('scripts/check-wire-brain.mjs')
  const roadmap = read('docs/roadmap.md')

  for (const law of [
    'OPERATOR ACCEPTED / SELECTED REALIZATION',
    'BrainRevisionDetail',
    'knowledgeBrowse',
    'domainRef',
    'conceptRef',
    'SEMANTIC',
    'KNOWLEDGE',
    'EVIDENCE_SPEC',
    'knowledgeBrowse -X-> decision/publication input',
    'no new Product operation/domain/Permission/record is admitted',
  ]) requireText(selected, law, `F07 selected realization missing law: ${law}`)

  const brn03 = sliceBetween(wire, 'summary: GetBrainRevision', '\n  /api/control/workspaces/{workspaceId}/brain/discoveries:')
  requireText(brn03, "$ref: '#/components/schemas/BrainRevisionDetail'", 'F07 RED: BRN-03 must return BrainRevisionDetail')

  for (const component of [
    'BrainRevisionDetail:',
    'BrainKnowledgeBrowseProjection:',
    'BrainKnowledgeDomainProjection:',
    'BrainKnowledgeConceptProjection:',
    'BrainKnowledgeSectionProjection:',
    'BrainKnowledgeSectionKind:',
    'BrainKnowledgeContentClass:',
  ]) requireText(wire, component, `F07 selected wire missing component ${component}`)

  const detail = sliceBetween(wire, '    BrainRevisionDetail:\n', '    BrainKnowledgeBrowseProjection:\n')
  for (const field of ['brainRevisionId:', 'brainDigest:', 'sourceRevision:', 'availability:', 'reviewText:', 'knowledgeBrowse:']) {
    requireText(detail, field, `F07 BrainRevisionDetail missing ${field}`)
  }

  const concept = sliceBetween(wire, '    BrainKnowledgeConceptProjection:\n', '    BrainKnowledgeSectionProjection:\n')
  for (const field of ['conceptRef:', 'label:', 'summary:', 'contentClasses:', 'sections:', 'provenanceRefs:']) {
    requireText(concept, field, `F07 concept projection missing ${field}`)
  }

  requireText(ledger, '4C-F07', 'F07 4A authority must record the accepted structured browse property')
  requireText(ledger, 'structured source-bound', 'F07 4A authority must keep the projection exact-source bound')
  requireText(checker, 'knowledgeBrowse', 'Brain wire checker must protect F07 structured browse')
  requireText(checker, 'BrainRevisionDetail', 'Brain wire checker must protect BRN-03 detail shape')
  requireText(roadmap, 'F07 OPERATOR ACCEPTED', 'roadmap must preserve operator acceptance of F07')
  requireText(roadmap, 'F07 SELECTED REALIZATION', 'roadmap must route F07 through selected RED/GREEN before lock')
})
