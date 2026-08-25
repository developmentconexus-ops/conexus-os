import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(new URL('../../', import.meta.url).pathname)
const path = p => resolve(root, p)
const read = p => readFileSync(path(p), 'utf8')
const htmlPath = 'docs/evidence/4c/w03-people-access-audit-functional-wireframe.html'

function requireText(text, needle, message = needle) {
  assert.ok(text.includes(needle), `W-03 P8 missing: ${message}`)
}

test('W-03 functional P8 makes subject-first People/access operable without frontend-owned authorization', () => {
  assert.equal(existsSync(path(htmlPath)), true, 'W-03 functional P8 HTML must exist after operator-approved P7')
  const html = read(htmlPath)

  requireText(html.toLowerCase(), '<!doctype html>', 'HTML document')
  for (const token of [
    'W-03 P8 FUNCTIONAL LOW-FI CANDIDATE',
    'NOT LOCKED',
    'fixture-only',
    'People & access',
    'Audit',
    'People',
    'Areas',
    'Add member',
    'Create Area',
    'Direct',
    'Area · Tecnologia',
    'Contextual person access',
    'Contextual Area access',
    'server-owned effective access projection',
  ]) requireText(html, token)

  for (const id of [
    'people-view', 'areas-view', 'person-panel', 'area-panel',
    'add-member-dialog', 'create-area-dialog',
  ]) requireText(html, `id="${id}"`, id)

  for (const operation of [
    'IAM-04', 'IAM-05', 'IAM-06', 'IAM-07', 'IAM-08', 'IAM-09', 'IAM-10', 'IAM-11', 'IAM-12',
    'IAM-18', 'IAM-19', 'IAM-20', 'WS-04', 'WS-05', 'PRJ-01',
  ]) requireText(html, operation, operation)

  for (const behavior of [
    'openPersonPanel',
    'closeContextPanel',
    'openAddMemberDialog',
    'searchMembershipCandidates',
    'loadNextCandidatePage',
    'addWorkspaceMember',
    'removeWorkspaceMember',
    'grantDirectProject',
    'revokeDirectProject',
    'addPersonToArea',
    'removePersonFromArea',
    'openAreaPanel',
    'createArea',
    'grantAreaProject',
    'revokeAreaProject',
  ]) requireText(html, behavior, behavior)

  requireText(html, 'effectiveProjects:', 'explicit server fixture projection')
  requireText(html, 'serverProjectionAfter', 'write responses must switch explicit server-owned fixture projections')
  assert.doesNotMatch(html, /function\s+(?:derive|compute|calculate)EffectiveAccess\b/i, 'P8 must not derive effective authorization in the frontend')
  assert.doesNotMatch(html, /Keycloak\s+(?:roles?|groups?|organizations?)/i, 'P8 must not mirror Keycloak authorization')
  assert.doesNotMatch(html, /access\s+matrix/i, 'matrix-first must not become the primary P8')
})

test('W-03 functional P8 makes immutable Audit investigation operable and preserves filtered context', () => {
  assert.equal(existsSync(path(htmlPath)), true, 'W-03 functional P8 HTML must exist after operator-approved P7')
  const html = read(htmlPath)

  for (const token of [
    'Server-side filters before pagination',
    'From',
    'To',
    'Actor',
    'Action',
    'Apply filters',
    'Next page',
    'Append-time label',
    'Evidence',
    'OBS-04',
    'OBS-05',
  ]) requireText(html, token)

  for (const id of ['audit-view', 'audit-filter-form', 'audit-results', 'audit-panel', 'audit-period-error']) {
    requireText(html, `id="${id}"`, id)
  }

  for (const behavior of [
    'applyAuditFilters',
    'loadNextAuditPage',
    'openAuditRecord',
    'closeAuditPanel',
    'validateAuditPeriod',
    'renderAuditResults',
  ]) requireText(html, behavior, behavior)

  requireText(html, 'filteredAuditPages', 'server-filtered fixture result pages')
  requireText(html, 'appliedAuditContext', 'filtered context preserved while exact record detail is open')
  requireText(html, 'evidence://audit/', 'exact immutable Evidence reference')
  requireText(html, 'actorSnapshot', 'append-time actor presentation snapshot')
  requireText(html, 'subjectSnapshot', 'append-time subject presentation snapshot')

  assert.doesNotMatch(html, /(?:Edit|Retry|Undo|Fix)\s+(?:audit|record)/i, 'Audit detail must not expose mutation/retry/undo/fix authority')
  assert.doesNotMatch(html, /function\s+filterAuditLocally\b/i, 'browser page must not become the audit search universe')
})

test('W-03 P8 stays disposable low-fi Evidence with responsive and accessibility mechanics', () => {
  assert.equal(existsSync(path(htmlPath)), true, 'W-03 functional P8 HTML must exist after operator-approved P7')
  const html = read(htmlPath)

  requireText(html, '@media', 'responsive CSS')
  requireText(html, 'role="dialog"', 'dialog semantics')
  requireText(html, 'aria-modal="true"', 'modal semantics')
  requireText(html, 'aria-live="polite"', 'status announcements')
  requireText(html, 'keydown', 'keyboard interaction')
  requireText(html, "event.key === 'Escape'", 'Escape closes focused overlays')
  requireText(html, 'returnFocusTo', 'focus return')
  requireText(html, 'DIRECT and AREA are explicit text', 'non-color-only access provenance')

  assert.doesNotMatch(html, /\bfetch\s*\(/, 'P8 must not perform network requests')
  assert.doesNotMatch(html, /XMLHttpRequest/, 'P8 must not perform network requests')
  assert.doesNotMatch(html, /localStorage|sessionStorage|indexedDB/i, 'P8 must not persist fixture state')
  assert.doesNotMatch(html, /<script[^>]+src=/i, 'P8 must be self-contained')
  assert.doesNotMatch(html, /<link[^>]+href=/i, 'P8 must be self-contained')
})
