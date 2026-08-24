import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(new URL('../../', import.meta.url).pathname)
const path = p => resolve(root, p)
const read = p => readFileSync(path(p), 'utf8')
const htmlPath = 'docs/evidence/4c/p01-build-workspace-functional-wireframe.html'

function requireText(text, needle, message = needle) {
  assert.ok(text.includes(needle), `P-01 P8 missing: ${message}`)
}

test('P-01 Build opens the current application with Conexus and creates exact Change work from a Build instruction instead of requiring Change selection', () => {
  assert.equal(existsSync(path(htmlPath)), true, 'P-01 functional P8 HTML must exist')
  const html = read(htmlPath)
  for (const token of [
    'P-01 P8 FUNCTIONAL LOW-FI CANDIDATE','NOT LOCKED','fixture-only','Current Application',
    'Preview = current Project application by default','Preview + Conexus = default Build entry',
    'Build instruction → BLD-03 CreateChange','Plan instruction → no Change mutation','Change emerges from the work',
    'Build','Plan','Preview','Code','Diff','BLD-03','BLD-06','BLD-07','BLD-08','BLD-09','BLD-10','BLD-16',
  ]) requireText(html, token)
  for (const id of [
    'build-root','chat-sidebar','chat-history','new-chat-button','build-composer','composer-mode','composer-input','composer-submit',
    'active-change-context','lens-preview','lens-code','lens-diff','preview-surface','source-tree','source-file','diff-view',
  ]) requireText(html, `id="${id}"`, id)
  for (const behavior of ['startNewChat','submitComposer','createChangeFromInstruction','selectWorkspaceLens','renderPreview','renderCode','renderDiff','simulateNextCandidateBuild']) requireText(html, behavior, behavior)
  requireText(html,'builderFixtures','explicit owner-issued Builder fixture projections')
  requireText(html,'currentApplication','current Project application fixture')
  requireText(html,'change.intent','authored human Change meaning')
  requireText(html,'activeChangeId','exact active Change context after mutation intent')
  requireText(html,'lastGoodPreview','last-good candidate fixture')
  requireText(html,'nextCandidate','next candidate fixture')
  assert.doesNotMatch(html,/id="build-overview"|id="open-change-session"|Open selected Change|Back to Build overview/,'Build must not require an intermediate Change chooser')
  assert.doesNotMatch(html,/(?:Save|Edit)\s+(?:source|file)|Commit\s+(?:source|changes)|Apply\s+patch/i,'Code/Diff must not expose source mutation')
  assert.doesNotMatch(html,/contenteditable\s*=\s*["']?true/i,'P8 must not become a browser source editor')
})

test('P-01 keeps Plan/progress and Findings/Evidence governed but on demand while the application remains the work center', () => {
  const html=read(htmlPath)
  for (const token of ['Visual Plan','Hub-owned progress','Approve checkpoint','Reject checkpoint','Plan current != stale planRevision','Findings','Evidence','Findings / Evidence = trust layer','no Findings != verified','Evidence present != claim proven','project.build != project.review != project.source.read','visible Code/Diff != project.source.read grant','visible Findings/Evidence != project.review grant','visible Plan decision != reviewer eligibility','BLD-04','BLD-05','BLD-11','BLD-12','BLD-13','BLD-14','BLD-15']) requireText(html,token)
  for (const id of ['focus-inspector','inspect-plan','inspect-findings','inspect-evidence','inspect-details','plan-panel','plan-items','plan-checkpoint','plan-decision-status','findings-panel','evidence-panel','finding-detail-dialog','finding-resolution-status']) requireText(html,`id="${id}"`,id)
  requireText(html,'id="focus-inspector" hidden','governance inspector closed by default')
  for (const behavior of ['toggleFocusInspector','closeFocusInspector','renderPlan','decidePlanCheckpoint','simulateStalePlan','renderFindings','openFinding','closeFindingDetail','closeFindingWithEvidence','renderEvidence']) requireText(html,behavior,behavior)
  requireText(html,'planRevision','exact Plan revision');requireText(html,'expectedFindingRevision','exact Finding revision');requireText(html,'resolutionEvidenceIds','Finding closure Evidence')
  assert.doesNotMatch(html,/function\s+(?:derive|compute|calculate)(?:Verification|Progress|Eligibility)\b/i,'frontend must not derive owner truth')
})

test('P-01 Conexus chat sidebar is the primary Build interaction surface without becoming owner truth or authority', () => {
  const html=read(htmlPath)
  for (const token of ['Conexus','Project context','Exact Change context','BLD-16 changeId?','assistant answer != owner state','conversation != Change','conversation != Plan truth','conversation != Progress truth','conversation != verification','Execution detail','execution detail = progressive disclosure','BLD-16','BLD-17','loading != known-empty != denied != absent/non-disclosable != dependency failure','working != blocked != waiting-for-user != completed','Preview ready != verified != live','source-readable != source-mutable']) requireText(html,token)
  for (const id of ['chat-sidebar','assistant-question','assistant-scope','assistant-answer','execution-details','scenario-select','scenario-status']) requireText(html,`id="${id}"`,id)
  for (const behavior of ['toggleAssistant','submitAssistantQuestion','toggleExecutionDetail','applyScenario','renderScenarioStatus']) requireText(html,behavior,behavior)
  requireText(html,'provenanceRefs','assistant provenance fixture')
  assert.doesNotMatch(html,/assistant[^\n]{0,80}(?:grant|permission|authorize)/i,'assistant must not imply authority grant')
})

test('P-01 P8 stays disposable self-contained low-fi Evidence with responsive and accessible interactions', () => {
  const html=read(htmlPath)
  requireText(html,'@media','responsive CSS');requireText(html,'role="dialog"','dialog semantics');requireText(html,'aria-modal="true"','modal semantics');requireText(html,'aria-live="polite"','status announcements');requireText(html,'keydown','keyboard interaction');assert.match(html,/event\.key\s*===\s*'Escape'/,'Escape closes focused overlay/panel');requireText(html,'returnFocusTo','focus return');requireText(html,'P8 WALKTHROUGH FIXTURES','fixture legend')
  assert.doesNotMatch(html,/\bfetch\s*\(/,'P8 must not perform network requests');assert.doesNotMatch(html,/XMLHttpRequest|localStorage|sessionStorage|indexedDB/i,'P8 must not persist or network fixture state');assert.doesNotMatch(html,/<script[^>]+src=|<link[^>]+href=/i,'P8 must be self-contained');assert.doesNotMatch(html,/P-01\s*=\s*LOCKED|P8\s*=\s*LOCKED/i,'P8 candidate must not pre-authorize lock')
})

test('P-01 app-first P8 inherits the locked GF-01 Project shell', () => {
  const html=read(htmlPath)
  for (const token of ['data-shell="single-adaptive-rail"','class="topbar"','id="workspaceCrumb"','id="projectCrumb"','id="projectRail"','Back to Projects','Project','Product','Capabilities','Integrations','Operate','Activity','Manage','Settings','GF-01 shell inherited']) requireText(html,token,`locked Project shell token ${token}`)
  const projectRail=html.match(/<section id="projectRail"[\s\S]*?<\/section>/)?.[0]??'';assert.ok(projectRail,'P-01 must render Project rail');requireText(projectRail,'<button class="rail-btn" type="button" aria-current="page">Build</button>','Build current in Project rail');for(const label of ['Data','Capabilities','Integrations','Agents','Brain','Releases','Activity','Settings'])requireText(projectRail,`>${label}</button>`,`Project rail destination ${label}`);assert.doesNotMatch(projectRail,/>Overview<\/button>/,'no invented Project Overview');assert.doesNotMatch(html,/class="global-nav"/,'no standalone sidebar shell')
})

test('P-01 app-first root shows the current application immediately and keeps Change as durable work truth behind chat-driven building', () => {
  const html=read(htmlPath)
  for (const token of ['App-first Build root','Current Application','New chat','TODAY','Build / Plan','No active Change','Change becomes active only after a Build instruction','chat = human interaction surface','Change = durable work truth','Plan = governed execution intent','Hub progress = execution truth','Evidence = verification truth','Preview = product result']) requireText(html,token,`app-first token ${token}`)
  requireText(html,'id="build-root"','Build root is directly rendered');requireText(html,'id="chat-sidebar"','Conexus chat sidebar rendered by default');requireText(html,'id="focus-inspector" hidden','inspection closed by default');assert.doesNotMatch(html,/Build Overview|Focused Build Session|Open selected Change/,'superseded Change-first navigation must be absent')
})
