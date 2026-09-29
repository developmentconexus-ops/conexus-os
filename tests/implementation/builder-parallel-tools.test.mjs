import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'
import { InMemoryStore } from '@mastra/core/storage'
import { LocalFilesystem, LocalSandbox, Workspace } from '@mastra/core/workspace'
import { hubModuleUrl } from './hub-build.mjs'

const { createBuilderController } = await import(hubModuleUrl('builder/harness/controller.js'))

const repositoryRoot = resolve(import.meta.dirname, '../..')
const usage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 }
const streamOf = (parts) => new ReadableStream({ start(controller) { for (const part of parts) controller.enqueue(part); controller.close() } })
const toolCall = (toolCallId, toolName, input) => ({ type: 'tool-call', toolCallId, toolName, input: JSON.stringify(input) })
const read = (id, path) => toolCall(id, 'mastra_workspace_read_file', { path })

// A filesystem whose reads take 150 ms and count how many are in flight at once.
class SlowReadFilesystem extends LocalFilesystem {
  inflight = 0
  peak = 0
  async readFile(path, options) {
    this.inflight += 1
    this.peak = Math.max(this.peak, this.inflight)
    try {
      await new Promise((r) => setTimeout(r, 150))
      return await super.readFile(path, options)
    } finally {
      this.inflight -= 1
    }
  }
}

// Runs one turn whose first model step emits `calls`, answers ask_user with "azul", and returns the peak overlap of file reads.
const runStep = async (t, calls) => {
  const root = mkdtempSync(resolve(tmpdir(), 'builder-parallel-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  for (const name of ['a.txt', 'b.txt', 'c.txt']) writeFileSync(resolve(root, name), name)
  mkdirSync(resolve(root, '.conexus/plans'), { recursive: true })
  writeFileSync(resolve(root, '.conexus/plans/p.md'), 'um dois')
  const filesystem = new SlowReadFilesystem({ basePath: root })
  const workspace = new Workspace({ id: 'parallel-ws', filesystem, sandbox: new LocalSandbox({ workingDirectory: root }) })
  let steps = 0
  const model = {
    specificationVersion: 'v2', provider: 'anthropic', modelId: 'probe-1', supportedUrls: {},
    async doGenerate() { throw new Error('doGenerate not used') },
    async doStream() {
      const first = steps++ === 0
      return {
        stream: streamOf(first
          ? [{ type: 'stream-start', warnings: [] }, ...calls, { type: 'finish', finishReason: 'tool-calls', usage }]
          : [{ type: 'stream-start', warnings: [] }, { type: 'text-start', id: 't' }, { type: 'text-delta', id: 't', delta: 'ok' }, { type: 'text-end', id: 't' }, { type: 'finish', finishReason: 'stop', usage }]),
      }
    },
  }
  const controller = createBuilderController({ workspace, model, storage: new InMemoryStore(), skillsPath: resolve(repositoryRoot, 'builder-skills') })
  await controller.init()
  t.after(() => controller.destroy?.())
  const session = await controller.createSession({ resourceId: 'project:probe-parallel', scope: 'probe-parallel' })
  await session.state.set({ yolo: true })
  const ended = []
  session.subscribe((event) => {
    if (event.type === 'tool_end') ended.push(event.toolCallId)
    if (event.type === 'tool_suspended') setTimeout(() => { void session.respondToToolSuspension({ toolCallId: event.toolCallId, resumeData: 'azul' }) }, 10)
  })
  await session.sendMessage({ content: 'leia os arquivos' })
  for (let waited = 0; steps < 2 && waited < 8000; waited += 50) await new Promise((r) => setTimeout(r, 50))
  return { peak: filesystem.peak, steps, ended, root }
}

test('two read tools called in one step run at the same time', async (t) => {
  const { peak, steps } = await runStep(t, [read('r1', 'a.txt'), read('r2', 'b.txt')])
  assert.equal(steps, 2)
  assert.equal(peak, 2)
})

test('a step that calls ask_user with two reads runs one tool at a time', async (t) => {
  const { peak, steps, ended } = await runStep(t, [read('r1', 'a.txt'), toolCall('q1', 'ask_user', { question: 'Qual cor?' }), read('r2', 'b.txt')])
  assert.equal(steps, 2)
  assert.equal(peak, 1)
  assert.deepEqual([...ended].sort(), ['q1', 'r1', 'r2'])
})

test('two edits to the same file in one step both land', async (t) => {
  const edit = (id, old_string, new_string) => toolCall(id, 'mastra_workspace_edit_file', { path: '.conexus/plans/p.md', old_string, new_string })
  const { root, steps } = await runStep(t, [edit('e1', 'um', '1'), edit('e2', 'dois', '2')])
  assert.equal(steps, 2)
  assert.equal(readFileSync(resolve(root, '.conexus/plans/p.md'), 'utf8'), '1 2')
})
