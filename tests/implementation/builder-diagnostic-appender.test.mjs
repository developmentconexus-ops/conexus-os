import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import { LibSQLStore } from '@mastra/libsql'
import { Memory } from '@mastra/memory'

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

const { createDiagnosticAppender } = await bundle('apps/hub/src/builder/module.ts')

const projectId = '44444444-4444-4444-8444-444444444444'
// A diagnostic belongs to the conversation the run was asked in, which is a thread of the Project's
// Mastra session and not a name the Builder derives.
const conversationId = '77777777-7777-4777-8777-777777777777'
const runId = '55555555-5555-4555-8555-555555555555'

const setUpAppender = async () => {
  const storage = new LibSQLStore({ id: 'diagnostic-appender-test', url: ':memory:' })
  const sessionMemory = new Memory({ storage, options: { lastMessages: 20 } })
  let init
  const ensureSessionStorage = async () => { init ??= storage.init(); await init }
  const appendDiagnostic = createDiagnosticAppender({ sessionMemory, ensureSessionStorage })
  const listMessages = async (threadId = conversationId) => {
    const memoryStore = await storage.getStore('memory')
    const { messages } = await memoryStore.listMessages({ threadId, resourceId: projectId })
    return messages
  }
  return { appendDiagnostic, ensureSessionStorage, listMessages }
}

test('appendDiagnostic collapses a retried call for the same run and code onto one message', async () => {
  const { appendDiagnostic, ensureSessionStorage, listMessages } = await setUpAppender()
  await ensureSessionStorage()
  await appendDiagnostic({ projectId, conversationId, builderRunId: runId, code: 'BUILDER_APPLICATION_BUILD_FAILED' })
  await appendDiagnostic({ projectId, conversationId, builderRunId: runId, code: 'BUILDER_APPLICATION_BUILD_FAILED' })
  const messages = await listMessages()
  assert.equal(messages.length, 1, `expected the retried call to collapse onto one message, saw ${messages.length}`)
})

test('appendDiagnostic still records distinct diagnostics for a different run or a different code', async () => {
  const { appendDiagnostic, ensureSessionStorage, listMessages } = await setUpAppender()
  await ensureSessionStorage()
  await appendDiagnostic({ projectId, conversationId, builderRunId: runId, code: 'BUILDER_APPLICATION_BUILD_FAILED' })
  await appendDiagnostic({ projectId, conversationId, builderRunId: runId, code: 'BUILDER_SOURCE_MATERIALIZATION_REFUSED' })
  await appendDiagnostic({ projectId, conversationId, builderRunId: '66666666-6666-4666-8666-666666666666', code: 'BUILDER_APPLICATION_BUILD_FAILED' })
  const messages = await listMessages()
  assert.equal(messages.length, 3)
})

test('a diagnostic is written to the conversation the run was asked in, not to every conversation', async () => {
  const { appendDiagnostic, ensureSessionStorage, listMessages } = await setUpAppender()
  await ensureSessionStorage()
  const other = '88888888-8888-4888-8888-888888888888'
  await appendDiagnostic({ projectId, conversationId: other, builderRunId: runId, code: 'BUILDER_APPLICATION_BUILD_FAILED' })
  assert.deepEqual(await listMessages(), [])
  assert.equal((await listMessages(other)).length, 1)
})
