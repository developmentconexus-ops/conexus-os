import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'

const root = resolve(new URL('../../', import.meta.url).pathname)
const path = p => resolve(root, p)
const read = p => readFileSync(path(p), 'utf8')

function requireText(text, needle, message) {
  if (!text.includes(needle)) throw new Error(message)
}

const evidencePath = 'docs/evidence/4c/w02a-brain-structural-hypotheses.md'
const htmlPath = 'docs/evidence/4c/w02a-brain-functional-wireframe.html'

test('W-02A structural record preserves the approved knowledge-first decision through operator lock', () => {
  if (!existsSync(path(evidencePath))) throw new Error('W-02A structural decision evidence is missing')
  const evidence = read(evidencePath)

  for (const law of [
    'LOCKED / OPERATOR APPROVED',
    'domain/concept first + separate governance work',
    'Knowledge                         ← primary mental model',
    'WHAT THE ORGANIZATION KNOWS',
    'HOW THAT KNOWLEDGE EVOLVES',
    'SEMANTIC',
    'KNOWLEDGE',
    'EVIDENCE_SPEC',
    'Fixture domain names',
    'W-02A = LOCKED',
    'NEXT = W-02B Connections P7',
  ]) requireText(evidence, law, `W-02A structural evidence missing law: ${law}`)
})

test('W-02A functional P8 makes organizational knowledge navigable by domain and business concept', () => {
  if (!existsSync(path(htmlPath))) throw new Error('W-02A functional P8 HTML is missing')
  const html = read(htmlPath)

  for (const token of [
    'data-wireframe="w-02a-brain"',
    'CANDIDATE · NOT LOCKED',
    'Knowledge',
    'Discovery',
    'Proposals',
    'Revisions',
    'Health',
    'data-brain-view="knowledge"',
    'data-domain-id="commercial"',
    'Search organizational knowledge',
    'Definition',
    'Business meaning',
    'Grain',
    'Relationships',
    'Business rules',
    'Caveats',
    'How this is verified',
    'Provenance',
    'Fixture domains and concepts are demonstration data only',
  ]) requireText(html, token, `W-02A P8 missing knowledge-navigation evidence: ${token}`)

  requireText(html, "'net-revenue': {", 'W-02A P8 fixture must include the representative Net Revenue business concept')
  requireText(html, 'data-concept-id="${id}"', 'W-02A P8 concept renderer must bind each fixture concept ID into human navigation')
  requireText(html, 'data-content-class="SEMANTIC"', 'W-02A P8 must expose SEMANTIC as concept metadata, not primary navigation')
  requireText(html, 'data-content-class="KNOWLEDGE"', 'W-02A P8 must expose KNOWLEDGE as concept metadata, not primary navigation')
  requireText(html, 'data-content-class="EVIDENCE_SPEC"', 'W-02A P8 must expose EVIDENCE_SPEC as concept metadata, not primary navigation')
})

test('W-02A functional P8 exercises Discovery to reviewed proposal to separate publication using local fixtures only', () => {
  if (!existsSync(path(htmlPath))) throw new Error('W-02A functional P8 HTML is missing')
  const html = read(htmlPath)

  for (const token of [
    'data-operation="BRN-04"',
    'data-operation="BRN-07"',
    'data-operation="BRN-08"',
    'data-operation="BRN-09"',
    'id="humanResolution"',
    'id="submitProposal"',
    'id="approveProposal"',
    'id="rejectProposal"',
    'id="publishProposal"',
    'reviewText',
    'proposalRevision',
    'candidateSourceRevision',
    'runDiscovery',
    'submitDiscoveryProposal',
    'decideProposal',
    'publishApprovedProposal',
    'APPROVED · NOT PUBLISHED',
    'PUBLISHED',
    'Fixture interaction only',
    'No backend/runtime behavior is claimed',
  ]) requireText(html, token, `W-02A P8 missing functional/authority evidence: ${token}`)

  if (html.includes('fetch(')) throw new Error('W-02A P8 must not imply live backend transport through fetch')
  if (html.includes('localStorage')) throw new Error('W-02A P8 must not make browser persistence a Brain authority substitute')
  if (html.includes('sessionStorage')) throw new Error('W-02A P8 must not make browser session persistence a Brain authority substitute')

  requireText(html, 'proposal approval != publication', 'W-02A P8 must explain approval/publication separation')
  requireText(html, 'reviewText != decision identity', 'W-02A P8 must keep reviewText presentation-only')
})
