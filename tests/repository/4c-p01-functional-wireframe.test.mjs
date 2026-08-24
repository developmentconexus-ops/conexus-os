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

test('P-01 functional P8 makes an exact Change human-recognizable and Preview-first without turning Code or Diff into mutation authority', () => {
  assert.equal(existsSync(path(htmlPath)), true, 'P-01 functional P8 HTML must exist after operator-approved P7')
  const html = read(htmlPath)

  requireText(html.toLowerCase(), '<!doctype html>', 'HTML document')
  for (const token of [
    'P-01 P8 FUNCTIONAL LOW-FI CANDIDATE',
    'NOT LOCKED',
    'fixture-only',
    'Preview-first exact-Change workspace',
    'Build',
    'Changes',
    'What do you want to change?',
    'Preview',
    'Code',
    'Diff',
    'Preview = default / dominant lens',
    'Code / Diff = read-only inspectable lenses',
    'last-good Preview survives while next candidate builds',
    'BLD-01', 'BLD-02', 'BLD-03', 'BLD-06', 'BLD-07', 'BLD-08', 'BLD-09', 'BLD-10',
  ]) requireText(html, token)

  for (const id of [
    'change-list', 'create-change-dialog', 'change-intent-input', 'change-workspace',
    'lens-preview', 'lens-code', 'lens-diff', 'preview-surface', 'source-tree', 'source-file', 'diff-view',
  ]) requireText(html, `id="${id}"`, id)

  for (const behavior of [
    'renderChangeList', 'selectChange', 'openCreateChangeDialog', 'closeCreateChangeDialog', 'createChange',
    'selectWorkspaceLens', 'renderPreview', 'renderCode', 'renderDiff', 'simulateNextCandidateBuild',
  ]) requireText(html, behavior, behavior)

  requireText(html, 'builderFixtures', 'explicit owner-issued Builder fixture projections')
  requireText(html, 'change.intent', 'authored human Change meaning')
  requireText(html, 'changeId', 'exact Change technical identity')
  requireText(html, 'lastGoodPreview', 'explicit last-good Preview fixture')
  requireText(html, 'nextCandidate', 'explicit next-candidate build fixture')

  assert.doesNotMatch(html, /(?:Save|Edit)\s+(?:source|file)|Commit\s+(?:source|changes)|Apply\s+patch/i, 'Code/Diff lenses must not expose source mutation')
  assert.doesNotMatch(html, /contenteditable\s*=\s*["']?true/i, 'P8 must not become a browser source editor')
  assert.doesNotMatch(html, /chat-first\s+split/i, 'rejected chat-first root must not become P8')
  assert.doesNotMatch(html, /engineering\s+control\s+center/i, 'rejected engineering-control-center root must not become P8')
})

test('P-01 functional P8 makes governed Plan/progress and Findings/Evidence independently operable while preserving review and source-read boundaries', () => {
  assert.equal(existsSync(path(htmlPath)), true, 'P-01 functional P8 HTML must exist after operator-approved P7')
  const html = read(htmlPath)

  for (const token of [
    'Visual Plan',
    'Hub-owned progress',
    'Approve checkpoint',
    'Reject checkpoint',
    'Plan current != stale planRevision',
    'Findings',
    'Evidence',
    'Findings / Evidence = trust layer',
    'no Findings != verified',
    'Evidence present != claim proven',
    'project.build != project.review != project.source.read',
    'visible Code/Diff != project.source.read grant',
    'visible Findings/Evidence != project.review grant',
    'visible Plan decision != reviewer eligibility',
    'BLD-04', 'BLD-05', 'BLD-11', 'BLD-12', 'BLD-13', 'BLD-14', 'BLD-15',
  ]) requireText(html, token)

  for (const id of [
    'plan-panel', 'plan-items', 'plan-checkpoint', 'plan-decision-status',
    'findings-panel', 'evidence-panel', 'finding-detail-dialog', 'finding-resolution-status',
  ]) requireText(html, `id="${id}"`, id)

  for (const behavior of [
    'renderPlan', 'decidePlanCheckpoint', 'simulateStalePlan',
    'renderFindings', 'openFinding', 'closeFindingDetail', 'closeFindingWithEvidence', 'renderEvidence',
  ]) requireText(html, behavior, behavior)

  requireText(html, 'planRevision', 'exact Plan current-subject fixture')
  requireText(html, 'expectedFindingRevision', 'exact Finding current-subject fixture')
  requireText(html, 'resolutionEvidenceIds', 'Finding closure requires admitted Evidence ids')

  assert.doesNotMatch(html, /function\s+(?:derive|compute|calculate)(?:Verification|Progress|Eligibility)\b/i, 'frontend must not derive verification/progress/reviewer eligibility authority')
  assert.doesNotMatch(html, /(?:Mark|Set)\s+(?:verified|complete|completed|done)/i, 'P8 must not invent generic verification/progress mutation')
})

test('P-01 functional P8 keeps Conexus contextual/retractable and execution detail progressively disclosed while making material states inspectable', () => {
  assert.equal(existsSync(path(htmlPath)), true, 'P-01 functional P8 HTML must exist after operator-approved P7')
  const html = read(htmlPath)

  for (const token of [
    'Ask Conexus',
    'Project context',
    'Exact Change context',
    'BLD-16 changeId?',
    'assistant answer != owner state',
    'conversation != Change',
    'conversation != Plan truth',
    'conversation != Progress truth',
    'conversation != verification',
    'Execution detail',
    'execution detail = progressive disclosure',
    'BLD-16', 'BLD-17',
    'loading != known-empty != denied != absent/non-disclosable != dependency failure',
    'working != blocked != waiting-for-user != completed',
    'Preview ready != verified != live',
    'source-readable != source-mutable',
  ]) requireText(html, token)

  for (const id of [
    'assistant-panel', 'assistant-question', 'assistant-scope', 'assistant-answer',
    'execution-details', 'scenario-select', 'scenario-status',
  ]) requireText(html, `id="${id}"`, id)

  for (const behavior of [
    'toggleAssistant', 'submitAssistantQuestion', 'toggleExecutionDetail',
    'applyScenario', 'renderScenarioStatus',
  ]) requireText(html, behavior, behavior)

  requireText(html, 'provenanceRefs', 'assistant answer keeps provenance fixture')
  requireText(html, 'WORKING', 'material working state')
  requireText(html, 'BLOCKED', 'material blocked state')
  requireText(html, 'WAITING_FOR_USER', 'material waiting-for-user state')
  requireText(html, 'COMPLETED', 'material completed state')
  requireText(html, 'DEPENDENCY_FAILURE', 'material dependency-failure state')

  assert.doesNotMatch(html, /assistant[^\n]{0,80}(?:grant|permission|authorize)/i, 'assistant must not imply authority grant')
  assert.doesNotMatch(html, /WorkUnit\s*\/\s*ActorRun\s+(?:nav|navigation|sidebar|root)/i, 'execution mechanics must not become root IA')
})

test('P-01 P8 stays disposable self-contained low-fi Evidence with responsive and accessible interactions', () => {
  assert.equal(existsSync(path(htmlPath)), true, 'P-01 functional P8 HTML must exist after operator-approved P7')
  const html = read(htmlPath)

  requireText(html, '@media', 'responsive CSS')
  requireText(html, 'role="dialog"', 'dialog semantics')
  requireText(html, 'aria-modal="true"', 'modal semantics')
  requireText(html, 'aria-live="polite"', 'status announcements')
  requireText(html, 'keydown', 'keyboard interaction')
  requireText(html, "event.key === 'Escape'", 'Escape closes focused overlay/panel')
  requireText(html, 'returnFocusTo', 'focus return')
  requireText(html, 'P8 WALKTHROUGH FIXTURES', 'explicit disposable-fixture legend')

  assert.doesNotMatch(html, /\bfetch\s*\(/, 'P8 must not perform network requests')
  assert.doesNotMatch(html, /XMLHttpRequest/, 'P8 must not perform network requests')
  assert.doesNotMatch(html, /localStorage|sessionStorage|indexedDB/i, 'P8 must not persist fixture state')
  assert.doesNotMatch(html, /<script[^>]+src=/i, 'P8 must be self-contained')
  assert.doesNotMatch(html, /<link[^>]+href=/i, 'P8 must be self-contained')
  assert.doesNotMatch(html, /P-01\s*=\s*LOCKED|P8\s*=\s*LOCKED/i, 'P8 candidate must not pre-authorize lock')
})

test('P-01 revised P8 inherits the locked GF-01 Project shell instead of inventing a standalone Builder navigation', () => {
  assert.equal(existsSync(path(htmlPath)), true, 'P-01 functional P8 HTML must exist')
  const html = read(htmlPath)

  for (const token of [
    'data-shell="single-adaptive-rail"',
    'class="topbar"',
    'id="workspaceCrumb"',
    'id="projectCrumb"',
    'id="projectRail"',
    'Back to Projects',
    'Project',
    'Product',
    'Capabilities',
    'Integrations',
    'Operate',
    'Activity',
    'Manage',
    'Settings',
    'GF-01 shell inherited',
  ]) requireText(html, token, `locked Project shell token ${token}`)

  const projectRail = html.match(/<section id="projectRail"[\s\S]*?<\/section>/)?.[0] ?? ''
  assert.ok(projectRail, 'P-01 must render the current Project rail')
  requireText(projectRail, '<button class="rail-btn" type="button" aria-current="page">Build</button>', 'Build must be current inside Project rail')
  for (const label of ['Data', 'Capabilities', 'Integrations', 'Agents', 'Brain', 'Releases', 'Activity', 'Settings']) {
    requireText(projectRail, `>${label}</button>`, `Project rail destination ${label}`)
  }
  assert.doesNotMatch(projectRail, />Overview<\/button>/, 'P-01 must not invent Overview inside the locked Project rail')
  assert.doesNotMatch(html, /class="global-nav"/, 'P-01 must not retain its standalone sidebar shell')
})
