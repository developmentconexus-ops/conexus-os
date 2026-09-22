import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'

const built = hubModuleUrl
const { createHttpApp } = await import(built('http/app.js'))
const { registerInstallationRoutes } = await import(built('identity-access/installation-routes.js'))
const { registerModelAccountRoutes } = await import(built('builder/model-accounts.js'))
const { registerInstallationGithubRoutes } = await import(built('builder/installation-github-routes.js'))
const { GithubRequestError } = await import(built('builder/factory-github.js'))

const origin = 'https://hub.test'
const ORG = 'conexus-installation'
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

const createFakeMemorySettings = () => {
  const rows = new Map()
  return {
    get: async ({ orgId, userId }) => rows.get(`${orgId}:${userId}`) ?? null,
    patch: async ({ orgId, userId, patch }) => {
      const key = `${orgId}:${userId}`
      const row = { orgId, userId, observerModelId: null, reflectorModelId: null, observationThreshold: null, reflectionThreshold: null, observeAttachments: null, ...rows.get(key), ...patch }
      rows.set(key, row)
      return row
    },
  }
}

const createFakeGithub = ({ app = {}, installations = [], repositories = new Map(), unreachable = false } = {}) => ({
  readApp: async () => app,
  listInstallations: async () => {
    if (unreachable) throw new GithubRequestError(503)
    return installations
  },
  readRepository: async (_installationId, slug) => {
    const repository = repositories.get(slug)
    if (!repository) throw new GithubRequestError(404)
    return repository
  },
})

const createFakeRecords = () => {
  const installations = []
  const repositoriesByInstallation = new Map()
  return {
    sourceControl: {
      installations: {
        list: async ({ orgId }) => installations.filter((row) => row.orgId === orgId),
        findByExternalId: async ({ orgId, externalId }) => installations.find((row) => row.orgId === orgId && row.externalId === externalId) ?? null,
        upsert: async ({ orgId, externalId, accountName, accountType }) => {
          const row = { id: `install-${externalId}`, orgId, externalId, accountName, accountType }
          installations.push(row)
          return row
        },
        delete: async ({ id }) => {
          const index = installations.findIndex((row) => row.id === id)
          if (index === -1) return false
          installations.splice(index, 1)
          return true
        },
      },
      repositories: {
        list: async ({ installationId }) => repositoriesByInstallation.get(installationId) ?? [],
      },
    },
    // Test setup only: seeds one recorded installation and its repository rows directly.
    seedInstallation: (row, repositories = []) => {
      installations.push(row)
      repositoriesByInstallation.set(row.id, repositories)
    },
  }
}

const buildApp = async (t, { administration = createFakeAdministration(), memorySettings = createFakeMemorySettings(), github = createFakeGithub(), records = createFakeRecords(), appSlug = 'conexus-probe' } = {}) => {
  const resolveCurrentSession = async (request) => {
    const accountId = request.cookies['__Host-conexus_session']
    return accountId ? { account: { accountId, displayName: accountId }, issuer: 'https://issuer.test', subject: accountId } : null
  }
  const isInstallationAdministrator = administration.isInstallationAdministrator
  const app = await createHttpApp({
    registerRoutes: async (instance) => {
      await registerInstallationRoutes(instance, { origin, resolveCurrentSession, installationAdministration: administration })
      await registerModelAccountRoutes(instance, {
        domains: { credentials: {}, modelPacks: {}, memorySettings },
        controller: {},
        orgId: ORG,
        origin,
        resolveCurrentSession,
        isInstallationAdministrator,
      })
      await registerInstallationGithubRoutes(instance, { origin, resolveCurrentSession, isInstallationAdministrator, github, records, orgId: ORG, appSlug })
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
  return { app, as, administration, memorySettings, github, records }
}

test('every route refuses an unauthenticated caller', async (t) => {
  const { as, app } = await buildApp(t)
  const anonymous = as(undefined)
  // GET carries no CSRF check, so the admit() path reaches the session check and answers 401.
  const reads = ['/api/control/installation', '/api/control/installation/administrators', '/api/control/installation/memory', '/api/control/installation/github']
  for (const url of reads) assert.equal((await anonymous('GET', url)).status, 401, url)

  // A write with no session and no CSRF cookie fails the authenticity check first, same as
  // model-accounts.ts's admit(): a forged write is refused before the Hub even asks who is calling.
  const writes = [
    ['POST', '/api/control/installation/administrators', { email: 'x@test.dev' }],
    ['DELETE', `/api/control/installation/administrators/${plain}`],
    ['PUT', '/api/control/installation/memory', { model: 'anthropic/claude-sonnet-4-6' }],
    ['POST', '/api/control/installation/github/connect'],
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
    ['GET', '/api/control/installation/memory'],
    ['PUT', '/api/control/installation/memory', { model: 'anthropic/claude-sonnet-4-6' }],
    ['GET', '/api/control/installation/github'],
    ['POST', '/api/control/installation/github/connect'],
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
  const putted = await app.inject({ method: 'PUT', url: '/api/control/installation/memory', ...withoutCsrf, payload: { model: 'anthropic/claude-sonnet-4-6' } })
  assert.equal(putted.statusCode, 403)
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

test('the memory GET/PUT round trip reads and writes the observer and reflector models', async (t) => {
  const { as } = await buildApp(t)
  const asAdmin = as(admin)
  assert.deepEqual(await asAdmin('GET', '/api/control/installation/memory'), { status: 200, body: { model: null } })
  const put = await asAdmin('PUT', '/api/control/installation/memory', { model: 'anthropic/claude-sonnet-4-6' })
  assert.deepEqual(put, { status: 200, body: { model: 'anthropic/claude-sonnet-4-6' } })
  assert.deepEqual(await asAdmin('GET', '/api/control/installation/memory'), { status: 200, body: { model: 'anthropic/claude-sonnet-4-6' } })
  const refused = await asAdmin('PUT', '/api/control/installation/memory', { model: 'not-a-model-id' })
  assert.equal(refused.status, 400)
})

test('the GitHub status maps not-connected, connected with a missing and a reachable repository, and gone', async (t) => {
  const notConnected = await buildApp(t)
  assert.deepEqual((await notConnected.as(admin)('GET', '/api/control/installation/github')).body, {
    state: 'not-connected', organization: null, installUrl: 'https://github.com/apps/conexus-probe/installations/new', manageUrl: null, repositories: [],
  })

  const connectedRecords = createFakeRecords()
  connectedRecords.seedInstallation({ id: 'install-1', orgId: ORG, externalId: '999', accountName: 'acme', accountType: 'Organization' }, [
    { slug: 'acme/missing-repo', externalId: '111' },
    { slug: 'acme/present-repo', externalId: '222' },
  ])
  const connectedGithub = createFakeGithub({
    installations: [{ id: 999, accountLogin: 'acme', accountType: 'Organization' }],
    repositories: new Map([['acme/present-repo', { id: 222, fullName: 'acme/present-repo', owner: 'acme', defaultBranch: 'main', private: true }]]),
  })
  const connected = await buildApp(t, { records: connectedRecords, github: connectedGithub })
  const connectedStatus = await connected.as(admin)('GET', '/api/control/installation/github')
  assert.deepEqual(connectedStatus.body, {
    state: 'connected',
    organization: { login: 'acme', type: 'Organization' },
    installUrl: 'https://github.com/apps/conexus-probe/installations/new',
    manageUrl: 'https://github.com/organizations/acme/settings/installations',
    repositories: [{ slug: 'acme/missing-repo', state: 'missing' }, { slug: 'acme/present-repo', state: 'reachable' }],
  })

  const goneRecords = createFakeRecords()
  goneRecords.seedInstallation({ id: 'install-2', orgId: ORG, externalId: '999', accountName: 'acme', accountType: 'Organization' }, [
    { slug: 'acme/present-repo', externalId: '222' },
  ])
  const goneGithub = createFakeGithub({ installations: [] })
  const gone = await buildApp(t, { records: goneRecords, github: goneGithub })
  const goneStatus = await gone.as(admin)('GET', '/api/control/installation/github')
  assert.equal(goneStatus.body.state, 'gone')
  assert.deepEqual(goneStatus.body.repositories, [{ slug: 'acme/present-repo', state: 'unknown' }])

  const unreachableRecords = createFakeRecords()
  unreachableRecords.seedInstallation({ id: 'install-3', orgId: ORG, externalId: '999', accountName: 'acme', accountType: 'Organization' }, [])
  const unreachable = await buildApp(t, { records: unreachableRecords, github: createFakeGithub({ unreachable: true }) })
  assert.equal((await unreachable.as(admin)('GET', '/api/control/installation/github')).body.state, 'unreachable')
})

test('connect maps each refusal the Factory throws to its own problem type', async (t) => {
  const scenario = async (github, expectedType, { records = createFakeRecords(), expectedStatus = 409 } = {}) => {
    const { as } = await buildApp(t, { github, records })
    const response = await as(admin)('POST', '/api/control/installation/github/connect')
    assert.equal(response.status, expectedStatus, expectedType)
    assert.equal(response.body.type.endsWith(expectedType), true, expectedType)
  }

  await scenario(createFakeGithub({ installations: [] }), 'github-installation-missing')
  await scenario(createFakeGithub({ installations: [{ id: 1, accountLogin: 'a', accountType: 'Organization' }, { id: 2, accountLogin: 'b', accountType: 'Organization' }] }), 'github-installation-ambiguous')
  await scenario(createFakeGithub({ installations: [{ id: 1, accountLogin: 'someone', accountType: 'User' }] }), 'github-organization-required')
  await scenario(createFakeGithub({ unreachable: true }), 'github-unreachable', { expectedStatus: 502 })

  const accountChangedRecords = createFakeRecords()
  accountChangedRecords.seedInstallation({ id: 'install-old', orgId: ORG, externalId: '111', accountName: 'old-org', accountType: 'Organization' }, [
    { slug: 'old-org/repo', externalId: '555' },
  ])
  const accountChangedGithub = createFakeGithub({ installations: [{ id: 222, accountLogin: 'new-org', accountType: 'Organization' }] })
  await scenario(accountChangedGithub, 'github-installation-account-changed', { records: accountChangedRecords })
})

test('a successful connect answers the fresh GitHub status', async (t) => {
  const records = createFakeRecords()
  const github = createFakeGithub({
    app: { clientId: 'client', slug: 'conexus-probe' },
    installations: [{ id: 999, accountLogin: 'acme', accountType: 'Organization' }],
  })
  const { as } = await buildApp(t, { records, github })
  const response = await as(admin)('POST', '/api/control/installation/github/connect')
  assert.equal(response.status, 200)
  assert.equal(response.body.state, 'connected')
  assert.deepEqual(response.body.organization, { login: 'acme', type: 'Organization' })
})
