import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'
import { InMemoryStore } from '@mastra/core/storage'
import { LocalFilesystem, LocalSandbox, Workspace } from '@mastra/core/workspace'
import { hubModuleUrl } from './hub-build.mjs'

const { createBuilderController } = await import(hubModuleUrl('builder/harness/controller.js'))
const { createControllerRunSessions } = await import(hubModuleUrl('builder/run/turn.js'))

const repositoryRoot = resolve(import.meta.dirname, '../..')
const usage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 }
const streamOf = (parts) => new ReadableStream({ start(controller) { for (const part of parts) controller.enqueue(part); controller.close() } })
const projectId = '22222222-2222-4222-8222-222222222222'
const conversationId = '44444444-4444-4444-8444-444444444444'
const firstRunId = '11111111-1111-4111-8111-111111111111'
const laterRunId = '33333333-3333-4333-8333-333333333333'
const SILENCE_MS = 300

const model = {
  specificationVersion: 'v2', provider: 'anthropic', modelId: 'probe-1', supportedUrls: {},
  async doGenerate() { throw new Error('doGenerate not used') },
  async doStream() {
    return { stream: streamOf([{ type: 'stream-start', warnings: [] }, { type: 'text-start', id: 't' }, { type: 'text-delta', id: 't', delta: 'Pronto.' }, { type: 'text-end', id: 't' }, { type: 'finish', finishReason: 'stop', usage }]) }
  },
}

const settle = (turn) => turn.then((value) => ({ settled: 'resolved', reason: value.reason }), (error) => ({ settled: 'rejected', code: error.message }))

test('a storage read that never settles ends the turn as BUILDER_AGENT_STALLED, and a later run in the same Project completes', async (t) => {
  const root = mkdtempSync(resolve(tmpdir(), 'builder-turn-stall-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const workspace = new Workspace({ id: 'stall-ws', filesystem: new LocalFilesystem({ basePath: root }), sandbox: new LocalSandbox({ workingDirectory: root }) })
  const conversationWorkspaces = new Map()
  const storage = new InMemoryStore()
  await storage.init()
  const workflows = await storage.getStore('workflows')
  const original = workflows.getWorkflowRunById.bind(workflows)
  let hang = true
  let hungReads = 0
  workflows.getWorkflowRunById = (args) => {
    if (!hang) return original(args)
    hungReads += 1
    return new Promise(() => {})
  }
  const controller = createBuilderController({
    workspace: ({ requestContext }) => conversationWorkspaces.get(requestContext.getRaw('conexusBuilderConversationId')),
    model, storage, skillsPath: resolve(repositoryRoot, 'builder-skills'),
  })
  await controller.init()
  t.after(() => controller.destroy?.())
  const openSession = createControllerRunSessions({
    controller, runContexts: new Map(), conversationWorkspaces, runTools: new Map(),
    readDefaultModel: async () => 'anthropic/default-model', turnSilenceMs: SILENCE_MS,
  })
  const open = (builderRunId) => openSession({
    projectId, conversationId, builderRunId, workspace,
    runCheck: async () => { throw new Error('not used') },
    bindContext: (requestContext) => { requestContext.setRaw('conexusBuilderRunId', builderRunId); requestContext.setRaw('conexusBuilderConversationId', conversationId) },
  })

  const first = await open(firstRunId)
  const started = Date.now()
  const outcome = await settle(first.takeStep({ kind: 'SEND', content: 'Faça o app.' }, new AbortController().signal))
  assert.deepEqual(outcome, { settled: 'rejected', code: 'BUILDER_AGENT_STALLED' })
  assert.ok(hungReads >= 1, 'the turn reached the storage read that never settles')
  assert.ok(Date.now() - started < 10_000, `the turn settled ${Date.now() - started} ms after it started`)

  hang = false
  const later = await open(laterRunId)
  assert.deepEqual(await settle(later.takeStep({ kind: 'SEND', content: 'Faça o app de novo.' }, new AbortController().signal)), { settled: 'resolved', reason: 'complete' })
})

test('the web names a stalled turn as a Conexus fault, not the model', async () => {
  const { failureCodeText } = await import('../../apps/web/src/app/failure.ts')
  assert.equal(
    failureCodeText('BUILDER_AGENT_STALLED'),
    'O agente parou de responder por uma falha do Conexus, e não do modelo, então a execução foi encerrada. As alterações desta execução não foram aplicadas. A falha foi registrada.',
  )
})
