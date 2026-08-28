import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'

const root = resolve(new URL('../../', import.meta.url).pathname)
const read = p => readFileSync(resolve(root, p), 'utf8')

function requireText(text, needle, message) {
  if (!text.includes(needle)) throw new Error(message)
}

function sliceBetween(text, startNeedle, endNeedle) {
  const start = text.indexOf(startNeedle)
  if (start < 0) return ''
  const end = text.indexOf(endNeedle, start)
  return text.slice(start, end < 0 ? undefined : end)
}

test('P-03 preserves the operator-accepted F24-F26 selected realization', () => {
  const evidence = read('docs/evidence/4c/p03-authority-feasibility-and-structural-hypotheses.md')
  for (const token of [
    '4C-F24 = OPERATOR ACCEPTED',
    '4C-F25 = OPERATOR ACCEPTED',
    '4C-F26 = OPERATOR ACCEPTED',
    'SELECTED REALIZATION',
    'P8 BLOCKED',
  ]) requireText(evidence, token, `P-03 accepted decision Evidence missing ${token}`)
})

test('F24 gives trigger administrators purpose-bound Agent summary discovery without source-detail widening', () => {
  const ledger = read('docs/product/operation-ledger.md')
  const permissions = read('docs/product/permission-contract.md')
  const wire = read('contracts/api/product/project-paths.yaml')
  const checker = read('scripts/check-wire-project-agent-catalog.mjs')

  const list = sliceBetween(wire, 'summary: ListProjectProductAgents', '\n  /api/control/projects/{projectId}/product-agents/{agentId}:')
  const detail = sliceBetween(wire, 'summary: GetProjectProductAgent', '\ncomponents:')
  for (const token of ['agent.trigger.manage', 'purpose-bound', 'summary']) {
    requireText(list, token, `F24 PRJ-20 alternate discovery route missing ${token}`)
  }
  if (detail.includes('agent.trigger.manage')) throw new Error('F24 must not broaden PRJ-21 source-detail disclosure')

  requireText(ledger, '4C-F24', 'F24 must be recorded in Product operation authority')
  requireText(permissions, 'PRJ-20', 'F24 Permission contract must name the bounded PRJ-20 consumer')
  requireText(permissions, 'does not grant PRJ-21', 'F24 must explicitly reject authored-detail widening')
  requireText(checker, 'agent.trigger.manage', 'F24 Project Agent checker must guard the alternate route')

  const ids = [...wire.matchAll(/x-conexus-4a-id: (PRJ-\d+)/g)].map(match => match[1])
  if (ids.length !== 24 || new Set(ids).size !== 24 || !ids.includes('PRJ-29')) {
    throw new Error(`F24 must preserve its bounded PRJ-20 route while the current split wire contains 24 Project IDs including PRJ-29; got ${ids.length}`)
  }
})

test('F25 gives eligible humans immutable Agent/action/time context without replacing the sealed subject', () => {
  const wire = read('contracts/api/product/par-paths.yaml')
  const checker = read('scripts/check-wire-par.mjs')

  const snapshot = sliceBetween(wire, '    ApprovalAgentSnapshot:\n', '    ApprovalRequest:\n')
  requireText(snapshot, 'required: [agentId, name, purpose, releaseId]', 'F25 Agent snapshot must be self-contained')
  for (const field of ['agentId:', 'name:', 'purpose:', 'releaseId:']) {
    requireText(snapshot, field, `F25 Agent snapshot missing ${field}`)
  }
  requireText(snapshot, 'request-time', 'F25 snapshot must be historical context, not current Agent authority')

  for (const schemaName of ['ApprovalRequest', 'ApprovalRequestSummary']) {
    const end = schemaName === 'ApprovalRequest' ? '    ApprovalRequestSummary:\n' : '    ApprovalRequestList:\n'
    const schema = sliceBetween(wire, `    ${schemaName}:\n`, end)
    for (const field of ['agent', 'actionSummary', 'requestedAt']) {
      requireText(schema, field, `F25 ${schemaName} missing ${field}`)
    }
    requireText(schema, 'expiresAt:', `F25 ${schemaName} missing optional expiresAt`)
  }

  for (const token of ['ApprovalAgentSnapshot', 'actionSummary', 'requestedAt', 'expiresAt']) {
    requireText(checker, token, `F25 PAR checker missing ${token}`)
  }
  for (const preserved of ['proposalDigest', 'SEALED_APPROVAL_PROPOSAL', 'expectedSubjectDigest']) {
    requireText(wire, preserved, `F25 must preserve sealed-subject law ${preserved}`)
  }
  for (const forbidden of ['mastraRunId:', 'toolCallId:', 'requestContext:']) {
    if (wire.includes(forbidden)) throw new Error(`F25 must not expose runtime mechanics ${forbidden}`)
  }
})

test('F26 makes AgentRun history temporally ordered and human-diagnosable without inventing actions', () => {
  const wire = read('contracts/api/product/par-paths.yaml')
  const checker = read('scripts/check-wire-par.mjs')
  const list = sliceBetween(wire, 'summary: ListAgentRuns', '\n  /api/runtime/projects/{projectId}/agent-runs/{agentRunId}:')
  const run = sliceBetween(wire, '    AgentRun:\n', '    AgentRunList:\n')
  const problem = sliceBetween(wire, '    AgentRunProblem:\n', '    AgentRun:\n')

  requireText(list, 'admittedAt DESC', 'F26 PAR-06 must define newest-admitted-first ordering')
  requireText(list, 'agentRunId DESC', 'F26 PAR-06 must define a stable tie-breaker')
  requireText(run, 'admittedAt', 'F26 AgentRun must expose owner admission time')
  requireText(run, 'settledAt:', 'F26 AgentRun must expose optional settlement time')
  requireText(run, "$ref: '#/components/schemas/AgentRunProblem'", 'F26 AgentRun must expose safe human problem context')
  requireText(problem, 'required: [summary]', 'F26 AgentRunProblem must require a human summary')
  for (const field of ['summary:', 'detail:', 'remediation:']) {
    requireText(problem, field, `F26 AgentRunProblem missing ${field}`)
  }
  for (const token of ['admittedAt', 'settledAt', 'AgentRunProblem', 'agentRunId DESC']) {
    requireText(checker, token, `F26 PAR checker missing ${token}`)
  }
  for (const forbidden of ['RetryAgentRun', 'ResumeAgentRun', 'MarkAgentRunSucceeded']) {
    if (wire.includes(forbidden)) throw new Error(`F26 must not invent unsupported action ${forbidden}`)
  }
})

test('P-03 preserves the REVISE history and closes the operator-approved lock with F27-F30 handoffs', () => {
  const evidence = read('docs/evidence/4c/p03-authority-feasibility-and-structural-hypotheses.md')
  const roadmap = read('docs/roadmap.md')
  const inventory = read('docs/evidence/4c/candidate-screen-surface-inventory.md')
  const phase = read('docs/phases/4c-frontend-interaction-and-authority-realization.md')
  const blueprint = read('docs/development/blueprint-harness-design.md')

  for (const token of [
    'P-03 — Product Agent work — LOCKED / OPERATOR APPROVED / P9-P10 CLOSED',
    'P8 operator walkthrough = REVISE',
    'F30 = OPERATOR APPROVED / 4A/4B GREEN',
    'P-01 Agent Studio delta = RE-LOCKED',
    'P-03 = LOCKED / P9 EXACT TRACE CLOSED / P10 CONSOLIDATED',
  ]) requireText(roadmap, token, `roadmap missing ${token}`)

  for (const token of [
    '## 14. Operator walkthrough REVISE — F27–F29',
    '4C-F27 — Published-App Agent interaction and decision continuity',
    '4C-F28 — Agent authoring inspectability and handoff',
    '4C-F29 — future Published-App Agent Experience Paved Road',
    '## 15. 4C-F30 — Agent Studio has no truthful structured authoring wire',
    '## 17. Operator LOCK closure',
    'P-01 Agent Studio delta = RE-LOCKED / OPERATOR APPROVED',
    'P-03 P8 = LOCKED / OPERATOR APPROVED',
  ]) requireText(evidence, token, `consolidated P-03 owner missing ${token}`)

  requireText(inventory, 'Accepted `4C-F27` binds the later PA-01 block', 'PA-01 inventory must absorb F27')
  requireText(phase, 'accepted `4C-F29` walkthrough finding', '4C owner must hand F29 to 4D')
  requireText(blueprint, 'Accepted `4C-F29` adds a concrete future Published-App Agent experience consumer', '4D owner must absorb F29')
})

test('F30 recompiles complete Agent definition and typed Change draft without direct Agent/runtime authority', () => {
  const evidence = read('docs/evidence/4c/p03-authority-feasibility-and-structural-hypotheses.md')
  const builder = read('contracts/api/product/builder-paths.yaml')
  const project = read('contracts/api/product/project-paths.yaml')
  const ledger = read('docs/product/operation-ledger.md')
  const permissions = read('docs/product/permission-contract.md')

  for (const token of [
    'No browser-reachable Product operation can submit an exact structured Agent edit',
    'Project definition read + Builder Change draft = SELECTED / OPERATOR APPROVED',
    'same candidate agent/v1',
    'BLD-18 GetChangeProductAgentDraft',
    'BLD-19 CreateChangeProductAgentDraft',
    'BLD-20 ReviseChangeProductAgentDraft',
    'expectedDraftRevision',
  ]) requireText(evidence, token, `F30 missing ${token}`)

  const createChange = sliceBetween(builder, 'summary: CreateChange', '/api/control/projects/{projectId}/changes/{changeId}:')
  requireText(createChange, 'required: [intent]', 'BLD-03 currently accepts only human intent')
  if (/agentDefinition|agentDraft|structuredAgent/i.test(createChange)) {
    throw new Error('F30 must not overload BLD-03 prose intent with structured Agent authority')
  }

  const definition = sliceBetween(project, '    ProductAgentDefinition:\n', '    ProjectProductAgentDetail:\n')
  for (const token of ['const: agent/v1', 'instructions:', 'modelPolicy:', 'tools:', 'brainContext:', 'memory:', 'interactions:', 'approvalPolicyRefs:', 'budgetPolicyRefs:', 'verificationRefs:', 'knownLimitations:']) {
    requireText(definition, token, `F30 ProductAgentDefinition missing ${token}`)
  }
  for (const forbidden of ['mastraAgentId:', 'storedAgentId:', 'credential:', 'extensions:']) {
    if (definition.includes(forbidden)) throw new Error(`F30 definition exposes forbidden mechanism/authority ${forbidden}`)
  }

  for (const token of ['x-conexus-4a-id: BLD-18', 'x-conexus-4a-id: BLD-19', 'x-conexus-4a-id: BLD-20', 'IdempotencyKey', 'EXPLICIT_REVISION', 'candidateSubjectDigest']) {
    requireText(builder, token, `F30 Builder wire missing ${token}`)
  }
  requireText(ledger, 'N_platform 122 → 125', 'F30 must close the exact operation census delta')
  requireText(permissions, 'creates no `agent.manage`', 'F30 must reject a parallel Agent-management Permission')
})
