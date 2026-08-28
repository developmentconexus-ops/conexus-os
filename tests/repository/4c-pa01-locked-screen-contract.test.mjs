import { existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = fileURLToPath(new URL('../../', import.meta.url))
const path = value => resolve(root, value)
const read = value => readFileSync(path(value), 'utf8')
const requireText = (text, needle, message = needle) => {
  if (!text.includes(needle)) throw new Error(`PA-01 lock missing: ${message}`)
}
function gitBlobSha(text) {
  const bytes = Buffer.from(text.replaceAll('\r\n', '\n'), 'utf8')
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
}

test('operator-approved PA-01 artifact remains pinned and closed through P9/P10', () => {
  const htmlPath = 'docs/evidence/4c/pa01-published-app-product-agent-functional-wireframe.html'
  const contractPath = 'docs/evidence/4c/pa01-published-app-product-agent-screen-contract.md'
  const blob = '87551c6bc24f335a088c976cbfd560d102f63cf7'
  const family3Locked = '612ec41d91104e01b3942f7d90f35c37ad89c9f0'
  const family4Candidate = 'ffba5935d8fccd0fc5d7ad4d275fe38b09294674'

  if (!existsSync(path(contractPath))) throw new Error('PA-01 exact Screen Contract must exist after operator lock')

  const html = read(htmlPath)
  const contract = read(contractPath)
  const evidence = read('docs/evidence/4c/pa01-published-app-product-agent-authority-feasibility-and-structural-hypotheses.md')
  const roadmap = read('docs/roadmap.md')
  const inventory = read('docs/evidence/4c/candidate-screen-surface-inventory.md')
  const index = read('docs/index.md')

  if (gitBlobSha(html) !== family4Candidate) throw new Error('P12 Family 4 re-locked PA-01 drifted')

  for (const token of [
    'LOCKED / OPERATOR APPROVED', 'P9 EXACT TRACE CLOSED', 'P10 CONSOLIDATED', 'P11 LATER ASSEMBLED PRODUCT',
    `approved final P8 artifact blob = ${blob}`,
    `approved IAM-13 ingress P8 delta blob = ${family3Locked} / OPERATOR APPROVED 2026-08-28`,
    `approved approval-run-egress P8 delta blob = ${family4Candidate} / OPERATOR APPROVED 2026-08-28`,
    'Minimal app frame', 'Project business surface', 'Agent entry/host', 'Conversation rail',
    'Transcript + composer', 'Exact run region', 'Needs-your-decision region',
    'IAM-02 EndSession', 'IAM-13 GetPublishedAppAccessContext',
    'PAR-01 ListConversations', 'PAR-02 GetConversation', 'PAR-03 CreateConversation', 'PAR-04 SendProductAgentTurn',
    'PAR-06 ListAgentRuns', 'PAR-07 GetAgentRun', 'PAR-08 ListApprovalRequests',
    'PAR-09 GetApprovalRequest', 'PAR-10 DecideApprovalRequest',
    'SERVER', 'PROJECT_RELEASE_COMPOSITION', 'TECHNICAL_PROJECTION', 'EPHEMERAL_UI',
    'BUD-01 / P11 / 4D / Product implementation / merge = NOT AUTHORIZED',
  ]) requireText(contract, token)

  requireText(evidence, '## 13. Operator LOCK closure', 'decision/Evidence closure')
  requireText(evidence, `approved final P8 artifact blob = ${blob}`, 'decision/Evidence exact artifact')
  requireText(roadmap, 'PA-01 = LOCKED / OPERATOR APPROVED / P9 EXACT TRACE CLOSED / P10 CONSOLIDATED', 'roadmap PA-01 closure')
  requireText(inventory, 'Family 3 preserved; P12 Family 4 ApprovalRun `ffba5935...` / RE-LOCKED / OPERATOR APPROVED', 'inventory exact PA-01 re-lock')
  requireText(index, 'pa01-published-app-product-agent-screen-contract.md', 'index routes to locked PA-01 Screen Contract')

  if (/^(?:BUD-01 = (?:OPEN|AUTHORIZED)|P11 = ASSEMBLED|4D = OPEN|Product implementation = AUTHORIZED)$/m.test(roadmap)) {
    throw new Error('PA-01 lock must not silently advance a later gate')
  }
})
