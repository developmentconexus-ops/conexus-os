import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import test from 'node:test'
import { InMemoryStore } from '@mastra/core/storage'
import { hubModuleUrl } from './hub-build.mjs'
import { takeHubLogs } from './hub-log-capture.mjs'

const { createBuilderController } = await import(hubModuleUrl('builder/harness/controller.js'))
const { createControllerRunSessions } = await import(hubModuleUrl('builder/run/turn.js'))
const { e2bConversationSandboxes } = await import(hubModuleUrl('builder/conversation-sandboxes.js'))
const { createConversationSandbox } = await import(hubModuleUrl('builder/sandbox.js'))
const { createLiveConversations } = await import(hubModuleUrl('builder/conversation.js'))

const repositoryRoot = resolve(import.meta.dirname, '../..')
const usage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 }
const streamOf = (parts) => new ReadableStream({ start(controller) { for (const part of parts) controller.enqueue(part); controller.close() } })
const CONVERSATION_SESSION_IDLE_MS = 10 * 60_000
const projectId = '22222222-2222-4222-8222-222222222222'
const resourceId = `project:${projectId}`
const conversation = (n) => `44444444-4444-4444-8444-44444444444${n}`
const runId = (n) => `11111111-1111-4111-8111-11111111111${n}`

const model = {
  specificationVersion: 'v2', provider: 'anthropic', modelId: 'probe-1', supportedUrls: {},
  async doGenerate() { throw new Error('doGenerate not used') },
  async doStream() {
    return { stream: streamOf([{ type: 'stream-start', warnings: [] }, { type: 'text-start', id: 't' }, { type: 'text-delta', id: 't', delta: 'Pronto.' }, { type: 'text-end', id: 't' }, { type: 'finish', finishReason: 'stop', usage }]) }
  },
}

// The production sandboxes with E2B stubbed out: every instance records its pause and its kill.
const sandboxCache = ({ killProvider } = {}) => {
  const built = []
  const cache = e2bConversationSandboxes({
    apiKey: 'test-key', templateId: 'conexus:template', idleMs: 300_000,
    ...(killProvider ? { killProvider } : {}),
    create: (input) => {
      const sandbox = createConversationSandbox(input)
      const entry = { conversationId: input.conversationId, providerSandboxId: input.providerSandboxId, idled: 0, killed: 0 }
      sandbox.idle = async () => { entry.idled += 1 }
      sandbox.kill = async () => { entry.killed += 1; await entry.hold }
      built.push(entry)
      return sandbox
    },
  })
  return { ...cache, built }
}

// The Builder controller on its live conversations, as the module wires them, over stubbed E2B sandboxes.
const runner = async (t, { runOpen = () => false } = {}) => {
  const storage = new InMemoryStore()
  await storage.init()
  const clock = { now: 0 }
  const sandboxes = sandboxCache()
  const recorded = new Map()
  let conversations
  const controller = createBuilderController({
    workspace: (context) => conversations.workspace(context),
    model, storage, skillsPath: resolve(repositoryRoot, 'builder-skills'),
  })
  await controller.init()
  t.after(() => controller.destroy?.())
  conversations = createLiveConversations({
    controller, sandboxes, readSandboxId: async ({ conversationId }) => recorded.get(conversationId) ?? null, runOpen, now: () => clock.now,
  })
  t.after(() => conversations.close())
  const openSession = createControllerRunSessions({ controller, conversations, readDefaultModel: async () => 'anthropic/default-model' })
  const open = (conversationId, builderRunId, project = projectId) => openSession({
    projectId: project, conversationId, builderRunId,
    bindContext: (requestContext) => { requestContext.setRaw('conexusBuilderRunId', builderRunId); requestContext.setRaw('conexusBuilderConversationId', conversationId) },
  })
  const live = (conversationId, resource = resourceId) => controller.getSessionByResource(resource, `conversation:${conversationId}`)
  return { controller, conversations, open, live, clock, built: sandboxes.built, recorded }
}

test('a conversation keeps one session across its runs, the one the browser opened, and each conversation has its own', async (t) => {
  const { conversations, open, live } = await runner(t)
  const browser = await conversations.open({ projectId, conversationId: conversation(1) })
  for (let turn = 0; turn < 6; turn += 1) {
    const run = await open(conversation(1), runId(turn))
    assert.equal((await run.takeStep({ kind: 'SEND', content: `pedido ${turn}` }, new AbortController().signal)).reason, 'complete')
    await run.release()
    assert.equal(await live(conversation(1)), browser, `turn ${turn}: the run stepped on the browser's session and left it to the conversation`)
  }
  const others = []
  for (let other = 2; other <= 4; other += 1) {
    const run = await open(conversation(other), runId(other))
    await run.takeStep({ kind: 'SEND', content: 'olá' }, new AbortController().signal)
    await run.release()
    others.push(await live(conversation(other)))
  }
  assert.equal(new Set([browser, ...others]).size, 4, 'one session per conversation')
})

test('releasing twice, or after the session is already gone, is not an error', async (t) => {
  const { open, live, controller } = await runner(t)
  const run = await open(conversation(1), runId(1))
  await run.release()
  await run.release()
  const second = await open(conversation(1), runId(2))
  await controller.deleteSession({ resourceId, scope: `conversation:${conversation(1)}` })
  await second.release()
  assert.equal(await live(conversation(1)), undefined)
})

test("a Project's deletion deletes its conversations' sessions and kills their VMs, and no other Project's; closing deletes every session", async (t) => {
  const { conversations, open, live, built } = await runner(t)
  const other = '55555555-5555-4555-8555-555555555555'
  await conversations.open({ projectId, conversationId: conversation(1) })
  await conversations.open({ projectId, conversationId: conversation(2) })
  await conversations.open({ projectId: other, conversationId: conversation(3) })
  await open(conversation(1), runId(1))
  await conversations.drop(projectId, [conversation(1), conversation(2), conversation(4)])
  assert.deepEqual([await live(conversation(1)), await live(conversation(2))], [undefined, undefined])
  assert.notEqual(await live(conversation(3), `project:${other}`), undefined)
  assert.deepEqual(built.map(({ conversationId, killed }) => [conversationId.at(-1), killed]), [['1', 1], ['2', 1], ['3', 0]])
  await conversations.close()
  assert.equal(await live(conversation(3), `project:${other}`), undefined)
})

test('the idle sweep lets an idle conversation go, and never one whose run is open, whatever its age', async (t) => {
  const open = new Set([conversation(2)])
  const { conversations, live, clock } = await runner(t, { runOpen: (conversationId) => open.has(conversationId) })
  await conversations.open({ projectId, conversationId: conversation(1) })
  await conversations.open({ projectId, conversationId: conversation(2) })
  clock.now += CONVERSATION_SESSION_IDLE_MS - 1
  await conversations.sweep(new AbortController().signal)
  assert.notEqual(await live(conversation(1)), undefined, 'not idle long enough yet')
  clock.now += 1
  await conversations.sweep(new AbortController().signal)
  assert.deepEqual([await live(conversation(1)) === undefined, await live(conversation(2)) === undefined], [true, false])
  open.delete(conversation(2))
  conversations.touch(conversation(2))
  await new Promise((settle) => { setImmediate(settle) })
  clock.now += CONVERSATION_SESSION_IDLE_MS - 1
  await conversations.sweep(new AbortController().signal)
  assert.notEqual(await live(conversation(2)), undefined, 'the idle window starts again when the run ends')
  clock.now += 1
  await conversations.sweep(new AbortController().signal)
  assert.equal(await live(conversation(2)), undefined)
})

test("a conversation's sandbox instance resumes the recorded VM, outlives its idle window, and a killed VM gives the conversation a new instance and session", async (t) => {
  const { conversations, live, built, recorded } = await runner(t)
  recorded.set(conversation(1), 'sbx-1')
  const session = await conversations.open({ projectId, conversationId: conversation(1) })
  const sandbox = await conversations.sandbox({ projectId, conversationId: conversation(1) })
  assert.equal(session.getWorkspace(), sandbox.workspace, 'the session stands on the conversation\'s sandbox')
  await sandbox.idle()
  assert.equal(await conversations.sandbox({ projectId, conversationId: conversation(1) }), sandbox, 'a VM left to pause resumes on the same instance')
  recorded.set(conversation(1), 'sbx-2')
  await sandbox.kill()
  assert.equal(await live(conversation(1)), undefined, 'the session on the killed VM goes with it')
  const next = await conversations.sandbox({ projectId, conversationId: conversation(1) })
  assert.notEqual(next, sandbox)
  assert.deepEqual(built.map(({ providerSandboxId, idled, killed }) => [providerSandboxId, idled, killed]), [['sbx-1', 1, 1], ['sbx-2', 0, 0]])
})

test('the workspace resolver only looks up: it builds nothing for a scope with no conversation, and gives the same workspace each time', async (t) => {
  const { conversations, built } = await runner(t)
  const contextOf = (scope) => ({ requestContext: { get: (key) => (key === 'controller' ? { scope } : undefined) } })
  assert.equal(await conversations.workspace(contextOf(`conversation:${conversation(1)}`)), undefined)
  assert.equal(built.length, 0)
  const sandbox = await conversations.sandbox({ projectId, conversationId: conversation(1) })
  const resolved = await Promise.all([1, 2, 3].map(() => conversations.workspace(contextOf(`conversation:${conversation(1)}`))))
  assert.deepEqual(resolved.map((workspace) => workspace === sandbox.workspace), [true, true, true])
  assert.equal(built.length, 1)
})

test('a conversation opened while the idle sweep looks at it is not retired under it', async (t) => {
  const { controller, conversations, live, clock } = await runner(t)
  await conversations.open({ projectId, conversationId: conversation(1) })
  clock.now += CONVERSATION_SESSION_IDLE_MS
  const lookup = controller.getSessionByResource.bind(controller)
  let answer = () => undefined
  const held = new Promise((settle) => { answer = settle })
  controller.getSessionByResource = async (...input) => { await held; controller.getSessionByResource = lookup; return lookup(...input) }
  const sweeping = conversations.sweep(new AbortController().signal)
  await new Promise((settle) => { setImmediate(settle) })
  const opening = conversations.open({ projectId, conversationId: conversation(1) })
  answer()
  await sweeping
  const session = await opening
  assert.equal(await live(conversation(1)), session, 'the session the browser opened during the sweep stays')
})

test('a conversation opened while its VM is being killed waits for the kill and stands on a new instance and session', async (t) => {
  const { conversations, live, built } = await runner(t)
  const sandbox = await conversations.sandbox({ projectId, conversationId: conversation(1) })
  let finish = () => undefined
  const dying = new Promise((settle) => { finish = settle })
  built[0].hold = dying
  const killing = sandbox.kill()
  await new Promise((settle) => { setImmediate(settle) })
  const opening = conversations.open({ projectId, conversationId: conversation(1) })
  finish()
  await killing
  const session = await opening
  assert.notEqual(session.getWorkspace(), sandbox.workspace, 'never the dying instance')
  assert.equal(await live(conversation(1)), session, 'the kill took the old session, never the new one')
  assert.equal(built.length, 2)
})

test('#413 a Project deletion kills every VM its conversations recorded at E2B, and a kill that fails is logged without stopping the rest', async () => {
  const asked = []
  takeHubLogs()
  const { killRecorded } = sandboxCache({
    killProvider: async (providerSandboxId) => {
      asked.push(providerSandboxId)
      if (providerSandboxId === 'ivm-unreachable') throw new Error('Error')
      return providerSandboxId !== 'ivm-gone'
    },
  })
  await killRecorded(['ivm-paused', 'ivm-unreachable', 'ivm-gone', 'ivm-running'])
  assert.deepEqual(asked, ['ivm-paused', 'ivm-unreachable', 'ivm-gone', 'ivm-running'])
  assert.deepEqual(takeHubLogs().map(({ message, fields }) => [message, fields['builder.provider_sandbox_id'], fields['exception.type']]), [['BUILDER_SANDBOX_KILL_FAILED', 'ivm-unreachable', 'Error']], 'a VM E2B no longer has is not a failure')
  await killRecorded([])
})
