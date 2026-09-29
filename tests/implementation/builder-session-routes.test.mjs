import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { Mastra } from '@mastra/core/mastra'
import { LibSQLStore } from '@mastra/libsql'
import { Memory } from '@mastra/memory'
import { hubModuleUrl } from './hub-build.mjs'

const built = hubModuleUrl
const { createHttpApp } = await import(built('http/app.js'))
const { registerBuilderSessionRoutes } = await import(built('builder/mastra-session-routes.js'))
const { registerBuilderRoutes } = await import(built('builder/routes.js'))
const { createBuilderController } = await import(built('builder/harness/controller.js'))
const { createConversations } = await import(built('builder/conversations.js'))

const origin = 'https://conexus.test'
const accountA = '22222222-2222-4222-8222-222222222222'
const accountB = '55555555-5555-4555-8555-555555555555'
const projectA = '33333333-3333-4333-8333-333333333333'
const projectB = '66666666-6666-4666-8666-666666666666'
const conversationA = '77777777-7777-4777-8777-777777777777'
const admittedProjects = { [accountA]: [projectA], [accountB]: [projectB] }
const modelTurns = []
const model = {
  specificationVersion: 'v2', provider: 'conexus-boundary', modelId: 'boundary-probe', supportedUrls: {},
  async doGenerate() { throw new Error('the boundary test never reaches the model') },
  async doStream() { modelTurns.push(Date.now()); throw new Error('the boundary test never reaches the model') },
}
const turnsWithin = async (ms, started = modelTurns.length) => {
  const deadline = Date.now() + ms
  while (modelTurns.length === started && Date.now() < deadline) await new Promise((done) => setTimeout(done, 25))
  return modelTurns.length - started
}

// The Hub's own mount over the Builder's controller, with the Project admission, the conversation
// owner and the busy check the Hub wires in production, and conversation A already opened.
const createBuilderApp = async (t, { accountId = accountA, providerDown = false, busy = false } = {}) => {
  const root = mkdtempSync(join(tmpdir(), 'conexus-builder-routes-'))
  const storage = new LibSQLStore({ id: `builder-boundary-${randomUUID()}`, url: `file:${join(root, 'session.db')}` })
  const memory = new Memory({ storage, options: { lastMessages: 20 } })
  const controller = createBuilderController({ id: 'conexus-builder', model, storage, memory, skillsPath: resolve(import.meta.dirname, '../../builder-skills/conexus-server') })
  const mastra = new Mastra({ storage, agentControllers: { 'conexus-builder': controller }, logger: false })
  await controller.init()
  const conversations = createConversations(async () => storage.getStore('memory'))
  await controller.createSession({ resourceId: `project:${projectA}`, scope: `conversation:${conversationA}`, threadId: conversationA })
  const reachedContexts = []
  const { providerUnavailable } = await import(hubModuleUrl('identity-access/host-sessions.js'))
  const resolveCurrentSession = async (request) => {
    if (providerDown) throw providerUnavailable()
    return request.cookies['__Host-conexus_session']
      ? { account: { accountId, displayName: 'Operator' }, issuer: 'https://issuer.test', subject: 'subject-1' }
      : null
  }
  const app = await createHttpApp({
    registerRoutes: async (instance) => {
      instance.addHook('onResponse', async (request) => {
        if (request.requestContext) reachedContexts.push({ url: request.url, user: request.requestContext.get('user') })
      })
      await registerBuilderSessionRoutes(instance, {
        mastra, controllerId: 'conexus-builder', controller, origin, resolveCurrentSession,
        admitProject: async ({ accountId: caller, projectId }) => admittedProjects[caller]?.includes(projectId) ?? false,
        conversationOwner: ({ projectId, conversationId }) => conversations.ownerOf(projectId, conversationId),
        projectBusy: async () => busy,
        runContext: () => undefined,
      })
      return []
    },
    staticRoot: null,
  })
  t.after(async () => {
    await app.close()
    await controller.destroy()
    await storage.close()
    rmSync(root, { recursive: true, force: true })
  })
  return { app, controller, conversations, reachedContexts }
}

const authentic = {
  headers: { origin, 'x-conexus-csrf': 'csrf-1', 'content-type': 'application/json' },
  cookies: { '__Host-conexus_session': 'session-1', '__Host-conexus_csrf': 'csrf-1' },
}
const PREFIX = '/api/builder/agent-controller/conexus-builder'
const sessionBase = (projectId = projectA) => `${PREFIX}/sessions/project:${projectId}`
const inConversation = (conversationId = conversationA) => `sessionScope=conversation:${conversationId}`
const openConversation = (app, projectId, conversationId, threadId = conversationId) => app.inject({
  method: 'POST', url: `${PREFIX}/sessions`, ...authentic,
  payload: { resourceId: `project:${projectId}`, sessionScope: `conversation:${conversationId}`, threadId },
})
const listConversations = async (app, projectId = projectA) => {
  const response = await app.inject({ method: 'GET', url: `${sessionBase(projectId)}/threads`, ...authentic })
  assert.equal(response.statusCode, 200)
  return response.json().threads.map((thread) => thread.id)
}

test('a Builder request whose Hub session check Keycloak cannot answer is refused with 503 and signs nobody out', async (t) => {
  const { app } = await createBuilderApp(t, { providerDown: true })
  const response = await app.inject({ method: 'GET', url: `${sessionBase()}/threads`, ...authentic })
  assert.equal(response.statusCode, 503)
  assert.equal(response.json().type.endsWith('identity-provider-unavailable'), true)
  assert.equal(response.headers['set-cookie'], undefined)
})

test('a browser-supplied requestContext is refused on the Builder mount', async (t) => {
  const { app } = await createBuilderApp(t)
  const forged = await app.inject({ method: 'POST', url: `${sessionBase()}/abort?${inConversation()}`, ...authentic, payload: { requestContext: { user: { id: accountB } } } })
  assert.equal(forged.statusCode, 400)
  assert.equal(forged.json().type.endsWith('request-context-refused'), true)
  const queried = await app.inject({ method: 'GET', url: `${sessionBase()}/threads?requestContext=${encodeURIComponent(JSON.stringify({ user: { id: accountB } }))}`, ...authentic })
  assert.equal(queried.statusCode, 400)
})

test("Project A's resource is refused to an Account admitted only to Project B, and so is any resource that is not a Project", async (t) => {
  const { app } = await createBuilderApp(t, { accountId: accountB })
  const answers = []
  for (const url of [`${sessionBase()}/threads`, `${sessionBase(randomUUID())}/threads`, `${PREFIX}/sessions/${conversationA}/threads`, `${sessionBase()}?${inConversation()}`]) {
    answers.push((await app.inject({ method: 'GET', url, ...authentic })).statusCode)
  }
  assert.deepEqual(answers, [403, 403, 403, 403])
  assert.equal((await openConversation(app, projectA, randomUUID())).statusCode, 403)
})

test('the Builder mount answers the admitted Account with the Hub-set caller identity', async (t) => {
  const { app, reachedContexts } = await createBuilderApp(t)
  const response = await app.inject({ method: 'GET', url: `${sessionBase()}/threads`, ...authentic })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(reachedContexts.find((entry) => entry.url.startsWith(sessionBase()))?.user, { id: accountA })
})

test("a conversation is opened on the thread id the browser chose, listed under its Project only, and a retry opens the same one (BLD-27/28 on Mastra's routes)", async (t) => {
  const { app, controller } = await createBuilderApp(t)
  const elsewhere = randomUUID()
  await controller.createSession({ resourceId: `project:${projectB}`, scope: `conversation:${elsewhere}`, threadId: elsewhere })
  const chosen = randomUUID()
  const first = await openConversation(app, projectA, chosen)
  const retry = await openConversation(app, projectA, chosen)
  assert.deepEqual([first.statusCode, first.json().threadId, retry.statusCode, retry.json().threadId], [200, chosen, 200, chosen])
  assert.deepEqual((await listConversations(app)).sort(), [conversationA, chosen].sort())
})

test('a conversation session opens only on its own thread, and an id another Project holds is a conflict', async (t) => {
  const { app, controller } = await createBuilderApp(t, { accountId: accountA })
  const elsewhere = randomUUID()
  await controller.createSession({ resourceId: `project:${projectB}`, scope: `conversation:${elsewhere}`, threadId: elsewhere })
  const mismatched = await openConversation(app, projectA, randomUUID(), randomUUID())
  const runScope = await app.inject({ method: 'POST', url: `${PREFIX}/sessions`, ...authentic, payload: { resourceId: `project:${projectA}`, sessionScope: `builder:${randomUUID()}`, threadId: conversationA } })
  const taken = await openConversation(app, projectA, elsewhere)
  assert.deepEqual([mismatched.statusCode, runScope.statusCode, taken.statusCode], [400, 400, 409])
  assert.equal(taken.json().type.endsWith('conversation-conflict'), true)
  const read = await app.inject({ method: 'GET', url: `${sessionBase()}?${inConversation(elsewhere)}`, ...authentic })
  assert.equal(read.statusCode, 404, "another Project's conversation is not found under this Project")
})

test("a conversation's mode switches only while no run is in flight, and never on a run's own session (AC-5)", async (t) => {
  const { app, controller } = await createBuilderApp(t)
  const switched = await app.inject({ method: 'POST', url: `${sessionBase()}/mode?${inConversation()}`, ...authentic, payload: { modeId: 'build' } })
  assert.equal(switched.statusCode, 200)
  const state = await app.inject({ method: 'GET', url: `${sessionBase()}?${inConversation()}`, ...authentic })
  assert.equal(state.json().modeId, 'build')
  const liveRun = `builder:${randomUUID()}`
  await controller.createSession({ resourceId: `project:${projectA}`, scope: liveRun, threadId: conversationA })
  const onRun = await app.inject({ method: 'POST', url: `${sessionBase()}/mode?sessionScope=${liveRun}`, ...authentic, payload: { modeId: 'plan' } })
  assert.equal(onRun.statusCode, 409)

  const { app: busyApp } = await createBuilderApp(t, { busy: true })
  const refused = await busyApp.inject({ method: 'POST', url: `${sessionBase()}/mode?${inConversation()}`, ...authentic, payload: { modeId: 'build' } })
  assert.equal(refused.statusCode, 409)
  assert.deepEqual(refused.json().title, 'O modo só muda quando o Builder está parado')
})

test("a model chosen on a run's own session, for both modes, is the conversation's model, even while the run is in flight", async (t) => {
  const { app, controller } = await createBuilderApp(t)
  const liveRun = `builder:${randomUUID()}`
  await controller.createSession({ resourceId: `project:${projectA}`, scope: liveRun, threadId: conversationA })
  const chosen = []
  for (const modeId of ['plan', 'build']) {
    const response = await app.inject({ method: 'POST', url: `${sessionBase()}/model?sessionScope=${liveRun}`, ...authentic, payload: { modelId: 'google-ai-pro/gemini-3-flash', scope: 'thread', modeId } })
    chosen.push(response.statusCode)
  }
  const state = await app.inject({ method: 'GET', url: `${sessionBase()}?${inConversation()}`, ...authentic })
  assert.deepEqual([chosen, state.json().modelId], [[200, 200], 'google-ai-pro/gemini-3-flash'])
})

test('only the Builder controller id is served, the Factory mount is gone, and the browser may not create, switch, rename or delete threads', async (t) => {
  const { app } = await createBuilderApp(t)
  const answers = await Promise.all([
    app.inject({ method: 'GET', url: `/api/builder/agent-controller/code/sessions/project:${projectA}/threads`, ...authentic }),
    app.inject({ method: 'GET', url: `/api/mastra-factory/agent-controller/code/sessions/${conversationA}/threads`, ...authentic }),
    app.inject({ method: 'POST', url: `${sessionBase()}/threads?${inConversation()}`, ...authentic, payload: { title: 'x' } }),
    app.inject({ method: 'POST', url: `${sessionBase()}/thread?${inConversation()}`, ...authentic, payload: { threadId: conversationA } }),
    app.inject({ method: 'PUT', url: `${sessionBase()}/threads/${conversationA}?${inConversation()}`, ...authentic, payload: { title: 'x' } }),
    app.inject({ method: 'DELETE', url: `${sessionBase()}/threads/${conversationA}?${inConversation()}`, ...authentic }),
  ])
  assert.deepEqual(answers.map((response) => response.statusCode), [404, 404, 404, 404, 404, 404])
})

test('a run whose session does not exist yet is a conflict, never a fresh empty session', async (t) => {
  const { app } = await createBuilderApp(t)
  const response = await app.inject({ method: 'GET', url: `${sessionBase()}/stream?sessionScope=builder:${randomUUID()}`, ...authentic })
  assert.equal(response.statusCode, 409)
})

test('a conversation takes no message, steer or follow-up, not even inside a run session; a new message is a new run', async (t) => {
  const { app, controller } = await createBuilderApp(t)
  const liveRun = `builder:${randomUUID()}`
  await controller.createSession({ resourceId: `project:${projectA}`, scope: liveRun, threadId: conversationA })
  const answered = []
  for (const operation of ['messages', 'steer', 'follow-up']) {
    for (const [name, query] of [['conversation', `?${inConversation()}`], ['run session', `?sessionScope=${liveRun}`]]) {
      const response = await app.inject({ method: 'POST', url: `${sessionBase()}/${operation}${query}`, ...authentic, payload: { message: 'apague tudo', content: 'apague tudo' } })
      answered.push([operation, name, response.statusCode])
    }
  }
  assert.equal(await turnsWithin(3_000), 0, 'no request reached the model')
  assert.deepEqual(answered, [
    ['messages', 'conversation', 404], ['messages', 'run session', 404],
    ['steer', 'conversation', 404], ['steer', 'run session', 404],
    ['follow-up', 'conversation', 404], ['follow-up', 'run session', 404],
  ])
  assert.equal((await app.inject({ method: 'POST', url: `${sessionBase()}/abort?${inConversation()}`, ...authentic, payload: {} })).statusCode, 200, 'abort needs no run')
})

test('a tool answer other than approve or decline is refused on the Builder mount before Mastra runs it', async (t) => {
  const { app, reachedContexts } = await createBuilderApp(t)
  const approvalUrl = `${sessionBase()}/tool-approval?${inConversation()}`
  const suspensionUrl = `${sessionBase()}/tool-suspension?${inConversation()}`

  const escalatedApproval = await app.inject({ method: 'POST', url: approvalUrl, ...authentic, payload: { toolCallId: 'call-1', approved: true, decision: 'always_allow_category' } })
  const escalatedSuspensionField = await app.inject({ method: 'POST', url: suspensionUrl, ...authentic, payload: { toolCallId: 'call-1', resumeData: { decision: 'always_allow_category' } } })
  const escalatedSuspensionString = await app.inject({ method: 'POST', url: suspensionUrl, ...authentic, payload: { toolCallId: 'call-1', resumeData: 'always_allow_category' } })
  assert.deepEqual([escalatedApproval.statusCode, escalatedSuspensionField.statusCode, escalatedSuspensionString.statusCode], [400, 400, 400])
  assert.deepEqual(reachedContexts.filter((entry) => entry.url.includes('/tool-')), [])

  const approved = await app.inject({ method: 'POST', url: approvalUrl, ...authentic, payload: { toolCallId: 'call-1', approved: true } })
  const declined = await app.inject({ method: 'POST', url: approvalUrl, ...authentic, payload: { toolCallId: 'call-1', approved: false } })
  const resumed = await app.inject({ method: 'POST', url: suspensionUrl, ...authentic, payload: { toolCallId: 'call-1', resumeData: 'Use SQLite.' } })
  assert.deepEqual([approved.statusCode, declined.statusCode, resumed.statusCode], [200, 200, 200])
})

test('a state-changing request without CSRF is refused on the mount', async (t) => {
  const { app } = await createBuilderApp(t)
  const withoutCsrf = { headers: { origin, 'content-type': 'application/json' }, cookies: { '__Host-conexus_session': 'session-1' } }
  assert.equal((await app.inject({ method: 'POST', url: `${sessionBase()}/abort?${inConversation()}`, ...withoutCsrf, payload: {} })).statusCode, 403)
  assert.equal((await app.inject({ method: 'POST', url: `${PREFIX}/sessions`, ...withoutCsrf, payload: { resourceId: `project:${projectA}`, sessionScope: `conversation:${conversationA}`, threadId: conversationA } })).statusCode, 403)
})

test('the browser sets its own reasoning level through the session state route, and nothing else', async (t) => {
  const { app } = await createBuilderApp(t)
  const write = await app.inject({ method: 'PUT', url: `${sessionBase()}/state?${inConversation()}`, ...authentic, payload: { state: { thinkingLevel: 'high' } } })
  assert.equal(write.statusCode, 200)
  const read = await app.inject({ method: 'GET', url: `${sessionBase()}?${inConversation()}`, ...authentic })
  assert.equal(read.statusCode, 200)
  assert.equal(read.json().settings?.thinkingLevel, 'high')
})

test('a session-state write outside the reasoning level is refused before it reaches Mastra', async (t) => {
  const { app, reachedContexts } = await createBuilderApp(t)
  const stateUrl = `${sessionBase()}/state?${inConversation()}`
  const yolo = await app.inject({ method: 'PUT', url: stateUrl, ...authentic, payload: { state: { yolo: true } } })
  const badLevel = await app.inject({ method: 'PUT', url: stateUrl, ...authentic, payload: { state: { thinkingLevel: 'max' } } })
  const mixed = await app.inject({ method: 'PUT', url: stateUrl, ...authentic, payload: { state: { thinkingLevel: 'low', yolo: true } } })
  const extraTopLevel = await app.inject({ method: 'PUT', url: stateUrl, ...authentic, payload: { state: { thinkingLevel: 'low' }, extra: 1 } })
  assert.deepEqual([yolo.statusCode, badLevel.statusCode, mixed.statusCode, extraTopLevel.statusCode], [400, 400, 400, 400])
  for (const response of [yolo, badLevel, mixed, extraTopLevel]) assert.equal(response.json().type.endsWith('session-state-refused'), true)
  assert.deepEqual(reachedContexts.filter((entry) => entry.url.includes('/state')), [])
})

test("deleting a Project's conversations removes its threads and their messages, leaves another Project's, and repeating it converges", async (t) => {
  const { app, controller, conversations } = await createBuilderApp(t)
  const elsewhere = randomUUID()
  await controller.createSession({ resourceId: `project:${projectB}`, scope: `conversation:${elsewhere}`, threadId: elsewhere })
  const second = randomUUID()
  assert.equal((await openConversation(app, projectA, second)).statusCode, 200)
  await conversations.appendMessage({ id: randomUUID(), role: 'assistant', createdAt: new Date(), threadId: second, resourceId: `project:${projectA}`, content: { format: 2, parts: [{ type: 'text', text: 'nota' }] } })
  await conversations.deleteAll(projectA)
  await conversations.deleteAll(projectA)
  assert.deepEqual(await listConversations(app), [])
  assert.deepEqual(await Promise.all([conversationA, second, elsewhere].map((id) => conversations.ownerOf(projectA, id))), ['NONE', 'NONE', 'OTHER'])
})

const createBuilderRoutesApp = async (t, { compareSourceRevisions, createBuilderRun } = {}) => {
  const resolveCurrentSession = async (request) => request.cookies['__Host-conexus_session']
    ? { account: { accountId: accountA, displayName: 'Operator' }, issuer: 'https://issuer.test', subject: 'subject-1' }
    : null
  const unused = async () => { throw new Error('unused in this test') }
  const service = { compareSourceRevisions: compareSourceRevisions ?? unused, createBuilderRun: createBuilderRun ?? unused }
  const app = await createHttpApp({
    registerRoutes: (instance) => registerBuilderRoutes(instance, { store: {}, service, resolveCurrentSession, origin }),
    staticRoot: null,
  })
  t.after(() => app.close())
  return { app }
}

test('the source compare route returns the changed files between two admitted revisions', async (t) => {
  const base = 'b'.repeat(40)
  const result = 'c'.repeat(40)
  let received
  const { app } = await createBuilderRoutesApp(t, {
    compareSourceRevisions: async (input) => {
      received = input
      return { baseSourceRevision: base, resultSourceRevision: result, files: [{ path: 'app/index.html', status: 'ADDED', previousPath: null }] }
    },
  })
  const response = await app.inject({ method: 'GET', url: `/api/control/projects/${projectA}/source/compare?baseSourceRevision=${base}&resultSourceRevision=${result}`, ...authentic })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), { baseSourceRevision: base, resultSourceRevision: result, files: [{ path: 'app/index.html', status: 'ADDED', previousPath: null }] })
  assert.deepEqual(received, { accountId: accountA, projectId: projectA, baseSourceRevision: base, resultSourceRevision: result })
})

test('the source compare route maps a not-found revision to 404 and any other failure to 503', async (t) => {
  const base = 'b'.repeat(40)
  const result = 'c'.repeat(40)
  const url = `/api/control/projects/${projectA}/source/compare?baseSourceRevision=${base}&resultSourceRevision=${result}`
  const { app: notFoundApp } = await createBuilderRoutesApp(t, { compareSourceRevisions: async () => { throw new Error('BUILDER_SOURCE_SUBJECT_NOT_FOUND') } })
  const notFound = await notFoundApp.inject({ method: 'GET', url, ...authentic })
  assert.equal(notFound.statusCode, 404)
  assert.equal(notFound.json().type.endsWith('source-revision-not-found'), true)

  const { app: unavailableApp } = await createBuilderRoutesApp(t, { compareSourceRevisions: async () => { throw new Error('BUILDER_FACTORY_PROJECT_UNBOUND') } })
  const unavailable = await unavailableApp.inject({ method: 'GET', url, ...authentic })
  assert.equal(unavailable.statusCode, 503)
  assert.equal(unavailable.json().type.endsWith('builder-source-unavailable'), true)
})

test('the source compare route requires authentication and 40-hex revisions', async (t) => {
  const { app } = await createBuilderRoutesApp(t)
  const base = 'b'.repeat(40)
  const result = 'c'.repeat(40)
  const unauthenticated = await app.inject({ method: 'GET', url: `/api/control/projects/${projectA}/source/compare?baseSourceRevision=${base}&resultSourceRevision=${result}` })
  assert.equal(unauthenticated.statusCode, 401)
  const malformed = await app.inject({ method: 'GET', url: `/api/control/projects/${projectA}/source/compare?baseSourceRevision=not-a-sha&resultSourceRevision=${result}`, ...authentic })
  assert.equal(malformed.statusCode, 400)
})

test('a message names its conversation and no mode: the run starts in the conversation\'s own mode, and an unknown conversation is 404', async (t) => {
  const received = []
  const { app } = await createBuilderRoutesApp(t, {
    createBuilderRun: async (input) => { received.push(input); throw new Error('BUILDER_CONVERSATION_NOT_FOUND') },
  })
  const url = `/api/control/projects/${projectA}/builder-session/messages`
  const send = (payload) => app.inject({ method: 'POST', url, headers: { ...authentic.headers, 'idempotency-key': 'k-1' }, cookies: authentic.cookies, payload })
  const withMode = await send({ content: 'altere', conversationId: conversationA, mode: 'BUILD' })
  const unknown = await send({ content: 'altere', conversationId: conversationA })
  assert.deepEqual([withMode.statusCode, unknown.statusCode], [400, 404])
  assert.equal(unknown.json().type.endsWith('conversation-not-found'), true)
  assert.deepEqual(received, [{ accountId: accountA, projectId: projectA, conversationId: conversationA, idempotencyKey: 'k-1', content: 'altere' }])
})
