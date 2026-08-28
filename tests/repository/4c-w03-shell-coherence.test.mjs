import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = fileURLToPath(new URL('../../', import.meta.url))
const path = value => resolve(root, value)
const htmlPath = 'docs/evidence/4c/w03-people-access-audit-functional-wireframe.html'
const read = value => readFileSync(path(value), 'utf8')
const requireText = (text, needle, message = needle) => {
  assert.ok(text.includes(needle), `W-03 shell correction missing: ${message}`)
}

test('W-03 uses the operator-relocked GF-01 Workspace shell', () => {
  assert.equal(existsSync(path(htmlPath)), true, 'W-03 functional HTML must exist')
  const html = read(htmlPath)

  for (const token of [
    'data-wireframe="w-03"', 'W-03 P8 FUNCTIONAL LOW-FI CANDIDATE', 'NOT LOCKED',
    'data-shell="single-adaptive-rail"', 'class="shell"', 'class="topbar"',
    'data-context-switcher="breadcrumb"', 'Current Workspace context', 'id="workspaceCrumb"',
    'id="workspaceMenu"', 'id="workspaceFilter"', 'class="account"',
    'class="rail"', 'id="rail"', 'Projects', 'Agents', 'Brain', 'Connections', 'People &amp; access', 'Audit',
    'id="menuToggle"', 'id="scrim"', 'data-drawer-open="false"',
    '@media (max-width: 760px)', '.shell[data-drawer-open="true"] .rail',
  ]) requireText(html, token)

  assert.equal((html.match(/<nav class="rail"/g) || []).length, 1, 'W-03 must expose one adaptive Workspace rail')
  assert.equal((html.match(/<header class="topbar"/g) || []).length, 1, 'W-03 must expose one GF-01 topbar')
  assert.doesNotMatch(html, /class="app"|class="sidebar"|\.sidebar\s*\{|\.app\s*\{/i, 'bespoke app/sidebar shell must be removed')
})

test('W-03 People/access and Audit routes remain wired to the original inner block', () => {
  const html = read(htmlPath)
  for (const token of [
    'id="nav-access"', 'id="nav-audit"', 'data-route="People &amp; access"', 'data-route="Audit"',
    "setDestination('access')", "setDestination('audit')", 'id="access-view"', 'id="audit-view"',
    'id="tab-people"', 'id="tab-areas"', 'id="people-list"', 'id="areas-list"',
    'id="person-panel"', 'id="area-panel"', 'id="audit-panel"',
    'id="add-member-dialog"', 'id="create-area-dialog"',
    'IAM-04', 'IAM-18', 'IAM-19', 'IAM-20', 'OBS-04', 'OBS-05',
    'DIRECT', 'AREA', 'server-owned effective access projection',
    'function openPersonPanel', 'function openAreaPanel', 'function openAuditRecord',
    'function addWorkspaceMember', 'function createArea', 'function applyAuditFilters',
  ]) requireText(html, token)
})

test('W-03 shell adds keyboard/context/drawer behavior without changing authority boundaries', () => {
  const html = read(htmlPath)
  for (const token of [
    'function closeWorkspaceMenu', 'function closeDrawer', 'function filterWorkspaceMenu',
    "el('menuToggle').addEventListener", "el('scrim').addEventListener", 'workspaceCrumb.addEventListener',
    'workspaceFilter.addEventListener', "event.key === 'Escape'", 'workspaceCrumb.focus()',
    'closeDrawer()', 'closeWorkspaceMenu()', 'Workspace context changed',
    'Exact destination reads remain server-owned',
  ]) requireText(html, token)
  assert.doesNotMatch(html, /UpdateWorkspace|UpdateProject|RenameWorkspace|RenameProject|SearchAudit/i, 'shell correction must not invent Product authority')
  assert.doesNotMatch(html, /fetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|indexedDB/i, 'P8 remains disposable local Evidence')
})

test('embedded W-03 shell-corrected script parses', () => {
  const html = read(htmlPath)
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1]
  assert.ok(script, 'W-03 inline script must exist')
  assert.doesNotThrow(() => new Function(script), 'W-03 inline JavaScript must parse')
})
