// Probe: can the Hub mount the code-sdk AgentController (the composition the Factory itself
// mounts) on storage we own, and are several conversations per Project its own threads?
// Every claim exits non-zero when false. Run twice: pass 1 writes, pass 2 reads after restart.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LibSQLStore } from '@mastra/libsql'
import { RequestContext } from '@mastra/core/request-context'
import { mountAgentControllerOnMastra } from '@mastra/code-sdk'

const assert = (ok, claim) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${claim}`)
  if (!ok) process.exitCode = 1
}

const root = process.env.CONV_PROBE_ROOT ?? mkdtempSync(join(tmpdir(), 'conv-probe-'))
const pass = process.env.CONV_PROBE_PASS ?? '1'
const projectId = '11111111-1111-4111-8111-111111111111'
const otherProjectId = '22222222-2222-4222-8222-222222222222'
console.log(`root=${root} pass=${pass}`)

const storage = new LibSQLStore({ id: 'conexus-builder-session', url: `file:${join(root, 'builder-session.db')}` })

const mounted = await mountAgentControllerOnMastra({
  controllerId: 'conexus-builder-controller',
  storage,
  storageBackend: 'libsql',
  cwd: root,
  configDir: '.conexus-builder',
  disableMcp: true,
  disableHooks: true,
  disablePlugins: true,
  disableGithubSignals: true,
  disableSettingsOmSeed: true,
  initialState: { yolo: true },
  // The Hub hands each run its own E2B-backed workspace; nothing local is ever the workspace.
  workspace: ({ requestContext }) => requestContext.getRaw('conexus.builder.workspace') ?? undefined,
})

const controller = mounted.controller
const registered = await mounted.mastra.getAgentControllerById('conexus-builder-controller')
assert(registered === controller, 'the browser addresses the mounted controller under the id the Hub registered')
console.log(`controller.id=${controller.id}`)

const caller = new RequestContext()
caller.set('user', { id: 'account-under-test', organizationId: 'conexus' })

const session = await controller.createSession({ resourceId: projectId, ownerId: projectId, requestContext: caller })

// Opening a Project binds a conversation: the session resumes the most recent thread or
// creates one. So a Project that has never been opened starts at one, not zero.
const opened = await session.thread.list()

if (pass === '1') {
  assert(opened.length === 1, `opening a Project for the first time yields one conversation (got ${opened.length})`)
  const first = await session.thread.create({ title: 'Primeira conversa' })
  const second = await session.thread.create({ title: 'Segunda conversa' })
  const listed = await session.thread.list()
  assert(listed.length === 3, `the Project now holds the conversations it was given (got ${listed.length})`)
  assert(listed.some((thread) => thread.id === first.id), 'the first conversation survives creating the second')

  await session.thread.switch({ threadId: first.id })
  await session.thread.rename({ title: 'Renomeada' })
  const renamed = await session.thread.getById({ threadId: first.id })
  assert(renamed?.title === 'Renomeada', `renaming a conversation sticks (got ${renamed?.title})`)
  const untouched = await session.thread.getById({ threadId: second.id })
  assert(untouched?.title === 'Segunda conversa', 'renaming one conversation leaves the other alone')

  const foreign = await controller.createSession({ resourceId: otherProjectId, ownerId: otherProjectId, requestContext: caller })
  const foreignThreads = await foreign.thread.list()
  assert(!foreignThreads.some((thread) => thread.id === first.id || thread.id === second.id),
    `another Project lists none of this Project's conversations (got ${foreignThreads.length} of its own)`)
  // `getById` is not resource-scoped: it returns another resource's thread row. Nothing the Hub
  // exposes calls it, and the message read below is scoped, which is what keeps a Project's
  // conversations unreadable from another Project.
  const stolen = await foreign.thread.getById({ threadId: first.id })
  assert(stolen?.id === first.id, 'framework property: getById is not resource-scoped, so no route may expose it')
  const refused = await foreign.thread.listMessages({ threadId: first.id }).then(() => null, (error) => error)
  assert(refused instanceof Error && /Thread not found/.test(refused.message),
    `a session on another Project is refused this conversation's messages (got ${refused ? refused.message : 'the messages'})`)
} else {
  assert(opened.length === 3, `every conversation is still there after a process restart (got ${opened.length})`)
  const titles = opened.map((thread) => thread.title ?? '').sort().filter(Boolean)
  assert(titles.join('|') === 'Renomeada|Segunda conversa', `their titles survived the restart (got ${titles.join('|')})`)
  assert(opened[0].createdAt >= opened[opened.length - 1].createdAt, 'the list arrives newest first')
  if (process.env.CONV_PROBE_NEGATIVE === '1') {
    assert(opened.length === 99, 'negative control: this claim is false on purpose and the run must fail')
  }
}

await controller.destroy()
await storage.close()
