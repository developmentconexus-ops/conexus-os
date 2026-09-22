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
