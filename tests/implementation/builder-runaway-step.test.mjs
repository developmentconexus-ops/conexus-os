import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'
import { InMemoryStore } from '@mastra/core/storage'
import { LocalFilesystem, LocalSandbox, Workspace } from '@mastra/core/workspace'
import { hubModuleUrl } from './hub-build.mjs'
import { testConversations } from './builder-conversation-fixture.mjs'

const { createBuilderController } = await import(hubModuleUrl('builder/harness/controller.js'))
const { createControllerRunSessions } = await import(hubModuleUrl('builder/run/turn.js'))

const repositoryRoot = resolve(import.meta.dirname, '../..')
const projectId = '22222222-2222-4222-8222-222222222222'
const builderRunId = '11111111-1111-4111-8111-111111111111'
const conversationId = '44444444-4444-4444-8444-444444444444'

// A provider that opens one tool call and keeps streaming its input, as the runaway turn did.
const streamingToolCallForever = () => {
  const seen = { calls: 0, maxOutputTokens: undefined, chunks: 0 }
  const model = {
    specificationVersion: 'v2', provider: 'anthropic', modelId: 'runaway-1', supportedUrls: {},
    async doGenerate() { throw new Error('doGenerate not used') },
    async doStream(options) {
      seen.calls += 1
      seen.maxOutputTokens = options.maxOutputTokens
      let started = false
      return {
        stream: new ReadableStream({
          async pull(controller) {
            await new Promise((done) => setTimeout(done, 5))
            if (!started) {
              started = true
              controller.enqueue({ type: 'stream-start', warnings: [] })
              controller.enqueue({ type: 'tool-input-start', id: 'call-1', toolName: 'mastra_workspace_write_file' })
              return
            }
            seen.chunks += 1
            controller.enqueue({ type: 'tool-input-delta', id: 'call-1', delta: 'x'.repeat(1024) })
          },
        }),
      }
    },
  }
  return { model, seen }
}

const openRun = async (t, model, modelStepTimeoutMs) => {
  const root = mkdtempSync(resolve(tmpdir(), 'builder-runaway-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(root, { recursive: true })
  const workspace = new Workspace({ id: 'runaway-ws', filesystem: new LocalFilesystem({ basePath: root }), sandbox: new LocalSandbox({ workingDirectory: root }) })
  let conversations
  const storage = new InMemoryStore()
  await storage.init()
  const controller = createBuilderController({
    workspace: (context) => conversations.workspace(context),
    model, storage, skillsPath: resolve(repositoryRoot, 'builder-skills'),
    ...(modelStepTimeoutMs ? { modelStepTimeoutMs } : {}),
  })
  await controller.init()
  t.after(() => controller.destroy?.())
  conversations = testConversations(controller, () => workspace)
  t.after(() => conversations.close())
  return createControllerRunSessions({ controller, conversations, readDefaultModel: async () => 'anthropic/default-model' })({
    projectId, conversationId, builderRunId,
    bindContext: (requestContext) => { requestContext.setRaw('conexusBuilderRunId', builderRunId); requestContext.setRaw('conexusBuilderConversationId', conversationId) },
  })
}

test('a tool call that never stops streaming ends the turn within the step budget as BUILDER_MODEL_STEP_TIMEOUT, and the model was asked for the output cap', async (t) => {
  const { model, seen } = streamingToolCallForever()
  const run = await openRun(t, model, 400)
  const started = Date.now()
  const outcome = await run.takeStep({ kind: 'SEND', content: 'Faça o app.' }, new AbortController().signal).then((turn) => ({ settled: 'resolved', reason: turn.reason }), (error) => ({ settled: 'rejected', code: error.message }))
  assert.deepEqual(outcome, { settled: 'rejected', code: 'BUILDER_MODEL_STEP_TIMEOUT' })
  assert.ok(Date.now() - started < 5_000, `the turn took ${Date.now() - started} ms`)
  assert.equal(seen.calls, 1)
  assert.equal(seen.maxOutputTokens, 32_000)
  assert.ok(seen.chunks > 5)
})

test('the web tells the person the model ran too long on one answer and nothing was applied', async () => {
  const { failureCodeText } = await import('../../apps/web/src/app/failure.ts')
  assert.equal(
    failureCodeText('BUILDER_MODEL_STEP_TIMEOUT'),
    'O modelo passou tempo demais gerando uma única resposta, então o Conexus encerrou a execução. As alterações desta execução não foram aplicadas. Tente novamente mais tarde.',
  )
})

test('the ChatGPT Codex request carries no max_output_tokens even when the call asks for a cap', async (t) => {
  const { codexModel } = await import('./codex-model.mjs')
  const realFetch = globalThis.fetch
  const live = { access: 'test-bearer', refresh: 'test-refresh', expires: Date.now() + 3_600_000, accountId: 'test-account' }
  let body
  globalThis.fetch = async (request) => {
    body = JSON.parse(await request.text())
    return new Response('data: [DONE]\n\n', { status: 200, headers: { 'content-type': 'text/event-stream' } })
  }
  t.after(() => { globalThis.fetch = realFetch })
  const model = await codexModel('gpt-6-luna', live)
  await model.doStream({ prompt: [{ role: 'user', content: [{ type: 'text', text: 'oi' }] }], maxOutputTokens: 32_000 })
  assert.equal(body.model, 'gpt-6-luna')
  assert.equal('max_output_tokens' in body, false)
})
