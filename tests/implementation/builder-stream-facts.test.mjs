import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { Mastra } from '@mastra/core/mastra'
import { InMemoryStore } from '@mastra/core/storage'
import { Memory } from '@mastra/memory'
import { hubModuleUrl } from './hub-build.mjs'
import { testConversations } from './builder-conversation-fixture.mjs'

// What the browser can count on from the Builder's controller through the Hub's mount, recorded
// from createBuilderController: the facts the conversation screen is built on. Mastra itself leaves
// a stream open when its session is deleted; the mount ends it.
const { createHttpApp } = await import(hubModuleUrl('http/app.js'))
const { registerBuilderSessionRoutes } = await import(hubModuleUrl('builder/mastra-session-routes.js'))
const { createBuilderController } = await import(hubModuleUrl('builder/harness/controller.js'))
const { createConversations } = await import(hubModuleUrl('builder/conversations.js'))

const origin = 'https://conexus.test'
const accountId = '22222222-2222-4222-8222-222222222222'
const projectId = '33333333-3333-4333-8333-333333333333'
const conversationId = '77777777-7777-4777-8777-777777777777'
const resourceId = `project:${projectId}`
const runScope = `conversation:${conversationId}`
const usage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 }
const streamOf = (parts) => new ReadableStream({ start(controller) { for (const part of parts) controller.enqueue(part); controller.close() } })

// The first step asks the person one question; every later step answers "ok".
const askingModel = () => {
  let steps = 0
  return {
    specificationVersion: 'v2', provider: 'anthropic', modelId: 'probe-1', supportedUrls: {},
    async doGenerate() { throw new Error('doGenerate not used') },
    async doStream() {
      const parts = steps++ === 0
        ? [{ type: 'tool-call', toolCallId: 'ask-1', toolName: 'ask_user', input: JSON.stringify({ questions: [{ question: 'Qual cor?' }] }) }, { type: 'finish', finishReason: 'tool-calls', usage }]
        : [{ type: 'text-start', id: 't' }, { type: 'text-delta', id: 't', delta: 'ok' }, { type: 'text-end', id: 't' }, { type: 'finish', finishReason: 'stop', usage }]
      return { stream: streamOf([{ type: 'stream-start', warnings: [] }, ...parts]) }
    },
  }
}

// The model memory names a thread with, answering every call with one title.
const titleModel = (delayMs = 0) => ({
  specificationVersion: 'v2', provider: 'anthropic', modelId: 'title-1', supportedUrls: {},
  async doGenerate() { await new Promise((done) => setTimeout(done, delayMs)); return { content: [{ type: 'text', text: 'Lista de compras' }], finishReason: 'stop', usage, warnings: [] } },
  async doStream() {
    await new Promise((done) => setTimeout(done, delayMs))
    return { stream: streamOf([{ type: 'stream-start', warnings: [] }, { type: 'text-start', id: 't' }, { type: 'text-delta', id: 't', delta: 'Lista de compras' }, { type: 'text-end', id: 't' }, { type: 'finish', finishReason: 'stop', usage }]) }
  },
})

const startMount = async (t, memoryOptions = {}, model = askingModel()) => {
  const storage = new InMemoryStore()
  const memory = new Memory({ storage, options: { lastMessages: 20, semanticRecall: false, ...memoryOptions } })
  const controller = createBuilderController({ id: 'conexus-builder', model, storage, memory, skillsPath: resolve(import.meta.dirname, '../../builder-skills') })
  const mastra = new Mastra({ storage, agentControllers: { 'conexus-builder': controller }, logger: false })
  await controller.init()
  const conversations = createConversations(async () => storage.getStore('memory'))
  const app = await createHttpApp({
    registerRoutes: async (instance) => {
      await registerBuilderSessionRoutes(instance, {
        mastra, controllerId: 'conexus-builder', controller, conversations: testConversations(controller, () => undefined), origin,
        resolveCurrentSession: async (request) => request.cookies['__Host-conexus_session'] ? { account: { accountId, displayName: 'Operator' }, issuer: 'https://issuer.test', subject: 'subject-1' } : null,
        admitProject: async () => true,
        conversationOwner: ({ projectId: project, conversationId: id }) => conversations.ownerOf(project, id),
        projectBusy: async () => false,
      })
      return []
    },
    staticRoot: null,
  })
  await app.listen({ host: '127.0.0.1', port: 0 })
  const base = `http://127.0.0.1:${app.server.address().port}/api/builder/agent-controller/conexus-builder/sessions/${resourceId}`
  // An open SSE response would hold the server's close forever.
  t.after(async () => {
    app.server.closeAllConnections()
    await app.close()
    await controller.destroy()
  })
  // The run's session, opened the way the Hub opens it: on the conversation's thread, tools allowed.
  const session = await controller.createSession({ resourceId, scope: runScope, threadId: conversationId })
  await session.state.set({ yolo: true })
  return { base, controller, session }
}

const headers = { cookie: '__Host-conexus_session=session-1; __Host-conexus_csrf=csrf-1' }

const nextEvent = (session, type) => new Promise((done) => {
  const detach = session.subscribe((event) => { if (event.type === type) { detach(); done(event) } })
})

const readMessages = async (base) => {
  const response = await fetch(`${base}/threads/${conversationId}/messages`, { headers })
  assert.equal(response.status, 200)
  return (await response.json()).messages
}

// An SSE body read as parsed events; a wait that times out answers null.
const openStream = async (base) => {
  const response = await fetch(`${base}/stream?sessionScope=${runScope}`, { headers })
  assert.equal(response.status, 200)
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const events = []
  let ended = false
  const pump = (async () => {
    for (;;) {
      const { done, value } = await reader.read().catch(() => ({ done: true }))
      if (done) { ended = true; return }
      buffer += decoder.decode(value, { stream: true })
      const frames = buffer.split('\n\n')
      buffer = frames.pop() ?? ''
      for (const frame of frames) {
        const data = frame.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('')
        if (data) events.push(JSON.parse(data))
      }
    }
  })()
  const waitFor = async (predicate, ms) => {
    const deadline = Date.now() + ms
    while (Date.now() < deadline) {
      const found = predicate()
      if (found) return found
      await new Promise((done) => setTimeout(done, 20))
    }
    return null
  }
  return {
    event: (match, ms = 2_000) => waitFor(() => events.find(match), ms),
    ended: (ms) => waitFor(() => ended, ms).then(Boolean),
    close: async () => { await reader.cancel().catch(() => undefined); await pump },
  }
}

test('a parked thread carries its open question in metadata.suspendedTools on the message window, and the answer clears it', async (t) => {
  const { base, session } = await startMount(t)
  const parked = nextEvent(session, 'agent_end')
  void session.sendMessage({ content: 'faça um app' })
  assert.equal((await parked).reason, 'suspended')

  const whileParked = (await readMessages(base)).flatMap((message) => Object.values(message.content.metadata?.suspendedTools ?? {}))
  assert.deepEqual(whileParked.map((entry) => [entry.toolCallId, entry.toolName, entry.args]), [['ask-1', 'ask_user', { questions: [{ question: 'Qual cor?' }] }]])

  const ended = nextEvent(session, 'agent_end')
  await session.respondToToolSuspension({ toolCallId: 'ask-1', resumeData: ['Azul'] })
  assert.equal((await ended).reason, 'complete')
  const afterAnswer = (await readMessages(base)).filter((message) => Object.keys(message.content.metadata?.suspendedTools ?? {}).length > 0)
  assert.deepEqual(afterAnswer, [])
})

test("a run's session state written by the Hub reaches the browser's stream through the mount as state_changed", async (t) => {
  const { base, session } = await startMount(t)
  const stream = await openStream(base)
  await session.state.set({ conexusRun: { builderRunId: 'run-1', state: 'RUNNING', phase: 'AGENT' } })
  const changed = await stream.event((event) => event.type === 'state_changed' && event.changedKeys.includes('conexusRun'))
  await stream.close()
  assert.deepEqual(changed?.state.conexusRun, { builderRunId: 'run-1', state: 'RUNNING', phase: 'AGENT' })
})

test("a stream opened after the Hub published the run starts with that run, as state_changed", async (t) => {
  const { base, session } = await startMount(t)
  await session.state.set({ conexusRun: { builderRunId: 'run-1', state: 'RUNNING', phase: 'WAITING' } })
  const stream = await openStream(base)
  const opened = await stream.event((event) => event.type === 'state_changed')
  await stream.close()
  assert.deepEqual([opened?.changedKeys, opened?.state.conexusRun], [['conexusRun'], { builderRunId: 'run-1', state: 'RUNNING', phase: 'WAITING' }])
})

test("deleting a run's session ends the browser's stream on it, so the browser reads the run again", async (t) => {
  const { base, controller } = await startMount(t)
  const stream = await openStream(base)
  assert.equal(await controller.deleteSession({ resourceId, scope: runScope }), true)
  const ended = await stream.ended(1_000)
  await stream.close()
  assert.equal(ended, true)
})

test("the title memory gives a conversation reaches the browser's stream on the run's session as thread_title_updated", async (t) => {
  const { base, session } = await startMount(t, { generateTitle: { model: titleModel() } }, titleModel())
  const stream = await openStream(base)
  void session.sendMessage({ content: 'faça uma lista de compras' })
  const titled = await stream.event((event) => event.type === 'thread_title_updated', 5_000)
  await stream.close()
  assert.deepEqual(titled && { threadId: titled.threadId, title: titled.title }, { threadId: conversationId, title: 'Lista de compras' })
})

// The title of a first turn that parks is made on the turn that resumes it; Mastra sends no
// thread_title_updated for that turn, so the browser rereads the list at its agent_end. With
// emitEvent the turn waits for the title, so even a slow title model has stored it by then.
test('a first turn that parks and is answered has its title stored when the resumed turn ends, however slow the title model', async (t) => {
  const { base, session } = await startMount(t, { generateTitle: { model: titleModel(800), emitEvent: true } })
  const stream = await openStream(base)
  const parked = nextEvent(session, 'agent_end')
  void session.sendMessage({ content: 'faça uma lista de compras' })
  await parked
  const ended = nextEvent(session, 'agent_end')
  await session.respondToToolSuspension({ toolCallId: 'ask-1', resumeData: ['Azul'] })
  await ended
  const titled = await stream.event((event) => event.type === 'thread_title_updated', 500)
  await stream.close()
  assert.equal(titled, null)
  const listed = await fetch(`${base}/threads`, { headers }).then((response) => response.json())
  assert.deepEqual(listed.threads.map((thread) => thread.title), ['Lista de compras'])
})
