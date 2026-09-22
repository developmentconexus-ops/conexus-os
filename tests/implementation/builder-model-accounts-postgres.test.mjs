import assert from 'node:assert/strict'
import { generateKeyPairSync, randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import pg from 'pg'
import { RequestContext } from '@mastra/core/request-context'
import { createEmptyDatabase, testPool } from './hub-database.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const hubBuild = mkdtempSync(resolve(repositoryRoot, 'apps/hub/builder-model-accounts-build-'))
process.once('exit', () => rmSync(hubBuild, { recursive: true, force: true }))
const compiled = spawnSync(process.execPath, [
  resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'),
  '--project', resolve(repositoryRoot, 'apps/hub/tsconfig.json'),
  '--noEmit', 'false', '--outDir', hubBuild,
], { encoding: 'utf8' })
if (compiled.status !== 0) throw new Error(`HUB_COMPILE_FAILED\n${compiled.stdout}\n${compiled.stderr}`)
const built = (path) => pathToFileURL(resolve(hubBuild, path)).href
const { composeFactory, createFactorySandbox, FACTORY_OPERATOR_ID } = await import(built('builder/factory.js'))
const { createMastraFactoryRunPorts } = await import(built('builder/factory-runtime.js'))
const { openFactoryRecords } = await import(built('builder/factory-provisioning.js'))

const ORG = 'conexus-installation'
const alice = '11111111-1111-4111-8111-111111111111'
const bob = '22222222-2222-4222-8222-222222222222'
const projectId = '33333333-3333-4333-8333-333333333333'
const conversationId = '44444444-4444-4444-8444-444444444444'

const composeOnPostgres = async (t) => {
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
    github: { appId: '1', clientId: 'client', clientSecret: 'secret', slug: 'conexus-probe', privateKey: privateKey.export({ type: 'pkcs1', format: 'pem' }) },
    stateSecret: 'state-secret-for-the-probe-only-0123456789',
    secretKey: 'a1'.repeat(32),
    publicUrl: 'https://hub.test',
    sandbox: createFactorySandbox({ apiKey: 'unused', templateId: 'conexus:tpl' }),
  })
  onCleanup(() => composition.close())
  return composition
}

// The rows a Project bound to a repository has, and the conversation a person opened on it.
const openConversation = async (composition) => {
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
  await thread.model.switch({ modelId: 'openai/gpt-5-mini' })
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
const { registerModelAccountRoutes, applyModelDefaults } = await import(built('builder/model-accounts.js'))
const { openFactoryConversationThread } = await import(built('builder/factory-routes.js'))

const openAccountsApp = async (t, composition, administrators) => {
  const app = await createHttpApp({
    registerRoutes: async (instance) => {
      await registerModelAccountRoutes(instance, {
        domains: {
          credentials: composition.storage.getDomain('model-credentials'),
          modelPacks: composition.storage.getDomain('model-packs'),
          memorySettings: composition.storage.getDomain('memory-settings'),
        },
        controller: composition.controller,
        orgId: ORG,
        origin,
        resolveCurrentSession: async (request) => {
          const accountId = request.cookies['__Host-conexus_session']
          return accountId ? { account: { accountId, displayName: accountId }, issuer: 'https://issuer.test', subject: accountId } : null
        },
        isInstallationAdministrator: async (accountId) => administrators.includes(accountId),
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

const sourceOf = (listing, provider) => listing.body.providers.find((entry) => entry.provider === provider)?.source

test('each person connects their own accounts, and only an installation administrator shares one with everyone', async (t) => {
  const composition = await composeOnPostgres(t)
  const { app, as } = await openAccountsApp(t, composition, [alice])
  const asAlice = as(alice)
  const asBob = as(bob)

  assert.equal((await asBob('PUT', '/api/control/model-accounts/anthropic/key', { key: 'sk-ant-bob' })).status, 200)
  assert.equal(sourceOf(await asBob('GET', '/api/control/model-accounts'), 'anthropic'), 'stored-user')
  assert.equal(sourceOf(await asAlice('GET', '/api/control/model-accounts'), 'anthropic'), 'none')
  assert.equal((await asBob('GET', '/api/control/model-accounts')).body.orgKeyAdmin, false)
  assert.equal((await asAlice('GET', '/api/control/model-accounts')).body.orgKeyAdmin, true)

  // Anything that writes the installation's shared row needs the administrator role.
  assert.equal((await asBob('POST', '/api/control/model-accounts/anthropic/share')).status, 403)
  assert.equal((await asBob('PUT', '/api/control/model-accounts/openai/key', { key: 'sk-bob', scope: 'org' })).status, 403)
  assert.equal((await asBob('DELETE', '/api/control/model-accounts/openai/key?scope=org')).status, 403)

  assert.equal((await asAlice('PUT', '/api/control/model-accounts/openai/key', { key: 'sk-alice' })).status, 200)
  assert.equal((await asAlice('POST', '/api/control/model-accounts/openai/share')).status, 204)
  assert.equal(sourceOf(await asBob('GET', '/api/control/model-accounts'), 'openai'), 'stored-org')
  assert.equal(sourceOf(await asAlice('GET', '/api/control/model-accounts'), 'openai'), 'stored-org')
  assert.equal((await asAlice('POST', '/api/control/model-accounts/openai/share')).status, 404)

  assert.equal((await asAlice('DELETE', '/api/control/model-accounts/openai/share')).status, 204)
  assert.equal(sourceOf(await asAlice('GET', '/api/control/model-accounts'), 'openai'), 'stored-user')
  assert.equal(sourceOf(await asBob('GET', '/api/control/model-accounts'), 'openai'), 'none')
  const credentials = composition.storage.getDomain('model-credentials')
  assert.deepEqual(await credentials.getCredential({ orgId: ORG, userId: alice }, 'openai-codex'), { type: 'api_key', key: 'sk-alice' })

  assert.equal((await asBob('DELETE', '/api/control/model-accounts/anthropic/key')).status, 200)
  assert.equal(sourceOf(await asBob('GET', '/api/control/model-accounts'), 'anthropic'), 'none')

  const forged = await app.inject({ method: 'PUT', url: '/api/control/model-accounts/anthropic/key', payload: { key: 'sk-x' }, cookies: { '__Host-conexus_session': bob } })
  assert.equal(forged.statusCode, 403)
  const anonymous = await app.inject({ method: 'GET', url: '/api/control/model-accounts' })
  assert.equal(anonymous.statusCode, 401)
})

test('a new conversation starts from the person\'s own defaults, else the installation\'s, and only an administrator sets the installation\'s', async (t) => {
  const composition = await composeOnPostgres(t)
  const projectRepositoryId = await openConversation(composition)
  const { as } = await openAccountsApp(t, composition, [alice])
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

  assert.equal((await asBob('DELETE', '/api/control/model-defaults/mine')).status, 204)
  assert.deepEqual(await modelsOf(bob), installation)
})
