import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const hubBuild = mkdtempSync(resolve(repositoryRoot, 'apps/hub/membership-http-build-'))
process.once('exit', () => rmSync(hubBuild, { recursive: true, force: true }))
const compiled = spawnSync(process.execPath, [
  resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'),
  '--project', resolve(repositoryRoot, 'apps/hub/tsconfig.json'),
  '--noEmit', 'false', '--outDir', hubBuild,
], { encoding: 'utf8' })
if (compiled.status !== 0) throw new Error(`HUB_COMPILE_FAILED\n${compiled.stdout}\n${compiled.stderr}`)
const built = (path) => pathToFileURL(resolve(hubBuild, path)).href
const { createHttpApp } = await import(built('http/app.js'))
const { registerMembershipRoutes, parseWorkspaceRole } = await import(built('identity-access/membership.js'))

const origin = 'https://conexus.test'
const workspaceId = '11111111-1111-4111-8111-111111111111'
const ownerAccountId = '22222222-2222-4222-8222-222222222222'
const memberAccountId = '33333333-3333-4333-8333-333333333333'

const notAdmitted = () => Object.assign(new Error('NOT_ADMITTED'), { code: '42501' })
const lastOwner = () => Object.assign(new Error('LAST_OWNER'), { code: '42501' })

const ownerEntry = {
  kind: 'member',
  accountId: ownerAccountId,
  displayName: 'Leandro',
  email: 'leandro@example.test',
  role: 'owner',
  since: '2026-09-01T00:00:00.000Z',
}

const memberEntry = {
  kind: 'member',
  accountId: memberAccountId,
  displayName: 'Ana',
  role: 'member',
  since: '2026-09-10T00:00:00.000Z',
}

const makeStore = (overrides = {}) => {
  const calls = []
  const record = (name) => async (input) => { calls.push({ name, input }); return undefined }
  return {
    calls,
    async roster(input) {
      calls.push({ name: 'roster', input })
      return { viewerRole: 'owner', entries: [ownerEntry, memberEntry] }
    },
    async invite(input) {
      calls.push({ name: 'invite', input })
      return {
        kind: 'invitation',
        invitationId: '44444444-4444-4444-8444-444444444444',
        email: input.email,
        role: input.role,
        invitedAt: '2026-09-19T00:00:00.000Z',
        expiresAt: '2026-10-03T00:00:00.000Z',
      }
    },
    cancelInvitation: record('cancelInvitation'),
    setRole: record('setRole'),
    remove: record('remove'),
    ...overrides,
  }
}

const createHubApp = (store, { accountId = ownerAccountId, signedIn = true } = {}) => createHttpApp({
  registerRoutes: (app) => registerMembershipRoutes(app, {
    store,
    config: { origin },
    resolveCurrentSession: async (request, requireCsrf = false) => {
      if (!signedIn || !request.cookies['__Host-conexus_session']) return null
      const value = request.headers['x-conexus-csrf']
      const csrfToken = Array.isArray(value) ? value[0] : value
      if (requireCsrf && csrfToken !== 'csrf-1') return null
      return { account: { accountId, displayName: 'Leandro' }, issuer: 'https://issuer.test', subject: 'subject-1' }
    },
  }),
  staticRoot: null,
})

const authentic = {
  headers: { origin, 'x-conexus-csrf': 'csrf-1', 'content-type': 'application/json' },
  cookies: { '__Host-conexus_session': 'session-1', '__Host-conexus_csrf': 'csrf-1' },
}

const authenticDelete = {
  headers: { origin, 'x-conexus-csrf': 'csrf-1' },
  cookies: authentic.cookies,
}

test('the roster carries members, invitations and the caller role', async (t) => {
  const store = makeStore()
  const app = await createHubApp(store)
  t.after(() => app.close())
  assert.deepEqual(app.routeCensus(), ['IAM-04', 'IAM-05', 'IAM-06', 'IAM-10'])
  const response = await app.inject({
    method: 'GET',
    url: `/api/control/workspaces/${workspaceId}/members`,
    cookies: { '__Host-conexus_session': 'session-1' },
  })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), { viewerRole: 'owner', entries: [ownerEntry, memberEntry] })
  assert.deepEqual(store.calls[0], { name: 'roster', input: { actor: ownerAccountId, workspaceId } })
})

test('a caller who is not a member is not told the Workspace exists', async (t) => {
  const app = await createHubApp(makeStore({ roster: async () => null }))
  t.after(() => app.close())
  const response = await app.inject({
    method: 'GET',
    url: `/api/control/workspaces/${workspaceId}/members`,
    cookies: { '__Host-conexus_session': 'session-1' },
  })
  assert.equal(response.statusCode, 404)
  assert.equal(response.json().title, 'Workspace not found')
})

test('inviting the same email twice answers the same invitation', async (t) => {
  const store = makeStore()
  const app = await createHubApp(store)
  t.after(() => app.close())
  const payload = { email: 'Ana@Example.Test', role: 'member' }
  const first = await app.inject({ method: 'POST', url: `/api/control/workspaces/${workspaceId}/invitations`, ...authentic, payload })
  const second = await app.inject({ method: 'POST', url: `/api/control/workspaces/${workspaceId}/invitations`, ...authentic, payload })
  assert.equal(first.statusCode, 200)
  assert.deepEqual(first.json(), {
    kind: 'invitation',
    invitationId: '44444444-4444-4444-8444-444444444444',
    email: 'ana@example.test',
    role: 'member',
    invitedAt: '2026-09-19T00:00:00.000Z',
    expiresAt: '2026-10-03T00:00:00.000Z',
  })
  assert.deepEqual(second.json(), first.json())
  assert.deepEqual(
    store.calls.map((call) => call.input.email),
    ['ana@example.test', 'ana@example.test'],
  )
})

test('the invited address is lower-cased before it reaches SQL', async (t) => {
  const store = makeStore()
  const app = await createHubApp(store)
  t.after(() => app.close())
  await app.inject({
    method: 'POST',
    url: `/api/control/workspaces/${workspaceId}/invitations`,
    ...authentic,
    payload: { email: 'ANA@EXAMPLE.TEST', role: 'owner' },
  })
  assert.deepEqual(store.calls[0].input, {
    actor: ownerAccountId,
    workspaceId,
    email: 'ana@example.test',
    role: 'owner',
  })
})

test('an address padded with whitespace is refused by the contract, not normalized', async (t) => {
  const store = makeStore()
  const app = await createHubApp(store)
  t.after(() => app.close())
  const response = await app.inject({
    method: 'POST',
    url: `/api/control/workspaces/${workspaceId}/invitations`,
    ...authentic,
    payload: { email: '  ana@example.test  ', role: 'member' },
  })
  assert.equal(response.statusCode, 400)
  assert.deepEqual(store.calls, [])
})

test('a member cannot invite, and the refusal is a 403', async (t) => {
  const app = await createHubApp(makeStore({ invite: async () => { throw notAdmitted() } }))
  t.after(() => app.close())
  const response = await app.inject({
    method: 'POST',
    url: `/api/control/workspaces/${workspaceId}/invitations`,
    ...authentic,
    payload: { email: 'ana@example.test', role: 'member' },
  })
  assert.equal(response.statusCode, 403)
  assert.equal(response.json().title, 'Member administration denied')
})

test('demoting the last owner is a 409 and removing them is too', async (t) => {
  const app = await createHubApp(makeStore({
    setRole: async () => { throw lastOwner() },
    remove: async () => { throw lastOwner() },
  }))
  t.after(() => app.close())
  const demoted = await app.inject({
    method: 'PUT',
    url: `/api/control/workspaces/${workspaceId}/members/${ownerAccountId}`,
    ...authentic,
    payload: { role: 'member' },
  })
  assert.equal(demoted.statusCode, 409)
  assert.equal(demoted.json().title, 'The Workspace would be left without an owner')
  const removed = await app.inject({
    method: 'DELETE',
    url: `/api/control/workspaces/${workspaceId}/roster/member/${ownerAccountId}`,
    ...authenticDelete,
  })
  assert.equal(removed.statusCode, 409)
})

test('one operation withdraws either kind of roster entry', async (t) => {
  const store = makeStore()
  const app = await createHubApp(store)
  t.after(() => app.close())
  const member = await app.inject({
    method: 'DELETE',
    url: `/api/control/workspaces/${workspaceId}/roster/member/${memberAccountId}`,
    ...authenticDelete,
  })
  const invitation = await app.inject({
    method: 'DELETE',
    url: `/api/control/workspaces/${workspaceId}/roster/invitation/44444444-4444-4444-8444-444444444444`,
    ...authenticDelete,
  })
  assert.equal(member.statusCode, 204)
  assert.equal(invitation.statusCode, 204)
  assert.deepEqual(store.calls, [
    { name: 'remove', input: { actor: ownerAccountId, workspaceId, member: memberAccountId } },
    { name: 'cancelInvitation', input: { actor: ownerAccountId, invitationId: '44444444-4444-4444-8444-444444444444' } },
  ])
})

test('setting a role binds the actor to the session and never to the request', async (t) => {
  const store = makeStore()
  const app = await createHubApp(store, { accountId: ownerAccountId })
  t.after(() => app.close())
  const response = await app.inject({
    method: 'PUT',
    url: `/api/control/workspaces/${workspaceId}/members/${memberAccountId}`,
    ...authentic,
    payload: { role: 'owner' },
  })
  assert.equal(response.statusCode, 204)
  assert.deepEqual(store.calls[0], {
    name: 'setRole',
    input: { actor: ownerAccountId, workspaceId, member: memberAccountId, role: 'owner' },
  })
})

test('a role outside the two admitted values never reaches SQL', async (t) => {
  const store = makeStore()
  const app = await createHubApp(store)
  t.after(() => app.close())
  const response = await app.inject({
    method: 'PUT',
    url: `/api/control/workspaces/${workspaceId}/members/${memberAccountId}`,
    ...authentic,
    payload: { role: 'administrator' },
  })
  assert.equal(response.statusCode, 400)
  assert.deepEqual(store.calls, [])
  assert.equal(parseWorkspaceRole('administrator'), null)
  assert.equal(parseWorkspaceRole('owner'), 'owner')
  assert.equal(parseWorkspaceRole('member'), 'member')
})

test('every write demands the exact origin, the CSRF pair and a session', async (t) => {
  const store = makeStore()
  const app = await createHubApp(store)
  t.after(() => app.close())
  const foreignOrigin = await app.inject({
    method: 'POST',
    url: `/api/control/workspaces/${workspaceId}/invitations`,
    headers: { origin: 'https://attacker.test', 'x-conexus-csrf': 'csrf-1', 'content-type': 'application/json' },
    cookies: authentic.cookies,
    payload: { email: 'ana@example.test', role: 'member' },
  })
  assert.equal(foreignOrigin.statusCode, 403)
  const wrongCsrf = await app.inject({
    method: 'POST',
    url: `/api/control/workspaces/${workspaceId}/invitations`,
    headers: { origin, 'x-conexus-csrf': 'wrong', 'content-type': 'application/json' },
    cookies: authentic.cookies,
    payload: { email: 'ana@example.test', role: 'member' },
  })
  assert.equal(wrongCsrf.statusCode, 403)
  assert.deepEqual(store.calls, [])
})

test('an anonymous caller gets 401 from the roster and from every write', async (t) => {
  const store = makeStore()
  const app = await createHubApp(store, { signedIn: false })
  t.after(() => app.close())
  const read = await app.inject({ method: 'GET', url: `/api/control/workspaces/${workspaceId}/members` })
  const write = await app.inject({
    method: 'POST',
    url: `/api/control/workspaces/${workspaceId}/invitations`,
    ...authentic,
    payload: { email: 'ana@example.test', role: 'member' },
  })
  assert.equal(read.statusCode, 401)
  assert.equal(write.statusCode, 401)
  assert.deepEqual(store.calls, [])
})
