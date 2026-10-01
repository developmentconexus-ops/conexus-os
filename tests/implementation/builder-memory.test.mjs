import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { Mastra } from '@mastra/core/mastra'
import { RequestContext } from '@mastra/core/request-context'
import { LibSQLStore } from '@mastra/libsql'
import { hubModuleUrl } from './hub-build.mjs'

const built = hubModuleUrl
const { createHttpApp } = await import(built('http/app.js'))
const { createBuilderController } = await import(built('builder/harness/controller.js'))
const { createBuilderMemory } = await import(built('builder/memory.js'))
const { registerBuilderSessionRoutes } = await import(built('builder/mastra-session-routes.js'))
const { createConversations } = await import(built('builder/conversations.js'))
const { createModelRouting, RUN_ACCOUNT_ID_KEY, RUN_ID_KEY } = await import(built('builder/model-routing.js'))

const ana = '22222222-2222-4222-8222-222222222222'
const runId = '44444444-4444-4444-8444-444444444444'
const usage = { inputTokens: 10, outputTokens: 10, totalTokens: 20 }
const OBSERVATIONS = '<observations>\n* 🔴 (09:00) Ana quer uma agenda semanal.\n</observations>'
const streamOf = (parts) => new ReadableStream({ start(controller) {
  for (const part of [{ type: 'stream-start', warnings: [] }, ...parts, { type: 'finish', finishReason: parts.some((part) => part.type === 'tool-call') ? 'tool-calls' : 'stop', usage }]) controller.enqueue(part)
  controller.close()
} })
const textParts = (text) => [{ type: 'text-start', id: 't' }, { type: 'text-delta', id: 't', delta: text }, { type: 'text-end', id: 't' }]

// The Hub's routing over one provider whose accounts are "acct-<person>". Each call names the model
// it reached and the account that paid for it; the Observer answers with a fixed log, and the main
// model says what tools it was offered and calls what the script tells it to.
const probeRouting = (script = []) => {
  const calls = []
  const recorded = []
  const offered = []
  const model = (name, paidBy) => ({
    specificationVersion: 'v2', provider: 'probe', modelId: name, supportedUrls: {},
    async doGenerate() {
      calls.push([name, paidBy])
      return { content: [{ type: 'text', text: OBSERVATIONS }], finishReason: 'stop', usage, warnings: [] }
    },
    async doStream(options) {
      calls.push([name, paidBy])
      if (name !== 'main') return { stream: streamOf(textParts(OBSERVATIONS)) }
      offered.push((options.tools ?? []).map((tool) => tool.name).sort())
      const step = script[offered.length - 1]
      return { stream: streamOf(step ? [{ type: 'tool-call', toolCallId: `t${offered.length}`, toolName: step.toolName, input: JSON.stringify(step.input) }] : textParts('Certo, vou planejar a agenda.')) }
    },
  })
  const routing = createModelRouting({
    routes: { probe: { accountProvider: 'probe', take: (account) => ({ modelProvider: 'probe', model: async (name) => model(name, account.modelAccountId) }) } },
    modelAccounts: { usable: async (accountId) => ({ modelAccountId: `acct-${accountId}`, kind: 'api_key', secret: 'x' }) },
    conversationModel: async () => null,
    readDefault: async (role) => role === 'memory' ? 'probe/observer' : 'probe/main',
    record: async (builderRunId, modelAccountId) => { recorded.push([builderRunId, modelAccountId]) },
  })
  return { routing, calls, recorded, offered }
}

// What run-runtime.ts binds on every turn of a run.
const runContext = () => {
  const requestContext = new RequestContext()
  requestContext.setRaw(RUN_ID_KEY, runId)
  requestContext.setRaw(RUN_ACCOUNT_ID_KEY, ana)
  return requestContext
}

const builderWithMemory = async (t, script) => {
  const dir = mkdtempSync(join(tmpdir(), 'builder-memory-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const storage = new LibSQLStore({ id: 'builder-memory', url: `file:${join(dir, 'memory.db')}` })
  const probe = probeRouting(script)
  const controller = createBuilderController({
    model: probe.routing.resolve,
    storage,
    memory: createBuilderMemory({ storage, memoryModel: probe.routing.resolveMemory }),
  })
  await controller.init()
  t.after(() => controller.destroy())
  return { controller, storage, ...probe }
}

// A turn of a conversation on the model its session holds, the way a run's session does.
const firstWindows = async (controller, content, { resourceId = 'project:memory', threadId } = {}) => {
  const session = await controller.createSession({ resourceId, scope: `builder:${runId}`, requestContext: runContext(), ...(threadId ? { threadId } : {}) })
  await session.model.switch({ modelId: 'probe/main' })
  await session.state.set({ yolo: true })
  const windows = []
  const results = {}
  session.subscribe((event) => {
    if (event.type === 'om_status') windows.push(event.windows.active)
    if (event.type === 'tool_end') results[event.toolCallId] = JSON.stringify(event.result)
  })
  await session.sendMessage({ content, requestContext: runContext() })
  return { windows, results }
}

// Past Mastra Code's 30,000 token threshold, so the request is observed before the first answer.
const LONG_REQUEST = `Quero uma agenda semanal. ${'Detalhes da agenda. '.repeat(9000)}`

test('a run observes its conversation on the installation memory model, paid by the run\'s account, and is offered the recall tool', async (t) => {
  const { controller, calls, recorded, offered } = await builderWithMemory(t)

  const { windows } = await firstWindows(controller, LONG_REQUEST)

  assert.deepEqual([windows[0].messages.threshold, windows[0].observations.threshold], [30_000, 40_000])
  assert.ok(windows[0].observations.tokens > 0, 'the request was observed before the first answer')
  const payer = `acct-${ana}`
  assert.deepEqual(calls, [['observer', payer], ['main', payer]], 'the Observer ran inside the run, on the memory default and the run\'s account')
  assert.deepEqual([...new Set(recorded.map(([run, account]) => `${run}:${account}`))], [`${runId}:${payer}`], 'every call, the Observer\'s included, is recorded on the run')
  assert.ok(offered[0].includes('recall'), 'no allowlist hides the recall tool')
})

test('a run under the thresholds keeps Mastra Code\'s windows', async (t) => {
  const { controller } = await builderWithMemory(t)

  const { windows } = await firstWindows(controller, 'Quero uma agenda semanal.')

  assert.deepEqual(windows[0].messages.threshold, 30_000)
  assert.deepEqual(windows[0].observations.threshold, 40_000)
})

test('recall lists the conversations of the Project and never those of another Project', async (t) => {
  const recall = { toolName: 'recall', input: { mode: 'threads' } }
  const { controller } = await builderWithMemory(t, [recall, undefined, recall])
  const other = await firstWindows(controller, 'Conversa do outro Project.', { resourceId: 'project:other', threadId: 'thread-other' })
  assert.match(Object.values(other.results).join('\n'), /thread-other/)
  const mine = await firstWindows(controller, 'Conversa deste Project.', { resourceId: 'project:memory', threadId: 'thread-mine' })
  const listed = Object.values(mine.results).join('\n')
  assert.match(listed, /thread-mine/)
  assert.doesNotMatch(listed, /thread-other/)
})

const origin = 'https://conexus.test'
const authentic = {
  headers: { origin, 'x-conexus-csrf': 'csrf-1', 'content-type': 'application/json' },
  cookies: { '__Host-conexus_session': 'session-1', '__Host-conexus_csrf': 'csrf-1' },
}
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

  await firstWindows(controller, LONG_REQUEST, { resourceId: `project:${projectId}`, threadId: conversationId })
  const state = await app.inject({ method: 'GET', url: `/api/builder/agent-controller/conexus-builder/sessions/project:${projectId}?sessionScope=conversation:${conversationId}`, ...authentic })

  const { pendingTokens, threshold, observationTokens, reflectionThreshold } = state.json().omProgress
  assert.deepEqual({ status: state.statusCode, pendingTokens, threshold, reflectionThreshold }, { status: 200, pendingTokens: 0, threshold: 30_000, reflectionThreshold: 40_000 })
  assert.ok(observationTokens > 0)
})

test('an Observer call outside a run has no one to pay for it and is refused before any account is used', async () => {
  const { routing, recorded } = probeRouting()
  const noRun = new RequestContext()
  noRun.setRaw(RUN_ACCOUNT_ID_KEY, ana)

  await assert.rejects(routing.resolveMemory(noRun), /^Error: BUILDER_MODEL_NOT_SELECTED$/)
  await assert.rejects(routing.resolveMemory(new RequestContext()), /^Error: BUILDER_MODEL_NOT_SELECTED$/)
  assert.deepEqual(recorded, [])
})

test('a run refuses to start when the installation has no memory default, and no model of the conversation stands in for it', async () => {
  const { routing } = probeRouting()
  const unset = createModelRouting({
    routes: {}, modelAccounts: { usable: async () => null }, conversationModel: async () => 'probe/main', readDefault: async () => null, record: async () => {},
  })
  await assert.rejects(unset.check({ accountId: ana, projectId: 'p', conversationId: 'c' }), /^Error: BUILDER_MODEL_NOT_SELECTED$/)
  await assert.doesNotReject(routing.check({ accountId: ana, projectId: 'p', conversationId: 'c' }))
})

test('a message that follows a ninety-minute gap in a conversation is preceded by a temporal-gap marker, as in Mastra Code', async (t) => {
  const { controller, storage } = await builderWithMemory(t)
  const memoryStore = await storage.getStore('memory')
  const threadId = '55555555-5555-4555-8555-555555555555'
  const resourceId = 'project:memory'
  const lastAnswer = new Date(Date.now() - 90.5 * 60 * 1000)
  await memoryStore.saveThread({ thread: { id: threadId, resourceId, title: 'Agenda', createdAt: lastAnswer, updatedAt: lastAnswer, metadata: {} } })
  const message = (id, role, text, createdAt) => ({ id, role, createdAt, threadId, resourceId, content: { format: 2, parts: [{ type: 'text', text }] } })
  await memoryStore.saveMessages({ messages: [
    message('older-user', 'user', 'Quero uma agenda semanal.', new Date(lastAnswer.getTime() - 1000)),
    message('older-assistant', 'assistant', 'Certo.', lastAnswer),
  ] })

  await firstWindows(controller, 'Volte à agenda.', { resourceId, threadId })

  const { messages } = await memoryStore.listMessages({ threadId, perPage: false, includeSystemReminders: true })
  const markers = messages.flatMap((stored) => {
    const attributes = stored.content?.metadata?.signal?.attributes
    return attributes?.type === 'temporal-gap' ? [attributes.gapText] : []
  })
  assert.deepEqual(markers, ['1 hour 30 minutes later'])
})

test('a request one fifth of the way to the window is observed in the background, as Mastra Code buffers it', async (t) => {
  const { controller, calls } = await builderWithMemory(t)

  const { windows } = await firstWindows(controller, `Quero uma agenda semanal. ${'Detalhes da agenda. '.repeat(1800)}`)
  await new Promise((resolve) => setTimeout(resolve, 1500))

  assert.equal(windows[0].messages.threshold, 30_000)
  assert.ok(windows[0].messages.tokens < 30_000, 'under the window: no blocking observation')
  assert.deepEqual(calls.map(([name]) => name).sort(), ['main', 'observer'], 'the Observer ran once, buffered, beside the main call')
})
