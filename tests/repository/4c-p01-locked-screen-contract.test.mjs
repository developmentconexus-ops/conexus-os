import { existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const path = p => resolve(root, p)
const read = p => readFileSync(path(p), 'utf8')
const requireText = (text, needle, message = needle) => { if (!text.includes(needle)) throw new Error(`P-01 lock missing: ${message}`) }
function gitBlobSha(text) { const bytes=Buffer.from(text.replaceAll('\r\n','\n'),'utf8'); return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') }

test('operator-approved P-01 baseline and bounded F05 delta remain pinned after re-lock', () => {
  const htmlPath='docs/evidence/4c/p01-build-workspace-functional-wireframe.html'
  const contractPath='docs/evidence/4c/p01-build-workspace-screen-contract.md'
  if(!existsSync(path(contractPath))) throw new Error('P-01 exact Screen Contract must exist after operator lock')

  const html=read(htmlPath),contract=read(contractPath),inventory=read('docs/evidence/4c/candidate-screen-surface-inventory.md')
  const approvedBlob='3f9d30f7e6fa0de814f0be20b7583b4e98aca7c8',relockedBlob='b679504046b7ef9956ede6757b1e9ebd9030770f',f05Blob='8ff34e12ab35ee69f8ffaff1bdd0a8274ac62cec'
  const family1Candidate='e5782b3f9e828a5c247b405821589d52039cc179'
  const family4Candidate='25e5077106892c4ff6aba6774987e73a12ccff51'
  if(gitBlobSha(html)!==family4Candidate) throw new Error('P12 Family 4 re-locked P-01 identity drifted')
  for(const token of ['PRE11-F05 bounded reference-selection overlay','PRJ-29','PRJ-16/17','BRN-14']) requireText(html,token,'bounded F05 lock marker')

  for(const token of [
    'LOCKED BASELINE / P12 FAMILY 1 RE-LOCKED / P12 FAMILY 4 AGENT-INGRESS DELTA RE-LOCKED / OPERATOR APPROVED','P9 EXACT TRACE CLOSED','P10 CONSOLIDATED','P11 LATER ASSEMBLED PRODUCT',
    `approved final P8 artifact blob = ${approvedBlob}`,
    `approved Agent Studio P8 artifact blob = ${relockedBlob}`,
    `approved Agent Studio reference-delta P8 artifact blob = ${f05Blob}`,
    `approved identity-custody P8 delta blob = ${family1Candidate}`,
    `approved Agent-ingress P8 delta blob = ${family4Candidate} / OPERATOR APPROVED 2026-08-28`,
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
    'same canonical HTML; no parallel Agent Studio artifact','PRJ-21 complete safe ProductAgentDefinition','BLD-19 explicit origin NEW | EXISTING + Idempotency-Key','BLD-20 expectedDraftRevision','structured edit + Conexus edit → same Change candidate','stale expectedDraftRevision → conflict + reload; never silent overwrite','Agent Studio delta P9 exact trace','Agent Studio delta P10 consolidation',
  ]) requireText(contract,token)

  for(const forbidden of [
    'Change chooser as root = FORBIDDEN','current app from latest Change = FORBIDDEN','current app from active Release = FORBIDDEN','browser-owned current app from source = FORBIDDEN',
    'source mutation in Code/Diff = FORBIDDEN','source permission elevation = FORBIDDEN','review permission elevation = FORBIDDEN','generic AI Builder/session owner = NOT ADMITTED','P11 early assembly = FORBIDDEN',
  ]) requireText(contract,forbidden)

  requireText(inventory,'Family 1 preserved; P12 Family 4 Agent-ingress `25e50771...` / RE-LOCKED / OPERATOR APPROVED','inventory must preserve Family 1 and expose the Family 4 re-lock')
  requireText(contract,'LOCKED BASELINE / P12 FAMILY 1 RE-LOCKED','P-01 Screen Contract must own the lock')
})
