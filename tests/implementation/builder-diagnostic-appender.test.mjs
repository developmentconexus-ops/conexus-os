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

const { createFactoryDiagnosticAppender } = await bundle('apps/hub/src/builder/module.ts')

const projectId = '44444444-4444-4444-8444-444444444444'
// A diagnostic belongs to the conversation the run was asked in, which is a thread of the Project's
// Mastra session and not a name the Builder derives.
const conversationId = '77777777-7777-4777-8777-777777777777'
const runId = '55555555-5555-4555-8555-555555555555'

const factoryThread = async () => {
  const storage = new LibSQLStore({ id: 'factory-diagnostic-appender-test', url: ':memory:' })
  await storage.init()
  const appendDiagnostic = createFactoryDiagnosticAppender(Promise.resolve({ mastra: { getStorage: () => storage } }))
  const texts = async () => {
    const memoryStore = await storage.getStore('memory')
    const { messages } = await memoryStore.listMessages({ threadId: conversationId, resourceId: conversationId })
    return messages.map((message) => [message.role, message.content.parts.map((part) => part.text).join('')])
  }
  return { appendDiagnostic, texts }
}

test('a Factory run whose edits were discarded leaves exactly one note, and a retried append does not add a second', async () => {
  const { appendDiagnostic, texts } = await factoryThread()
  const note = { projectId, conversationId, builderRunId: runId, code: 'BUILDER_MODEL_INCOMPLETE', outcome: 'RUN_NOT_FINISHED', sourceRevision: 'd'.repeat(40) }
  await appendDiagnostic(note)
  await appendDiagnostic(note)
  assert.deepEqual(await texts(), [['assistant',
    `A execução ${runId} não terminou e nada dela foi aplicado. As alterações desta execução foram descartadas e os arquivos voltaram à revisão ${'d'.repeat(40)}; as edições descritas acima nesta conversa não existem nos arquivos. Leia os arquivos antes de confiar neste histórico. Diagnóstico seguro: BUILDER_MODEL_INCOMPLETE.`]])
})

test('a Factory run that lost the compare-and-swap says its edits were discarded and the next request starts from the current source', async () => {
  const { appendDiagnostic, texts } = await factoryThread()
  await appendDiagnostic({ projectId, conversationId, builderRunId: runId, code: 'BUILDER_SOURCE_BASE_MOVED', outcome: 'SOURCE_BASE_MOVED', sourceRevision: 'd'.repeat(40) })
  assert.deepEqual(await texts(), [['assistant',
    `A execução ${runId} não foi aplicada: a fonte do Project mudou enquanto ela trabalhava, e nada foi sobrescrito. As alterações desta execução foram descartadas e os arquivos voltaram à revisão ${'d'.repeat(40)}; as edições descritas acima nesta conversa não existem nos arquivos. Leia os arquivos antes de confiar neste histórico. Diagnóstico seguro: BUILDER_SOURCE_BASE_MOVED. Envie o pedido novamente: ele começará da versão atual da fonte.`]])
})
