import { existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const path = p => resolve(root, p)
const read = p => readFileSync(path(p), 'utf8')

function requireText(text, needle, message) {
  if (!text.includes(needle)) throw new Error(message)
}

function gitBlobSha(text) {
  const bytes = Buffer.from(text.replaceAll('\r\n', '\n'), 'utf8')
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
}

test('operator-approved W-02A Brain is locked and closed through exact P9/P10 trace', () => {
  const htmlPath = 'docs/evidence/4c/w02a-brain-functional-wireframe.html'
  const contractPath = 'docs/evidence/4c/w02a-brain-screen-contract.md'
  if (!existsSync(path(contractPath))) throw new Error('W-02A exact Screen Contract must exist after operator lock')

  const html = read(htmlPath)
  const hypotheses = read('docs/evidence/4c/w02a-brain-structural-hypotheses.md')
  const contract = read(contractPath)
  const roadmap = read('docs/roadmap.md')

  const approvedBlob = '9ca84ddbf40f6bcd969bfa638203bff8b9abf46e'
  const family2Candidate = 'f0a6902737a36217b081ff61768caa39c98c4734'
  if (gitBlobSha(html) !== family2Candidate) throw new Error('P12 Family 2 W-02A candidate drifted before operator walkthrough')
  requireText(contract, `approved P8 artifact blob = ${approvedBlob}`, 'W-02A Screen Contract must pin the exact approved HTML blob')
  requireText(contract, `P12 Family 2 approved P8 delta blob = ${family2Candidate}`, 'W-02A contract must pin re-lock separately')

  requireText(hypotheses, 'LOCKED / OPERATOR APPROVED', 'W-02A structural record must preserve the operator-only lock')
  requireText(hypotheses, 'domain/concept first + separate governance work', 'W-02A lock must preserve the selected mental model')

  for (const exactTrace of [
    'PRJ-01 ListProjects',
    'BRN-01 GetWorkspaceBrain',
    'BRN-02 ListBrainRevisions',
    'BRN-03 GetBrainRevision',
    'BRN-04 StartBrainDiscovery',
    'BRN-05 ListKnowledgeProposals',
    'BRN-06 GetKnowledgeProposal',
    'BRN-07 SubmitKnowledgeProposal',
    'BRN-08 DecideKnowledgeProposal',
    'BRN-09 PublishBrainRevision',
    'BRN-10 GetBrainHealth',
  ]) requireText(contract, exactTrace, `W-02A Screen Contract missing ${exactTrace}`)

  for (const law of [
    'Knowledge → Domain → Concept',
    'knowledgeBrowse = SERVER',
    'selected projectId before Discovery = FORM_DRAFT',
    'humanResolution = FORM_DRAFT',
    'proposal / proposalRevision = SERVER',
    'proposal approval != publication',
    'reviewText -X-> decision identity',
    'health overlay -X-> immutable Brain content mutation',
    'BRN-12 = OUT OF BLOCK',
    'P10 graduated shared patterns = 0',
    'P11 = LATER ASSEMBLED PRODUCT',
  ]) requireText(contract, law, `W-02A closure missing law: ${law}`)

  requireText(roadmap, 'W-02A LOCKED', 'roadmap must show W-02A locked')
  requireText(roadmap, 'W-02B', 'roadmap must route the next material block to W-02B')
  if (/\|\s*4D\b[^|\n]*\|\s*(?:OPEN|ACTIVE)\b/.test(roadmap)) throw new Error('W-02A lock must not skip W-02B or later 4C blocks')
})
