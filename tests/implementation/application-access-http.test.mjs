import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'

const { createHttpApp } = await import(hubModuleUrl('http/app.js'))
const { registerApplicationAccessRoutes } = await import(hubModuleUrl('identity-access/application-access.js'))

const origin = 'https://conexus.test'
const projectId = '11111111-1111-4111-8111-111111111111'
const ownerAccountId = '22222222-2222-4222-8222-222222222222'
const grantId = '33333333-3333-4333-8333-333333333333'
const invitationId = '44444444-4444-4444-8444-444444444444'

const notAdmitted = () => Object.assign(new Error('NOT_ADMITTED'), { code: '42501' })
const notFound = () => Object.assign(new Error('APPLICATION_NOT_FOUND'), { code: 'P0002' })

const grantEntry = { kind: 'grant', grantId, accountId: '55555555-5555-4555-8555-555555555555', displayName: 'Funcionária', email: 'funcionaria@example.test', grantedAt: '2026-09-23T10:00:00.000Z' }
const invitationEntry = { kind: 'invitation', invitationId, email: 'nova@example.test', invitedAt: '2026-09-23T11:00:00.000Z', expiresAt: '2026-10-07T11:00:00.000Z' }

const makeStore = (overrides = {}) => {
  const calls = []
  return {
    calls,
    async list(input) { calls.push({ name: 'list', input }); return { slug: 'caderno-de-compras', entries: [grantEntry, invitationEntry] } },
    async grant(input) { calls.push({ name: 'grant', input }); return { ...invitationEntry, email: input.email } },
    async cancelInvitation(input) { calls.push({ name: 'cancelInvitation', input }); return true },
    async revokeGrant(input) { calls.push({ name: 'revokeGrant', input }); return true },
    ...overrides,
  }
}

const createHubApp = (store, { applicationPort = 3445 } = {}) => createHttpApp({
  registerRoutes: (app) => registerApplicationAccessRoutes(app, {
    store,
    config: { origin, applicationAddress: (slug) => applicationPort ? `https://${slug}.conexus.localhost:${applicationPort}` : null },
    resolveCurrentSession: async (request, requireCsrf = false) => {
      if (!request.cookies['__Host-conexus_session']) return null
      const value = request.headers['x-conexus-csrf']
      if (requireCsrf && (Array.isArray(value) ? value[0] : value) !== 'csrf-1') return null
      return { account: { accountId: ownerAccountId, displayName: 'Leandro' }, issuer: 'https://issuer.test', subject: 'subject-1' }
    },
  }),
  staticRoot: null,
})

const session = { '__Host-conexus_session': 'session-1', '__Host-conexus_csrf': 'csrf-1' }
const authentic = { headers: { origin, 'x-conexus-csrf': 'csrf-1', 'content-type': 'application/json' }, cookies: session }
const authenticDelete = { headers: { origin, 'x-conexus-csrf': 'csrf-1' }, cookies: session }
const accessUrl = `/api/control/projects/${projectId}/application-access`

test('an Owner reads the application address, its grants and its invitations', async (t) => {
  const store = makeStore()
  const app = await createHubApp(store)
  t.after(() => app.close())
  assert.deepEqual(app.routeCensus(), ['IAM-11', 'IAM-12', 'IAM-13'])
  const response = await app.inject({ method: 'GET', url: accessUrl, cookies: session })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), { address: 'https://caderno-de-compras.conexus.localhost:3445', entries: [grantEntry, invitationEntry] })
  assert.deepEqual(store.calls, [{ name: 'list', input: { actor: ownerAccountId, projectId } }])
})

test('before the first grant there is no address', async (t) => {
  const app = await createHubApp(makeStore({ list: async () => ({ slug: null, entries: [] }) }))
  t.after(() => app.close())
  const response = await app.inject({ method: 'GET', url: accessUrl, cookies: session })
  assert.deepEqual(response.json(), { entries: [] })
})

test('a member who is not an Owner is refused and a non-member is not told the Project exists', async (t) => {
  const member = await createHubApp(makeStore({ list: async () => { throw notAdmitted() }, grant: async () => { throw notAdmitted() } }))
  const stranger = await createHubApp(makeStore({ list: async () => { throw notFound() }, revokeGrant: async () => { throw notFound() } }))
  t.after(() => Promise.all([member.close(), stranger.close()]))
  const read = await member.inject({ method: 'GET', url: accessUrl, cookies: session })
  assert.equal(read.statusCode, 403)
  assert.equal(read.json().type, 'urn:conexus:problem:application-access-manage-required')
  const grant = await member.inject({ method: 'POST', url: accessUrl, ...authentic, payload: { email: 'a@example.test' } })
  assert.equal(grant.statusCode, 403)
  assert.equal((await stranger.inject({ method: 'GET', url: accessUrl, cookies: session })).statusCode, 404)
  assert.equal((await stranger.inject({ method: 'DELETE', url: `${accessUrl}/grant/${grantId}`, ...authenticDelete })).statusCode, 404)
})

test('an Owner grants by verified email, normalized, and a malformed email is refused before the store', async (t) => {
  const store = makeStore()
  const app = await createHubApp(store)
  t.after(() => app.close())
  const granted = await app.inject({ method: 'POST', url: accessUrl, ...authentic, payload: { email: 'Nova@Example.test' } })
  assert.equal(granted.statusCode, 200)
  assert.deepEqual(granted.json(), { ...invitationEntry, email: 'nova@example.test' })
  assert.deepEqual(store.calls, [{ name: 'grant', input: { actor: ownerAccountId, projectId, email: 'nova@example.test' } }])
  const malformed = await app.inject({ method: 'POST', url: accessUrl, ...authentic, payload: { email: 'no at sign' } })
  assert.equal(malformed.statusCode, 400)
  assert.equal(store.calls.length, 1)
})

test('a state change without the exact Origin or the CSRF token is refused before the store', async (t) => {
  const store = makeStore()
  const app = await createHubApp(store)
  t.after(() => app.close())
  const cases = [
    { headers: { ...authentic.headers, origin: 'https://caderno-de-compras.conexus.localhost:3445' } },
    { headers: { 'x-conexus-csrf': 'csrf-1', 'content-type': 'application/json' } },
    { headers: { ...authentic.headers, 'x-conexus-csrf': 'other' } },
  ]
  for (const { headers } of cases) {
    const response = await app.inject({ method: 'POST', url: accessUrl, headers, cookies: session, payload: { email: 'a@example.test' } })
    assert.equal(response.statusCode, 403)
    assert.equal(response.json().type, 'urn:conexus:problem:request-authenticity-denied')
  }
  const revoke = await app.inject({ method: 'DELETE', url: `${accessUrl}/grant/${grantId}`, headers: { 'x-conexus-csrf': 'csrf-1' }, cookies: session })
  assert.equal(revoke.statusCode, 403)
  assert.deepEqual(store.calls, [])
})

test('revoking names the Project and the entry, and an entry of another Project is not found', async (t) => {
  const store = makeStore({ cancelInvitation: async (input) => { store.calls.push({ name: 'cancelInvitation', input }); return false } })
  const app = await createHubApp(store)
  t.after(() => app.close())
  const revoked = await app.inject({ method: 'DELETE', url: `${accessUrl}/grant/${grantId}`, ...authenticDelete })
  assert.equal(revoked.statusCode, 204)
  const elsewhere = await app.inject({ method: 'DELETE', url: `${accessUrl}/invitation/${invitationId}`, ...authenticDelete })
  assert.equal(elsewhere.statusCode, 404)
  const unknownKind = await app.inject({ method: 'DELETE', url: `${accessUrl}/member/${grantId}`, ...authenticDelete })
  assert.equal(unknownKind.statusCode, 404)
  assert.deepEqual(store.calls, [
    { name: 'revokeGrant', input: { actor: ownerAccountId, projectId, grantId } },
    { name: 'cancelInvitation', input: { actor: ownerAccountId, projectId, invitationId } },
  ])
})

test('without a session every operation answers 401', async (t) => {
  const app = await createHubApp(makeStore())
  t.after(() => app.close())
  assert.equal((await app.inject({ method: 'GET', url: accessUrl })).statusCode, 401)
  assert.equal((await app.inject({ method: 'POST', url: accessUrl, headers: authentic.headers, cookies: { '__Host-conexus_csrf': 'csrf-1' }, payload: { email: 'a@example.test' } })).statusCode, 401)
})
