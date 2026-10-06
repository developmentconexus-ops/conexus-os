import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'

const { standingOf } = await import(hubModuleUrl('identity-access/sessions.js'))
const { lastOwnerStays, invitationState } = await import(hubModuleUrl('identity-access/roster.js'))
const { lastAdministratorStays } = await import(hubModuleUrl('identity-access/administrators.js'))
const { NO_ACCESS, locationOf } = await import(hubModuleUrl('identity-access/sign-in.js'))
const { slugFor } = await import(hubModuleUrl('identity-access/application-access.js'))
const { slugBase, parseApplicationSlug } = await import(hubModuleUrl('platform/application-slug.js'))

const A = '10000000-0000-4000-8000-000000000001'
const B = '10000000-0000-4000-8000-000000000002'

test('standingOf maps the columns the database computed', () => {
  assert.deepEqual(standingOf({ liveness: 'LIVE', recheck_due: false }), { kind: 'live', recheckDue: false })
  assert.deepEqual(standingOf({ liveness: 'LIVE', recheck_due: true }), { kind: 'live', recheckDue: true })
  assert.deepEqual(standingOf({ liveness: 'IDLE_EXPIRED', recheck_due: true }), { kind: 'ended', reason: 'IDLE_EXPIRED' })
  assert.deepEqual(standingOf({ liveness: 'ABSOLUTE_EXPIRED', recheck_due: false }), { kind: 'ended', reason: 'ABSOLUTE_EXPIRED' })
})

test('lastOwnerStays and lastAdministratorStays keep one active holder', () => {
  const both = [{ accountId: A, active: true }, { accountId: B, active: true }]
  const inactiveOther = [{ accountId: A, active: true }, { accountId: B, active: false }]
  for (const [owners, change, stays] of [
    [both, { accountId: A, role: 'member' }, true],
    [both, { accountId: A, role: null }, true],
    [inactiveOther, { accountId: A, role: 'member' }, false],
    [inactiveOther, { accountId: A, role: null }, false],
    [inactiveOther, { accountId: A, role: 'owner' }, true],
    [[{ accountId: A, active: true }], { accountId: B, role: null }, true],
  ]) assert.equal(lastOwnerStays(owners, change), stays, JSON.stringify(change))
  assert.equal(lastAdministratorStays(both, A), true)
  assert.equal(lastAdministratorStays(inactiveOther, A), false)
  assert.equal(lastAdministratorStays([{ accountId: A, active: true }], A), false)
  assert.equal(invitationState({ open: true }), 'PENDING')
  assert.equal(invitationState({ open: false }), 'EXPIRED')
})

test('locationOf and NO_ACCESS: each outcome has one address, and an application discloses one of its three reasons', () => {
  const origin = 'https://estoque-parado.apps.conexus.test'
  assert.equal(locationOf({ kind: 'HUB', session: 'x' }), '/')
  assert.equal(locationOf({ kind: 'APPLICATION', handoff: 'h'.repeat(43), origin }), `${origin}/__conexus/sign-in/complete?handoff=${'h'.repeat(43)}`)
  assert.equal(locationOf({ kind: 'REFUSED', venue: 'HUB', reason: 'ACCOUNT_INACTIVE' }), '/no-access?reason=ACCOUNT_INACTIVE')
  assert.equal(locationOf({ kind: 'REFUSED', venue: 'APPLICATION', reason: 'NOT_GRANTED', origin }), `${origin}/__conexus/no-access?reason=NOT_GRANTED`)
  assert.deepEqual(NO_ACCESS, {
    SIGN_IN_EXPIRED: { hub: 'SIGN_IN_EXPIRED', application: 'SIGN_IN_FAILED' },
    SIGN_IN_FAILED: { hub: 'SIGN_IN_FAILED', application: 'SIGN_IN_FAILED' },
    IDENTITY_EMAIL_NOT_VERIFIED: { hub: 'IDENTITY_EMAIL_NOT_VERIFIED', application: 'EMAIL_NOT_VERIFIED' },
    IDENTITY_NOT_ELIGIBLE: { hub: 'IDENTITY_NOT_ELIGIBLE', application: 'NOT_GRANTED' },
    ACCOUNT_INACTIVE: { hub: 'ACCOUNT_INACTIVE', application: 'NOT_GRANTED' },
    NOT_GRANTED: { hub: 'IDENTITY_NOT_ELIGIBLE', application: 'NOT_GRANTED' },
  })
})

test('the slug base ports the SQL rule exactly, and every suffix is a valid slug', () => {
  for (const [name, base] of [
    ['Estoque Parado', 'estoque-parado'], ['Ação Rápida', 'acao-rapida'], ['www', 'app-www'], ['123', 'app-123'], ['!!!', 'aplicativo'],
    ['Preview', 'app-preview'], ['preview-x', 'app-preview-x'], ['  --Olá, Mundo--  ', 'ola-mundo'], ['a'.repeat(50), 'a'.repeat(36)],
  ]) assert.equal(slugBase(name), base, name)
  assert.equal(slugFor('Estoque Parado', 1), 'estoque-parado')
  assert.equal(slugFor('Estoque Parado', 2), 'estoque-parado-2')
  assert.equal(slugFor('a'.repeat(50), 12), `${'a'.repeat(36)}-12`)
  assert.equal(slugFor('ab-'.repeat(13), 100), 'ab-ab-ab-ab-ab-ab-ab-ab-ab-ab-ab-ab-100')
  assert.equal(parseApplicationSlug(slugFor('x'.repeat(40), 100)), slugFor('x'.repeat(40), 100))
})
