import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'
import { test } from 'node:test'

const root = fileURLToPath(new URL('../../', import.meta.url))
const path = relative => resolve(root, relative)
const htmlPath = 'docs/evidence/4c/t01-trusted-setup-functional-wireframe.html'
const read = relative => readFileSync(path(relative), 'utf8')

function requireText(text, needle, message = needle) {
  assert.ok(text.includes(needle), 'T-01 P8 missing: ' + message)
}

test('T-01 P8 realizes Account-first setup with explicit normal re-entry and first Workspace handoff', () => {
  assert.equal(existsSync(path(htmlPath)), true, 'T-01 functional P8 HTML must exist after operator-approved P7')
  const html = read(htmlPath)

  for (const token of [
    '<!doctype html>',
    'data-wireframe="t-01"',
    'T-01 P8 FUNCTIONAL LOW-FI CANDIDATE',
    'NOT LOCKED',
    'fixture-only',
    'Set up this Conexus instance',
    'Step 1 — Configure your Account',
    'Account established',
    'Sign in to continue',
    'Create your first Workspace',
    'Workspace access confirmed',
    'Continue to Projects',
    'GF-01 boundary',
    'no disclosed Workspaces yet',
    'Open trusted Account provisioning',
    'W-03 / P-05 candidate selection',
  ]) requireText(html, token)

  for (const id of [
    'trusted-setup-root',
    'account-stage',
    'bootstrap-account-form',
    'account-display-name',
    'account-email',
    'reentry-stage',
    'normal-reentry',
    'workspace-stage',
    'workspace-form',
    'workspace-name',
    'ready-stage',
    'projects-handoff',
    'trusted-stage',
    'trusted-account-form',
    'trusted-external-subject',
    'trusted-display-name',
    'trusted-account-submit',
  ]) requireText(html, 'id="' + id + '"', id)

  for (const behavior of [
    'submitBootstrapAccount',
    'completeBootstrapAccount',
    'continueNormalReentry',
    'submitWorkspace',
    'completeWorkspace',
    'retrySameIntake',
    'openTrustedProvisioning',
    'submitTrustedProvisioning',
    'continueToProjects',
    'attemptOldBootstrapWorkspace',
    'applyScenario',
    'render',
  ]) requireText(html, behavior, behavior)
})

test('T-01 P8 keeps bootstrap authority and ordinary provisioning distinct', () => {
  const html = read(htmlPath)
  for (const token of [
    'IAM-03 ProvisionAccount',
    'IAM-01 GetControlPlaneAccessContext',
    'WS-01 CreateWorkspace',
    'TRUSTED_BOOTSTRAP_CONTEXT',
    'server-derived',
    'platform_operator',
    'Idempotency-Key',
    'AccountSummary',
    'creatorAccountId',
    'initialAccessEstablished=true',
    'old bootstrap context cannot call WS-01',
    'Membership and application access remain separate',
    'data-operation="IAM-03"',
    'data-operation="IAM-01"',
    'data-operation="WS-01"',
  ]) requireText(html, token, token)

  const bootstrapForm = html.match(/<form id="bootstrap-account-form"[\s\S]*?<\/form>/)?.[0] ?? ''
  assert.doesNotMatch(bootstrapForm, /externalSubject|issuer|provider|subject/i, 'bootstrap form must not accept provider identity input')
  assert.match(html, /<input[^>]+name="externalSubject"/, 'ordinary trusted provisioning must accept exact external subject')
  assert.doesNotMatch(html, /(?:public\s+signup|default\s+(?:shared\s+)?password|tenant\s+onboarding)/i, 'T-01 must not expose commercial or reusable-credential onboarding')
  assert.doesNotMatch(html, /Keycloak\s+(?:roles?|groups?|organizations?)/i, 'T-01 must not mirror provider authorization')
})

test('T-01 P8 exposes every material first-access, recovery and provisioning state', () => {
  const html = read(htmlPath)
  for (const state of [
    'AUTHENTICATION_REQUIRED',
    'IDENTITY_NOT_ELIGIBLE',
    'BOOTSTRAP_IN_PROGRESS',
    'ACCOUNT_INPUT_INVALID',
    'ACCOUNT_CONFLICT_OR_AMBIGUOUS_INTAKE',
    'DEPENDENCY_FAILURE',
    'ACCOUNT_ESTABLISHED_REENTRY_REQUIRED',
    'BOOTSTRAP_SEALED',
    'SESSION_ESTABLISHED',
    'NO_WORKSPACE',
    'WORKSPACE_INPUT_INVALID',
    'WORKSPACE_CONFLICT_OR_AMBIGUOUS_INTAKE',
    'WORKSPACE_ESTABLISHED',
  ]) requireText(html, '<option>' + state + '</option>', state)

  for (const token of [
    'same Idempotency-Key',
    'ambiguous result never claims success',
    'known-empty Workspace collection',
    'not treated as an empty Workspace',
    'No Account existence detail is disclosed',
    'Bootstrap access sealed',
    'Initial access confirmed',
  ]) requireText(html, token)
})

test('T-01 P8 keeps Product UI separate from closed review/proof controls', () => {
  const html = read(htmlPath)
  const reviewStart = html.indexOf('<details class="review-controls"')
  const scriptStart = html.indexOf('<script>')
  assert.ok(reviewStart > 0 && scriptStart > reviewStart, 'review controls must follow Product UI and precede script')
  assert.match(html.slice(reviewStart, scriptStart), /<details[^>]*id="review-controls"(?![^>]*\bopen\b)/i, 'review controls must be closed by default')

  const product = html.slice(0, reviewStart)
  const review = html.slice(reviewStart, scriptStart)
  for (const proofMarker of [
    'TRUSTED_BOOTSTRAP_CONTEXT',
    'IAM-03 ProvisionAccount',
    'IAM-01 GetControlPlaneAccessContext',
    'WS-01 CreateWorkspace',
    'initialAccessEstablished=true',
  ]) {
    assert.equal(product.includes(proofMarker), false, 'Product UI must not expose proof marker ' + proofMarker)
    requireText(review, proofMarker, 'review marker ' + proofMarker)
  }
})

test('T-01 P8 remains disposable, responsive, accessible and self-contained', () => {
  const html = read(htmlPath)
  for (const token of [
    '@media (max-width: 700px)',
    '@media (prefers-reduced-motion: reduce)',
    'aria-live="polite"',
    'focus-visible',
    'event.key === \'Escape\'',
    'P8 WALKTHROUGH FIXTURES',
    'role="status"',
  ]) requireText(html, token)

  assert.doesNotMatch(html, /\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|indexedDB/i, 'P8 must not network or persist fixture state')
  assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+href=/i, 'P8 must be self-contained')
})

test('T-01 inline interaction script parses', () => {
  const html = read(htmlPath)
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  assert.equal(scripts.length, 1, 'T-01 P8 must contain exactly one inline interaction script')
  assert.doesNotThrow(() => new Function(scripts[0][1]), 'T-01 inline JavaScript must parse')
})
