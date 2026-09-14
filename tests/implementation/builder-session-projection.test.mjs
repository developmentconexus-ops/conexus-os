import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import { AgentController } from '@mastra/core/agent-controller'
import { createCodingAgent } from '@mastra/core/coding-agent'
import { LibSQLStore } from '@mastra/libsql'
import { Memory } from '@mastra/memory'
const repositoryRoot = resolve(import.meta.dirname, '../..')
const buildRoot = await mkdtemp(resolve(repositoryRoot, 'apps/hub/session-projection-build-'))
const compiled = spawnSync(resolve(repositoryRoot, 'node_modules/.bin/esbuild'), [
  resolve(repositoryRoot, 'apps/hub/src/builder/module.ts'), `--outdir=${buildRoot}`, '--bundle', '--platform=node', '--format=esm', '--packages=external', '--log-level=error',
], { cwd: repositoryRoot, encoding: 'utf8' })
if (compiled.status !== 0) throw new Error(compiled.stdout || compiled.stderr)
const { projectBuilderMessages } = await import(pathToFileURL(resolve(buildRoot, 'module.js')).href)

const model = {
  specificationVersion: 'v2', provider: 'conexus-slice-3', modelId: 'slice-3-probe', supportedUrls: {},
  async doGenerate() {
    return { content: [{ type: 'text', text: 'Resposta persistida.' }], finishReason: 'stop', usage: { inputTokens: 0, outputTokens: 1, totalTokens: 1 }, warnings: [] }
  },
  async doStream() {
    return { stream: new ReadableStream({
      start(stream) {
        stream.enqueue({ type: 'stream-start', warnings: [] })
        stream.enqueue({ type: 'text-start', id: 'slice-3-text' })
        stream.enqueue({ type: 'text-delta', id: 'slice-3-text', delta: 'Resposta persistida.' })
        stream.enqueue({ type: 'text-end', id: 'slice-3-text' })
        stream.enqueue({ type: 'finish', finishReason: 'stop', usage: { inputTokens: 0, outputTokens: 1, totalTokens: 1 } })
        stream.close()
      },
    }) }
  },
}

test('real Mastra messages project to Product roles without leaking internal signals', async () => {
  const root = await mkdtemp(join(tmpdir(), 'conexus-slice-3-projection-'))
  const threadId = `conexus-builder:${randomUUID()}`
  const storage = new LibSQLStore({ id: `slice-3-projection-${randomUUID()}`, url: `file:${join(root, 'session.db')}` })
  const memory = new Memory({ storage, options: { lastMessages: 20 } })
  const agent = createCodingAgent({ id: 'slice-3-projection-agent', name: 'Slice 3 Projection', model, instructions: 'Mechanical probe.', memory, workspace: undefined })
  const controller = new AgentController({ id: `slice-3-projection-controller-${randomUUID()}`, storage, memory, agent, modes: [{ id: 'build', name: 'Build', availableTools: [] }], defaultModeId: 'build' })
  await controller.init()
  try {
    const session = await controller.createSession({ resourceId: 'slice-3-project', ownerId: 'slice-3-project', scope: 'builder:projection', threadId })
    await session.sendMessage({ content: 'Mensagem real do operador.' })
    const recalled = (await memory.recall({ threadId, resourceId: 'slice-3-project', page: 0, perPage: 50 })).messages
    const user = recalled.find((message) => message.role === 'signal' && message.type === 'user' && message.content.parts?.some((part) => part.type === 'text' && part.text === 'Mensagem real do operador.'))
    const assistant = recalled.find((message) => message.role === 'assistant')
    assert.ok(user)
    assert.ok(assistant)
    assert.equal(user.role, 'signal')
    assert.equal(user.type, 'user')
    await memory.saveMessages({ messages: [
      { id: 'slice-3-internal', role: 'signal', type: 'task', createdAt: new Date('2026-01-01T00:00:01Z'), threadId, resourceId: 'slice-3-project', content: { format: 2, parts: [{ type: 'text', text: 'internal task' }] } },
      { id: 'slice-3-empty', role: 'assistant', createdAt: new Date('2026-01-01T00:00:02Z'), threadId, resourceId: 'slice-3-project', content: { format: 2, parts: [{ type: 'text', text: '' }] } },
    ] })
    const projected = projectBuilderMessages((await memory.recall({ threadId, resourceId: 'slice-3-project', page: 0, perPage: 50 })).messages)
    const projectedUser = projected.find((message) => message.id === user.id)
    const projectedAssistant = projected.find((message) => message.id === assistant.id)
    assert.equal(projectedUser?.role, 'user')
    assert.equal(projectedUser?.text, 'Mensagem real do operador.')
    assert.equal(projectedAssistant?.role, 'assistant')
    assert.equal(projectedAssistant?.text, 'Resposta persistida.')
    assert.equal(projected.some((message) => message.text === 'internal task'), false)
    assert.equal(projected.some((message) => message.id === 'slice-3-empty'), false)
    assert.equal(projected.some((message) => message.role === 'system'), false)
    assert.equal(projected.every((message) => message.role === 'user' || message.role === 'assistant' || message.role === 'system'), true)
    assert.deepEqual(projected.map((message) => message.createdAt), projected.map((message) => message.createdAt).toSorted())
  } finally {
    await controller.destroy()
    await storage.close()
    await rm(root, { recursive: true, force: true })
  }
})

test.after(async () => { await rm(buildRoot, { recursive: true, force: true }) })
