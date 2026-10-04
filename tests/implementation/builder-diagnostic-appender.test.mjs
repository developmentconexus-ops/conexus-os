import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import { LibSQLStore } from '@mastra/libsql'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const buildRoot = await mkdtemp(resolve(repositoryRoot, 'apps/hub/builder-diagnostic-appender-build-'))
test.after(() => rm(buildRoot, { recursive: true, force: true }))

const bundle = (relativeSourcePath) => {
  const outfile = resolve(buildRoot, `${relativeSourcePath.replaceAll('/', '-')}.js`)
  const built = spawnSync(resolve(repositoryRoot, 'node_modules/.bin/esbuild'), [
    resolve(repositoryRoot, relativeSourcePath), `--outfile=${outfile}`, '--bundle', '--platform=node', '--format=esm', '--packages=external', '--log-level=error',
  ], { cwd: repositoryRoot, encoding: 'utf8' })
  if (built.status !== 0) throw new Error(built.stdout || built.stderr)
  return import(pathToFileURL(outfile).href)
}

const { createDiagnosticAppender } = await bundle('apps/hub/src/builder/diagnostic-appender.ts')
const { createBuilderController } = await bundle('apps/hub/src/builder/harness/controller.ts')
const { createBuilderMemory } = await bundle('apps/hub/src/builder/memory.ts')

const projectId = '44444444-4444-4444-8444-444444444444'
// A diagnostic belongs to the conversation the run was asked in, which is a thread of the Project's
// Mastra session and not a name the Builder derives.
const conversationId = '77777777-7777-4777-8777-777777777777'
const runId = '55555555-5555-4555-8555-555555555555'
const resourceId = `project:${projectId}`
const usage = { inputTokens: { total: 1, noCache: 1 }, outputTokens: { total: 1, text: 1 } }

// The Builder's own controller on a real storage, and a model that records every prompt it is sent.
const conversationThread = async (t) => {
  const storage = new LibSQLStore({ id: 'builder-diagnostic-appender-test', url: ':memory:' })
  await storage.init()
  const memory = await storage.getStore('memory')
  const prompts = []
  const model = {
    specificationVersion: 'v3', provider: 'anthropic.messages', modelId: 'probe-1', supportedUrls: {},
    async doGenerate() { throw new Error('doGenerate not used') },
    async doStream(options) {
      prompts.push(JSON.stringify(options.prompt))
      const parts = [{ type: 'stream-start', warnings: [] }, { type: 'text-start', id: 't' }, { type: 'text-delta', id: 't', delta: 'ok' }, { type: 'text-end', id: 't' }, { type: 'finish', finishReason: 'stop', usage }]
      return { stream: new ReadableStream({ start(controller) { for (const part of parts) controller.enqueue(part); controller.close() } }) }
    },
  }
  const controller = createBuilderController({ model, storage, memory: createBuilderMemory({ storage, memoryModel: async () => model }), skillsPath: resolve(repositoryRoot, 'builder-skills', 'conexus-server') })
  await controller.init()
  t.after(() => controller.destroy?.())
  const session = await controller.createSession({ resourceId, scope: `conversation:${conversationId}`, threadId: conversationId })
  const appendDiagnostic = createDiagnosticAppender(async () => session)
  const rows = async () => {
    const { messages } = await memory.listMessages({ threadId: conversationId, resourceId })
    return messages.map((message) => [message.role, message.content.metadata?.signal?.type, message.content.parts.map((part) => part.text).join('')])
  }
  const nextTurnPrompt = async () => {
    await session.sendMessage({ content: 'continue' })
    for (let waited = 0; prompts.length === 0 && waited < 5000; waited += 50) await new Promise((wake) => { setTimeout(wake, 50) })
    return prompts[0]
  }
  return { appendDiagnostic, rows, nextTurnPrompt }
}

test('a run that kept its files unadmitted leaves exactly one notice signal in its conversation, and a retried append does not add a second', async (t) => {
  const { appendDiagnostic, rows } = await conversationThread(t)
  const note = { projectId, conversationId, builderRunId: runId, code: 'BUILDER_MODEL_INCOMPLETE', outcome: 'RUN_NOT_FINISHED', sourceRevision: 'd'.repeat(40) }
  await appendDiagnostic(note)
  await appendDiagnostic(note)
  assert.deepEqual(await rows(), [['signal', 'notification',
    `A execução ${runId} não terminou e nada dela foi aplicado. Os arquivos desta execução ficaram guardados nesta conversa, e a próxima execução continua deles, junto com a versão atual da fonte; a versão aplicada continua na revisão ${'d'.repeat(40)}. Leia os arquivos antes de confiar neste histórico. Referência: ${runId.slice(0, 8)}.`]])
})

test("a refused candidate's notice reaches the next turn's model as a notification, so it can fix it (AC-9)", async (t) => {
  const { appendDiagnostic, nextTurnPrompt } = await conversationThread(t)
  await appendDiagnostic({ projectId, conversationId, builderRunId: runId, code: 'BUILDER_CHECK_FAILED', outcome: 'CANDIDATE_REFUSED', sourceRevision: 'd'.repeat(40), detail: 'typecheck failed: app/src/a.ts:1:1 TS2304 Cannot find name b.' })
  const prompt = JSON.parse(await nextTurnPrompt())
  const userTexts = prompt.filter((message) => message.role === 'user').map((message) => message.content.map((part) => part.text).join('')).filter((text) => !text.startsWith('<system-reminder>'))
  assert.deepEqual(userTexts, [
    `<notification source="conexus" outcome="CANDIDATE_REFUSED" run="${runId}">A execução ${runId} não foi aplicada. O código novo quebrou as regras do próprio Projeto, então foi recusado. O Projeto continua no código anterior. Os arquivos desta execução ficaram guardados nesta conversa, e a próxima execução continua deles, junto com a versão atual da fonte; a versão aplicada continua na revisão ${'d'.repeat(40)}. Leia os arquivos antes de confiar neste histórico. Referência: ${runId.slice(0, 8)}. Motivo: typecheck failed: app/src/a.ts:1:1 TS2304 Cannot find name b. Resolva isso na próxima execução.</notification>`,
    'continue',
  ])
})

test('boot problems in an admitted app are stored as a notice and say that the Preview is up', async (t) => {
  const { appendDiagnostic, rows } = await conversationThread(t)
  await appendDiagnostic({ projectId, conversationId, builderRunId: runId, code: 'APPLICATION_BOOT_PROBLEMS', outcome: 'BOOT_PROBLEMS', sourceRevision: 'd'.repeat(40), detail: 'boot failed:\nBOOT_CONSOLE_ERROR Failed to load notes' })
  assert.deepEqual(await rows(), [['signal', 'notification',
    `A execução ${runId} foi aplicada e a Prévia está no ar, mas ao abrir o app o Conexus viu problemas. Detalhe: boot failed:\nBOOT_CONSOLE_ERROR Failed to load notes Resolva isso na próxima execução.`]])
})
