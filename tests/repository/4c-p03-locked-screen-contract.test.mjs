import { existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = fileURLToPath(new URL('../../', import.meta.url))
const path = value => resolve(root, value)
const read = value => readFileSync(path(value), 'utf8')
const requireText = (text, needle, message = needle) => {
  if (!text.includes(needle)) throw new Error(`P-03 lock missing: ${message}`)
}
function gitBlobSha(text) {
  const bytes = Buffer.from(text.replaceAll('\r\n', '\n'), 'utf8')
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
}

test('operator-approved P-03 and P-01 baselines and F05 deltas remain pinned after lock', () => {
  const p03HtmlPath = 'docs/evidence/4c/p03-product-agent-functional-wireframe.html'
  const p01HtmlPath = 'docs/evidence/4c/p01-build-workspace-functional-wireframe.html'
  const contractPath = 'docs/evidence/4c/p03-product-agent-screen-contract.md'
  const p03Blob = 'dfc661a19aa43ad541e728e22849de5daf47fb47'
  const p01Blob = 'b679504046b7ef9956ede6757b1e9ebd9030770f'
  const p03F05Blob = 'b462c3bb536e0562d28ffb85ef9f6d44fb52df3a'
  const p01F05Blob = '8ff34e12ab35ee69f8ffaff1bdd0a8274ac62cec'
  const p01Family1Candidate = 'e5782b3f9e828a5c247b405821589d52039cc179'
  const p03Family4Candidate = '17d31534fac0e57a74f70202567b23d8a63cd3c0'
  const p01Family4Candidate = '25e5077106892c4ff6aba6774987e73a12ccff51'

  if (!existsSync(path(contractPath))) throw new Error('P-03 exact Screen Contract must exist after operator lock')

  const p03Html = read(p03HtmlPath)
  const p01Html = read(p01HtmlPath)
  const contract = read(contractPath)
  const p01Contract = read('docs/evidence/4c/p01-build-workspace-screen-contract.md')
  const evidence = read('docs/evidence/4c/p03-authority-feasibility-and-structural-hypotheses.md')
  const roadmap = read('docs/roadmap.md')
  const inventory = read('docs/evidence/4c/candidate-screen-surface-inventory.md')
  const index = read('docs/index.md')

  if (gitBlobSha(p03Html) !== p03Family4Candidate) throw new Error('P12 Family 4 re-locked P-03 drifted')
  if (gitBlobSha(p01Html) !== p01Family4Candidate) throw new Error('P12 Family 4 re-locked P-01 drifted')
  for (const token of ['PRE11-F05 bounded read-only reference presentation','PRJ-29','PRJ-16/17','BRN-14']) requireText(p03Html, token, 'bounded F05 P-03 lock marker')
  for (const token of ['PRE11-F05 bounded reference-selection overlay','PRJ-29','PRJ-16/17','BRN-14']) requireText(p01Html, token, 'bounded F05 P-01 lock marker')

  for (const token of [
    'LOCKED / OPERATOR APPROVED','P9 EXACT TRACE CLOSED','P10 CONSOLIDATED','P11 LATER ASSEMBLED PRODUCT',
    `approved final P8 artifact blob = ${p03Blob}`,
    `approved reference-presentation P8 artifact blob = ${p03F05Blob}`,
    `approved Agent/ApprovalRun-egress P8 delta blob = ${p03Family4Candidate} / OPERATOR APPROVED 2026-08-28`,
    'Agents landing','Agent Overview','Definition','Automations','Runs','Exact approval','Agent Studio handoff',
    'PRJ-20 ListProjectProductAgents','PRJ-21 GetProjectProductAgent','PRJ-17 / Project Capability',
    'BLD-19 origin=NEW','BLD-20','PAR-06 ListAgentRuns','PAR-07 GetAgentRun','PAR-08 ListApprovalRequests',
    'PAR-11 ListAgentTriggers','PAR-16 DisableAgentTrigger','project.source.read != project.read != agent.trigger.manage != project.build',
    'SERVER','URL_NAVIGATION','EPHEMERAL_UI','loading, empty, denied and failed states remain semantically distinct',
    'Framework-specific system prompt, skill, workflow and tool representations remain mechanisms',
    'P-04 / P11 / 4D / Product implementation = NOT AUTHORIZED',
  ]) requireText(contract, token)

  requireText(p01Contract, 'P12 FAMILY 1 RE-LOCKED', 'P-01 Family 1 re-lock status')
  requireText(p01Contract, `approved Agent Studio P8 artifact blob = ${p01Blob}`, 'P-01 exact re-locked artifact')
  requireText(p01Contract, `approved Agent Studio reference-delta P8 artifact blob = ${p01F05Blob}`, 'P-01 exact PRE11-F05 artifact')
  requireText(p01Contract, `approved identity-custody P8 delta blob = ${p01Family1Candidate}`, 'P-01 exact Family 1 re-lock')
  requireText(p01Contract, `approved Agent-ingress P8 delta blob = ${p01Family4Candidate} / OPERATOR APPROVED 2026-08-28`, 'P-01 exact Family 4 re-lock')
  requireText(evidence, '## 17. Operator LOCK closure', 'decision/Evidence closure')
  requireText(roadmap, 'P-03 = LOCKED / OPERATOR APPROVED / P9 EXACT TRACE CLOSED / P10 CONSOLIDATED', 'roadmap P-03 closure')
  requireText(inventory, '| `P-03` | Agents + definition inspection + Agent Studio handoff + triggers + runs + exact approvals |', 'inventory includes the P-03 block')
  requireText(index, 'p03-product-agent-screen-contract.md', 'index routes to locked P-03 Screen Contract')

  if (/^(?:P-04 = (?:OPEN|AUTHORIZED)|P11 = ASSEMBLED|4D = OPEN|Product implementation = AUTHORIZED)$/m.test(roadmap)) {
    throw new Error('P-03 lock must not silently advance a later gate')
  }
})
