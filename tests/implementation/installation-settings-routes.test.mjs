import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'

const built = hubModuleUrl
const { createHttpApp } = await import(built('http/app.js'))
const { registerInstallationRoutes } = await import(built('identity-access/installation-routes.js'))

const origin = 'https://hub.test'
const admin = '11111111-1111-4111-8111-111111111111'
const plain = '22222222-2222-4222-8222-222222222222'

// A minimal stand-in for InstallationAdministration: one Set of open administrators, tenures kept
// only for `list`, and the same LAST_INSTALLATION_ADMINISTRATOR refusal shape the real functions raise.
const createFakeAdministration = (initial = [admin]) => {
  const open = new Map(initial.map((accountId) => [accountId, { grantedVia: 'OPERATOR_BOOTSTRAP', grantedBy: null, grantedAt: new Date('2026-09-20T00:00:00.000Z') }]))
  const byEmail = new Map()
  const refuse = (code, message) => { const error = new Error(message); error.code = code; throw error }
  return {
    accounts: byEmail,
    isInstallationAdministrator: async (accountId) => open.has(accountId),
    list: async (actor) => {
      if (!open.has(actor)) refuse('42501', 'NOT_ADMITTED')
      return [...open.entries()].map(([accountId, tenure]) => ({ accountId, displayName: byEmail.get(accountId)?.displayName ?? accountId, email: byEmail.get(accountId)?.email ?? null, ...tenure }))
    },
    grantByEmail: async ({ actor, email }) => {
      if (!open.has(actor)) refuse('42501', 'NOT_ADMITTED')
      const matches = [...byEmail.entries()].filter(([, row]) => row.email.toLowerCase().trim() === email.toLowerCase().trim())
      if (matches.length === 0) refuse('P0002', 'ACCOUNT_NOT_FOUND')
      if (matches.length > 1) refuse('P0003', 'ACCOUNT_EMAIL_AMBIGUOUS')
      const [accountId] = matches[0]
      open.set(accountId, { grantedVia: 'ADMINISTRATOR', grantedBy: { accountId: actor, displayName: byEmail.get(actor)?.displayName ?? actor }, grantedAt: new Date() })
      return accountId
    },
    revoke: async ({ actor, account }) => {
      if (!open.has(actor)) refuse('42501', 'NOT_ADMITTED')
      if (open.has(account) && open.size === 1) refuse('42501', 'LAST_INSTALLATION_ADMINISTRATOR')
      open.delete(account)
    },
    grant: async () => { throw new Error('unused in this fixture') },
  }
}

const buildApp = async (t, { administration = createFakeAdministration() } = {}) => {
  const resolveCurrentSession = async (request) => {
    const accountId = request.cookies['__Host-conexus_session']
    return accountId ? { account: { accountId, displayName: accountId }, issuer: 'https://issuer.test', subject: accountId } : null
  }
  const app = await createHttpApp({
    registerRoutes: async (instance) => {
      await registerInstallationRoutes(instance, { origin, resolveCurrentSession, installationAdministration: administration })
      return []
    },
    staticRoot: null,
  })
  t.after(() => app.close())
  const as = (accountId) => async (method, url, payload) => {
    const response = await app.inject({
      method, url, ...(payload !== undefined ? { payload } : {}),
      headers: { origin, 'x-conexus-csrf': 'csrf-1', ...(payload !== undefined ? { 'content-type': 'application/json' } : {}) },
      cookies: accountId ? { '__Host-conexus_session': accountId, '__Host-conexus_csrf': 'csrf-1' } : {},
    })
    return { status: response.statusCode, body: response.body ? response.json() : null }
  }
  return { app, as, administration }
}

test('every route refuses an unauthenticated caller', async (t) => {
  const { as, app } = await buildApp(t)
  const anonymous = as(undefined)
  // GET carries no CSRF check, so the admit() path reaches the session check and answers 401.
  const reads = ['/api/control/installation', '/api/control/installation/administrators']
  for (const url of reads) assert.equal((await anonymous('GET', url)).status, 401, url)

  // A write with no session and no CSRF cookie fails the authenticity check first: a forged write
  // is refused before the Hub even asks who is calling.
  const writes = [
    ['POST', '/api/control/installation/administrators', { email: 'x@test.dev' }],
    ['DELETE', `/api/control/installation/administrators/${plain}`],
  ]
  for (const [method, url, payload] of writes) assert.equal((await anonymous(method, url, payload)).status, 403, `${method} ${url}`)

  // A write with the Origin and CSRF pair right, but no session cookie, reaches the session check.
  const authenticButSessionless = async (method, url, payload) => app.inject({
    method, url, ...(payload !== undefined ? { payload } : {}),
    headers: { origin, 'x-conexus-csrf': 'csrf-1', ...(payload !== undefined ? { 'content-type': 'application/json' } : {}) },
    cookies: { '__Host-conexus_csrf': 'csrf-1' },
  })
  for (const [method, url, payload] of writes) assert.equal((await authenticButSessionless(method, url, payload)).statusCode, 401, `${method} ${url}`)
})

test('every admin-only route refuses a signed-in caller who is not an administrator', async (t) => {
  const { as } = await buildApp(t, { administration: createFakeAdministration([admin]) })
  const asPlain = as(plain)
  const adminOnly = [
    ['GET', '/api/control/installation/administrators'],
    ['POST', '/api/control/installation/administrators', { email: 'x@test.dev' }],
    ['DELETE', `/api/control/installation/administrators/${admin}`],
  ]
  for (const [method, url, payload] of adminOnly) {
    assert.equal((await asPlain(method, url, payload)).status, 403, `${method} ${url}`)
  }
  assert.deepEqual(await asPlain('GET', '/api/control/installation'), { status: 200, body: { administrator: false } })
})

test('a write without CSRF is refused before the administrator check', async (t) => {
  const { app } = await buildApp(t, { administration: createFakeAdministration([admin]) })
  const withoutCsrf = { headers: { origin, 'content-type': 'application/json' }, cookies: { '__Host-conexus_session': plain } }
  const posted = await app.inject({ method: 'POST', url: '/api/control/installation/administrators', ...withoutCsrf, payload: { email: 'x@test.dev' } })
  assert.equal(posted.statusCode, 403)
  assert.equal(posted.json().type.endsWith('request-authenticity-denied'), true)
})

test('an administrator lists, grants by email, and revokes, and the last one cannot be revoked', async (t) => {
  const administration = createFakeAdministration([admin])
  administration.accounts.set(admin, { displayName: 'Admin', email: 'admin@test.dev' })
  administration.accounts.set(plain, { displayName: 'Plain', email: 'plain@test.dev' })
  const { as } = await buildApp(t, { administration })
  const asAdmin = as(admin)

  const listed = await asAdmin('GET', '/api/control/installation/administrators')
  assert.equal(listed.status, 200)
  assert.deepEqual(listed.body.administrators.map((row) => row.accountId), [admin])

  const granted = await asAdmin('POST', '/api/control/installation/administrators', { email: '  Plain@Test.DEV  ' })
  assert.equal(granted.status, 201)
  assert.equal(granted.body.administrator.accountId, plain)
  assert.equal(granted.body.administrator.grantedVia, 'ADMINISTRATOR')
  assert.deepEqual(granted.body.administrator.grantedBy, { accountId: admin, displayName: 'Admin' })

  const notFound = await asAdmin('POST', '/api/control/installation/administrators', { email: 'nobody@test.dev' })
  assert.equal(notFound.status, 404)
  assert.equal(notFound.body.type.endsWith('account-not-found'), true)

  assert.equal((await asAdmin('DELETE', `/api/control/installation/administrators/${plain}`)).status, 204)
  assert.equal((await asAdmin('DELETE', `/api/control/installation/administrators/${plain}`)).status, 204, 'revoking a non-administrator is idempotent')

  const lastAdministrator = await asAdmin('DELETE', `/api/control/installation/administrators/${admin}`)
  assert.equal(lastAdministrator.status, 409)
  assert.equal(lastAdministrator.body.type.endsWith('last-installation-administrator'), true)
})
