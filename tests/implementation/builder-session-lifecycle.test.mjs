import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'
import { RequestContext } from '@mastra/core/request-context'
import { InMemoryStore } from '@mastra/core/storage'
import { LocalFilesystem, LocalSandbox, Workspace } from '@mastra/core/workspace'
import { hubModuleUrl } from './hub-build.mjs'

const { createBuilderController } = await import(hubModuleUrl('builder/harness/controller.js'))
const { createControllerRunSessions, e2bConversationSandboxes } = await import(hubModuleUrl('builder/run-runtime.js'))
const { createConversationSandbox } = await import(hubModuleUrl('builder/sandbox.js'))
const { createConversationSessions } = await import(hubModuleUrl('builder/conversation-sessions.js'))

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

const runner = async (t) => {
  const root = mkdtempSync(resolve(tmpdir(), 'builder-session-lifecycle-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const workspace = new Workspace({ id: 'lifecycle-ws', filesystem: new LocalFilesystem({ basePath: root }), sandbox: new LocalSandbox({ workingDirectory: root }) })
  const conversationWorkspaces = new Map()
  const storage = new InMemoryStore()
  await storage.init()
  const controller = createBuilderController({
    workspace: ({ requestContext }) => conversationWorkspaces.get(requestContext.getRaw('conexusBuilderConversationId')),
    model, storage, skillsPath: resolve(repositoryRoot, 'builder-skills'),
  })
  await controller.init()
  t.after(() => controller.destroy?.())
  const openSession = createControllerRunSessions({
    controller, runContexts: new Map(), conversationWorkspaces, runTools: new Map(), readDefaultModel: async () => 'anthropic/default-model',
  })
  const open = (conversationId, builderRunId) => openSession({
    projectId, conversationId, builderRunId, workspace, runCheck: async () => { throw new Error('not used') },
    bindContext: (requestContext) => { requestContext.setRaw('conexusBuilderRunId', builderRunId); requestContext.setRaw('conexusBuilderConversationId', conversationId) },
  })
  const live = (conversationId) => controller.getSessionByResource(resourceId, `builder:${conversationId}`)
  return { controller, open, live }
}

test('runs deleting their session leave none in the controller, however many turns a conversation takes', async (t) => {
  const { open, live } = await runner(t)
  const TURNS = 6
  const inRegistry = []
  for (let turn = 0; turn < TURNS; turn += 1) {
    const run = await open(conversation(1), runId(turn))
    assert.notEqual(await live(conversation(1)), undefined, `turn ${turn}: the session exists while the run is open`)
    assert.equal((await run.sendTurn(`pedido ${turn}`)).reason, 'complete')
    await run.end()
    assert.notEqual(await live(conversation(1)), undefined, `turn ${turn}: ending the agent's turn keeps the session for the run's remaining phases`)
    await run.release()
    inRegistry.push(await live(conversation(1)))
  }
  for (let other = 2; other <= 4; other += 1) {
    const run = await open(conversation(other), runId(other))
    await run.sendTurn('olá')
    await run.end()
    await run.release()
    inRegistry.push(await live(conversation(other)))
  }
  assert.deepEqual(inRegistry, new Array(TURNS + 3).fill(undefined), 'nothing is left after any run')
})

test('releasing twice, or after the session is already gone, is not an error', async (t) => {
  const { open, live, controller } = await runner(t)
  const run = await open(conversation(1), runId(1))
  await run.release()
  await run.release()
  const second = await open(conversation(1), runId(2))
  await controller.deleteSession({ resourceId, scope: `builder:${conversation(1)}` })
  await second.release()
  assert.equal(await live(conversation(1)), undefined)
})

test("a Project's deletion deletes both sessions of each of its conversations and no other Project's, and closing deletes the conversation sessions in use", async (t) => {
  const { controller, open } = await runner(t)
  const sessions = createConversationSessions({ controller, sweepEveryMs: 3_600_000 })
  t.after(() => sessions.close())
  const other = 'project:55555555-5555-4555-8555-555555555555'
  const holds = async () => {
    const found = []
    for (const [resource, scope] of [[resourceId, `conversation:${conversation(1)}`], [resourceId, `builder:${conversation(1)}`], [resourceId, `conversation:${conversation(2)}`], [other, `conversation:${conversation(3)}`]]) {
      if (await controller.getSessionByResource(resource, scope)) found.push(`${resource === other ? 'other' : 'project'}/${scope.split(':')[0]}/${scope.at(-1)}`)
    }
    return found
  }
  await sessions.open({ resourceId, conversationId: conversation(1), requestContext: new RequestContext() })
  await sessions.open({ resourceId, conversationId: conversation(2), requestContext: new RequestContext() })
  await sessions.open({ resourceId: other, conversationId: conversation(3), requestContext: new RequestContext() })
  await open(conversation(1), runId(1))
  assert.deepEqual(await holds(), ['project/conversation/1', 'project/builder/1', 'project/conversation/2', 'other/conversation/3'])
  await sessions.drop(resourceId, [conversation(1), conversation(2)])
  assert.deepEqual(await holds(), ['other/conversation/3'])
  await sessions.close()
  assert.deepEqual(await holds(), [])
})

test("the idle sweep deletes a conversation's session after the limit and never a run's own session, which a run may keep open longer", async (t) => {
  const { controller, open, live } = await runner(t)
  const clock = { now: 0 }
  const sessions = createConversationSessions({ controller, now: () => clock.now, sweepEveryMs: 3_600_000 })
  t.after(() => sessions.close())
  const IDLE = CONVERSATION_SESSION_IDLE_MS
  await sessions.open({ resourceId, conversationId: conversation(1), requestContext: new RequestContext() })
  const run = await open(conversation(1), runId(1))
  clock.now += 2 * IDLE
  await sessions.sweep()
  assert.equal(await controller.getSessionByResource(resourceId, `conversation:${conversation(1)}`), undefined)
  assert.notEqual(await live(conversation(1)), undefined, 'the run still holds its own')
  await run.release()
})

// The production sandbox cache with E2B stubbed out: every instance it builds records its pause and its kill.
const sandboxCache = () => {
  const built = []
  const log = []
  const cache = e2bConversationSandboxes({
    apiKey: 'test-key', templateId: 'conexus:template', log: (line) => log.push(line),
    create: (input) => {
      const sandbox = createConversationSandbox(input)
      const entry = { conversationId: input.conversationId, providerSandboxId: input.providerSandboxId, paused: 0, killed: 0, finishPause: null }
      sandbox.pause = () => { entry.paused += 1; return entry.finishPause ? new Promise((done) => { entry.finishPause = done }) : Promise.resolve() }
      sandbox.kill = async () => { entry.killed += 1 }
      built.push(entry)
      return sandbox
    },
  })
  return { ...cache, built, log }
}

test("a conversation's sandbox instance is dropped once its VM is paused, and the next run builds one that resumes it by the recorded id", async () => {
  const { open, built } = sandboxCache()
  const turn = async (conversationId, providerSandboxId) => {
    const sandbox = open({ conversationId, providerSandboxId })
    await sandbox.pause()
    return sandbox
  }
  const first = await turn(conversation(1), null)
  const second = await turn(conversation(1), 'sbx-1')
  assert.notEqual(first, second, 'the paused instance was dropped')
  assert.deepEqual(built.map(({ conversationId, providerSandboxId, paused }) => [conversationId, providerSandboxId, paused]), [[conversation(1), null, 1], [conversation(1), 'sbx-1', 1]])
  for (let n = 0; n < 50; n += 1) await turn(conversation(2), 'sbx-2')
  assert.equal(built.length, 52, 'fifty paused turns built fifty instances, none of them kept')
  const kept = open({ conversationId: conversation(3), providerSandboxId: null })
  assert.equal(open({ conversationId: conversation(3), providerSandboxId: null }), kept, 'until its pause, every run of the conversation gets the one instance')
  assert.equal(built.length, 53)
})

test('a pause that finishes after the next run took the instance drops nothing, and a workspace is never destroyed on a pause', async () => {
  const { open, built } = sandboxCache()
  const run1 = open({ conversationId: conversation(1), providerSandboxId: null })
  let destroyed = 0
  run1.workspace.destroy = async () => { destroyed += 1 }
  built[0].finishPause = () => {}
  const pausing = run1.pause()
  const run2 = open({ conversationId: conversation(1), providerSandboxId: 'sbx-1' })
  assert.equal(run2, run1, 'the next run waits on the same instance while the pause is pending')
  built[0].finishPause()
  await pausing
  assert.equal(open({ conversationId: conversation(1), providerSandboxId: 'sbx-1' }), run1, 'it is still held for the run that took it')
  built[0].finishPause = null
  await run1.pause()
  assert.notEqual(open({ conversationId: conversation(1), providerSandboxId: 'sbx-1' }), run1, 'the last run to take it dropped it on its pause')
  assert.equal(destroyed, 0, 'Mastra destroys the VM with the workspace, so the paused VM is only left to E2B')
})

test('a killed VM is forgotten, and a Project deletion kills the VMs its conversations still hold in memory and no others', async () => {
  const { open, built, destroy } = sandboxCache()
  const doomed = open({ conversationId: conversation(1), providerSandboxId: null })
  await doomed.kill()
  assert.notEqual(open({ conversationId: conversation(1), providerSandboxId: null }), doomed, 'the next run gets a new instance')
  open({ conversationId: conversation(2), providerSandboxId: null })
  open({ conversationId: conversation(3), providerSandboxId: null })
  await destroy([conversation(1), conversation(2), conversation(4)])
  assert.deepEqual(built.map(({ conversationId, killed }) => [conversationId.at(-1), killed]), [['1', 1], ['1', 1], ['2', 1], ['3', 0]])
  assert.equal(built.length, 4, 'one instance per open, none rebuilt for the conversations that were not asked for')
})
