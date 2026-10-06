import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'
import { hubJsonWrite, hubWrite, opaque, testListener } from './access/test-listener.mjs'

const { registerConnectorRoutes } = await import(hubModuleUrl('connectors/routes.js'))
const { Failure } = await import(hubModuleUrl('platform/failure.js'))

const workspaceId = '11111111-1111-4111-8111-111111111111'
const projectId = '22222222-2222-4222-8222-222222222222'
const connectionId = '33333333-3333-4333-8333-333333333333'
const bindingId = '44444444-4444-4444-8444-444444444444'
const adminAccountId = '55555555-5555-4555-8555-555555555555'
const memberAccountId = '66666666-6666-4666-8666-666666666666'

const connectionEntry = { connectionId, connectorId: 'sankhya', label: 'ERP principal', createdAt: '2026-09-24T10:00:00.000Z' }
const otherConnectionId = '77777777-7777-4777-8777-777777777777'
const binding = { kind: 'binding', bindingId, name: 'erp', connectionId, connectorId: 'sankhya', label: 'ERP principal', boundAt: '2026-09-24T11:00:00.000Z' }
const bindable = { kind: 'bindable', connectionId: otherConnectionId, connectorId: 'sankhya', label: 'ERP filial' }

const makeStore = (overrides = {}) => {
  const calls = []
  return {
    calls,
    async listConnections(input) { calls.push({ name: 'listConnections', input }); return [connectionEntry] },
    async createConnection(input) { calls.push({ name: 'createConnection', input }); return { connection: connectionEntry, created: true } },
    async disableConnection(input) { calls.push({ name: 'disableConnection', input }) },
    async listProjectBindings(input) { calls.push({ name: 'listProjectBindings', input }); return [binding, bindable] },
    async bindConnection(input) { calls.push({ name: 'bindConnection', input }); return { binding, created: true } },
    async unbindConnection(input) { calls.push({ name: 'unbindConnection', input }) },
    ...overrides,
  }
}

const SESSION_TOKEN = opaque('rita')
const makeApp = async (store, { checkConnection = async () => 'CONNECTOR_UNCONFIGURED', currentAccountId = adminAccountId } = {}) => (await testListener({
  sessions: { [SESSION_TOKEN]: { account: { accountId: currentAccountId, displayName: 'Rita' }, issuer: 'https://issuer.test', subject: 'subject-1' } },
  registerRoutes: (app) => registerConnectorRoutes(app, { store, checkConnection }),
})).app

const session = { '__Host-conexus_session': SESSION_TOKEN }
const authentic = { headers: hubJsonWrite, cookies: session }
const authenticDelete = { headers: hubWrite, cookies: session }
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
  assert.deepEqual(app.routeCensus(), ['bindProjectConnection', 'checkWorkspaceConnection', 'createWorkspaceConnection', 'disableWorkspaceConnection', 'listProjectConnectionBindings', 'listWorkspaceConnections', 'unbindProjectConnection'])
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
  assert.deepEqual(store.calls.at(-1), { name: 'createConnection', input: { accountId: adminAccountId, workspaceId, body: { connectionId, connectorId: 'sankhya', label: 'ERP principal', credential } } })

  const disabled = await app.inject({ method: 'DELETE', url: `/api/control/workspaces/${workspaceId}/connections/${connectionId}`, ...authenticDelete })
  assert.equal(disabled.statusCode, 204)
  assert.deepEqual(store.calls.at(-1), { name: 'disableConnection', input: { accountId: adminAccountId, workspaceId, connectionId } })
})

test('a retry the store recognizes answers 200, a changed one 409, and a Workspace that does not exist 422', async (t) => {
  const outcomes = [
    async () => ({ connection: connectionEntry, created: false }),
    async () => { throw new Failure('CONNECTOR_CONNECTION_CONFLICT') },
    async () => { throw new Failure('CONNECTOR_WORKSPACE_NOT_FOUND') },
  ]
  const app = await makeApp(makeStore({ createConnection: () => outcomes.shift()() }))
  t.after(() => app.close())
  const post = () => app.inject({ method: 'POST', url: `/api/control/workspaces/${workspaceId}/connections`, ...authentic, payload: { connectionId, connectorId: 'sankhya', label: 'ERP principal', credential } })

  const retried = await post()
  assert.deepEqual({ status: retried.statusCode, body: retried.json() },
    { status: 200, body: { connectionId, connectorId: 'sankhya', label: 'ERP principal', createdAt: '2026-09-24T10:00:00.000Z' } })
  const changed = await post()
  assert.deepEqual({ status: changed.statusCode, type: changed.json().type }, { status: 409, type: 'urn:conexus:problem:CONNECTOR_CONNECTION_CONFLICT' })
  const nowhere = await post()
  assert.deepEqual({ status: nowhere.statusCode, type: nowhere.json().type }, { status: 422, type: 'urn:conexus:problem:CONNECTOR_WORKSPACE_NOT_FOUND' })
  for (const response of [retried, changed, nowhere]) bodyHasNoCredential(response.json())
})

test('a malformed id gets the declared 400, 404 or 422, and never reaches the store', async (t) => {
  const store = makeStore()
  const app = await makeApp(store)
  t.after(() => app.close())
  const bad = 'not-a-uuid'
  const cases = [
    { method: 'GET', url: `/api/control/workspaces/${bad}/connections`, cookies: session, expected: { status: 404, type: 'WORKSPACE_NOT_FOUND' } },
    { method: 'POST', url: `/api/control/workspaces/${bad}/connections`, ...authentic, payload: { connectionId, connectorId: 'sankhya', label: 'x', credential }, expected: { status: 422, type: 'CONNECTOR_WORKSPACE_NOT_FOUND' } },
    { method: 'POST', url: `/api/control/workspaces/${workspaceId}/connections`, ...authentic, payload: { connectionId: bad, connectorId: 'sankhya', label: 'x', credential }, expected: { status: 400, type: 'REQUEST_VALIDATION_FAILED' } },
    { method: 'POST', url: `/api/control/workspaces/${workspaceId}/connections`, ...authentic, payload: { connectionId, connectorId: 'sankhya', label: '   ', credential }, expected: { status: 422, type: 'CONNECTOR_LABEL_REFUSED' } },
    { method: 'POST', url: `/api/control/workspaces/${bad}/connections/${connectionId}/authentication-check`, ...authenticDelete, expected: { status: 404, type: 'CONNECTOR_CONNECTION_NOT_FOUND' } },
    { method: 'POST', url: `/api/control/workspaces/${workspaceId}/connections/${bad}/authentication-check`, ...authenticDelete, expected: { status: 404, type: 'CONNECTOR_CONNECTION_NOT_FOUND' } },
    { method: 'DELETE', url: `/api/control/workspaces/${bad}/connections/${connectionId}`, ...authenticDelete, expected: { status: 404, type: 'CONNECTOR_CONNECTION_NOT_FOUND' } },
    { method: 'DELETE', url: `/api/control/workspaces/${workspaceId}/connections/${bad}`, ...authenticDelete, expected: { status: 404, type: 'CONNECTOR_CONNECTION_NOT_FOUND' } },
    { method: 'GET', url: `/api/control/projects/${bad}/connection-bindings`, cookies: session, expected: { status: 404, type: 'PROJECT_NOT_FOUND' } },
    { method: 'POST', url: `/api/control/projects/${bad}/connection-bindings`, ...authentic, payload: { connectionId, name: 'erp' }, expected: { status: 404, type: 'PROJECT_NOT_FOUND' } },
    { method: 'POST', url: `/api/control/projects/${projectId}/connection-bindings`, ...authentic, payload: { connectionId: bad, name: 'erp' }, expected: { status: 400, type: 'REQUEST_VALIDATION_FAILED' } },
    { method: 'POST', url: `/api/control/projects/${projectId}/connection-bindings`, ...authentic, payload: { connectionId, name: 'ERP' }, expected: { status: 400, type: 'REQUEST_VALIDATION_FAILED' } },
    { method: 'POST', url: `/api/control/projects/${projectId}/connection-bindings`, ...authentic, payload: { connectionId, name: `e${'r'.repeat(40)}` }, expected: { status: 400, type: 'REQUEST_VALIDATION_FAILED' } },
    { method: 'POST', url: `/api/control/projects/${projectId}/connection-bindings`, ...authentic, payload: { connectionId, name: 'erp', operationId: 'sankhya.purchase-order.read' }, expected: { status: 400, type: 'REQUEST_VALIDATION_FAILED' } },
    { method: 'POST', url: `/api/control/projects/${projectId}/connection-bindings`, ...authentic, payload: { connectionId, name: 'erp', environment: 'production' }, expected: { status: 400, type: 'REQUEST_VALIDATION_FAILED' } },
    { method: 'DELETE', url: `/api/control/projects/${bad}/connection-bindings/${bindingId}`, ...authenticDelete, expected: { status: 404, type: 'PROJECT_NOT_FOUND' } },
    { method: 'DELETE', url: `/api/control/projects/${projectId}/connection-bindings/${bad}`, ...authenticDelete, expected: { status: 404, type: 'CONNECTOR_BINDING_NOT_FOUND' } },
  ]
  for (const { expected, ...request } of cases) {
    const response = await app.inject(request)
    assert.deepEqual({ status: response.statusCode, type: response.json().type }, { status: expected.status, type: `urn:conexus:problem:${expected.type}` }, `${request.method} ${request.url} ${JSON.stringify(request.payload ?? {})}`)
  }
  assert.deepEqual(store.calls, [])
})

test('an invalid credential or label is refused before the store with its own 422, and no field name or value comes back', async (t) => {
  const store = makeStore()
  const app = await makeApp(store)
  t.after(() => app.close())
  const post = (payload) => app.inject({ method: 'POST', url: `/api/control/workspaces/${workspaceId}/connections`, ...authentic, payload })

  const emptyField = await post({ connectionId, connectorId: 'sankhya', label: 'ERP principal', credential: { clientId: 'client-a', clientSecret: '', xToken: 'x' } })
  assert.deepEqual({ status: emptyField.statusCode, type: emptyField.json().type }, { status: 422, type: 'urn:conexus:problem:CONNECTOR_CREDENTIAL_REFUSED' })
  bodyHasNoCredential(emptyField.json())

  const extraField = await post({ connectionId, connectorId: 'sankhya', label: 'ERP principal', credential: { ...credential, mgeUser: 'x' } })
  assert.deepEqual({ status: extraField.statusCode, type: extraField.json().type }, { status: 422, type: 'urn:conexus:problem:CONNECTOR_CREDENTIAL_REFUSED' })

  const blankLabel = await post({ connectionId, connectorId: 'sankhya', label: '   ', credential })
  assert.deepEqual({ status: blankLabel.statusCode, type: blankLabel.json().type }, { status: 422, type: 'urn:conexus:problem:CONNECTOR_LABEL_REFUSED' })

  const unregistered = await post({ connectionId, connectorId: 'other-erp', label: 'ERP principal', credential })
  assert.deepEqual({ status: unregistered.statusCode, type: unregistered.json().type }, { status: 400, type: 'urn:conexus:problem:REQUEST_VALIDATION_FAILED' })
  assert.equal(store.calls.length, 0)
})

test('the label is stored trimmed', async (t) => {
  const store = makeStore()
  const app = await makeApp(store)
  t.after(() => app.close())
  const created = await app.inject({
    method: 'POST', url: `/api/control/workspaces/${workspaceId}/connections`, ...authentic,
    payload: { connectionId, connectorId: 'sankhya', label: '  ERP principal  ', credential },
  })
  assert.equal(created.statusCode, 201)
  assert.equal(store.calls.at(-1).input.body.label, 'ERP principal')
})

test('an authentication check answers only a closed outcome and never carries a provider value', async (t) => {
  const seen = []
  const app = await makeApp(makeStore(), { checkConnection: async (input) => { seen.push(input); return 'CONNECTOR_UNCONFIGURED' } })
  t.after(() => app.close())
  const response = await app.inject({ method: 'POST', url: `/api/control/workspaces/${workspaceId}/connections/${connectionId}/authentication-check`, ...authenticDelete })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), { outcome: 'CONNECTOR_UNCONFIGURED' })
  assert.deepEqual(seen, [{ accountId: adminAccountId, workspaceId, connectionId }])
})

test('an authentication check of a Connection absent from the Workspace is a 404', async (t) => {
  const app = await makeApp(makeStore(), { checkConnection: async () => { throw new Failure('CONNECTOR_CONNECTION_NOT_FOUND') } })
  t.after(() => app.close())
  const response = await app.inject({ method: 'POST', url: `/api/control/workspaces/${workspaceId}/connections/${connectionId}/authentication-check`, ...authenticDelete })
  assert.equal(response.statusCode, 404)
  assert.equal(response.json().type, 'urn:conexus:problem:CONNECTOR_CONNECTION_NOT_FOUND')
})

test('a refusal of the administrator admission is a 403 on every Connection operation', async (t) => {
  const refuse = async () => { throw new Failure('INSTALLATION_ADMINISTRATOR_REQUIRED') }
  const app = await makeApp(
    makeStore({ listConnections: refuse, createConnection: refuse, disableConnection: refuse }),
    { currentAccountId: memberAccountId, checkConnection: refuse },
  )
  t.after(() => app.close())
  const list = await app.inject({ method: 'GET', url: `/api/control/workspaces/${workspaceId}/connections`, cookies: session })
  assert.deepEqual({ status: list.statusCode, type: list.json().type }, { status: 403, type: 'urn:conexus:problem:INSTALLATION_ADMINISTRATOR_REQUIRED' })
  const create = await app.inject({ method: 'POST', url: `/api/control/workspaces/${workspaceId}/connections`, ...authentic, payload: { connectionId, connectorId: 'sankhya', label: 'x', credential } })
  assert.equal(create.statusCode, 403)
  const disable = await app.inject({ method: 'DELETE', url: `/api/control/workspaces/${workspaceId}/connections/${connectionId}`, ...authenticDelete })
  assert.equal(disable.statusCode, 403)
  const check = await app.inject({ method: 'POST', url: `/api/control/workspaces/${workspaceId}/connections/${connectionId}/authentication-check`, ...authenticDelete })
  assert.equal(check.statusCode, 403)
})

test('an Owner lists, binds and unbinds a Project Connection binding', async (t) => {
  const store = makeStore()
  const app = await makeApp(store, { currentAccountId: memberAccountId })
  t.after(() => app.close())

  const listed = await app.inject({ method: 'GET', url: `/api/control/projects/${projectId}/connection-bindings`, cookies: session })
  assert.equal(listed.statusCode, 200)
  assert.deepEqual(listed.json(), {
    entries: [
      { kind: 'binding', bindingId, name: 'erp', connectionId, connectorId: 'sankhya', label: 'ERP principal', boundAt: '2026-09-24T11:00:00.000Z' },
      { kind: 'bindable', connectionId: otherConnectionId, connectorId: 'sankhya', label: 'ERP filial' },
    ],
  })
  assert.deepEqual(store.calls.at(-1), { name: 'listProjectBindings', input: { accountId: memberAccountId, projectId } })

  const bound = await app.inject({ method: 'POST', url: `/api/control/projects/${projectId}/connection-bindings`, ...authentic, payload: { connectionId, name: 'erp' } })
  assert.equal(bound.statusCode, 201)
  assert.deepEqual(bound.json(), { kind: 'binding', bindingId, name: 'erp', connectionId, connectorId: 'sankhya', label: 'ERP principal', boundAt: '2026-09-24T11:00:00.000Z' })
  assert.deepEqual(store.calls.at(-1), { name: 'bindConnection', input: { accountId: memberAccountId, projectId, body: { connectionId, name: 'erp' } } })

  const retried = makeStore({ async bindConnection() { return { binding, created: false } } })
  const retryApp = await makeApp(retried, { currentAccountId: memberAccountId })
  t.after(() => retryApp.close())
  const retry = await retryApp.inject({ method: 'POST', url: `/api/control/projects/${projectId}/connection-bindings`, ...authentic, payload: { connectionId, name: 'erp' } })
  assert.equal(retry.statusCode, 200)

  const unbound = await app.inject({ method: 'DELETE', url: `/api/control/projects/${projectId}/connection-bindings/${bindingId}`, ...authenticDelete })
  assert.equal(unbound.statusCode, 204)
  assert.deepEqual(store.calls.at(-1), { name: 'unbindConnection', input: { accountId: memberAccountId, projectId, bindingId } })
})

test('a bind conflict is a 409, and an unbind of a binding that is not open is a 404', async (t) => {
  const app = await makeApp(makeStore({ bindConnection: async () => { throw new Failure('CONNECTOR_BINDING_CONFLICT') }, unbindConnection: async () => { throw new Failure('CONNECTOR_BINDING_NOT_FOUND') } }), { currentAccountId: memberAccountId })
  t.after(() => app.close())
  const conflict = await app.inject({ method: 'POST', url: `/api/control/projects/${projectId}/connection-bindings`, ...authentic, payload: { connectionId, name: 'erp-2' } })
  assert.deepEqual({ status: conflict.statusCode, type: conflict.json().type }, { status: 409, type: 'urn:conexus:problem:CONNECTOR_BINDING_CONFLICT' })
  const gone = await app.inject({ method: 'DELETE', url: `/api/control/projects/${projectId}/connection-bindings/${bindingId}`, ...authenticDelete })
  assert.deepEqual({ status: gone.statusCode, type: gone.json().type }, { status: 404, type: 'urn:conexus:problem:CONNECTOR_BINDING_NOT_FOUND' })
})

test('a non-member is not told the Project exists, and a Connection outside the Workspace answers the same non-disclosing 404', async (t) => {
  const notFoundStore = makeStore({ listProjectBindings: async () => { throw new Failure('PROJECT_NOT_FOUND') }, unbindConnection: async () => { throw new Failure('PROJECT_NOT_FOUND') } })
  const app = await makeApp(notFoundStore, { currentAccountId: memberAccountId })
  t.after(() => app.close())
  const listed = await app.inject({ method: 'GET', url: `/api/control/projects/${projectId}/connection-bindings`, cookies: session })
  assert.deepEqual({ status: listed.statusCode, type: listed.json().type }, { status: 404, type: 'urn:conexus:problem:PROJECT_NOT_FOUND' })
  const unbound = await app.inject({ method: 'DELETE', url: `/api/control/projects/${projectId}/connection-bindings/${bindingId}`, ...authenticDelete })
  assert.deepEqual({ status: unbound.statusCode, type: unbound.json().type }, { status: 404, type: 'urn:conexus:problem:PROJECT_NOT_FOUND' })

  const unavailableStore = makeStore({ bindConnection: async () => { throw new Failure('CONNECTOR_CONNECTION_NOT_AVAILABLE') } })
  const app2 = await makeApp(unavailableStore, { currentAccountId: memberAccountId })
  t.after(() => app2.close())
  const refused = await app2.inject({ method: 'POST', url: `/api/control/projects/${projectId}/connection-bindings`, ...authentic, payload: { connectionId, name: 'erp' } })
  assert.deepEqual({ status: refused.statusCode, type: refused.json().type }, { status: 404, type: 'urn:conexus:problem:CONNECTOR_CONNECTION_NOT_AVAILABLE' })

  const notOwnerStore = makeStore({ listProjectBindings: async () => { throw new Failure('CONNECTOR_BINDING_MANAGE_REQUIRED') } })
  const app3 = await makeApp(notOwnerStore, { currentAccountId: memberAccountId })
  t.after(() => app3.close())
  const denied = await app3.inject({ method: 'GET', url: `/api/control/projects/${projectId}/connection-bindings`, cookies: session })
  assert.deepEqual({ status: denied.statusCode, type: denied.json().type }, { status: 403, type: 'urn:conexus:problem:CONNECTOR_BINDING_MANAGE_REQUIRED' })
})

test('a state change that is not the Hub page writing is refused before the store', async (t) => {
  const store = makeStore()
  const app = await makeApp(store)
  t.after(() => app.close())
  const cases = [
    { headers: { ...authentic.headers, origin: 'https://elsewhere.test' } },
    { headers: { 'content-type': 'application/json' } },
    { headers: { ...authentic.headers, 'sec-fetch-site': 'cross-site' } },
    { headers: { ...authentic.headers, 'sec-fetch-site': 'same-site' } },
    { headers: { ...authentic.headers, 'sec-fetch-mode': 'navigate' } },
    { headers: { ...authentic.headers, 'content-type': 'application/x-www-form-urlencoded' } },
  ]
  for (const { headers } of cases) {
    const response = await app.inject({ method: 'POST', url: `/api/control/workspaces/${workspaceId}/connections`, headers, cookies: session, payload: { connectionId, connectorId: 'sankhya', label: 'x', credential } })
    assert.equal(response.statusCode, 403)
    assert.equal(response.json().type, 'urn:conexus:problem:REQUEST_AUTHENTICITY_DENIED')
  }
  assert.deepEqual(store.calls, [])
})

test('without a session every operation answers 401', async (t) => {
  const app = await makeApp(makeStore())
  t.after(() => app.close())
  assert.equal((await app.inject({ method: 'GET', url: `/api/control/workspaces/${workspaceId}/connections` })).statusCode, 401)
  assert.equal((await app.inject({ method: 'GET', url: `/api/control/projects/${projectId}/connection-bindings` })).statusCode, 401)
  assert.equal((await app.inject({
    method: 'POST', url: `/api/control/workspaces/${workspaceId}/connections`,
    headers: authentic.headers, payload: { connectionId, connectorId: 'sankhya', label: 'x', credential },
  })).statusCode, 401)
})
