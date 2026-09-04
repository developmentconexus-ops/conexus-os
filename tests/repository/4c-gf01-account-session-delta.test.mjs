import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = fileURLToPath(new URL('../../', import.meta.url))
const path = value => resolve(root, value)
const htmlPath = 'docs/evidence/4c/gf01-global-frame-wireframe.html'
const read = value => readFileSync(path(value), 'utf8')
const requireText = (text, needle, message = needle) => {
  assert.ok(text.includes(needle), `GF-01 Account/session delta missing: ${message}`)
}

test('GF-01 P8 Account/session delta remains bounded to the canonical shell', () => {
  assert.equal(existsSync(path(htmlPath)), true, 'GF-01 canonical HTML must exist')
  const html = read(htmlPath)

  for (const token of [
    'data-wireframe="gf-01"', 'CANDIDATE · NOT LOCKED',
    'data-context-switcher="breadcrumb"', 'data-workspace-menu', 'data-assistant-seam="contextual"',
    'data-project-rail-context', 'data-project-collection-fixture',
    'aria-label="Workspace navigation"', 'aria-label="Project navigation"',
    'Back to Projects', 'Ask Conexus', 'P8 Evidence',
  ]) requireText(html, token)

  assert.equal((html.match(/<nav class="rail"/g) || []).length, 1, 'Account delta must not create a second rail')
  assert.equal((html.match(/data-assistant-seam="contextual"/g) || []).length, 1, 'Account delta must preserve one assistant seam')
  assert.equal((html.match(/id="currentNavigation"/g) || []).length, 1, 'Account delta must preserve one current navigation landmark')
})

test('Account menu projects IAM-01 identity and admits only IAM-02 session exit', () => {
  const html = read(htmlPath)
  const accountStart = html.indexOf('<div class="account-wrap">')
  const accountEnd = html.indexOf('</header>', accountStart)
  assert.ok(accountStart >= 0 && accountEnd > accountStart, 'Account region must be bounded in the topbar')
  const account = html.slice(accountStart, accountEnd)

  for (const token of [
    'id="accountToggle"', 'aria-controls="accountMenu"', 'aria-expanded="false"', 'aria-haspopup="true"',
    'id="accountMenu"', 'aria-labelledby="accountToggle"', 'id="accountIdentity"', 'tabindex="-1"',
    'id="accountDisplayName"', 'id="accountEmail"', 'id="accountTechnical"', 'id="accountId"',
    'Sign out of Conexus', 'id="accountSignOut"', 'id="accountRetry"',
    'IAM-01 AccountSummary', 'IAM-02 EndSession', 'IAM-02 DELETE /api/session',
  ]) requireText(account + html, token)

  requireText(html, 'const accountSummary = {', 'server-projection fixture')
  for (const field of ['accountId:', 'displayName:', 'email:']) requireText(html, field, `AccountSummary field ${field}`)
  for (const field of ['accountSummary.displayName', 'accountSummary.email', 'accountSummary.accountId']) {
    requireText(html, field, `renderAccountSummary must derive ${field}`)
  }
  assert.doesNotMatch(account, /Account profile|Account settings|role editor/i, 'Account menu must not become a profile/settings surface')
  assert.doesNotMatch(account, /account\.(?:read|manage)/i, 'AccountSummary does not create an account Permission')
})

test('Account/session failure and recovery states remain truthful and operable', () => {
  const html = read(htmlPath)
  for (const token of [
    'data-account-scenario="SIGNOUT_204"', 'data-account-scenario="SIGNOUT_401"', 'data-account-scenario="SIGNOUT_DEPENDENCY_FAILURE"',
    'data-account-scenario="IAM01_SESSION_EXPIRED"', 'id="accountStatus"', 'aria-live="polite"',
    'id="authenticationRequired"', 'AUTHENTICATION_REQUIRED', 'id="authenticationReentry"',
    'function showAuthenticationRequired', 'function endSession', 'function restoreSessionFixture',
    'Your Conexus session has ended.', 'Your Conexus session was already expired.',
    'Unable to confirm sign out.', 'Retry sign out',
  ]) requireText(html, token)

  const endSession = html.match(/function endSession\(\)\{([\s\S]*?)\n  \}/)?.[1] || ''
  assert.match(endSession, /SIGNOUT_204[\s\S]*showAuthenticationRequired/)
  assert.match(endSession, /SIGNOUT_401[\s\S]*showAuthenticationRequired/)
  assert.match(endSession, /DEPENDENCY_FAILURE/)
  assert.doesNotMatch(endSession, /location\.reload|fetch\s*\(/i, 'fixture sign-out must not hide an ambiguous outcome with navigation/network code')
})

test('Account menu has keyboard, click-away and narrow-sheet structure without changing shell semantics', () => {
  const html = read(htmlPath)
  for (const token of [
    'function closeAccountMenu', 'function openAccountMenu', 'accountIdentity.focus()',
    'accountToggle.focus()', 'accountMenu.contains(document.activeElement)',
    "e.key==='Escape'", "!e.target.closest('.account-wrap')",
    '@media (max-width:760px)', 'position:fixed;top:calc(var(--topbar) + 8px)',
    'left:8px;right:8px;width:auto', 'account-menu',
  ]) requireText(html, token)

  const openAccount = html.match(/function openAccountMenu\(\)\{([\s\S]*?)\n  \}/)?.[1] || ''
  assert.doesNotMatch(openAccount, /openAssistant|BLD-16/, 'opening Account must not invoke the contextual assistant operation')
  assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+href=|\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|indexedDB/i, 'P8 must remain self-contained fixture Evidence')
  assert.doesNotMatch(html, /<button[^>]*>\s*(?:Profile|Account settings|Keycloak logout|Role editor)\s*<\/button>/i, 'Account menu must not invent forbidden commands')
})

test('embedded GF-01 Account/session candidate script parses', () => {
  const html = read(htmlPath)
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1]
  assert.ok(script, 'GF-01 inline interaction script must exist')
  assert.doesNotThrow(() => new Function(script), 'GF-01 inline JavaScript must parse')
})
