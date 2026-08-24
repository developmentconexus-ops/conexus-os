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

test('operator-approved W-04 Workspace Agent catalog remains locked through later bounded P-01 progression', () => {
  const htmlPath = 'docs/evidence/4c/w04-agent-catalog-functional-wireframe.html'
  const contractPath = 'docs/evidence/4c/w04-agent-catalog-screen-contract.md'
  if (!existsSync(path(contractPath))) throw new Error('W-04 exact Screen Contract must exist after operator lock')

  const html = read(htmlPath)
  const hypotheses = read('docs/evidence/4c/w04-structural-hypotheses.md')
  const revision = read('docs/evidence/4c/w04-p8-agent-information-hierarchy-revision.md')
  const contract = read(contractPath)
  const inventory = read('docs/evidence/4c/candidate-screen-surface-inventory.md')
  const roadmap = read('docs/roadmap.md')

  const approvedBlob = '65073eb5f532f2675f04ec307eb0d9b91fd1b69d'
  if (gitBlobSha(html) !== approvedBlob) throw new Error('operator-approved revised W-04 HTML artifact changed after lock')

  requireText(contract, 'LOCKED / OPERATOR APPROVED', 'W-04 Screen Contract must own the operator-only lock')
  requireText(contract, `approved revised P8 artifact blob = ${approvedBlob}`, 'W-04 Screen Contract must pin the exact approved revised HTML blob')
  requireText(hypotheses, 'P7 CANDIDATE / OPERATOR ADJUDICATION / P8 BLOCKED / NOT LOCKED', 'W-04 P7 record must remain immutable historical candidate Evidence')
  requireText(revision, 'OPERATOR ACCEPTED / INTERACTION-ONLY REVISION / P8 REVISED CANDIDATE / NOT LOCKED', 'W-04 P8 revision record must remain immutable historical candidate Evidence')

  for (const exactTrace of [
    'PRJ-22 ListWorkspaceProductAgents',
    'WorkspaceProductAgentCatalogItem',
    'ProductAgent.name',
    'ProductAgent.purpose',
    'ProjectSummary',
    'PRJ-20 ListProjectProductAgents = OUTSIDE W-04',
    'PRJ-21 GetProjectProductAgent = OUTSIDE W-04',
  ]) requireText(contract, exactTrace, `W-04 Screen Contract missing ${exactTrace}`)

  for (const law of [
    'project.read != project.source.read',
    'Included in active Release | No active Release',
    'activeReleaseId != runtime health',
    'ProjectSummary.archived != Agent lifecycle',
    'complete already-disclosed PRJ-22 collection',
    'local search/filter = EPHEMERAL_UI',
    'technical detail expansion = EPHEMERAL_UI',
    'Open Agent = URL_NAVIGATION boundary intent',
    'WORKSPACE AGENTS = DISCOVER',
    'PROJECT-OWNED AGENT WORKSPACE = UNDERSTAND + COMPOSE + TEST + VERIFY + OPERATE',
    'PUBLISHED-APP AGENT = USE',
    'P10 new graduated shared patterns = 0',
    'existing graduated patterns remain = 1',
    'context-preserving exact-subject panel',
    'P11 = LATER ASSEMBLED PRODUCT',
  ]) requireText(contract, law, `W-04 closure missing law: ${law}`)

  for (const forbidden of [
    'PRJ-21 dependency under project.read = FORBIDDEN',
    'Workspace Agent/fleet owner = FORBIDDEN',
    'Agent create/edit/run controls = NOT ADMITTED',
    'system-prompt/tools editor in W-04 = FORBIDDEN',
    'runtime-health projection from activeReleaseId = FORBIDDEN',
    'server search/pagination/sort by frontend convenience = NOT ADMITTED',
  ]) requireText(contract, forbidden, `W-04 Screen Contract must preserve forbidden scope: ${forbidden}`)

  requireText(inventory, '| WS-S03 | Workspace Agent catalog | `ROUTE_PAGE` |', 'W-04 lock must preserve the exact Workspace Agent catalog surface')
  requireText(inventory, '| `W-04` | Workspace Agent catalog | access-filtered browse of Project-owned Agents | LOCKED / OPERATOR APPROVED', 'W-04 lock must remain in the material-block ledger')
  requireText(inventory, '| `P-01` | Build + Plan/Preview/Code/Diff/Findings/Evidence/assistant | primary Project workspace | LOCKED / OPERATOR APPROVED', 'later authorized P-01 lock must not falsify W-04 history')
  requireText(inventory, '| `P-02` | Data + Capabilities + Integrations + Project Connections + Brain binding | inspectable Product resources | NEXT / NOT OPEN', 'current routing after P-01 lock must remain bounded')

  requireText(roadmap, 'W-04 = LOCKED / OPERATOR APPROVED / REVISED P8 / P9/P10 CLOSED', 'roadmap must preserve W-04 lock')
  requireText(roadmap, 'P-01 = LOCKED / OPERATOR APPROVED / P9/P10 CLOSED', 'later authorized P-01 closure must be visible')
  requireText(roadmap, 'P-02 = NEXT / NOT OPEN', 'roadmap must route but not open P-02')
  if (/P-02[^\n|]*=\s*OPEN/.test(roadmap) || /P11\s*=\s*ASSEMBLED/.test(roadmap) || /4D[^\n|]*=\s*OPEN/.test(roadmap)) {
    throw new Error('later P-01 lock must not open P-02, P11 or 4D')
  }
})
