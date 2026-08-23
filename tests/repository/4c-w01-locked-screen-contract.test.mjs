import { existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { resolve } from 'node:path'

const root = resolve(new URL('../../', import.meta.url).pathname)
const path = p => resolve(root, p)
const read = p => readFileSync(path(p), 'utf8')

function requireText(text, needle, message) {
  if (!text.includes(needle)) throw new Error(message)
}

function gitBlobSha(text) {
  const bytes = Buffer.from(text, 'utf8')
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
}

test('operator-approved W-01 C1-R1 is locked and closed through exact P9/P10 trace', () => {
  const htmlPath = 'docs/evidence/4c/w01-projects-inception-wireframe.html'
  const contractPath = 'docs/evidence/4c/w01-screen-contract.md'
  if (!existsSync(path(contractPath))) throw new Error('W-01 exact Screen Contract must exist after operator lock')

  const html = read(htmlPath)
  const hypotheses = read('docs/evidence/4c/w01-reference-and-structural-hypotheses.md')
  const contract = read(contractPath)
  const roadmap = read('docs/roadmap.md')

  const approvedBlob = '3d1d475d3ca7ce06ea549da12152cd386ab170a2'
  if (gitBlobSha(html) !== approvedBlob) throw new Error('operator-approved W-01 HTML artifact changed after lock')
  requireText(contract, `approved P8 artifact blob = ${approvedBlob}`, 'W-01 Screen Contract must pin the exact approved HTML blob')

  requireText(hypotheses, 'LOCKED / OPERATOR APPROVED', 'W-01 hypotheses must record the operator-only lock')
  requireText(hypotheses, 'C1-R1', 'W-01 lock must identify C1-R1 exactly')

  for (const exactTrace of [
    'PRJ-01 ListProjects',
    'PRJ-03 CreateProject',
    'PRJ-07 RunInceptionInvestigation',
    'PRJ-08 GetApprovedProjectBaseline',
    'PRJ-09 ApproveProjectBaselineRevision',
    'PRJ-23 GetProjectBaselineCandidate',
    'PRJ-24 AskConexusAboutBaselineCandidate',
  ]) requireText(contract, exactTrace, `W-01 Screen Contract missing ${exactTrace}`)

  for (const law of [
    'candidateBaselineDigest = URL_NAVIGATION',
    'review selection / panel open-close = EPHEMERAL_UI',
    'proposed refinements = FORM_DRAFT',
    'Candidate A remains immutable',
    'Apply refinements = explicit PRJ-07 boundary',
    'P10 graduated shared patterns = 0',
    'Plan visual grammar = DEFERRED TO P-01',
    'P11 = NOT TRIGGERED SEPARATELY',
  ]) requireText(contract, law, `W-01 closure missing law: ${law}`)

  requireText(roadmap, 'W-01 LOCKED', 'roadmap must show W-01 locked')
  requireText(roadmap, 'W-02', 'roadmap must route the next material block to W-02')
  if (/W-03[^\n|]*OPEN|W-04[^\n|]*OPEN|P-01[^\n|]*OPEN|4D[^\n|]*OPEN/.test(roadmap)) {
    throw new Error('W-01 lock must not skip the routed W-02 material block')
  }
})
