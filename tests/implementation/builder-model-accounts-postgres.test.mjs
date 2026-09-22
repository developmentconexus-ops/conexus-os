import assert from 'node:assert/strict'
import { generateKeyPairSync, randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import pg from 'pg'
import { RequestContext } from '@mastra/core/request-context'
import { hubBuildDirectory, hubModuleUrl as built } from './hub-build.mjs'
import { createEmptyDatabase, testPool } from './hub-database.mjs'

const { composeFactory, createFactorySandbox, FACTORY_OPERATOR_ID } = await import(built('builder/factory.js'))
const { createMastraFactoryRunPorts } = await import(built('builder/factory-runtime.js'))
const { openFactoryRecords } = await import(built('builder/factory-provisioning.js'))
const { filterChatModels } = await import(built('builder/chat-models.js'))
const { HubSessionAuthProvider } = await import(built('builder/hub-session-auth.js'))

const ORG = 'conexus-installation'
const alice = '11111111-1111-4111-8111-111111111111'
const bob = '22222222-2222-4222-8222-222222222222'
const projectId = '33333333-3333-4333-8333-333333333333'
const conversationId = '44444444-4444-4444-8444-444444444444'

// The Hub session is the account id in the session cookie; the Factory reads it through the same
// resolver the Hub's own routes use.
const resolveCurrentSession = async (request) => {
  const accountId = request.cookies['__Host-conexus_session']
  return accountId ? { account: { accountId, displayName: accountId }, issuer: 'https://issuer.test', subject: accountId } : null
}

const composeOnPostgres = async (t, { administrators = [], ...options } = {}) => {
  const { admin, connection, onCleanup } = await createEmptyDatabase(t, 'conexus_model_accounts')
  const role = `factory_accounts_${randomUUID().replaceAll('-', '').slice(0, 12)}`
  const password = randomUUID()
  await admin.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}'`)
  onCleanup(() => admin.query(`DROP ROLE IF EXISTS ${role}`))
  const owner = new pg.Client(connection)
  await owner.connect()
  await owner.query(`CREATE SCHEMA factory AUTHORIZATION ${role}`)
  await owner.end()
  onCleanup(async () => {
    const dropper = new pg.Client(connection)
    await dropper.connect()
    await dropper.query('DROP SCHEMA IF EXISTS factory CASCADE')
    await dropper.end()
  })
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const composition = await composeFactory({
    pool: testPool({ ...connection, user: role, password, options: '-c search_path=factory', max: 4 }),
    orgId: ORG,
    auth: new HubSessionAuthProvider({ orgId: ORG, resolveCurrentSession, isInstallationAdministrator: async (accountId) => administrators.includes(accountId) }),
    github: { appId: '1', clientId: 'client', clientSecret: 'secret', slug: 'conexus-probe', privateKey: privateKey.export({ type: 'pkcs1', format: 'pem' }) },
    stateSecret: 'state-secret-for-the-probe-only-0123456789',
    secretKey: 'a1'.repeat(32),
    publicUrl: 'https://hub.test',
    sandbox: createFactorySandbox({ apiKey: 'unused', templateId: 'conexus:tpl' }),
    ...options,
  })
  onCleanup(() => composition.close())
  return composition
}

// The rows a Project bound to a repository has, and the conversation a person opened on it.
const openConversation = async (composition, modelId = 'openai/gpt-5-mini') => {
  const records = await openFactoryRecords(composition.storage)
  const { sourceControl } = records
  const installation = await sourceControl.installations.upsert({ orgId: ORG, connectedByUserId: FACTORY_OPERATOR_ID, externalId: '163574754', accountName: 'acme-org', accountType: 'Organization', providerMetadata: {} })
  const repository = await sourceControl.repositories.upsert({ orgId: ORG, input: { installationId: installation.id, externalId: '700001', slug: 'acme-org/app', defaultBranch: 'main', providerMetadata: {} } })
  const factoryProject = await records.projects.create({ orgId: ORG, userId: FACTORY_OPERATOR_ID, input: { name: `conexus-${projectId}` } })
  const connection = await sourceControl.connections.create({ orgId: ORG, factoryProjectId: factoryProject.id, installationId: installation.id, createdByUserId: FACTORY_OPERATOR_ID })
  const link = await sourceControl.projectRepositories.link({ orgId: ORG, connectionId: connection.id, repositoryId: repository.id, createdByUserId: FACTORY_OPERATOR_ID, branch: null, sandboxProvider: 'e2b', sandboxWorkdir: '/workspace', setupCommand: null })
  await sourceControl.sessions.create({ sessionId: conversationId, projectRepositoryId: link.id, orgId: ORG, userId: alice, branch: `conexus/${conversationId}`, baseBranch: 'main', visibility: 'org' })
  const requestContext = new RequestContext()
  requestContext.set('user', { id: alice, organizationId: ORG })
  const thread = await composition.controller.createSession({ resourceId: conversationId, ownerId: conversationId, threadId: conversationId, requestContext })
  await thread.model.switch({ modelId })
  return link.id
}

// Every model request leaves the process through fetch; the probe answers each with a refusal and
// keeps the credential it carried.
const captureModelRequests = (t) => {
  const seen = []
  const original = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    seen.push({ url, authorization: headers.get('authorization') })
    return new Response(JSON.stringify({ error: { message: 'probe refusal', type: 'invalid_request_error' } }), { status: 401, headers: { 'content-type': 'application/json' } })
  }
  t.after(() => { globalThis.fetch = original })
  return seen
}

const runAs = async (composition, accountId) => {
  const ports = createMastraFactoryRunPorts({ composition, orgId: ORG, log: () => undefined })
  const run = await ports.openSession({ conversationId, builderRunId: randomUUID(), projectId, accountId })
  try {
    await run.configure({ mode: 'BUILD', instructions: 'Answer briefly.' })
    // The probe refuses every model request, so the turn fails; what it sent is the evidence.
    return await run.sendTurn('Olá').catch((error) => error.message)
  } finally {
    await run.close().catch(() => undefined)
  }
}

const openAiCredentialsSent = (seen) => seen.filter(({ url }) => url.startsWith('https://api.openai.com/')).map(({ authorization }) => authorization)

test('a run uses the credential of the person who started it, else the installation\'s shared one, and never another person\'s', async (t) => {
  const composition = await composeOnPostgres(t)
  await openConversation(composition)
  const credentials = composition.storage.getDomain('model-credentials')
  await credentials.setCredential({ orgId: ORG, userId: alice }, 'openai-codex', { type: 'api_key', key: 'sk-alice-own' })
  await credentials.setCredential({ orgId: ORG }, 'openai-codex', { type: 'api_key', key: 'sk-installation-shared' })
  const seen = captureModelRequests(t)

  await runAs(composition, alice)
  assert.deepEqual([...new Set(openAiCredentialsSent(seen))], ['Bearer sk-alice-own'])

  seen.length = 0
  await runAs(composition, bob)
  assert.deepEqual([...new Set(openAiCredentialsSent(seen))], ['Bearer sk-installation-shared'])

  // With nothing shared, Bob has no credential at all: Alice's is not his to use.
  await credentials.removeCredential({ orgId: ORG }, 'openai-codex')
  const { invalidateTenantCredentialSnapshots } = await import('@mastra/factory/routes/tenant-credentials')
  invalidateTenantCredentialSnapshots({ orgId: ORG })
  seen.length = 0
  assert.equal(await runAs(composition, bob), 'BUILDER_MODEL_AUTH_FAILED')
  assert.deepEqual(openAiCredentialsSent(seen), [])
})

const origin = 'https://hub.test'
const { createHttpApp } = await import(built('http/app.js'))
const { FACTORY_CREDENTIAL_ROUTES, registerModelAccountRoutes, applyModelDefaults } = await import(built('builder/model-accounts.js'))
const { registerFactoryApiRoutes } = await import(built('builder/mastra-session-routes.js'))
const { openFactoryConversationThread } = await import(built('builder/factory-routes.js'))

const openAccountsApp = async (t, composition, administrators, googleAiPro) => {
  const app = await createHttpApp({
    registerRoutes: async (instance) => {
      await registerFactoryApiRoutes(instance, { mastra: composition.mastra, routes: FACTORY_CREDENTIAL_ROUTES, origin, resolveCurrentSession })
      await registerModelAccountRoutes(instance, {
        domains: {
          credentials: composition.storage.getDomain('model-credentials'),
          modelPacks: composition.storage.getDomain('model-packs'),
          memorySettings: composition.storage.getDomain('memory-settings'),
        },
        orgId: ORG,
        origin,
        resolveCurrentSession,
        isInstallationAdministrator: async (accountId) => administrators.includes(accountId),
        ...(googleAiPro ? { googleAiPro } : {}),
      })
      return []
    },
    staticRoot: null,
  })
  t.after(() => app.close())
  const as = (accountId) => async (method, url, payload) => {
    const response = await app.inject({
      method, url, ...(payload ? { payload } : {}),
      headers: { origin, 'x-conexus-csrf': 'csrf-1', ...(payload ? { 'content-type': 'application/json' } : {}) },
      cookies: { '__Host-conexus_session': accountId, '__Host-conexus_csrf': 'csrf-1' },
    })
    return { status: response.statusCode, body: response.body ? response.json() : null }
  }
  return { app, as }
}

test('a person signs in to Google AI Pro from Settings, and their runs then carry their own record to the router', async (t) => {
  const { chmodSync, copyFileSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { createCliproxyPool } = await import(built('builder/google-ai-pro/pool.js'))
  const { syncGoogleAiProProvider } = await import(built('builder/factory.js'))
  const scratch = mkdtempSync(resolve(tmpdir(), 'conexus-google-ai-pro-'))
  t.after(() => rmSync(scratch, { recursive: true, force: true }))
  const binary = resolve(scratch, 'cli-proxy-api')
  copyFileSync(resolve(import.meta.dirname, 'builder-google-ai-pro-fake-cliproxy.mjs'), binary)
  chmodSync(binary, 0o755)
  const pool = createCliproxyPool({ binary, stateDir: resolve(scratch, 'state') })
  t.after(() => pool.close())

  const router = 'http://127.0.0.1:59999'
  const composition = await composeOnPostgres(t, { googleAiProUrl: router })
  const customProviders = composition.storage.getDomain('custom-providers')
  const providerUrls = async () => (await customProviders.list({ orgId: ORG })).map((row) => row.url)
  assert.deepEqual(await providerUrls(), [`${router}/v1`], 'the installation routes the provider right after boot')
  await openConversation(composition, 'mastracode/google-ai-pro/gemini-3.1-pro-low')

  const { as } = await openAccountsApp(t, composition, [], pool)
  const asAlice = as(alice)
  const connection = '/api/control/model-accounts/google-ai-pro/connection'
  assert.deepEqual((await asAlice('GET', connection)).body, { mine: false, shared: false, administrator: false })
  const offered = async (accountId) => (await as(accountId)('GET', '/api/control/model-accounts/models')).body.models
    .filter((model) => model.provider === 'mastracode/google-ai-pro').map((model) => model.id)
  assert.deepEqual(await offered(alice), [], 'a person without the connection is offered none of its models')
  const { loginId, url } = (await asAlice('POST', '/api/control/model-accounts/google-ai-pro/login/start', {})).body
  const callbackUrl = `http://localhost:51121/oauth-callback?state=${new URL(url).searchParams.get('state')}&code=good`
  assert.equal((await asAlice('POST', '/api/control/model-accounts/google-ai-pro/login/complete', { loginId, callbackUrl })).status, 200)
  let state = 'waiting'
  for (let polls = 0; state === 'waiting' && polls < 100; polls++) state = (await asAlice('GET', `/api/control/model-accounts/google-ai-pro/login/${loginId}`)).body.state
  assert.equal(state, 'succeeded')
  assert.deepEqual((await asAlice('GET', connection)).body, { mine: true, shared: false, administrator: false })
  assert.deepEqual((await as(bob)('GET', connection)).body, { mine: false, shared: false, administrator: false })
  assert.deepEqual((await offered(alice)).sort(), [
    'gemini-3-flash', 'gemini-3.1-flash-lite', 'gemini-3.1-pro-low', 'gemini-3.5-flash-lite',
    'gemini-3.6-flash-high', 'gemini-3.7-flash-high', 'gemini-3.8-flash-high', 'gemini-pro-agent',
  ].map((model) => `mastracode/google-ai-pro/${model}`).sort())
  assert.deepEqual(await offered(bob), [])
  const memory = await composition.storage.getDomain('memory-settings').get({ orgId: ORG, userId: alice })
  assert.deepEqual([memory.observerModelId, memory.reflectorModelId], ['mastracode/google-ai-pro/gemini-3.5-flash-lite', 'mastracode/google-ai-pro/gemini-3.5-flash-lite'])
  const stored = await composition.storage.getDomain('model-credentials').getCredential({ orgId: ORG, userId: alice }, 'google-ai-pro')
  assert.equal(stored.type, 'api_key')

  const seen = captureModelRequests(t)
  const routed = () => seen.filter(({ url: requested }) => requested.startsWith(`${router}/v1/`)).map(({ authorization }) => authorization)
  await runAs(composition, alice)
  assert.deepEqual([...new Set(routed())], [`Bearer ${stored.key}`])

  seen.length = 0
  assert.equal(await runAs(composition, bob), 'BUILDER_MODEL_AUTH_FAILED')
  assert.deepEqual(routed(), [])

  await syncGoogleAiProProvider(customProviders, ORG, undefined)
  assert.deepEqual(await providerUrls(), [], 'without a router the installation has no such provider')
})

test('the operator imports a CLIProxyAPI Antigravity file as a person\'s or the shared Google AI Pro row, idempotently and without printing it', async (t) => {
  const { writeFileSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { importGoogleAiProLogin } = await import(built('builder/factory-provisioning.js'))
  const { decodeKey, parseKey } = await import(built('builder/google-ai-pro/credential.js'))
  const composition = await composeOnPostgres(t)
  const credentials = composition.storage.getDomain('model-credentials')
  const memorySettings = composition.storage.getDomain('memory-settings')
  const directory = mkdtempSync(resolve(tmpdir(), 'conexus-agy-import-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const record = { type: 'antigravity', email: 'person@example.com', refresh_token: 'refresh-secret-value', access_token: 'access-secret-value' }
  const authFile = resolve(directory, 'antigravity-person@example.com.json')
  writeFileSync(authFile, JSON.stringify(record))
  const lines = []
  const importAs = (accountId, file = authFile) => importGoogleAiProLogin({ credentials, memorySettings, orgId: ORG, accountId, authFile: file, write: (line) => lines.push(line) })

  await importAs(alice)
  await importAs(alice)
  await importAs(null)
  assert.deepEqual(lines, [
    `GOOGLE_AI_PRO_LOGIN_IMPORTED=google-ai-pro:api_key:${alice}`,
    `GOOGLE_AI_PRO_LOGIN_IMPORTED=google-ai-pro:api_key:${alice}`,
    'GOOGLE_AI_PRO_LOGIN_IMPORTED=google-ai-pro:api_key:shared',
  ])
  for (const tenant of [{ orgId: ORG, userId: alice }, { orgId: ORG }]) {
    const row = await credentials.getCredential(tenant, 'google-ai-pro')
    assert.equal(row.type, 'api_key')
    const stored = decodeKey(parseKey(row.key))
    assert.equal(stored.fileName, 'antigravity-person@example.com.json')
    assert.deepEqual(JSON.parse(Buffer.from(stored.bytes).toString()), record)
  }
  const memory = await memorySettings.get({ orgId: ORG, userId: alice })
  assert.deepEqual([memory.observerModelId, memory.reflectorModelId], ['mastracode/google-ai-pro/gemini-3.5-flash-lite', 'mastracode/google-ai-pro/gemini-3.5-flash-lite'])
  await memorySettings.patch({ orgId: ORG, userId: bob, patch: { observerModelId: 'openai/gpt-5-mini' } })
  await importAs(bob)
  assert.equal((await memorySettings.get({ orgId: ORG, userId: bob })).observerModelId, 'openai/gpt-5-mini', 'a model the person chose is kept')
  assert.equal(lines.some((line) => /secret-value|cxagy1/.test(line)), false)

  const renamed = resolve(directory, 'credentials.json')
  writeFileSync(renamed, JSON.stringify(record))
  await assert.rejects(importAs(alice, renamed), { message: 'GOOGLE_AI_PRO_LOGIN_FILE_REFUSED' })
  const codex = resolve(directory, 'antigravity-codex@example.com.json')
  writeFileSync(codex, JSON.stringify({ type: 'codex' }))
  await assert.rejects(importAs(alice, codex), { message: 'GOOGLE_AI_PRO_LOGIN_UNREADABLE' })
  const garbled = resolve(directory, 'antigravity-garbled@example.com.json')
  writeFileSync(garbled, 'not json')
  await assert.rejects(importAs(alice, garbled), { message: 'GOOGLE_AI_PRO_LOGIN_UNREADABLE' })
  await assert.rejects(importAs(alice, resolve(directory, 'antigravity-absent@example.com.json')), { message: 'GOOGLE_AI_PRO_LOGIN_UNREADABLE' })
  await assert.rejects(importAs('not-an-account'), { message: 'GOOGLE_AI_PRO_LOGIN_ACCOUNT_REFUSED' })

  for (const args of [['--shared'], ['--auth-file', authFile], ['--auth-file', authFile, '--shared', '--account-id', alice]]) {
    const ran = spawnSync(process.execPath, [resolve(hubBuildDirectory(), 'factory-cli.js'), 'import-google-ai-pro-login', ...args], { encoding: 'utf8', env: { PATH: process.env.PATH } })
    assert.equal(ran.status, 1, `${args}: ${ran.stdout}${ran.stderr}${ran.error ?? ''}`)
    assert.match(ran.stderr, /^usage: factory-cli /, `${args}: ${ran.stdout}${ran.stderr}${ran.error ?? ''}`)
  }
})

const sourceOf = (listing, provider) => listing.body.providers.find((entry) => entry.provider === provider)?.source

test('each person connects their own accounts, and only an installation administrator shares one with everyone', async (t) => {
  const composition = await composeOnPostgres(t, { administrators: [alice] })
  const { app, as } = await openAccountsApp(t, composition, [alice])
  const asAlice = as(alice)
  const asBob = as(bob)

  assert.equal((await asBob('PUT', '/web/config/providers/anthropic/key', { key: 'sk-ant-bob' })).status, 200)
  assert.equal(sourceOf(await asBob('GET', '/web/config/providers'), 'anthropic'), 'stored-user')
  const offersAnthropic = async (ask) => (await ask('GET', '/api/control/model-accounts/models')).body.models.some((model) => model.provider === 'anthropic')
  assert.equal(await offersAnthropic(asBob), true, 'the picker offers what the person connected')
  assert.equal(await offersAnthropic(asAlice), false, 'and not what someone else connected')
  assert.equal(sourceOf(await asAlice('GET', '/web/config/providers'), 'anthropic'), 'none')
  assert.equal((await asBob('GET', '/web/config/providers')).body.orgKeyAdmin, false)
  assert.equal((await asAlice('GET', '/web/config/providers')).body.orgKeyAdmin, true)

  // Anything that writes the installation's shared row needs the administrator role.
  assert.equal((await asBob('POST', '/api/control/model-accounts/anthropic/share')).status, 403)
  assert.equal((await asBob('PUT', '/web/config/providers/openai/key', { key: 'sk-bob', scope: 'org' })).status, 403)
  assert.equal((await asBob('DELETE', '/web/config/providers/openai/key?scope=org')).status, 403)

  assert.equal((await asAlice('PUT', '/web/config/providers/openai/key', { key: 'sk-alice' })).status, 200)
  assert.equal((await asAlice('POST', '/api/control/model-accounts/openai/share')).status, 204)
  assert.equal(sourceOf(await asBob('GET', '/web/config/providers'), 'openai'), 'stored-org')
  assert.equal(sourceOf(await asAlice('GET', '/web/config/providers'), 'openai'), 'stored-org')
  assert.equal((await asAlice('POST', '/api/control/model-accounts/openai/share')).status, 404)

  assert.equal((await asAlice('DELETE', '/api/control/model-accounts/openai/share')).status, 204)
  assert.equal(sourceOf(await asAlice('GET', '/web/config/providers'), 'openai'), 'stored-user')
  assert.equal(sourceOf(await asBob('GET', '/web/config/providers'), 'openai'), 'none')
  const credentials = composition.storage.getDomain('model-credentials')
  assert.deepEqual(await credentials.getCredential({ orgId: ORG, userId: alice }, 'openai-codex'), { type: 'api_key', key: 'sk-alice' })

  assert.equal((await asBob('DELETE', '/web/config/providers/anthropic/key')).status, 200)
  assert.equal(sourceOf(await asBob('GET', '/web/config/providers'), 'anthropic'), 'none')

  const forged = await app.inject({ method: 'PUT', url: '/web/config/providers/anthropic/key', payload: { key: 'sk-x' }, cookies: { '__Host-conexus_session': bob } })
  assert.equal(forged.statusCode, 403)
  const anonymous = await app.inject({ method: 'GET', url: '/web/config/providers' })
  assert.equal(anonymous.statusCode, 401)
  // The Hub serves only the Factory's credential routes; the rest of its surface is not reachable.
  for (const url of ['/auth/me', '/web/intake/label-routes', '/web/config/memory']) assert.equal((await asAlice('GET', url)).status, 404, url)
})

test('with the Factory reading the Hub session, the browser\'s Mastra session routes still answer the admitted person', async (t) => {
  const composition = await composeOnPostgres(t)
  await openConversation(composition)
  const { registerFactoryMastraRoutes } = await import(built('builder/mastra-session-routes.js'))
  const app = await createHttpApp({
    registerRoutes: async (instance) => {
      await registerFactoryMastraRoutes(instance, {
        mastra: composition.mastra, controllerId: composition.controllerId, controller: composition.controller, origin, orgId: ORG,
        resolveCurrentSession, admitConversation: async () => true,
      })
      return []
    },
    staticRoot: null,
  })
  t.after(() => app.close())
  const threads = await app.inject({
    method: 'GET', url: `/api/mastra-factory/agent-controller/${composition.controllerId}/sessions/${conversationId}/threads`,
    cookies: { '__Host-conexus_session': alice },
  })
  assert.equal(threads.statusCode, 200, threads.body)
  assert.deepEqual(threads.json().threads.map((thread) => thread.id), [conversationId])
})

test('a conversation is created by the Factory\'s own session route, only for a person who may build its Project', async (t) => {
  const composition = await composeOnPostgres(t)
  const projectRepositoryId = await openConversation(composition)
  const { registerFactoryConversationRoutes, openFactoryConversationThread: openThread, FACTORY_SESSION_ROUTE } = await import(built('builder/factory-routes.js'))
  const builders = new Set([alice])
  const app = await createHttpApp({
    registerRoutes: async (instance) => {
      await registerFactoryApiRoutes(instance, {
        mastra: composition.mastra, routes: new Set([FACTORY_SESSION_ROUTE]), origin, resolveCurrentSession,
        admit: async ({ accountId, params }) => builders.has(accountId) && params.id === projectRepositoryId,
      })
      return registerFactoryConversationRoutes(instance, {
        readFactoryBinding: async ({ accountId }) => {
          if (!builders.has(accountId)) throw new Error('NOT_AUTHORIZED')
          return { projectId, projectRepositoryId, repositoryId: 'unused' }
        },
        sessions: composition.github.sourceControlStorage.sessions,
        controller: composition.controller,
        origin, resolveCurrentSession,
        openThread: openThread({ controller: composition.controller, orgId: ORG }),
      })
    },
    staticRoot: null,
  })
  t.after(() => app.close())
  const as = (accountId) => ({
    headers: { origin, 'x-conexus-csrf': 'csrf-1', 'content-type': 'application/json' },
    cookies: { '__Host-conexus_session': accountId, '__Host-conexus_csrf': 'csrf-1' },
  })
  const conversation = randomUUID()
  const first = await app.inject({ method: 'POST', url: `/api/control/projects/${projectId}/conversations`, ...as(alice), payload: { conversationId: conversation } })
  assert.equal(first.statusCode, 201, first.body)
  const row = await composition.github.sourceControlStorage.sessions.getBySessionId(conversation)
  assert.deepEqual(
    { projectRepositoryId: row.projectRepositoryId, userId: row.userId, branch: row.branch, baseBranch: row.baseBranch, visibility: row.visibility },
    { projectRepositoryId, userId: alice, branch: `conexus/${conversation}`, baseBranch: 'main', visibility: 'org' },
  )
  const retried = await app.inject({ method: 'POST', url: `/api/control/projects/${projectId}/conversations`, ...as(alice), payload: { conversationId: conversation } })
  assert.equal(retried.statusCode, 200)
  assert.deepEqual(retried.json(), first.json())

  const direct = await app.inject({ method: 'POST', url: `/web/github/projects/${projectRepositoryId}/sessions`, ...as(bob), payload: { sessionId: randomUUID() } })
  assert.equal(direct.statusCode, 403, 'the Factory route is reachable only with the Project\'s build authority')
})

test('a new conversation starts from the person\'s own defaults, else the installation\'s, and only an administrator sets the installation\'s', async (t) => {
  const composition = await composeOnPostgres(t, { administrators: [alice] })
  const projectRepositoryId = await openConversation(composition)
  const { app, as } = await openAccountsApp(t, composition, [alice])
  const asAlice = as(alice)
  const asBob = as(bob)
  const installation = { build: 'anthropic/claude-sonnet-4-6', fast: 'anthropic/claude-haiku-4-5' }
  const bobs = { build: 'openai/gpt-5.5', fast: 'openai/gpt-5-mini' }

  assert.equal((await asBob('PUT', '/api/control/model-defaults/installation', installation)).status, 403)
  assert.equal((await asAlice('PUT', '/api/control/model-defaults/installation', installation)).status, 200)
  assert.equal((await asBob('PUT', '/api/control/model-defaults/mine', bobs)).status, 200)
  assert.deepEqual((await asBob('GET', '/api/control/model-defaults')).body, { installation, mine: bobs, administrator: false })
  assert.deepEqual((await asAlice('GET', '/api/control/model-defaults')).body, { installation, mine: null, administrator: true })

  const records = await openFactoryRecords(composition.storage)
  const openThread = openFactoryConversationThread({ controller: composition.controller, orgId: ORG, applyDefaults: applyModelDefaults({ modelPacks: composition.storage.getDomain('model-packs'), orgId: ORG }) })
  const modelsOf = async (accountId) => {
    const conversation = randomUUID()
    await records.sourceControl.sessions.create({ sessionId: conversation, projectRepositoryId, orgId: ORG, userId: accountId, branch: `conexus/${conversation}`, baseBranch: 'main', visibility: 'org' })
    await openThread({ conversationId: conversation, accountId })
    const session = await composition.controller.getSessionByResource(conversation)
    return { build: await session.thread.getSetting({ key: 'modeModelId_build' }), fast: await session.thread.getSetting({ key: 'modeModelId_fast' }) }
  }
  assert.deepEqual(await modelsOf(bob), bobs)
  assert.deepEqual(await modelsOf(alice), installation)

  const labelled = await app.inject({
    method: 'DELETE', url: '/api/control/model-defaults/mine',
    headers: { origin, 'x-conexus-csrf': 'csrf-1', 'content-type': 'application/json' },
    cookies: { '__Host-conexus_session': bob, '__Host-conexus_csrf': 'csrf-1' },
  })
  assert.equal(labelled.statusCode, 204, 'a DELETE labelled JSON with no body is accepted')
  assert.deepEqual(await modelsOf(bob), installation)
})

test('the operator imports a host Mastra Code login into the Factory, as the shared row or one person\'s, idempotently and without printing it', async (t) => {
  const { writeFileSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { importHostCredential } = await import(built('builder/factory-provisioning.js'))
  const composition = await composeOnPostgres(t)
  const credentials = composition.storage.getDomain('model-credentials')
  const directory = mkdtempSync(resolve(tmpdir(), 'conexus-host-auth-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const authFile = resolve(directory, 'auth.json')
  const login = { type: 'oauth', access: 'host-access-token', refresh: 'host-refresh-token', expires: 4102444800000, accountId: 'chatgpt-account' }
  writeFileSync(authFile, JSON.stringify({ 'openai-codex': login, anthropic: { type: 'api_key', key: 'sk-ant-host' } }))
  const lines = []
  const importAs = (provider, accountId) => importHostCredential({ credentials, orgId: ORG, provider, accountId, authFile, write: (line) => lines.push(line) })

  await importAs('openai-codex', null)
  await importAs('openai', null)
  await importAs('anthropic', bob)
  assert.deepEqual(lines, [
    'FACTORY_HOST_CREDENTIAL_IMPORTED=openai-codex:oauth:shared',
    'FACTORY_HOST_CREDENTIAL_IMPORTED=openai-codex:oauth:shared',
    `FACTORY_HOST_CREDENTIAL_IMPORTED=anthropic:api_key:${bob}`,
  ])
  assert.deepEqual(await credentials.getCredential({ orgId: ORG }, 'openai-codex'), login)
  assert.deepEqual(await credentials.getCredential({ orgId: ORG, userId: bob }, 'anthropic'), { type: 'api_key', key: 'sk-ant-host' })
  assert.deepEqual((await credentials.listCredentials(ORG, alice)).map(({ provider, scope }) => [provider, scope]), [['openai-codex', 'org']])

  await assert.rejects(importAs('xai', null), { message: 'FACTORY_HOST_CREDENTIAL_MISSING:xai' })
  await assert.rejects(importAs('openai', 'not-an-account'), { message: 'FACTORY_HOST_CREDENTIAL_ACCOUNT_REFUSED' })
  await assert.rejects(importHostCredential({ credentials, orgId: ORG, provider: 'openai', accountId: null, authFile: resolve(directory, 'absent.json'), write: () => undefined }), { message: 'FACTORY_HOST_AUTH_FILE_UNREADABLE' })
  assert.equal(lines.some((line) => /host-access|host-refresh|sk-ant/.test(line)), false)
})

test('GET /api/control/model-accounts/models keeps chat models and drops image, embedding, and speech ones', () => {
  const catalog = [
    { id: 'openai/gpt-5-mini', provider: 'openai', modelName: 'gpt-5-mini', hasApiKey: true },
    { id: 'anthropic/claude-sonnet-5', provider: 'anthropic', modelName: 'claude-sonnet-5', hasApiKey: true },
    { id: 'openai/dall-e-3', provider: 'openai', modelName: 'dall-e-3', hasApiKey: true },
    { id: 'openai/text-embedding-3-small', provider: 'openai', modelName: 'text-embedding-3-small', hasApiKey: true },
    { id: 'openai/tts-1-hd', provider: 'openai', modelName: 'tts-1-hd', hasApiKey: true },
  ]

  assert.deepEqual(filterChatModels(catalog).map((model) => model.id), [
    'openai/gpt-5-mini',
    'anthropic/claude-sonnet-5',
  ])
})
