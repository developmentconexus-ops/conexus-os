import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import net from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { Mastra } from '@mastra/core/mastra'
import { LibSQLStore } from '@mastra/libsql'
import { Memory } from '@mastra/memory'
import { hubModuleUrl } from './hub-build.mjs'
import { hubSessionCookie, opaque, testListener } from './access/test-listener.mjs'
import { testConversations } from './builder-conversation-fixture.mjs'

const { registerBuilderSessionRoutes } = await import(hubModuleUrl('builder/mastra-session-routes.js'))
const { createBuilderController } = await import(hubModuleUrl('builder/harness/controller.js'))

const accountId = '22222222-2222-4222-8222-222222222222'
const projectId = '33333333-3333-4333-8333-333333333333'
const conversationId = '77777777-7777-4777-8777-777777777777'
const model = {
  specificationVersion: 'v2', provider: 'conexus-boundary', modelId: 'boundary-probe', supportedUrls: {},
  async doGenerate() { throw new Error('never reached') },
  async doStream() { throw new Error('never reached') },
}
const FRAME_BYTES = 256 * 1024
const FRAMES = 160

// The Builder's stream route on a real port, with a client that sends its request and then never reads.
const flood = async (t, streamBacklog) => {
  const root = mkdtempSync(join(tmpdir(), 'conexus-stream-backlog-'))
  const storage = new LibSQLStore({ id: `stream-backlog-${Date.now()}`, url: `file:${join(root, 'session.db')}` })
  const memory = new Memory({ storage, options: { lastMessages: 20 } })
  const controller = createBuilderController({ id: 'conexus-builder', model, storage, memory, skillsPath: resolve(import.meta.dirname, '../../builder-skills') })
  const mastra = new Mastra({ storage, agentControllers: { 'conexus-builder': controller }, logger: false })
  await controller.init()
  const sessions = testConversations(controller, () => undefined)
  const session = await controller.createSession({ resourceId: `project:${projectId}`, scope: `conversation:${conversationId}`, threadId: conversationId })
  const responses = []
  const token = opaque('operator')
  const { app } = await testListener({
    sessions: { [token]: { account: { accountId, displayName: 'Operator' }, issuer: 'https://issuer.test', subject: 'subject-1' } },
    registerRoutes: async (instance) => {
      instance.addHook('onRequest', async (request, reply) => { if (request.url.includes('/stream')) responses.push(reply.raw) })
      await registerBuilderSessionRoutes(instance, {
        mastra, controllerId: 'conexus-builder', controller, conversations: sessions,
        admitBuilder: async () => {},
        conversationOwner: async () => 'PROJECT',
        projectBusy: async () => false,
        ...(streamBacklog ? { streamBacklog } : {}),
      })
      return []
    },
  })
  await app.listen({ port: 0, host: '127.0.0.1' })
  const client = net.connect({ port: app.server.address().port, host: '127.0.0.1' })
  let closed = false
  client.on('close', () => { closed = true })
  client.on('error', () => {})
  await new Promise((connected) => client.once('connect', connected))
  client.write(`GET /api/builder/agent-controller/conexus-builder/sessions/project:${projectId}/stream?sessionScope=conversation:${conversationId} HTTP/1.1\r\nHost: 127.0.0.1\r\nCookie: ${hubSessionCookie(token)}\r\n\r\n`)
  client.pause()
  for (let wait = 0; responses.length === 0 && wait < 100; wait += 1) await new Promise((tick) => setTimeout(tick, 20))
  assert.equal(responses.length, 1, 'the stream opened')
  t.after(async () => {
    client.destroy()
    await app.close()
    await controller.destroy()
    await storage.close()
    rmSync(root, { recursive: true, force: true })
  })
  const frame = 'x'.repeat(FRAME_BYTES)
  const state = { peakUnsent: 0 }
  for (let sent = 0; sent < FRAMES; sent += 1) {
    session.emit({ type: 'info', message: frame })
    await new Promise((tick) => setTimeout(tick, 5))
    state.peakUnsent = Math.max(state.peakUnsent, responses[0].writableLength)
    if (responses[0].destroyed) break
  }
  await new Promise((tick) => setTimeout(tick, 200))
  return { response: responses[0], state, closed: () => closed }
}

test('a client that stops reading the session stream has it closed once its unsent bytes pass the limit', async (t) => {
  const LIMIT = 1024 * 1024
  const { response, state } = await flood(t, { limitBytes: LIMIT, checkMs: 20 })
  t.diagnostic(`peak unsent ${state.peakUnsent} bytes with the limit at ${LIMIT}`)
  assert.equal(response.destroyed, true, 'the Hub closed the stream')
  assert.ok(state.peakUnsent < LIMIT + 8 * FRAME_BYTES, `the unsent bytes peaked at ${state.peakUnsent}, within a few frames of the ${LIMIT} limit`)
})

test("without the limit, Mastra's route and adapter keep writing to a client that reads nothing", async (t) => {
  const { response, state } = await flood(t, { limitBytes: Number.MAX_SAFE_INTEGER, checkMs: 20 })
  t.diagnostic(`peak unsent ${state.peakUnsent} bytes of ${FRAMES * FRAME_BYTES} sent`)
  assert.equal(response.destroyed, false)
  assert.ok(state.peakUnsent > 8 * 1024 * 1024, `the unsent bytes reached ${state.peakUnsent}, with ${FRAMES * FRAME_BYTES} sent`)
})
