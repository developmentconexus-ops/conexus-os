import assert from 'node:assert/strict'
import { setTimeout as sleep } from 'node:timers/promises'
import test from 'node:test'
import { InMemoryStore } from '@mastra/core/storage'
import { Sandbox } from 'e2b'
import { readBuilderE2BApiKey } from '../../scripts/builder-e2b-template.mjs'
import { hubModuleUrl } from '../implementation/hub-build.mjs'
import { conversationId, projectId } from '../implementation/builder-run-harness.mjs'
import { ASK, bindRun, builderOn, liveSession, pendingCall, scriptedModel } from '../implementation/builder-question-fixture.mjs'

// Paid: one real E2B sandbox on the Builder's template for about ten minutes, killed before the test
// ends. Run with `npm run builder:question:live`, which reads the Hub env file.
const live = process.env.CONEXUS_FACTORY_LIVE === 'true'
const skip = !live && 'opt-in: CONEXUS_FACTORY_LIVE=true with CONEXUS_BUILDER_E2B_API_KEY_FILE and CONEXUS_BUILDER_E2B_TEMPLATE_ID'
const MINUTE = 60_000
const IDLE_MS = 5 * MINUTE

const liveConfig = () => {
  const templateId = process.env.CONEXUS_BUILDER_E2B_TEMPLATE_ID
  if (!templateId || !/^[a-z0-9]+:[0-9a-f-]{36}$/.test(templateId)) throw new Error('CONEXUS_FACTORY_LIVE_CONFIG_REFUSED')
  return { templateId, apiKey: readBuilderE2BApiKey(process.env.CONEXUS_BUILDER_E2B_API_KEY_FILE) }
}

const timed = async (work) => {
  const started = performance.now()
  const result = await work()
  return { result, ms: Math.round(performance.now() - started) }
}

test('a question answered inside the idle window finds its VM running, one answered after it finds the VM E2B paused, and both resume the same session on the same VM', { skip, timeout: 20 * MINUTE }, async (t) => {
  const { e2bConversationSandboxes } = await import(hubModuleUrl('builder/conversation-sandboxes.js'))
  const { templateId, apiKey } = liveConfig()
  const seen = new Set()
  t.after(async () => { for (const id of seen) await Sandbox.kill(id, { apiKey }).catch(() => undefined) })
  const storage = new InMemoryStore()
  await storage.init()
  const builder = await builderOn(t, storage, scriptedModel().model, { sandboxes: e2bConversationSandboxes({ apiKey, templateId, idleMs: IDLE_MS }) })
  const ref = { projectId, conversationId }
  const sandbox = await builder.conversations.sandbox(ref)
  const command = (script) => sandbox.executeCommand('sh', ['-c', script], { cwd: '/tmp' })
  const first = await timed(() => command('echo kept > /tmp/s2-live && cat /tmp/s2-live'))
  assert.equal(first.result.stdout.trim(), 'kept')
  const providerId = sandbox.sandboxId
  seen.add(providerId)
  const state = async () => (await Sandbox.getInfo(providerId, { apiKey })).state
  const signal = new AbortController().signal
  const answers = []

  for (const [index, waitMs] of [2 * MINUTE, 6 * MINUTE].entries()) {
    const builderRunId = `33333333-3333-4333-8333-${String(index).padStart(12, '0')}`
    let release = await sandbox.holdOpen((error) => { throw error })
    const session = await builder.openSession({ projectId, conversationId, builderRunId, bindContext: bindRun(builderRunId) })
    assert.equal((await session.takeStep({ kind: 'SEND', content: ASK }, signal)).reason, 'suspended')
    await session.untilQuestionStored()
    const held = await liveSession(builder.controller)
    const toolCallId = await pendingCall(builder.controller)
    release()
    await sleep(waitMs)
    const before = await state()
    const resumed = await timed(() => command('cat /tmp/s2-live'))
    release = await sandbox.holdOpen((error) => { throw error })
    const answered = await session.takeStep({ kind: 'ANSWER', toolCallId, resumeData: ['Azul'] }, signal)
    release()
    await session.release()
    answers.push({ waitMs, before, resumeMs: resumed.ms, file: resumed.result.stdout.trim(), sameVm: sandbox.sandboxId === providerId, sameSession: (await liveSession(builder.controller)) === held, reason: answered.reason })
  }

  t.diagnostic(`sandbox ${providerId}: first command ${first.ms} ms; ${answers.map((answer) => `answer at ${answer.waitMs / MINUTE} min found it ${answer.before}, command ${answer.resumeMs} ms`).join('; ')}`)
  assert.deepEqual(answers.map(({ before, file, sameVm, sameSession, reason }) => ({ before, file, sameVm, sameSession, reason })), [
    { before: 'running', file: 'kept', sameVm: true, sameSession: true, reason: 'complete' },
    { before: 'paused', file: 'kept', sameVm: true, sameSession: true, reason: 'complete' },
  ])
  await sandbox.kill()
  await assert.rejects(Sandbox.getInfo(providerId, { apiKey }), 'the killed VM is gone')
  seen.delete(providerId)
})
