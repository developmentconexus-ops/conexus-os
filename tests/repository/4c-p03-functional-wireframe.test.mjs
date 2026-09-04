import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(new URL('../../', import.meta.url).pathname)
const path = p => resolve(root, p)
const read = p => readFileSync(path(p), 'utf8')
const htmlPath = 'docs/evidence/4c/p03-product-agent-functional-wireframe.html'

function requireText(text, needle, message = needle) {
  assert.ok(text.includes(needle), `P-03 P8 missing: ${message}`)
}

test('P-03 P8 realizes the approved Project Agent workbench without backend-shaped navigation', () => {
  assert.equal(existsSync(path(htmlPath)), true, 'P-03 functional P8 HTML must exist after P7 approval')
  const html = read(htmlPath)
  for (const token of [
    'P-03 P8 FUNCTIONAL LOW-FI CANDIDATE', 'NOT LOCKED', 'fixture-only', 'GF-01 shell inherited',
    'Project Agent workbench', 'Needs your decision', 'Agents', 'Overview', 'Definition', 'Automations', 'Runs',
    'New Agent', 'P-01 Build boundary', 'owner-specific decisions',
  ]) requireText(html, token)
  for (const id of [
    'route-agents', 'agents-landing', 'approval-queue', 'agent-search', 'agent-collection',
    'agent-workspace', 'agent-workspace-name', 'agent-tab-overview', 'agent-tab-definition', 'agent-tab-automations', 'agent-tab-runs',
  ]) requireText(html, `id="${id}"`, id)
  for (const behavior of ['renderAgentsLanding', 'openAgentWorkspace', 'closeAgentWorkspace', 'selectAgentTab', 'filterAgents']) {
    requireText(html, behavior, behavior)
  }
  assert.doesNotMatch(html, />\s*(Triggers|Approval Requests|Agent Runs)\s*<\/button>/i, 'PAR nouns must not become sibling root navigation')
  assert.doesNotMatch(html, /global Approval Center|fleet dashboard|fleet manager/i, 'P8 must not create rejected global/fleet owners')
})

test('P-03 Agent catalog uses responsive whole-card targets instead of dense rows', () => {
  const html=read(htmlPath)
  for (const token of [
    'class="agent-card"','aria-label="Open ${esc(agent.definition.name)}"','class="card-open">Open Agent →',
    '.agent-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))',
    '@media(max-width:1100px){.agent-list{grid-template-columns:repeat(2,minmax(0,1fr))',
    '@media(max-width:620px){.agent-list,.definition-grid{grid-template-columns:1fr}',
  ]) requireText(html,token)
  assert.doesNotMatch(html,/<article class="agent-item"/,'Agent collection must not fall back to row-shaped cards')
})

test('P-03 Agent detail exposes the complete authored definition and hands exact context to the single P-01 Agent Studio authoring path', () => {
  const html=read(htmlPath)
  for (const token of [
    'Definition','Exact authored agent/v1 configuration','Edit Agent','One authoring path',
    'Behavior','Model policy','Tools this Agent can use','Context','Memory & interactions','Governance & verification',
    'Schema','Policy ref','Temperature','Top P','Max output','Brain refs','Known limitations','Use policy default',
    'Why this Agent uses it','Inspect capability contract','Capability contract from separate governed inspection truth',
    'Definition ≠ active Release ≠ runtime health','F30 complete ProductAgentDefinition','Edit Agent → same canonical P-01 Agent Studio',
    'exact Project + agentId + authoredRevisionId + activeReleaseId preserved','BLD-18 · BLD-19 · BLD-20',
    'p01-build-workspace-functional-wireframe.html','agent-studio','agentId','origin','EXISTING','NEW',
  ]) requireText(html,token)
  for (const id of ['agent-tab-definition','agent-panel-definition','agent-definition-heading','agent-definition-summary','change-agent','overview-change-agent']) requireText(html,`id="${id}"`,id)
  for (const behavior of ['renderAgentDefinition','handoffToBuild','URLSearchParams']) requireText(html,behavior,behavior)
  requireText(html,'class="definition-grid"','definition uses a scannable responsive grid')
  requireText(html,"['overview','definition','automations','runs']",'Definition is a first-class Agent workspace tab')
  requireText(html,"definition:{schemaVersion:'agent/v1'",'each Agent fixture carries the complete canonical definition')
  requireText(html,"agent.definition.name",'catalog projects human identity from the canonical definition')
  assert.doesNotMatch(html,/agentName:agent\.name|purpose:agent\.purpose/,'handoff must carry coordinates, not trust duplicated authored content in the URL')
  assert.doesNotMatch(html,/<(?:input|textarea|select)[^>]*id="agent-definition/i,'P-03 definition inspection must not become a second editor')
  assert.doesNotMatch(html,/function\s+(?:save|revise|update)AgentDefinition/i,'P-03 must not own Agent authoring mutation')
})

test('P-03 Automations keeps trigger creation, revision, enable and narrowing disable distinct', () => {
  const html = read(htmlPath)
  for (const token of [
    'Schedule automation', 'Time zone', 'Create disabled', 'Save new revision', 'Enable automation', 'Disable automation',
    'Archive does not stop automations', 'stale revision', 'Idempotency-Key', 'If-Match', 'expectedTriggerRevisionId',
    'PAR-11', 'PAR-12', 'PAR-13', 'PAR-14', 'PAR-15', 'PAR-16',
  ]) requireText(html, token)
  for (const id of [
    'automation-list', 'new-automation', 'automation-panel', 'automation-form', 'automation-cron',
    'automation-time-zone', 'automation-create', 'automation-save-revision', 'automation-enable', 'automation-disable',
  ]) requireText(html, `id="${id}"`, id)
  for (const behavior of [
    'renderAutomations', 'openAutomationPanel', 'closeAutomationPanel', 'createAutomation',
    'reviseAutomation', 'enableAutomation', 'disableAutomation', 'applyArchivedProjectState',
  ]) requireText(html, behavior, behavior)
  assert.doesNotMatch(html, /triggerKind\s*:\s*['"](?:EVENT|WEBHOOK)/i, 'P8 must admit SCHEDULE only')
})

test('P-03 Runs preserves owner time/order/problem truth and offers investigation, not runtime mutation', () => {
  const html = read(htmlPath)
  for (const token of [
    'Newest available first', 'admittedAt DESC', 'agentRunId DESC', 'Settled', 'Problem', 'Remediation',
    'COMPLETED does not mean every external effect succeeded', 'Continue to Activity', 'P-04 boundary','Evidence','evidenceRefs','renderStructured',
    'PAR-06', 'PAR-07', 'INTERACTIVE', 'HEADLESS', 'SCHEDULE',
  ]) requireText(html, token)
  for (const id of ['run-list', 'run-detail', 'run-detail-body', 'run-state-filter']) requireText(html, `id="${id}"`, id)
  for (const behavior of ['renderRuns', 'openRunDetail', 'closeRunDetail', 'filterRuns']) requireText(html, behavior, behavior)
  assert.doesNotMatch(html, /<button[^>]*>\s*(Retry|Resume|Mark succeeded)\s*<\/button>/i, 'P8 must not invent AgentRun mutation')
  assert.doesNotMatch(html, /mastraRunId|toolCallId|threadId/i, 'runtime framework identity must remain private')
})

test('P-03 keeps definition, runs, triggers and authoring access independently disclosed', () => {
  const html=read(htmlPath)
  for (const token of ['Independent access walkthrough','Permission composition','SOURCE_ONLY','OPERATE_ONLY','TRIGGER_ONLY','BUILD_ONLY','project.source.read, project.read, agent.trigger.manage and project.build remain independent.','applyAccessScenario']) requireText(html,token)
  requireText(html,'id="access-scenario"','independent permission scenario control')
})

test('P-03 presents paged owner collections without claiming a loaded page is the whole result set', () => {
  const html=read(htmlPath)
  for (const token of ['nextPageToken','More appear here when available','Filter current results','All decisions loaded','All automations loaded','All runs loaded']) requireText(html,token)
  for (const id of ['approval-load-more','automation-load-more','run-load-more']) requireText(html,`id="${id}"`,id)
})

test('P-03 exact approval remains readable, sealed and non-actionable after owner rejection of eligibility/state', () => {
  const html = read(htmlPath)
  for (const token of [
    'Allow once', 'Deny', 'Exact proposed effect', 'Action summary', 'Requested', 'Expires',
    'expectedSubjectDigest', 'proposalDigest', 'Changed proposal requires a new request',
    'STALE', 'EXPIRED', 'Eligibility revoked', 'reviewed subject remains visible',
    'PAR-08', 'PAR-09', 'PAR-10', 'ApprovalAgentSnapshot',
  ]) requireText(html, token)
  for (const id of [
    'approval-detail', 'approval-detail-body', 'approval-state-badge', 'approval-allow', 'approval-deny', 'approval-status',
  ]) requireText(html, `id="${id}"`, id)
  for (const behavior of [
    'renderApprovalQueue', 'openApprovalDetail', 'closeApprovalDetail', 'decideApproval', 'setApprovalNonActionable',
  ]) requireText(html, behavior, behavior)
  assert.doesNotMatch(html, /Edit (?:proposal|action)|Modify (?:proposal|action)/i, 'P8 must not allow editing a sealed subject')
})

test('P-03 P8 exposes material truth states and remains self-contained, responsive and accessible', () => {
  const html = read(htmlPath)
  for (const token of [
    'loading != empty != denied/non-disclosable != failed', 'actionable != stale != expired != eligibility revoked',
    'enabled != healthy != running', 'active Release != runtime health',
    'Review controls', '@media', 'prefers-reduced-motion', 'aria-live="polite"', 'role="dialog"',
    'aria-modal="true"', 'keydown', "event.key === 'Escape'", 'returnFocusTo',
  ]) requireText(html, token)
  for (const id of ['review-controls', 'agent-scenario', 'approval-scenario', 'project-archive-scenario', 'scenario-status']) {
    requireText(html, `id="${id}"`, id)
  }
  for (const behavior of ['applyAgentScenario', 'applyApprovalScenario', 'applyProjectArchiveScenario']) requireText(html, behavior, behavior)
  assert.doesNotMatch(html, /\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|indexedDB/i, 'P8 must not network or persist fixture state')
  assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+href=/i, 'P8 must be self-contained')
  assert.doesNotMatch(html, /LOCKED \/ OPERATOR APPROVED/i, 'candidate must not claim operator lock')
})

test('P-03 proof chrome stays closed and outside the ordinary Product surface', () => {
  const html = read(htmlPath)
  const reviewStart = html.indexOf('<details id="review-controls"')
  const scriptStart = html.indexOf('<script>')
  assert.ok(reviewStart > 0 && scriptStart > reviewStart, 'review controls must follow Product UI and precede script')
  const product = html.slice(0, reviewStart)
  const review = html.slice(reviewStart, scriptStart)
  assert.match(review, /<details id="review-controls"(?![^>]*\bopen\b)[^>]*>/i, 'review controls closed by default')
  for (const marker of [
    'P-03 P8 FUNCTIONAL LOW-FI CANDIDATE', 'fixture-only', 'PRJ-20', 'PRJ-21', 'PAR-06', 'PAR-07',
    'PAR-08', 'PAR-09', 'PAR-10', 'PAR-11', 'PAR-12', 'PAR-13', 'PAR-14', 'PAR-15', 'PAR-16',
    'Idempotency-Key', 'If-Match', 'expectedTriggerRevisionId', 'expectedSubjectDigest', 'P-01 Build boundary', 'P-04 boundary',
  ]) {
    assert.doesNotMatch(product, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), `Product surface must not expose proof marker ${marker}`)
    requireText(review, marker, `review marker ${marker}`)
  }
})

test('P-03 inline interaction script parses before operator walkthrough', () => {
  const html = read(htmlPath)
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1]
  assert.ok(script, 'P-03 P8 must include one self-contained inline interaction script')
  assert.doesNotThrow(() => new Function(script), 'P-03 inline JavaScript must parse')
})
