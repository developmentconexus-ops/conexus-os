import { existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { resolve } from 'node:path'

const root = resolve(new URL('../../', import.meta.url).pathname)
const path = p => resolve(root, p)
const read = p => readFileSync(path(p), 'utf8')
const requireText = (text, needle, message = needle) => { if (!text.includes(needle)) throw new Error(`P-01 lock missing: ${message}`) }
function gitBlobSha(text) { const bytes=Buffer.from(text,'utf8'); return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') }

test('operator-approved P-01 Build remains locked through later explicitly authorized P-02 progression', () => {
  const htmlPath='docs/evidence/4c/p01-build-workspace-functional-wireframe.html'
  const contractPath='docs/evidence/4c/p01-build-workspace-screen-contract.md'
  if(!existsSync(path(contractPath))) throw new Error('P-01 exact Screen Contract must exist after operator lock')

  const html=read(htmlPath),contract=read(contractPath),inventory=read('docs/evidence/4c/candidate-screen-surface-inventory.md'),roadmap=read('docs/roadmap.md')
  const approvedBlob='3f9d30f7e6fa0de814f0be20b7583b4e98aca7c8'
  if(gitBlobSha(html)!==approvedBlob) throw new Error('operator-approved final right-sidebar P-01 P8 artifact changed after lock')

  for(const token of [
    'LOCKED / OPERATOR APPROVED','P9 EXACT TRACE CLOSED','P10 CONSOLIDATED','P11 LATER ASSEMBLED PRODUCT',
    `approved final P8 artifact blob = ${approvedBlob}`,
    'Build → current Project application immediately','Conexus chat = right sidebar','no active Change required','no Change chooser',
    'BLD-10 GetBuildPreview without changeId → CURRENT_PROJECT','BLD-10 GetBuildPreview with optional exact changeId → CHANGE_CANDIDATE',
    'subjectDigest','current Project source != active Release','Build Preview != Published App serving state','ready != verified != live',
    'BLD-03 CreateChange','Build instruction → exact Change.intent','Plan mode before Change = BLD-16 Project-context conversational reasoning','Plan mode before Change != BLD-04 durable ChangePlan',
    'BLD-04 GetChangePlan','BLD-05 DecideChangePlanCheckpoint','BLD-06 GetChangeProgress','BLD-07 GetChangeDiff','BLD-08 ListProjectSourceTree','BLD-09 GetProjectSourceFile',
    'BLD-11 ListChangeFindings','BLD-12 GetFinding','BLD-13 CloseFinding','BLD-14 ListChangeEvidence','BLD-15 GetEvidence','BLD-16 AskConexusAboutContext','BLD-17 GetChangeExecutionDetail',
    'project.build != project.review != project.source.read','visible Code/Diff != project.source.read grant','visible Findings/Evidence != project.review grant','visible Plan decision != reviewer eligibility',
    'current/candidate Preview = SERVER','active Change after create = SERVER','composer draft/chat fixture = EPHEMERAL_UI','lens/inspector open state = EPHEMERAL_UI','Project route = URL_NAVIGATION',
    'loading != known-empty != denied != absent/non-disclosable != dependency failure','working != blocked != waiting-for-user != completed','current != candidate',
    'durable Builder conversation/thread persistence = NOT ADMITTED','assistant answer -X-> Change / Plan / progress / verification truth',
    'context-preserving exact-subject panel','P10 new graduated shared patterns = 0','existing graduated patterns remain = 1','app-first Builder + right-side chat = single-instance','Build/Plan composer = single-instance',
  ]) requireText(contract,token)

  for(const forbidden of [
    'Change chooser as root = FORBIDDEN','current app from latest Change = FORBIDDEN','current app from active Release = FORBIDDEN','browser-owned current app from source = FORBIDDEN',
    'source mutation in Code/Diff = FORBIDDEN','source permission elevation = FORBIDDEN','review permission elevation = FORBIDDEN','generic AI Builder/session owner = NOT ADMITTED','P11 early assembly = FORBIDDEN',
  ]) requireText(contract,forbidden)

  requireText(inventory,'| `P-01` | Build + Plan/Preview/Code/Diff/Findings/Evidence/assistant | primary Project workspace | LOCKED / OPERATOR APPROVED','inventory must keep P-01 locked')
  requireText(roadmap,'P-01 = LOCKED / OPERATOR APPROVED / P9/P10 CLOSED','roadmap must keep P-01 locked')
  if(/P11\s*=\s*ASSEMBLED/.test(roadmap)||/4D[^\n|]*=\s*OPEN/.test(roadmap)) throw new Error('later P-02 progression must not assemble P11 or open 4D')
})
