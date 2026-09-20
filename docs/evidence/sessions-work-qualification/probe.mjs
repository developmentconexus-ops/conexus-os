// Conversations probe for the Sessions and Work qualification. Throwaway and isolated: it
// reads an existing @mastra install, writes only into the scratch store directory it is
// given, calls no model and costs nothing. Every property is asserted on its own; none is
// inferred from another. Any failed assertion exits non-zero.
//
// Usage: node probe.mjs <storeDir> write|read|negative-control
// The install to read is CONEXUS_NODE_MODULES; run.sh sets it.
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const [storeDir, phase] = process.argv.slice(2)
if (!storeDir || !['write', 'read', 'negative-control'].includes(phase ?? '')) {
  console.error('usage: node probe.mjs <storeDir> write|read|negative-control')
  process.exit(2)
}

const modules = process.env.CONEXUS_NODE_MODULES
if (!modules) {
  console.error('CONEXUS_NODE_MODULES is required so the probe states which install it read')
  process.exit(2)
}
const load = async (specifier) => import(pathToFileURL(resolve(modules, specifier)).href)
const version = (pkg) => createRequire(import.meta.url)(resolve(modules, pkg, 'package.json')).version

const { AgentController } = await load('@mastra/core/dist/agent-controller/index.js')
const { createCodingAgent } = await load('@mastra/core/dist/coding-agent/index.js')
const { LibSQLStore } = await load('@mastra/libsql/dist/index.js')
const { Memory } = await load('@mastra/memory/dist/index.js')

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
  results.push({ property, statement, ok, detail })

const finish = () => {
  for (const r of results) {
    const line = `${r.ok ? 'PASS' : 'FAIL'}  [${r.property}] ${r.statement}${r.detail ? `  (${r.detail})` : ''}`
    if (phase === 'write') console.error(line)
    else console.log(line)
  }
  process.exit(results.some((r) => !r.ok) ? 1 : 0)
}

// Written straight into the store. No model is called, which is what makes this a
// persistence test rather than a generation test.
const message = (threadId, resourceId, role, text) => ({
  id: randomUUID(), role, threadId, resourceId, createdAt: new Date(),
  content: { format: 2, parts: [{ type: 'text', text }] },
})
const ids = (listed) => (listed?.threads ?? listed ?? []).map((t) => t.id)

if (phase === 'negative-control') {
  const { controller } = await build()
  const session = await controller.createSession({ resourceId: ALPHA, scope: 'conversations' })
  const created = await session.thread.create({ title: 'Controle' })
  claim('negative control', 'a thread that was just created is absent from the listing',
    !ids(await session.thread.list()).includes(created.id), 'this claim is false on purpose')
  finish()
}

if (phase === 'write') {
  const { controller, memory } = await build()
  const session = await controller.createSession({ resourceId: ALPHA, scope: 'conversations' })
  const one = await session.thread.create({ title: 'Conversa um' })
  const two = await session.thread.create({ title: 'Conversa dois' })
  claim('write phase', 'two distinct conversations were created', one.id !== two.id, `${one.id} vs ${two.id}`)

  await session.thread.switch({ threadId: one.id })
  await session.thread.setSetting({ key: 'currentModelId', value: 'probe-model-one' })

  const saved = await memory.saveMessages({ messages: [
    message(one.id, ALPHA, 'user', 'pergunta da conversa um'),
    message(one.id, ALPHA, 'assistant', 'resposta da conversa um'),
    message(two.id, ALPHA, 'user', 'pergunta da conversa dois'),
  ] })
  claim('write phase', 'three messages were accepted by the store',
    (saved?.messages ?? []).length === 3, `${(saved?.messages ?? []).length} saved`)

  // Concurrency here is concurrent thread creation against one store, not concurrent agent
  // runs. Nothing claims more than that.
  const raced = (await Promise.all(Array.from({ length: 8 }, (_, i) =>
    session.thread.create({ title: `Concorrente ${i}` })))).map((t) => t.id)
  claim('concurrent execution', 'eight concurrent creations produce eight distinct ids',
    new Set(raced).size === 8, `${new Set(raced).size} distinct`)

  const betaSession = await controller.createSession({ resourceId: BETA, scope: 'conversations' })
  await betaSession.thread.create({ title: 'Conversa de outro Project' })

  if (results.some((r) => !r.ok)) finish()
  console.log(JSON.stringify({ one: one.id, two: two.id, raced }))
  finish()
}

const handles = JSON.parse(process.env.PROBE_HANDLES ?? '{}')
if (!handles.one) {
  console.error('PROBE_HANDLES is required for the read phase; run.sh passes the writer output')
  process.exit(2)
}
const { controller } = await build()
const session = await controller.createSession({ resourceId: ALPHA, scope: 'conversations' })

const listedIds = ids(await session.thread.list())
claim('id persistence', 'both conversation ids written by a previous process are listed by a new one',
  listedIds.includes(handles.one) && listedIds.includes(handles.two), `${listedIds.length} listed`)

const restored = await session.thread.getById({ threadId: handles.one })
claim('metadata persistence', 'the title written by the previous process survives',
  restored?.title === 'Conversa um', String(restored?.title))

await session.thread.switch({ threadId: handles.one })
const setting = await session.thread.getSetting({ key: 'currentModelId' })
claim('metadata persistence', 'a per-thread setting written by the previous process is read back',
  setting === 'probe-model-one', String(setting))

claim('thread binding', 'switch binds the session to the named thread',
  session.thread.getId() === handles.one, String(session.thread.getId()))
await session.thread.switch({ threadId: handles.two })
claim('thread binding', 'switching again rebinds to the other thread',
  session.thread.getId() === handles.two, String(session.thread.getId()))

const text = (list) => (list ?? []).flatMap((m) => (m.content?.parts ?? []).filter((p) => p.type === 'text').map((p) => p.text))
const oneText = text(await session.thread.listMessages({ threadId: handles.one }))
const twoText = text(await session.thread.listMessages({ threadId: handles.two }))
claim('message persistence', 'both messages of the first conversation are recovered after process restart',
  oneText.length === 2 && oneText.includes('pergunta da conversa um') && oneText.includes('resposta da conversa um'),
  oneText.join(' | '))
claim('message isolation', 'the second conversation carries only its own message',
  twoText.length === 1 && twoText[0] === 'pergunta da conversa dois', twoText.join(' | '))

const racedPresent = handles.raced.filter((id) => listedIds.includes(id)).length
claim('concurrent execution', 'all eight concurrently created threads are present after restart',
  racedPresent === handles.raced.length, `${racedPresent} of ${handles.raced.length}`)

// Isolation between Projects, which is not the same question as privacy between two people
// working on one Project. The probe answers the first only.
const betaSession = await controller.createSession({ resourceId: BETA, scope: 'conversations' })
const betaIds = ids(await betaSession.thread.list())
claim('isolation between Projects', 'a session on another Project does not list this Project\'s conversations',
  !betaIds.includes(handles.one) && !betaIds.includes(handles.two), `${betaIds.length} listed for beta`)

const refusal = async (attempt) => {
  try { return { refused: false, detail: await attempt() } }
  catch (error) { return { refused: true, detail: error?.message ?? String(error) } }
}
const foreignRead = await refusal(async () =>
  `returned ${(await betaSession.thread.listMessages({ threadId: handles.one }) ?? []).length} message(s)`)
claim('isolation between Projects', 'reading another Project\'s conversation by id is refused',
  foreignRead.refused, foreignRead.detail)

const foreignSwitch = await refusal(async () => {
  await betaSession.thread.switch({ threadId: handles.one })
  return `bound to ${betaSession.thread.getId()}`
})
claim('isolation between Projects', 'binding another Project\'s conversation by id is refused',
  foreignSwitch.refused, foreignSwitch.detail)

// Privacy between two people working on the same Project is a different question, and the
// answer here is that the framework does not answer it: threads are scoped by resourceId,
// so two sessions on one Project see each other's conversations.
const secondPerson = await controller.createSession({ resourceId: ALPHA, scope: 'second-person' })
const secondPersonIds = ids(await secondPerson.thread.list())
claim('privacy within a Project', 'a second session on the same Project does see the first person\'s conversations',
  secondPersonIds.includes(handles.one) && secondPersonIds.includes(handles.two),
  `${secondPersonIds.length} listed, so per-person privacy is not provided by resourceId scoping`)

const again = await build()
const resumed = await again.controller.createSession({ resourceId: ALPHA, scope: 'conversations' })
const resumedIds = ids(await resumed.thread.list())
claim('controller recreation', 'a second controller in the same process reads the same conversations',
  resumedIds.includes(handles.one) && resumedIds.includes(handles.two), `${resumedIds.length} listed`)

finish()
