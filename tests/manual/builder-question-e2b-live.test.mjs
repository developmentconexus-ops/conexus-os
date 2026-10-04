import assert from 'node:assert/strict'
import { setTimeout as sleep } from 'node:timers/promises'
import test from 'node:test'
import { InMemoryStore } from '@mastra/core/storage'
import { Sandbox } from 'e2b'
import { readBuilderE2BApiKey } from '../../scripts/builder-e2b-template.mjs'
import { hubModuleUrl } from '../implementation/hub-build.mjs'
import { conversationId, harness, projectId } from '../implementation/builder-run-harness.mjs'
import { builderOn, liveSession, pendingCall, scriptedModel } from '../implementation/builder-question-fixture.mjs'

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

test('a run waiting on a question lets its VM go: an answer inside the idle window finds it running, one after it finds it paused by E2B, and each resumes the same session on the same VM', { skip, timeout: 25 * MINUTE }, async (t) => {
  const { e2bConversationSandboxes } = await import(hubModuleUrl('builder/conversation-sandboxes.js'))
  const { templateId, apiKey } = liveConfig()
  const seen = new Set()
  t.after(async () => { for (const id of seen) await Sandbox.kill(id, { apiKey }).catch(() => undefined) })
  const storage = new InMemoryStore()
  await storage.init()
  const builder = await builderOn(t, storage, scriptedModel().model, { sandboxes: e2bConversationSandboxes({ apiKey, templateId, idleMs: IDLE_MS }) })
  const sandbox = () => builder.conversations.sandbox({ projectId, conversationId })
  const state = async (id) => (await Sandbox.getInfo(id, { apiKey })).state
  const waits = []
  // The person answers after `waitMs`; what E2B says of the VM is read just before the answer.
  const answerAfter = (waitMs) => async (service) => {
    try {
      const providerId = (await sandbox()).sandboxId
      if (!seen.has(providerId)) t.diagnostic(`sandbox ${providerId}`)
      seen.add(providerId)
      const session = await liveSession(builder.controller)
      await sleep(waitMs)
      const before = await state(providerId)
      const answered = service.answerQuestion({ projectId, conversationId, toolCallId: await pendingCall(builder.controller), resumeData: ['Azul'] })
      waits.push({ waitMs, providerId, before, session, answered })
    } catch (error) {
      // The harness drops what the person's act throws, so it is kept for the assertion.
      waits.push({ waitMs, error })
    }
  }
  const run = await harness(t, { answers: [answerAfter(2 * MINUTE), answerAfter(6 * MINUTE)], questionWaitMs: 8 * MINUTE, session: (input) => builder.openSession(input), openSandbox: () => sandbox() })
  const phasesOfRun = () => run.calls.filter(([kind]) => kind === 'phase').map(([, phase]) => phase)

  await run.start()
  await run.untilEnded()
  const first = { phases: phasesOfRun(), ending: run.calls.at(-1) }
  run.calls.length = 0
  await run.again(undefined, 'second')
  await run.untilEnded()
  const second = { phases: phasesOfRun(), ending: run.calls.at(-1) }

  const vm = await sandbox()
  const file = await vm.executeCommand('sh', ['-c', 'test -d /workspace/repo/.git && echo checkout'], { cwd: '/tmp' })
  t.diagnostic(`sandbox ${vm.sandboxId}: ${waits.map((wait) => `answer at ${wait.waitMs / MINUTE} min found it ${wait.before}`).join('; ')}`)
  assert.deepEqual({ first, second }, {
    first: { phases: ['PREPARING', 'AGENT', 'WAITING', 'AGENT', 'FINALIZING'], ending: ['settle', 'RESPONSE_ONLY'] },
    second: { phases: ['PREPARING', 'AGENT', 'WAITING', 'AGENT', 'FINALIZING'], ending: ['settle', 'RESPONSE_ONLY'] },
  })
  assert.deepEqual(waits.map(({ before, providerId, answered, error }) => ({ before, sameVm: providerId === vm.sandboxId, answered, error })), [{ before: 'running', sameVm: true, answered: 'ACCEPTED', error: undefined }, { before: 'paused', sameVm: true, answered: 'ACCEPTED', error: undefined }])
  assert.equal(waits[0].session, waits[1].session, 'one Mastra session for the conversation across both waits')
  assert.equal(await liveSession(builder.controller), waits[0].session)
  assert.equal(file.stdout.trim(), 'checkout', 'the checkout survived the pause')
  const providerId = vm.sandboxId
  await vm.kill()
  await assert.rejects(Sandbox.getInfo(providerId, { apiKey }), 'the killed VM is gone')
  seen.delete(providerId)
})
