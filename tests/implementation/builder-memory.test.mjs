import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { Mastra } from '@mastra/core/mastra'
import { RequestContext } from '@mastra/core/request-context'
import { LibSQLStore } from '@mastra/libsql'
import { PgFactoryStorage } from '@mastra/pg'
import { createEmptyDatabase, query, testPool } from './hub-database.mjs'
import { hubModuleUrl } from './hub-build.mjs'

const built = hubModuleUrl
const { createHttpApp } = await import(built('http/app.js'))
const { createBuilderController } = await import(built('builder/harness/controller.js'))
const { BuilderMemorySettings, createBuilderMemory, MEMORY_SETTINGS_KEY } = await import(built('builder/memory.js'))
const { registerModelAccountRoutes } = await import(built('builder/model-accounts.js'))
const { registerBuilderSessionRoutes } = await import(built('builder/mastra-session-routes.js'))
const { createConversations } = await import(built('builder/conversations.js'))
const { createModelRouting, RUN_ACCOUNT_ID_KEY, RUN_ID_KEY } = await import(built('builder/model-routing.js'))
const { createBuilderStorage } = await import(built('builder/module.js'))

const ana = '22222222-2222-4222-8222-222222222222'
const bia = '55555555-5555-4555-8555-555555555555'
const runId = '44444444-4444-4444-8444-444444444444'
const usage = { inputTokens: 10, outputTokens: 10, totalTokens: 20 }
const OBSERVATIONS = '<observations>\n* 🔴 (09:00) Ana quer uma agenda semanal.\n</observations>'
const streamOf = (text) => new ReadableStream({ start(controller) {
  for (const part of [
    { type: 'stream-start', warnings: [] }, { type: 'text-start', id: 't' }, { type: 'text-delta', id: 't', delta: text }, { type: 'text-end', id: 't' },
    { type: 'finish', finishReason: 'stop', usage },
  ]) controller.enqueue(part)
  controller.close()
} })

// The Hub's routing over one provider whose accounts are "acct-<person>". Each call names the model
// it reached and the account that paid for it; the Observer answers with a fixed log.
const probeRouting = () => {
  const calls = []
  const recorded = []
  const model = (name, paidBy) => ({
    specificationVersion: 'v2', provider: 'probe', modelId: name, supportedUrls: {},
    async doGenerate() {
      calls.push([name, paidBy])
      return { content: [{ type: 'text', text: OBSERVATIONS }], finishReason: 'stop', usage, warnings: [] }
    },
    async doStream() {
      calls.push([name, paidBy])
      return { stream: streamOf(name === 'main' ? 'Certo, vou planejar a agenda.' : OBSERVATIONS) }
    },
  })
  const routing = createModelRouting({
    routes: { probe: { accountProvider: 'probe', take: (account) => ({ modelProvider: 'probe', model: async (name) => model(name, account.modelAccountId) }) } },
    modelAccounts: { usable: async (accountId) => ({ modelAccountId: `acct-${accountId}`, kind: 'api_key', secret: 'x' }) },
    modelOf: async () => null,
    readDefault: async () => 'probe/main',
    record: async (builderRunId, modelAccountId) => { recorded.push([builderRunId, modelAccountId]) },
  })
  return { routing, calls, recorded }
}

// What run-runtime.ts binds on every turn of a run, with the settings of the person it runs for.
const runContext = (settings) => {
  const requestContext = new RequestContext()
  requestContext.setRaw(RUN_ID_KEY, runId)
  requestContext.setRaw(RUN_ACCOUNT_ID_KEY, ana)
  if (settings) requestContext.setRaw(MEMORY_SETTINGS_KEY, settings)
  return requestContext
}

const builderWithMemory = async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'builder-memory-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const storage = new LibSQLStore({ id: 'builder-memory', url: `file:${join(dir, 'memory.db')}` })
  const probe = probeRouting()
  const controller = createBuilderController({
    model: probe.routing.resolve,
    storage,
    memory: createBuilderMemory({ storage, roleModel: (requestContext, modelId) => probe.routing.resolve({ requestContext }, modelId) }),
  })
  await controller.init()
  t.after(() => controller.destroy())
  return { controller, storage, ...probe }
}

const firstWindows = async (controller, settings, content, { resourceId = 'project:memory', threadId } = {}) => {
  const session = await controller.createSession({ resourceId, scope: `builder:${runId}`, requestContext: runContext(settings), ...(threadId ? { threadId } : {}) })
  const windows = []
  session.subscribe((event) => { if (event.type === 'om_status') windows.push(event.windows.active) })
  await session.sendMessage({ content, requestContext: runContext(settings) })
  return windows
}

const LONG_REQUEST = `Quero uma agenda semanal. ${'Detalhes da agenda. '.repeat(400)}`

test('a run observes its conversation at the thresholds the person chose, on their observer model, paid by their account', async (t) => {
  const { controller, calls, recorded } = await builderWithMemory(t)
  const settings = { observerModelId: 'probe/observer', reflectorModelId: null, observationThreshold: 1_000, reflectionThreshold: 2_000 }

  const windows = await firstWindows(controller, settings, LONG_REQUEST)

  assert.deepEqual(windows[0], { messages: { tokens: 0, threshold: 1_000 }, observations: { tokens: 14, threshold: 2_000 } }, 'the request was observed before the first answer')
  const payer = `acct-${ana}`
  assert.deepEqual(calls, [['observer', payer], ['main', payer]], 'the Observer ran inside the run, on the chosen model and the person\'s account')
  assert.deepEqual([...new Set(recorded.map(([run, account]) => `${run}:${account}`))], [`${runId}:${payer}`], 'every call, the Observer\'s included, is recorded on the run')
})

test('with no model chosen, the Observer is the conversation\'s own model', async (t) => {
  const { controller, calls } = await builderWithMemory(t)

  await firstWindows(controller, { observerModelId: null, reflectorModelId: null, observationThreshold: 1_000, reflectionThreshold: 2_000 }, LONG_REQUEST)

  assert.deepEqual(calls, [['main', `acct-${ana}`], ['main', `acct-${ana}`]], 'the observation, then the answer, both on the conversation\'s model')
})

test('a run with no settings bound keeps Mastra Code\'s thresholds', async (t) => {
  const { controller } = await builderWithMemory(t)

  const windows = await firstWindows(controller, undefined, 'Quero uma agenda semanal.')

  assert.deepEqual(windows[0], { messages: { tokens: 35, threshold: 30_000 }, observations: { tokens: 0, threshold: 40_000 } })
})

const origin = 'https://conexus.test'
const authentic = {
  headers: { origin, 'x-conexus-csrf': 'csrf-1', 'content-type': 'application/json' },
  cookies: { '__Host-conexus_session': 'session-1', '__Host-conexus_csrf': 'csrf-1' },
}
const memoryUrl = '/api/control/model-accounts/memory'

const projectId = '33333333-3333-4333-8333-333333333333'
const conversationId = '77777777-7777-4777-8777-777777777777'

test('the conversation\'s own session shows the memory a run of it stored, through the Hub\'s mount', async (t) => {
  const { controller, storage } = await builderWithMemory(t)
  const mastra = new Mastra({ storage, agentControllers: { 'conexus-builder': controller }, logger: false })
  const conversations = createConversations(async () => storage.getStore('memory'))
  const app = await createHttpApp({
    registerRoutes: async (instance) => {
      await registerBuilderSessionRoutes(instance, {
        mastra, controllerId: 'conexus-builder', controller, origin,
        resolveCurrentSession: async () => ({ account: { accountId: ana, displayName: 'Ana' }, issuer: 'https://issuer.test', subject: 'ana' }),
        admitProject: async () => true,
        conversationOwner: ({ projectId: project, conversationId: conversation }) => conversations.ownerOf(project, conversation),
        projectBusy: async () => false,
        runContext: () => undefined,
      })
      return []
    },
    staticRoot: null,
  })
  t.after(() => app.close())

  await firstWindows(controller, { observerModelId: 'probe/observer', reflectorModelId: null, observationThreshold: 1_000, reflectionThreshold: 2_000 }, LONG_REQUEST,
    { resourceId: `project:${projectId}`, threadId: conversationId })
  const state = await app.inject({ method: 'GET', url: `/api/builder/agent-controller/conexus-builder/sessions/project:${projectId}?sessionScope=conversation:${conversationId}`, ...authentic })

  const { pendingTokens, threshold, observationTokens, reflectionThreshold } = state.json().omProgress
  assert.deepEqual({ status: state.statusCode, pendingTokens, threshold, observationTokens, reflectionThreshold },
    { status: 200, pendingTokens: 0, threshold: 1_000, observationTokens: 14, reflectionThreshold: 2_000 })
})

test('an Observer call outside a run has no one to pay for it and is refused before any account is used', async () => {
  const { routing, recorded } = probeRouting()
  const noRun = new RequestContext()
  noRun.setRaw(RUN_ACCOUNT_ID_KEY, ana)

  await assert.rejects(routing.resolve({ requestContext: noRun }, 'probe/observer'), /^Error: BUILDER_MODEL_NOT_SELECTED$/)
  await assert.rejects(routing.resolve({ requestContext: new RequestContext() }, null), /^Error: BUILDER_MODEL_NOT_SELECTED$/)
  assert.deepEqual(recorded, [])
})


// The settings routes over an in-memory stand-in of the store; the store itself is proven on
// Postgres below. Ana has a Claude subscription, so the Anthropic models are hers to choose.
const createApp = async (t) => {
  const stored = new Map()
  let caller = ana
  const app = await createHttpApp({
    registerRoutes: async (instance) => {
      await registerModelAccountRoutes(instance, {
        origin,
        resolveCurrentSession: async (request) => request.cookies['__Host-conexus_session'] ? { account: { accountId: caller } } : null,
        isInstallationAdministrator: async () => false,
        modelAccounts: {
          connection: async (accountId, provider) => ({ mine: accountId === ana && provider === 'anthropic' ? 'oauth' : null, shared: false }),
          hasShared: async () => false,
        },
        memorySettings: {
          read: async (accountId) => stored.get(accountId) ?? { observerModelId: null, reflectorModelId: null, observationThreshold: 30_000, reflectionThreshold: 40_000 },
          write: async (accountId, settings) => { stored.set(accountId, settings); return settings },
        },
      })
      return []
    },
    staticRoot: null,
  })
  t.after(() => app.close())
  return { app, stored, as: (accountId) => { caller = accountId } }
}

const chosen = { observerModelId: 'anthropic/claude-haiku-4-5', reflectorModelId: null, observationThreshold: 50_000, reflectionThreshold: 60_000 }

test('the person reads their memory settings, and a write replaces them for them alone', async (t) => {
  const { app, as } = await createApp(t)

  const before = await app.inject({ method: 'GET', url: memoryUrl, ...authentic })
  assert.deepEqual([before.statusCode, before.json()], [200, { settings: { observerModelId: null, reflectorModelId: null, observationThreshold: 30_000, reflectionThreshold: 40_000 } }])

  const written = await app.inject({ method: 'PUT', url: memoryUrl, ...authentic, payload: chosen })
  assert.deepEqual([written.statusCode, written.json()], [200, { settings: chosen }])
  assert.deepEqual((await app.inject({ method: 'GET', url: memoryUrl, ...authentic })).json(), { settings: chosen })

  as(bia)
  assert.deepEqual((await app.inject({ method: 'GET', url: memoryUrl, ...authentic })).json().settings.observerModelId, null)
})

test('a memory settings write is refused without the CSRF pair, for a model the person cannot use, and out of range', async (t) => {
  const { app, stored } = await createApp(t)
  const put = (payload, headers = authentic.headers) => app.inject({ method: 'PUT', url: memoryUrl, headers, cookies: authentic.cookies, payload })

  const forged = await put(chosen, { ...authentic.headers, 'x-conexus-csrf': 'other' })
  assert.deepEqual([forged.statusCode, forged.json().type], [403, 'urn:conexus:problem:request-authenticity-denied'])

  const notHers = await put({ ...chosen, reflectorModelId: 'openai/gpt-5.1' })
  assert.deepEqual([notHers.statusCode, notHers.json().type], [400, 'urn:conexus:problem:memory-model-refused'])

  for (const payload of [
    { ...chosen, observationThreshold: 999 },
    { ...chosen, reflectionThreshold: 1_000_001 },
    { ...chosen, observationThreshold: 1_500.5 },
    { ...chosen, observerModelId: 7 },
    { observerModelId: null, reflectorModelId: null, observationThreshold: 30_000 },
    { ...chosen, extra: true },
  ]) {
    assert.equal((await put(payload)).statusCode, 400, JSON.stringify(payload))
  }
  assert.deepEqual([...stored.keys()], [], 'no refused write reached the store')
})

// Needs CONEXUS_TEST_DB_* like every Postgres suite.
test('on Postgres, the settings live in a Mastra collection of the Builder\'s own store, one row per person', async (t) => {
  const fixture = await createEmptyDatabase(t, 'conexus_builder_memory')
  await query(fixture.connectionString, 'CREATE SCHEMA factory')
  const pool = testPool({ connectionString: fixture.connectionString, options: '-c search_path=factory' })
  fixture.onCleanup(() => pool.end())
  const settings = new PgFactoryStorage({ store: createBuilderStorage(pool) }).registerDomain(new BuilderMemorySettings())

  assert.deepEqual(await settings.read(ana), { observerModelId: null, reflectorModelId: null, observationThreshold: 30_000, reflectionThreshold: 40_000 })
  assert.deepEqual(await settings.write(ana, chosen), chosen)
  assert.deepEqual(await settings.write(ana, { ...chosen, observerModelId: null }), { ...chosen, observerModelId: null })
  assert.deepEqual(await settings.read(ana), { ...chosen, observerModelId: null })
  assert.equal((await settings.read(bia)).observationThreshold, 30_000)

  const rows = (await query(fixture.connectionString, 'SELECT account_id, observation_threshold FROM factory.builder_memory_settings')).rows
  assert.deepEqual(rows, [{ account_id: ana, observation_threshold: 50_000 }])
})
