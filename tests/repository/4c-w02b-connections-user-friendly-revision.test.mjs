import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'

const root = resolve(new URL('../../', import.meta.url).pathname)
const path = p => resolve(root, p)
const read = p => readFileSync(path(p), 'utf8')

function requireText(text, needle, message) {
  if (!text.includes(needle)) throw new Error(message)
}

const htmlPath = 'docs/evidence/4c/w02b-connections-functional-wireframe.html'

test('revised W-02B P8 presents Connections as human-first cards with honest current test applicability', () => {
  const html = read(htmlPath)

  // First expected RED on the pre-revision P8.
  requireText(html, 'id="connectionGrid"', 'W-02B revised P8 must render a card grid rather than the original row-like list')

  for (const token of [
    'class="connection-grid"',
    'Sankhya API',
    'baseUrl',
    'Connection test',
    'Test connection',
    'Last test passed',
    'Last test failed',
    'Needs retest',
    'Not tested',
    'View problem',
    'Technical details',
    '<details',
    'markTestNeedsRetest',
    'connectionTest',
    'credentialGeneration',
    'diagnostic',
    'remediation',
  ]) requireText(html, token, `W-02B revised P8 missing user-facing/test-applicability evidence: ${token}`)

  const sankhyaStart = html.indexOf("id:'sankhya-api'")
  if (sankhyaStart < 0) throw new Error('W-02B revised P8 must use a Sankhya API ConnectorDefinition fixture')
  const nextConnector = html.indexOf("id:'", sankhyaStart + 20)
  const sankhyaSlice = html.slice(sankhyaStart, nextConnector < 0 ? undefined : nextConnector)
  for (const forbiddenDbField of ["host:{", "port:{", "service:{"]) {
    if (sankhyaSlice.includes(forbiddenDbField)) throw new Error(`Sankhya API fixture must not masquerade as Oracle/database configuration: ${forbiddenDbField}`)
  }

  for (const forbiddenClaim of ['>Active<', '>Inactive<', '>Connected<', '>Ready<', '>Healthy<', 'latestQualification', 'qualificationHistory']) {
    if (html.includes(forbiddenClaim)) throw new Error(`W-02B revised P8 invents forbidden Connection truth: ${forbiddenClaim}`)
  }
})

test('revised W-02B P8 makes failures actionable and invalidates old tests after configuration or credential change', () => {
  const html = read(htmlPath)

  for (const token of [
    "state:'FAILED'",
    "state:'PASSED'",
    "state:'NOT_TESTED'",
    "state:'NEEDS_RETEST'",
    'Authentication rejected',
    'Update credentials and test again',
    'function renderConnectionTest',
    'function openTestProblem',
    'function runQualification',
    'function markTestNeedsRetest',
    "detail.connectionTest = {state:'NEEDS_RETEST'",
    'credentialForm.reset()',
    "credentialInput.value = ''",
  ]) requireText(html, token, `W-02B revised P8 missing actionable failure/retest behavior: ${token}`)

  const technicalDetailsStart = html.indexOf('id="technicalDetails"')
  if (technicalDetailsStart < 0) throw new Error('W-02B revised P8 must place technical coordinates behind a collapsed Technical details disclosure')

  // Keep accepted architecture/proof coordinates available somewhere without making them the primary UX.
  for (const technicalToken of ['currentRevisionId', 'credentialConfigured', 'qualificationId', 'connectionRevisionId', 'evidenceRefs']) {
    requireText(html, technicalToken, `W-02B revised P8 must retain technical proof coordinate ${technicalToken}`)
  }

  for (const forbidden of ['fetch(', 'localStorage', 'sessionStorage']) {
    if (html.includes(forbidden)) throw new Error(`W-02B revised P8 must remain deterministic local Evidence and not use ${forbidden}`)
  }
})