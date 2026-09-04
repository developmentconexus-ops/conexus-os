import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = fileURLToPath(new URL('../../', import.meta.url))
const path = value => resolve(root, value)
const read = value => readFileSync(path(value), 'utf8')
const p01Path = 'docs/evidence/4c/p01-build-workspace-functional-wireframe.html'
const p03Path = 'docs/evidence/4c/p03-product-agent-functional-wireframe.html'
const p01 = read(p01Path)
const p03 = read(p03Path)

function requireText(text, needle, message = needle) {
  assert.ok(text.includes(needle), `reference delta missing: ${message}`)
}

function scripts(html) {
  return [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1])
}

test('P-01/P-03 F05 delta keeps one candidate per canonical HTML and the owner-read vocabulary', () => {
  assert.equal(existsSync(path(p01Path)), true)
  assert.equal(existsSync(path(p03Path)), true)
  for (const token of [
    'PRE11-F05', 'NOT LOCKED', 'owner-backed references', 'PRJ-29', 'PRJ-16/17', 'BRN-14',
    'LOADING', 'KNOWN_EMPTY', 'DENIED', 'NON_DISCLOSABLE', 'DEPENDENCY_FAILURE', 'READY',
    'DISCLOSED', 'DETAIL_WITHHELD', 'EXACT_UNRESOLVED', 'SERVER_INVALID',
  ]) requireText(p01, token, `P-01 ${token}`)
  for (const token of [
    'PRE11-F05', 'NOT LOCKED', 'Governed reference presentation', 'PRJ-29', 'PRJ-16/17', 'BRN-14',
    'LOADING', 'KNOWN_EMPTY', 'DENIED', 'NON_DISCLOSABLE', 'DEPENDENCY_FAILURE', 'READY',
    'DETAIL_WITHHELD', 'EXACT_UNRESOLVED', 'SERVER_INVALID',
  ]) requireText(p03, token, `P-03 ${token}`)
  for (const token of [
    'agent-reference-delta', 'agent-reference-owner-status', 'agent-model-policy-options',
    'agent-capability-options', 'agent-brain-options', 'agent-protected-refs', 'agent-reference-state',
    'agent-reference-delta-template', 'owner-model-policy', 'owner-capability', 'owner-brain',
    'authoringRef', 'server default', 'None configured; cannot be added in F1',
    'BLD-19 NEW blocked', '422 owner-invalid authoring reference', 'expectedDraftRevision',
  ]) requireText(p01, token, `P-01 ${token}`)
  for (const token of [
    'reference-presentation-delta', 'reference-presentation-state', 'reference-presentation-grid',
    'reference-protected-list', 'reference-presentation-scenario', 'Model policy · PRJ-29',
    'Capability binding · PRJ-16/17', 'Project Brain · BRN-14',
    'Details withheld by current authority', 'protected exact reference; no owner label is inferred',
  ]) requireText(p03, token, `P-03 ${token}`)
})

test('F05 P8 references stay bounded, self-contained and candidate-only', () => {
  for (const html of [p01, p03]) {
    assert.doesNotMatch(html, /\bfetch\s*\(/, 'P8 delta must not network')
    assert.doesNotMatch(html, /XMLHttpRequest|localStorage|sessionStorage|indexedDB/i, 'P8 delta must not persist fixtures')
    assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+href=/i, 'P8 delta must remain self-contained')
    assert.match(html, /NOT LOCKED/)
  }
  assert.match(p01, /project\.build[^\n]{0,180}(?:no invocation|generic read|owner-backed)/i)
  assert.match(p03, /P-03 remains read-only/)
  assert.doesNotMatch(p03, /<button[^>]*>\s*(Retry|Resume|Mark succeeded)\s*<\/button>/i)
})

test('P-01 F05 interaction scripts parse and retain NEW/EXISTING draft safety', () => {
  for (const script of scripts(p01)) assert.doesNotThrow(() => new Function(script), 'P-01 inline script must parse')
  for (const token of [
    "requestedOrigin==='NEW'", "origin==='EXISTING'", 'BLD-03', 'BLD-19', 'BLD-18', 'BLD-20',
    'Idempotency-Key', 'expectedAuthoredRevisionId', 'candidateSubjectDigest', 'server-issued candidate identity',
    'preserveOptionalRefs', 'Complete ProductAgentDefinition diff', 'Conflict', 'Reload before revising',
  ]) requireText(p01, token)
  assert.doesNotMatch(p01, /Create(?:Product)?Agent\s*\(|Update(?:Product)?Agent\s*\(|Delete(?:Product)?Agent\s*\(/)
  assert.doesNotMatch(p01, /MastraAgent|providerToolId|systemPromptSecret|apiKey/i)
})

test('P-03 F05 presentation remains read-only and separates owner detail from protected refs', () => {
  for (const script of scripts(p03)) assert.doesNotThrow(() => new Function(script), 'P-03 inline script must parse')
  for (const token of [
    'PRJ-29', 'policyRef', 'label', 'purpose', 'isDefault', 'samplingLimits',
    'capabilityId', 'operationId', 'regime', 'authoringRef', 'conceptRef', 'detailDisclosed',
    'policyRefs', 'approvalPolicyRefs', 'budgetPolicyRefs', 'verificationRefs',
    'P-03 remains read-only', 'no owner label is inferred',
  ]) requireText(p03, token)
  assert.doesNotMatch(p03, /function\s+(?:save|revise|update)AgentDefinition/i)
  assert.doesNotMatch(p03, /<input[^>]+id="agent-definition|<textarea[^>]+id="agent-definition/i)
})
