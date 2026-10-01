import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'
import { InMemoryStore } from '@mastra/core/storage'
import { LocalFilesystem, LocalSandbox, Workspace } from '@mastra/core/workspace'
import { hubModuleUrl } from './hub-build.mjs'

const { createBuilderController } = await import(hubModuleUrl('builder/harness/controller.js'))
const { createControllerRunSessions } = await import(hubModuleUrl('builder/run-runtime.js'))

const repositoryRoot = resolve(import.meta.dirname, '../..')
const usage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 }
const streamOf = (parts) => new ReadableStream({ start(controller) { for (const part of parts) controller.enqueue(part); controller.close() } })
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
