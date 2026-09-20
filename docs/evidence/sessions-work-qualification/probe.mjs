// Throwaway qualification probe, phase 2. Isolated: its own scratch LibSQL file under the
// directory given on the command line, no Conexus code, no product dependency change,
// no model call and no paid effect. Each property is asserted on its own; none is inferred
// from another. Run as: node qual-probe2.mjs <storeDir> write|read
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { AgentController } from '/home/leandrotheodoro/wt-stream/node_modules/@mastra/core/dist/agent-controller/index.js'
import { createCodingAgent } from '/home/leandrotheodoro/wt-stream/node_modules/@mastra/core/dist/coding-agent/index.js'
import { LibSQLStore } from '/home/leandrotheodoro/wt-stream/node_modules/@mastra/libsql/dist/index.js'
import { Memory } from '/home/leandrotheodoro/wt-stream/node_modules/@mastra/memory/dist/index.js'

const [storeDir, phase] = process.argv.slice(2)
const storeUrl = `file:${resolve(storeDir, 'probe.db')}`
const ALPHA = 'project-alpha'
const BETA = 'project-beta'

const build = async () => {
  const storage = new LibSQLStore({ id: 'probe', url: storeUrl })
  const memory = new Memory({ storage, options: { lastMessages: 20 } })
  const agent = createCodingAgent({ id: 'probe-agent', model: 'anthropic/claude-sonnet-5', editor: false, tools: {} })
  const controller = new AgentController({
    id: 'probe-controller', agent, storage, memory,
    modes: [{ id: 'chat', name: 'Chat', availableTools: [] }],
    defaultModeId: 'chat', initialState: {}, workspace: undefined,
  })
  await controller.init?.()
  return { controller, memory }
}

const results = []
const claim = (property, statement, ok, detail = '') =>
  results.push({ property, statement, verdict: ok ? 'PASS' : 'FAIL', detail })

// A message written straight into the store. No model is called, which is what makes this
// a persistence test and not a generation test.
const message = (threadId, resourceId, role, text) => ({
  id: randomUUID(), role, threadId, resourceId, createdAt: new Date(),
  content: { format: 2, parts: [{ type: 'text', text }] },
})

const ids = (listed) => (listed?.threads ?? listed ?? []).map((t) => t.id)

if (phase === 'write') {
  const { controller, memory } = await build()
  const session = await controller.createSession({ resourceId: ALPHA, scope: 'conversations' })
  const one = await session.thread.create({ title: 'Conversa um' })
  const two = await session.thread.create({ title: 'Conversa dois' })

  await session.thread.switch({ threadId: one.id })
  await session.thread.setSetting({ key: 'currentModelId', value: 'probe-model-one' })

  await memory.saveMessages({ messages: [
    message(one.id, ALPHA, 'user', 'pergunta da conversa um'),
    message(one.id, ALPHA, 'assistant', 'resposta da conversa um'),
    message(two.id, ALPHA, 'user', 'pergunta da conversa dois'),
  ] })

  // Concurrency here means concurrent thread creation against one store, not concurrent
  // agent runs. Nothing below claims more than that.
  const racers = await Promise.all(Array.from({ length: 8 }, (_, i) =>
    session.thread.create({ title: `Concorrente ${i}` })))
  const raced = racers.map((t) => t.id)
  claim('concurrent execution', 'eight concurrent thread creations on one session all get distinct ids',
    new Set(raced).size === 8, `${new Set(raced).size} distinct`)

  const betaSession = await controller.createSession({ resourceId: BETA, scope: 'conversations' })
  const betaThread = await betaSession.thread.create({ title: 'Conversa de outro Project' })

  console.log(JSON.stringify({ one: one.id, two: two.id, raced, beta: betaThread.id, betaSeed: betaSession.thread.getId() }))
  console.error(JSON.stringify(results))
  process.exit(0)
}

const handles = JSON.parse(process.env.PROBE_HANDLES)
const { controller, memory } = await build()
const session = await controller.createSession({ resourceId: ALPHA, scope: 'conversations' })

// 1. Persistence of ids and metadata, in a process that never saw the writer.
const listed = await session.thread.list()
const listedIds = ids(listed)
claim('id persistence', 'both conversation ids written by a previous process are listed by a new one',
  listedIds.includes(handles.one) && listedIds.includes(handles.two), `${listedIds.length} listed`)

const restored = await session.thread.getById({ threadId: handles.one })
claim('metadata persistence', 'the title written by the previous process survives',
  restored?.title === 'Conversa um', String(restored?.title))

await session.thread.switch({ threadId: handles.one })
const setting = await session.thread.getSetting({ key: 'currentModelId' })
claim('metadata persistence', 'a per-thread setting written by the previous process is read back',
  setting === 'probe-model-one', String(setting))

// 2. Binding to a thread, asserted on its own accessor rather than inferred from a read.
claim('thread binding', 'switch binds the session to the named thread',
  session.thread.getId() === handles.one, String(session.thread.getId()))
await session.thread.switch({ threadId: handles.two })
claim('thread binding', 'switching again rebinds to the other thread',
  session.thread.getId() === handles.two, String(session.thread.getId()))

// 3. Messages and context, recovered after process restart, and not crossed between threads.
const oneMessages = await session.thread.listMessages({ threadId: handles.one })
const twoMessages = await session.thread.listMessages({ threadId: handles.two })
const text = (list) => (list ?? []).flatMap((m) => (m.content?.parts ?? []).filter((p) => p.type === 'text').map((p) => p.text))
const oneText = text(oneMessages)
const twoText = text(twoMessages)
claim('message persistence', 'both messages of the first conversation are recovered after process restart',
  oneText.includes('pergunta da conversa um') && oneText.includes('resposta da conversa um'), oneText.join(' | '))
claim('message isolation', 'the second conversation carries only its own message',
  twoText.length === 1 && twoText[0] === 'pergunta da conversa dois', twoText.join(' | '))

// 4. Concurrent creations survive the restart too, which the writer could not assert.
const racedPresent = handles.raced.filter((id) => listedIds.includes(id)).length
claim('concurrent execution', 'all eight concurrently created threads are present after restart',
  racedPresent === handles.raced.length, `${racedPresent} of ${handles.raced.length}`)

// 5. Privacy between Projects. This asks what the framework does by default, and the answer
// is evidence either way: a leak here is a Conexus-owned responsibility, not a bug.
const betaSession = await controller.createSession({ resourceId: BETA, scope: 'conversations' })
const betaIds = ids(await betaSession.thread.list())
claim('privacy', 'a session on another Project does not list this Project\'s conversations',
  !betaIds.includes(handles.one) && !betaIds.includes(handles.two), `${betaIds.length} listed for beta`)

let foreignRead = 'not attempted'
try {
  const foreign = await betaSession.thread.listMessages({ threadId: handles.one })
  foreignRead = `returned ${(foreign ?? []).length} message(s)`
} catch (error) {
  foreignRead = `refused: ${error?.message ?? error}`
}
claim('authorization', 'reading another Project\'s conversation by id from a foreign session',
  foreignRead.startsWith('refused'), foreignRead)

let foreignSwitch = 'not attempted'
try {
  await betaSession.thread.switch({ threadId: handles.one })
  foreignSwitch = betaSession.thread.getId() === handles.one ? 'bound to the foreign thread' : 'did not bind'
} catch (error) {
  foreignSwitch = `refused: ${error?.message ?? error}`
}
claim('authorization', 'binding a foreign Project\'s conversation from a session of another Project',
  foreignSwitch.startsWith('refused'), foreignSwitch)

// 6. Controller recreation inside one process, kept separate from the restart above.
const again = await build()
const resumed = await again.controller.createSession({ resourceId: ALPHA, scope: 'conversations' })
const resumedIds = ids(await resumed.thread.list())
claim('controller recreation', 'a second controller in the same process reads the same conversations',
  resumedIds.includes(handles.one) && resumedIds.includes(handles.two), `${resumedIds.length} listed`)

for (const r of results) console.log(`${r.verdict}  [${r.property}] ${r.statement}${r.detail ? `  (${r.detail})` : ''}`)
process.exit(results.some((r) => r.verdict === 'FAIL') ? 1 : 0)
