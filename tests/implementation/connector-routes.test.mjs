import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'

const { createHttpApp } = await import(hubModuleUrl('http/app.js'))
const { registerConnectorRoutes } = await import(hubModuleUrl('connectors/routes.js'))
const { sankhyaCredentialSchema } = await import(hubModuleUrl('connectors/sankhya/definition.js'))

const origin = 'https://conexus.test'
const workspaceId = '11111111-1111-4111-8111-111111111111'
const projectId = '22222222-2222-4222-8222-222222222222'
const connectionId = '33333333-3333-4333-8333-333333333333'
const grantId = '44444444-4444-4444-8444-444444444444'
const adminAccountId = '55555555-5555-4555-8555-555555555555'
const memberAccountId = '66666666-6666-4666-8666-666666666666'

const notAdmitted = () => Object.assign(new Error('NOT_ADMITTED'), { code: '42501' })
const projectNotFound = () => Object.assign(new Error('CONNECTOR_PROJECT_NOT_FOUND'), { code: 'P0002' })
const connectionUnavailable = () => Object.assign(new Error('CONNECTOR_CONNECTION_NOT_AVAILABLE'), { code: 'P0002' })

const connectionEntry = { connectionId, connectorId: 'sankhya', label: 'ERP principal', createdAt: new Date('2026-09-24T10:00:00.000Z'), disabledAt: null }
const openGrant = { kind: 'grant', grantId, connectionId, connectorId: 'sankhya', capabilityId: 'sankhya.purchase-order.read', grantedAt: new Date('2026-09-24T11:00:00.000Z') }
const grantable = { kind: 'grantable', connectionId, connectorId: 'sankhya', capabilityId: 'sankhya.purchase-order.read' }

const makeStore = (overrides = {}) => {
  const calls = []
  return {
    calls,
    async listConnections(input) { calls.push({ name: 'listConnections', input }); return [connectionEntry] },
    async createConnection(input) { calls.push({ name: 'createConnection', input }); return { connection: connectionEntry, created: true } },
    async disableConnection(input) { calls.push({ name: 'disableConnection', input }); return true },
    async listProjectGrants(input) { calls.push({ name: 'listProjectGrants', input }); return [openGrant, grantable] },
    async grantCapability(input) { calls.push({ name: 'grantCapability', input }); return openGrant },
    async revokeGrant(input) { calls.push({ name: 'revokeGrant', input }); return true },
    ...overrides,
  }
}

const makeApp = (store, { isAdmin = true, checkConnection = async () => 'CONNECTOR_UNCONFIGURED', currentAccountId = adminAccountId, credentialSchemas = { sankhya: sankhyaCredentialSchema } } = {}) => createHttpApp({
  registerRoutes: (app) => registerConnectorRoutes(app, {
    store,
    resolveCurrentSession: async (request, requireCsrf = false) => {
      if (!request.cookies['__Host-conexus_session']) return null
      const value = request.headers['x-conexus-csrf']
      if (requireCsrf && (Array.isArray(value) ? value[0] : value) !== 'csrf-1') return null
      return { account: { accountId: currentAccountId, displayName: 'Leandro' }, issuer: 'https://issuer.test', subject: 'subject-1' }
    },
    isInstallationAdministrator: async () => isAdmin,
    checkConnection,
    credentialSchemas,
    admittedOperationIds: new Set(['sankhya.purchase-order.read']),
    config: { origin },
  }),
  staticRoot: null,
})

const session = { '__Host-conexus_session': 'session-1', '__Host-conexus_csrf': 'csrf-1' }
const authentic = { headers: { origin, 'x-conexus-csrf': 'csrf-1', 'content-type': 'application/json' }, cookies: session }
const authenticDelete = { headers: { origin, 'x-conexus-csrf': 'csrf-1' }, cookies: session }
const credential = { clientId: 'client-a', clientSecret: 'super-secret-value', xToken: 'x-token-value' }
const CREDENTIAL_VALUES = Object.values(credential)
const CREDENTIAL_FIELD_NAMES = ['clientSecret', 'xToken', 'credential', 'credentialSealed']

const bodyHasNoCredential = (payload) => {
  const text = JSON.stringify(payload)
  for (const value of CREDENTIAL_VALUES) assert.equal(text.includes(value), false, `response leaked the credential value ${value}`)
  for (const name of CREDENTIAL_FIELD_NAMES) assert.equal(text.includes(`"${name}"`), false, `response leaked the credential field ${name}`)
}

test('routeCensus is exactly the seven Connector operations', async (t) => {
  const app = await makeApp(makeStore())
  t.after(() => app.close())
  assert.deepEqual(app.routeCensus(), ['CON-01', 'CON-02', 'CON-03', 'CON-04', 'CON-05', 'CON-06', 'CON-07'])
})

test('an installation administrator lists, creates and disables a Workspace Connection; the credential never comes back', async (t) => {
  const store = makeStore()
  const app = await makeApp(store)
  t.after(() => app.close())

  const listed = await app.inject({ method: 'GET', url: `/api/control/workspaces/${workspaceId}/connections`, cookies: session })
  assert.equal(listed.statusCode, 200)
  bodyHasNoCredential(listed.json())
  assert.deepEqual(listed.json(), { entries: [{ connectionId, connectorId: 'sankhya', label: 'ERP principal', createdAt: '2026-09-24T10:00:00.000Z' }] })

  const created = await app.inject({
    method: 'POST', url: `/api/control/workspaces/${workspaceId}/connections`, ...authentic,
    payload: { connectionId, connectorId: 'sankhya', label: 'ERP principal', credential },
  })
  assert.equal(created.statusCode, 201)
  bodyHasNoCredential(created.json())
  assert.deepEqual(created.json(), { connectionId, connectorId: 'sankhya', label: 'ERP principal', createdAt: '2026-09-24T10:00:00.000Z' })
  assert.deepEqual(store.calls.at(-1), { name: 'createConnection', input: { actor: adminAccountId, connectionId, workspaceId, connectorId: 'sankhya', label: 'ERP principal', credential } })

  const disabled = await app.inject({ method: 'DELETE', url: `/api/control/workspaces/${workspaceId}/connections/${connectionId}`, ...authenticDelete })
  assert.equal(disabled.statusCode, 204)
  assert.deepEqual(store.calls.at(-1), { name: 'disableConnection', input: { actor: adminAccountId, workspaceId, connectionId } })
})

test('a retry the store recognizes answers 200, a changed one 409, and a Workspace that does not exist 422', async (t) => {
  const outcomes = [
    async () => ({ connection: connectionEntry, created: false }),
    async () => { throw Object.assign(new Error('CONNECTOR_CONNECTION_CONFLICT'), { code: 'P0001' }) },
    async () => { throw Object.assign(new Error('CONNECTOR_WORKSPACE_NOT_FOUND'), { code: 'P0002' }) },
  ]
  const app = await makeApp(makeStore({ createConnection: () => outcomes.shift()() }))
  t.after(() => app.close())
  const post = () => app.inject({ method: 'POST', url: `/api/control/workspaces/${workspaceId}/connections`, ...authentic, payload: { connectionId, connectorId: 'sankhya', label: 'ERP principal', credential } })

  const retried = await post()
  assert.deepEqual({ status: retried.statusCode, body: retried.json() },
    { status: 200, body: { connectionId, connectorId: 'sankhya', label: 'ERP principal', createdAt: '2026-09-24T10:00:00.000Z' } })
  const changed = await post()
  assert.deepEqual({ status: changed.statusCode, type: changed.json().type }, { status: 409, type: 'urn:conexus:problem:connector-connection-conflict' })
  const nowhere = await post()
  assert.deepEqual({ status: nowhere.statusCode, type: nowhere.json().type }, { status: 422, type: 'urn:conexus:problem:connector-workspace-not-found' })
  for (const response of [retried, changed, nowhere]) bodyHasNoCredential(response.json())
})

test('a malformed id gets the declared 400, 404 or 422, and never reaches the store', async (t) => {
  const store = makeStore()
  const app = await makeApp(store)
  t.after(() => app.close())
  const bad = 'not-a-uuid'
  const cases = [
    { method: 'GET', url: `/api/control/workspaces/${bad}/connections`, cookies: session, expected: { status: 200, body: { entries: [] } } },
    { method: 'POST', url: `/api/control/workspaces/${bad}/connections`, ...authentic, payload: { connectionId, connectorId: 'sankhya', label: 'x', credential }, expected: { status: 422, type: 'connector-workspace-not-found' } },
    { method: 'POST', url: `/api/control/workspaces/${workspaceId}/connections`, ...authentic, payload: { connectionId: bad, connectorId: 'sankhya', label: 'x', credential }, expected: { status: 400, type: 'request-invalid' } },
    { method: 'POST', url: `/api/control/workspaces/${workspaceId}/connections`, ...authentic, payload: { connectionId, connectorId: 'sankhya', label: '   ', credential }, expected: { status: 422, type: 'connector-label-refused' } },
    { method: 'POST', url: `/api/control/workspaces/${bad}/connections/${connectionId}/authentication-check`, ...authenticDelete, expected: { status: 404, type: 'connector-connection-not-found' } },
    { method: 'POST', url: `/api/control/workspaces/${workspaceId}/connections/${bad}/authentication-check`, ...authenticDelete, expected: { status: 400, type: 'request-invalid' } },
    { method: 'DELETE', url: `/api/control/workspaces/${bad}/connections/${connectionId}`, ...authenticDelete, expected: { status: 404, type: 'connector-connection-not-found' } },
    { method: 'DELETE', url: `/api/control/workspaces/${workspaceId}/connections/${bad}`, ...authenticDelete, expected: { status: 400, type: 'request-invalid' } },
    { method: 'GET', url: `/api/control/projects/${bad}/connector-grants`, cookies: session, expected: { status: 404, type: 'project-not-found' } },
    { method: 'POST', url: `/api/control/projects/${bad}/connector-grants`, ...authentic, payload: { connectionId, operationId: 'sankhya.purchase-order.read' }, expected: { status: 404, type: 'project-not-found' } },
    { method: 'POST', url: `/api/control/projects/${projectId}/connector-grants`, ...authentic, payload: { connectionId: bad, operationId: 'sankhya.purchase-order.read' }, expected: { status: 400, type: 'request-invalid' } },
    { method: 'DELETE', url: `/api/control/projects/${bad}/connector-grants/${grantId}`, ...authenticDelete, expected: { status: 404, type: 'project-not-found' } },
    { method: 'DELETE', url: `/api/control/projects/${projectId}/connector-grants/${bad}`, ...authenticDelete, expected: { status: 400, type: 'request-invalid' } },
  ]
  for (const { expected, ...request } of cases) {
    const response = await app.inject(request)
    const seen = expected.body ? { status: response.statusCode, body: response.json() } : { status: response.statusCode, type: response.json().type }
    assert.deepEqual(seen, expected.body ? expected : { status: expected.status, type: `urn:conexus:problem:${expected.type}` }, `${request.method} ${request.url} ${JSON.stringify(request.payload ?? {})}`)
  }
  assert.deepEqual(store.calls, [])
})

test('the credential fields are writeOnly: a malformed credential is refused before the store, and every field name stays out of every response', async (t) => {
  const store = makeStore()
  const app = await makeApp(store)
  t.after(() => app.close())

  const malformed = await app.inject({
    method: 'POST', url: `/api/control/workspaces/${workspaceId}/connections`, ...authentic,
    payload: { connectionId, connectorId: 'sankhya', label: 'ERP principal', credential: { clientId: 'client-a', clientSecret: '', xToken: 'x' } },
  })
  assert.equal(malformed.statusCode, 400, 'the wire schema itself refuses an empty field before any handler runs')
  bodyHasNoCredential(malformed.json())
  assert.equal(store.calls.length, 0)

  const extraField = await app.inject({
    method: 'POST', url: `/api/control/workspaces/${workspaceId}/connections`, ...authentic,
    payload: { connectionId, connectorId: 'sankhya', label: 'ERP principal', credential: { ...credential, mgeUser: 'x' } },
  })
  assert.equal(extraField.statusCode, 400, 'the wire schema is additionalProperties:false on the credential object, so no MGE field is ever admitted')
  assert.equal(store.calls.length, 0)
})

test('a registered wire connectorId with no matching Definition schema is refused as 422, never forwarded', async (t) => {
  const store = makeStore()
  const app = await makeApp(store, { credentialSchemas: {} })
  t.after(() => app.close())
  const response = await app.inject({
    method: 'POST', url: `/api/control/workspaces/${workspaceId}/connections`, ...authentic,
    payload: { connectionId, connectorId: 'sankhya', label: 'ERP principal', credential },
  })
  assert.equal(response.statusCode, 422)
  bodyHasNoCredential(response.json())
  assert.equal(store.calls.length, 0)
})

test('an authentication check answers only a closed outcome and never carries a provider value', async (t) => {
  const seen = []
  const app = await makeApp(makeStore(), { checkConnection: async (input) => { seen.push(input); return 'CONNECTOR_UNCONFIGURED' } })
  t.after(() => app.close())
  const response = await app.inject({ method: 'POST', url: `/api/control/workspaces/${workspaceId}/connections/${connectionId}/authentication-check`, ...authenticDelete })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), { outcome: 'CONNECTOR_UNCONFIGURED' })
  assert.deepEqual(seen, [{ actor: adminAccountId, workspaceId, connectionId }])
})

test('an authentication check of a Connection absent from the Workspace is a 404', async (t) => {
  const app = await makeApp(makeStore(), { checkConnection: async () => 'NOT_FOUND' })
  t.after(() => app.close())
  const response = await app.inject({ method: 'POST', url: `/api/control/workspaces/${workspaceId}/connections/${connectionId}/authentication-check`, ...authenticDelete })
  assert.equal(response.statusCode, 404)
  assert.equal(response.json().type, 'urn:conexus:problem:connector-connection-not-found')
})

test('a non-administrator is refused every Connection operation', async (t) => {
  const app = await makeApp(makeStore(), { isAdmin: false, currentAccountId: memberAccountId })
  t.after(() => app.close())
  const list = await app.inject({ method: 'GET', url: `/api/control/workspaces/${workspaceId}/connections`, cookies: session })
  assert.equal(list.statusCode, 403)
  assert.equal(list.json().type, 'urn:conexus:problem:installation-administrator-required')
  const create = await app.inject({ method: 'POST', url: `/api/control/workspaces/${workspaceId}/connections`, ...authentic, payload: { connectionId, connectorId: 'sankhya', label: 'x', credential } })
  assert.equal(create.statusCode, 403)
  const disable = await app.inject({ method: 'DELETE', url: `/api/control/workspaces/${workspaceId}/connections/${connectionId}`, ...authenticDelete })
  assert.equal(disable.statusCode, 403)
  const check = await app.inject({ method: 'POST', url: `/api/control/workspaces/${workspaceId}/connections/${connectionId}/authentication-check`, ...authenticDelete })
  assert.equal(check.statusCode, 403)
})

test('an Owner lists, grants and revokes a Project Connector Grant; a non-admitted operation id is refused before the store', async (t) => {
  const store = makeStore()
  const app = await makeApp(store, { currentAccountId: memberAccountId })
  t.after(() => app.close())

  const listed = await app.inject({ method: 'GET', url: `/api/control/projects/${projectId}/connector-grants`, cookies: session })
  assert.equal(listed.statusCode, 200)
  assert.deepEqual(listed.json(), {
    entries: [
      { kind: 'grant', grantId, connectionId, connectorId: 'sankhya', capabilityId: 'sankhya.purchase-order.read', grantedAt: '2026-09-24T11:00:00.000Z' },
      { kind: 'grantable', connectionId, connectorId: 'sankhya', capabilityId: 'sankhya.purchase-order.read' },
    ],
  })

  const notAdmitted422 = await app.inject({
    method: 'POST', url: `/api/control/projects/${projectId}/connector-grants`, ...authentic,
    payload: { connectionId, operationId: 'sankhya.purchase-order.write' },
  })
  assert.equal(notAdmitted422.statusCode, 422)
  assert.equal(store.calls.some((call) => call.name === 'grantCapability'), false)

  const granted = await app.inject({
    method: 'POST', url: `/api/control/projects/${projectId}/connector-grants`, ...authentic,
    payload: { connectionId, operationId: 'sankhya.purchase-order.read' },
  })
  assert.equal(granted.statusCode, 200)
  assert.deepEqual(granted.json(), { kind: 'grant', grantId, connectionId, connectorId: 'sankhya', capabilityId: 'sankhya.purchase-order.read', grantedAt: '2026-09-24T11:00:00.000Z' })
  assert.deepEqual(store.calls.at(-1), { name: 'grantCapability', input: { actor: memberAccountId, projectId, connectionId, operationId: 'sankhya.purchase-order.read' } })

  const revoked = await app.inject({ method: 'DELETE', url: `/api/control/projects/${projectId}/connector-grants/${grantId}`, ...authenticDelete })
  assert.equal(revoked.statusCode, 204)
  assert.deepEqual(store.calls.at(-1), { name: 'revokeGrant', input: { actor: memberAccountId, projectId, grantId } })
})

test('a non-member is not told the Project exists, and a Connection outside the Workspace answers the same non-disclosing 404', async (t) => {
  const notFoundStore = makeStore({ listProjectGrants: async () => { throw projectNotFound() }, revokeGrant: async () => { throw projectNotFound() } })
  const app = await makeApp(notFoundStore, { currentAccountId: memberAccountId })
  t.after(() => app.close())
  assert.equal((await app.inject({ method: 'GET', url: `/api/control/projects/${projectId}/connector-grants`, cookies: session })).statusCode, 404)
  assert.equal((await app.inject({ method: 'DELETE', url: `/api/control/projects/${projectId}/connector-grants/${grantId}`, ...authenticDelete })).statusCode, 404)

  const unavailableStore = makeStore({ grantCapability: async () => { throw connectionUnavailable() } })
  const app2 = await makeApp(unavailableStore, { currentAccountId: memberAccountId })
  t.after(() => app2.close())
  const refused = await app2.inject({ method: 'POST', url: `/api/control/projects/${projectId}/connector-grants`, ...authentic, payload: { connectionId, operationId: 'sankhya.purchase-order.read' } })
  assert.equal(refused.statusCode, 404)

  const notOwnerStore = makeStore({ listProjectGrants: async () => { throw notAdmitted() } })
  const app3 = await makeApp(notOwnerStore, { currentAccountId: memberAccountId })
  t.after(() => app3.close())
  const denied = await app3.inject({ method: 'GET', url: `/api/control/projects/${projectId}/connector-grants`, cookies: session })
  assert.equal(denied.statusCode, 403)
})

test('a state change without the exact Origin or the CSRF token is refused before the store', async (t) => {
  const store = makeStore()
  const app = await makeApp(store)
  t.after(() => app.close())
  const cases = [
    { headers: { ...authentic.headers, origin: 'https://elsewhere.test' } },
    { headers: { 'x-conexus-csrf': 'csrf-1', 'content-type': 'application/json' } },
    { headers: { ...authentic.headers, 'x-conexus-csrf': 'other' } },
  ]
  for (const { headers } of cases) {
    const response = await app.inject({ method: 'POST', url: `/api/control/workspaces/${workspaceId}/connections`, headers, cookies: session, payload: { connectionId, connectorId: 'sankhya', label: 'x', credential } })
    assert.equal(response.statusCode, 403)
    assert.equal(response.json().type, 'urn:conexus:problem:request-authenticity-denied')
  }
  assert.deepEqual(store.calls, [])
})

test('without a session every operation answers 401', async (t) => {
  const app = await makeApp(makeStore())
  t.after(() => app.close())
  assert.equal((await app.inject({ method: 'GET', url: `/api/control/workspaces/${workspaceId}/connections` })).statusCode, 401)
  assert.equal((await app.inject({ method: 'GET', url: `/api/control/projects/${projectId}/connector-grants` })).statusCode, 401)
  assert.equal((await app.inject({
    method: 'POST', url: `/api/control/workspaces/${workspaceId}/connections`,
    headers: authentic.headers, cookies: { '__Host-conexus_csrf': 'csrf-1' }, payload: { connectionId, connectorId: 'sankhya', label: 'x', credential },
  })).statusCode, 401)
})
