import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { test } from 'node:test'
import { GithubIntegration } from '@mastra/factory/integrations/github/integration'
import { hubModuleUrl } from './hub-build.mjs'

const built = hubModuleUrl
const { createMastraFactoryRunPorts } = await import(built('builder/factory-runtime.js'))
const { createFactorySandbox } = await import(built('builder/factory.js'))

const ORG = 'conexus-installation'
const conversationId = '44444444-4444-4444-8444-444444444444'
const githubApp = {
  appId: '1', clientId: 'client', clientSecret: 'secret', slug: 'conexus-probe',
  privateKey: generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs1', format: 'pem' }),
}
const assistant = (id, text) => ({ id, role: 'assistant', content: { parts: [{ type: 'text', text }] } })
const user = (id, text) => ({ id, role: 'user', content: { parts: [{ type: 'text', text }] } })

const fakeSession = ({ messages = [], turnUserMessageId = 'user-2', title = null } = {}) => {
  const listeners = new Set()
  const thread = {
    title,
    listActiveMessages: async () => messages,
    getById: async ({ threadId }) => threadId === conversationId ? { id: conversationId, resourceId: conversationId, title: thread.title } : null,
    rename: async ({ title: next }) => { thread.title = next },
  }
  const models = { observer: 'google/gemini-3.5-flash', reflector: 'google/gemini-3.5-flash' }
  const role = (name) => ({ modelId: () => models[name], switchModel: async ({ modelId }) => { models[name] = modelId } })
  const stateWrites = []
  let state = {}
  return {
    models,
    stateWrites,
    getWorkspace: () => ({ sandbox: createFactorySandbox({ apiKey: 'unused', templateId: 'conexus:tpl' })({ sessionId: conversationId }) }),
    state: { get: () => state, set: async (updates) => { stateWrites.push(updates); state = { ...state, ...updates } } },
    om: { observer: role('observer'), reflector: role('reflector') },
    mode: { switch: async () => undefined },
    model: { hasSelection: () => true },
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener) },
    abort: () => undefined,
    sendMessage: async () => {
      for (const listener of listeners) listener({ type: 'message_end', message: { id: turnUserMessageId, role: 'user' } })
      for (const listener of listeners) listener({ type: 'agent_end', reason: 'complete' })
    },
    thread,
  }
}

const openPorts = async ({ session, github = new GithubIntegration(githubApp), memory = null }) => {
  const ports = createMastraFactoryRunPorts({
    orgId: ORG,
    log: () => undefined,
    composition: {
      controller: {
        createSession: async () => session,
        deleteSession: async () => true,
        getSessionByResource: async () => null,
      },
      github,
      storage: { getDomain: (name) => name === 'memory-settings' ? { get: async (key) => memory?.(key) ?? null } : undefined },
    },
  })
  return ports.openSession({ conversationId, builderRunId: '11111111-1111-4111-8111-111111111111', projectId: '22222222-2222-4222-8222-222222222222', accountId: '33333333-3333-4333-8333-333333333333' })
}

test('a turn summary holds only what the assistant said after this turn\'s own message', async () => {
  const session = fakeSession({
    messages: [user('user-1', 'Primeiro pedido'), assistant('a-1', 'Resposta antiga.'), user('user-2', 'Segundo pedido'), assistant('a-2', 'Resposta nova.')],
  })
  const run = await openPorts({ session })
  const turn = await run.sendTurn('Segundo pedido')
  assert.deepEqual({ userMessageId: turn.userMessageId, summary: turn.summary }, { userMessageId: 'user-2', summary: 'Resposta nova.' })
})

test('the first request names an untitled conversation, in its own words, before the model runs', async () => {
  const short = fakeSession()
  await (await openPorts({ session: short })).sendTurn('  Crie um contador   de visitas\ncom botão de reiniciar')
  assert.equal(short.thread.title, 'Crie um contador de visitas')

  const long = fakeSession()
  await (await openPorts({ session: long })).sendTurn('Quero uma página de inscrição para o evento de sábado, com nome, e-mail e telefone obrigatórios')
  assert.equal(long.thread.title, 'Quero uma página de inscrição para o evento de sábado, com…')
})

test('a conversation that already has a title keeps it', async () => {
  const session = fakeSession({ title: 'Contador de visitas' })
  await (await openPorts({ session })).sendTurn('Agora mude a cor do botão')
  assert.equal(session.thread.title, 'Contador de visitas')
})

test('every tool the Factory GitHub integration contributes is denied, including one it adds later', async () => {
  class LaterGithubIntegration extends GithubIntegration {
    sessionTools(input) {
      return { ...super.sessionTools(input), github_future_token_tool: {} }
    }
  }
  const session = fakeSession()
  const run = await openPorts({ session, github: new LaterGithubIntegration(githubApp) })
  await run.configure({ mode: 'BUILD', instructions: 'Edit the checkout.' })
  assert.deepEqual(session.stateWrites[0].permissionRules, {
    categories: {},
    tools: {
      github_refresh_token: 'deny',
      github_upsert_factory_triage_comment: 'deny',
      github_subscribe_pr: 'deny',
      github_unsubscribe_pr: 'deny',
      github_future_token_tool: 'deny',
      web_search: 'deny',
      web_extract: 'deny',
    },
  })
})

const memoryRow = (userId, modelId) => ({ orgId: ORG, userId, observerModelId: modelId, reflectorModelId: modelId, observationThreshold: null, reflectionThreshold: null, observeAttachments: null })
const runner = '33333333-3333-4333-8333-333333333333'

test('the memory row of the person who started the run sets its observer and reflector models', async () => {
  const session = fakeSession()
  const run = await openPorts({
    session,
    memory: ({ userId }) => ({ [runner]: memoryRow(runner, 'anthropic/claude-haiku-5'), 'conexus-operator': memoryRow('conexus-operator', 'openai/gpt-5.6-luna') })[userId],
  })
  await run.configure({ mode: 'BUILD', instructions: 'Edit the checkout.' })
  assert.deepEqual(session.models, { observer: 'anthropic/claude-haiku-5', reflector: 'anthropic/claude-haiku-5' })
})

test('a person with no memory row gets the organization memory row', async () => {
  const session = fakeSession()
  const asked = []
  const run = await openPorts({
    session,
    memory: (key) => {
      asked.push(key)
      return key.userId === 'conexus-operator' ? memoryRow('conexus-operator', 'openai/gpt-5.6-luna') : null
    },
  })
  await run.configure({ mode: 'BUILD', instructions: 'Edit the checkout.' })
  assert.deepEqual(asked, [{ orgId: ORG, userId: runner }, { orgId: ORG, userId: 'conexus-operator' }])
  assert.deepEqual(session.models, { observer: 'openai/gpt-5.6-luna', reflector: 'openai/gpt-5.6-luna' })
})

test('with no organization memory row a run keeps the models the Factory seeded', async () => {
  const session = fakeSession()
  const run = await openPorts({ session })
  await run.configure({ mode: 'BUILD', instructions: 'Edit the checkout.' })
  assert.deepEqual(session.models, { observer: 'google/gemini-3.5-flash', reflector: 'google/gemini-3.5-flash' })
})
