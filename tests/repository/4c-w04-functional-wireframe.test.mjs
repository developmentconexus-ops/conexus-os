import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(new URL('../../', import.meta.url).pathname)
const path = p => resolve(root, p)
const read = p => readFileSync(path(p), 'utf8')
const htmlPath = 'docs/evidence/4c/w04-agent-catalog-functional-wireframe.html'

function requireText(text, needle, message = needle) {
  assert.ok(text.includes(needle), `W-04 P8 missing: ${message}`)
}

test('W-04 functional P8 makes the Workspace Agent catalog human-first and locally searchable over complete PRJ-22 disclosure', () => {
  assert.equal(existsSync(path(htmlPath)), true, 'W-04 functional P8 HTML must exist after operator-approved P7')
  const html = read(htmlPath)

  requireText(html.toLowerCase(), '<!doctype html>', 'HTML document')
  for (const token of [
    'W-04 P8 FUNCTIONAL LOW-FI CANDIDATE',
    'NOT LOCKED',
    'fixture-only',
    'Agent-first searchable catalog',
    'Agents',
    'Search agents',
    'Project',
    'Release presence',
    'Included in active Release',
    'No active Release',
    'Owning Project archived',
    'PRJ-22',
    'local search/filter over complete already-disclosed catalog',
  ]) requireText(html, token)

  for (const id of ['agent-search', 'project-filter', 'release-filter', 'agent-results', 'catalog-empty', 'catalog-count']) {
    requireText(html, `id="${id}"`, id)
  }

  for (const behavior of [
    'applyCatalogFilters',
    'clearCatalogFilters',
    'renderAgentCatalog',
    'buildProjectFilter',
  ]) requireText(html, behavior, behavior)

  requireText(html, 'workspaceAgentCatalog', 'explicit complete PRJ-22 fixture projection')
  requireText(html, 'agent.name', 'human Agent identity')
  requireText(html, 'agent.purpose', 'human Agent purpose')
  requireText(html, 'project.name', 'human owning Project context')
  requireText(html, 'activeReleaseId', 'exact Release-presence coordinate')

  assert.doesNotMatch(html, /frontend[- ]owned\s+(?:agent|project)\s+(?:name|label)/i, 'P8 must not create frontend presentation authority')
  assert.doesNotMatch(html, /project[- ]grouped\s+catalog/i, 'rejected Project-grouped hypothesis must not become P8')
  assert.doesNotMatch(html, /project[- ]first\s+master\/detail/i, 'rejected Project-first hypothesis must not become P8')
})

test('W-04 functional P8 preserves Project ownership and stops at the P-03 Agent-workspace boundary without source-read or runtime authority', () => {
  assert.equal(existsSync(path(htmlPath)), true, 'W-04 functional P8 HTML must exist after operator-approved P7')
  const html = read(htmlPath)

  for (const token of [
    'Open Agent',
    'P-03 boundary',
    'Project-owned Agent workspace',
    'Deeper Project-owned Agent work is outside this P8',
    'project.read != project.source.read',
    'Catalog visibility does not grant authoring or runtime authority',
  ]) requireText(html, token)

  for (const id of ['agent-workspace-dialog', 'workspace-agent-name', 'workspace-project-name', 'workspace-boundary-status']) {
    requireText(html, `id="${id}"`, id)
  }

  for (const behavior of ['openAgentWorkspaceBoundary', 'closeAgentWorkspaceBoundary', 'returnFocusTo']) {
    requireText(html, behavior, behavior)
  }

  assert.doesNotMatch(html, /PRJ-21/, 'W-04 P8 must not depend on Project source-read Agent detail')
  assert.doesNotMatch(html, /Create agent|Edit agent|Run agent/i, 'W-04 catalog must not create authoring/runtime actions')
  assert.doesNotMatch(html, /Agent active|Agent inactive|\bHealthy\b|\bRunning\b|\bOnline\b|\bReady\b|Deployed successfully/i, 'Release presence must not become invented runtime-health state')
  assert.doesNotMatch(html, /fleet\s+(?:manager|dashboard|status)/i, 'W-04 must not become a Workspace Agent fleet owner')
})

test('operator-approved W-04 P8 revision gives Agent cards enough information and hands off through Open Agent', () => {
  assert.equal(existsSync(path(htmlPath)), true, 'W-04 revised P8 HTML must exist')
  const html = read(htmlPath)

  for (const token of [
    'Information hierarchy revision',
    'Purpose',
    'Owning Project',
    'Authored revision',
    'Release references',
    'Agent workspace',
    'Open Agent',
    'Project-owned Agent workspace',
    'Instructions, tools, testing, verification and operations continue in the owning Project',
    'This catalog is for discovery; it is not the Agent editor',
  ]) requireText(html, token, token)

  for (const className of ['agent-summary', 'agent-meta', 'agent-workspace-hint']) {
    requireText(html, `class="${className}`, `revised card hierarchy class ${className}`)
  }

  for (const id of ['agent-workspace-dialog', 'workspace-agent-name', 'workspace-project-name', 'workspace-boundary-status']) {
    requireText(html, `id="${id}"`, id)
  }

  for (const behavior of ['openAgentWorkspaceBoundary', 'closeAgentWorkspaceBoundary']) {
    requireText(html, behavior, behavior)
  }

  assert.doesNotMatch(html, />\s*Open in Project\s*</, 'revised primary CTA must be Open Agent rather than a Project-navigation label')
  assert.doesNotMatch(html, /System prompt\s*<\/|Tools\s*<\/.*(?:button|textarea|input)/is, 'W-04 must not smuggle an Agent editor into the Workspace catalog')
})

test('W-04 P8 stays disposable low-fi Evidence with responsive and accessible fixture-only interactions', () => {
  assert.equal(existsSync(path(htmlPath)), true, 'W-04 functional P8 HTML must exist after operator-approved P7')
  const html = read(htmlPath)

  requireText(html, '@media', 'responsive CSS')
  requireText(html, 'role="dialog"', 'dialog semantics')
  requireText(html, 'aria-modal="true"', 'modal semantics')
  requireText(html, 'aria-live="polite"', 'status announcements')
  requireText(html, 'keydown', 'keyboard interaction')
  requireText(html, "event.key === 'Escape'", 'Escape closes boundary dialog')
  requireText(html, 'returnFocusTo', 'focus return')

  assert.doesNotMatch(html, /\bfetch\s*\(/, 'P8 must not perform network requests')
  assert.doesNotMatch(html, /XMLHttpRequest/, 'P8 must not perform network requests')
  assert.doesNotMatch(html, /localStorage|sessionStorage|indexedDB/i, 'P8 must not persist fixture state')
  assert.doesNotMatch(html, /<script[^>]+src=/i, 'P8 must be self-contained')
  assert.doesNotMatch(html, /<link[^>]+href=/i, 'P8 must be self-contained')
})
