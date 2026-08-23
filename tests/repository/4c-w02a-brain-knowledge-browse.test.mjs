import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'

const root = resolve(new URL('../../', import.meta.url).pathname)
const path = p => resolve(root, p)
const read = p => readFileSync(path(p), 'utf8')

function requireText(text, needle, message) {
  if (!text.includes(needle)) throw new Error(message)
}

function brainRevisionSchema(yaml) {
  const start = yaml.indexOf('    BrainRevision:')
  const end = yaml.indexOf('    BrainDiscoveryCandidate:', start)
  if (start < 0 || end < 0) throw new Error('cannot isolate BrainRevision schema')
  return yaml.slice(start, end)
}

test('W-02A P9 exposes the structured knowledge-browse gap without fabricating frontend semantics', () => {
  const findingPath = 'docs/evidence/4c/w02a-brain-knowledge-browse-finding.md'
  const gmPath = 'docs/evidence/4c/w02a-brain-knowledge-browse-global-maximum.md'
  if (!existsSync(path(findingPath))) throw new Error('F07 Brain knowledge-browse finding must exist')
  if (!existsSync(path(gmPath))) throw new Error('F07 Global-Maximum assessment must exist')

  const wire = read('contracts/api/product/brain-paths.yaml')
  const revision = brainRevisionSchema(wire)
  const html = read('docs/evidence/4c/w02a-brain-functional-wireframe.html')
  const finding = read(findingPath)
  const gm = read(gmPath)
  const roadmap = read('docs/roadmap.md')

  for (const field of ['brainRevisionId:', 'brainDigest:', 'sourceRevision:', 'availability:', 'reviewText:']) {
    requireText(revision, field, `current BrainRevision must preserve ${field}`)
  }
  for (const absent of ['reviewProjection:', 'knowledgeProjection:', 'domains:', 'concepts:']) {
    if (revision.includes(absent)) throw new Error(`solution-neutral F07 inquiry must begin before ${absent} exists in BrainRevision`)
  }

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

  requireText(gm, 'LEADING GLOBAL-MAXIMUM CANDIDATE = D', 'F07 must identify the leading candidate without admitting it')
  requireText(roadmap, 'F07 OPERATOR GATE', 'roadmap must route F07 to operator adjudication')
  requireText(roadmap, 'W-02A P8 OPERATOR APPROVED', 'roadmap must preserve operator approval of the UX candidate')
  requireText(roadmap, 'W-02A NOT LOCKED', 'P9 falsifier must prevent a false completed lock')
})
