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
const { Failure } = await import(built('platform/failure.js'))
const { registerBuilderSessionRoutes } = await import(built('builder/mastra-session-routes.js'))
const { registerBuilderRoutes } = await import(built('builder/routes.js'))
const { createBuilderController } = await import(built('builder/harness/controller.js'))
const { createConversations } = await import(built('builder/conversations.js'))
const { createConversationSessions } = await import(built('builder/conversation-sessions.js'))

const CONVERSATION_SESSION_IDLE_MS = 10 * 60_000
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
const createBuilderApp = async (t, { accountId = accountA, providerDown = false, busy = false, answered = [], answerOutcome = async () => 'RESUMED', model: modelOf = model } = {}) => {
  const root = mkdtempSync(join(tmpdir(), 'conexus-builder-routes-'))
  const storage = new LibSQLStore({ id: `builder-boundary-${randomUUID()}`, url: `file:${join(root, 'session.db')}` })
  const memory = new Memory({ storage, options: { lastMessages: 20 } })
  const controller = createBuilderController({ id: 'conexus-builder', model: modelOf, storage, memory, modelRetryDelayMs: () => 1, skillsPath: resolve(import.meta.dirname, '../../builder-skills') })
  const mastra = new Mastra({ storage, agentControllers: { 'conexus-builder': controller }, logger: false })
  await controller.init()
  const conversations = createConversations(async () => storage.getStore('memory'))
  const clock = { now: 0 }
  const sessions = createConversationSessions({ controller, now: () => clock.now, sweepEveryMs: 3_600_000 })
  await controller.createSession({ resourceId: `project:${projectA}`, scope: `conversation:${conversationA}`, threadId: conversationA })
  const reachedContexts = []
  const { createHostSessions } = await import(hubModuleUrl('identity-access/host-sessions.js'))
  const keycloakDown = createHostSessions({
    pool: { query: async () => ({ rows: [{ account_id: accountId, issuer: 'https://issuer.test', subject: 'subject-1', display_name: 'Operator', email: null, provider_checked_at: new Date(0), due_provider_refresh_token: 'sealed-refresh-token' }] }) },
    refresh: async () => ({ kind: 'UNAVAILABLE' }),
    envelope: { open: async () => 'refresh-token', seal: async (value) => value },
  })
  const resolveCurrentSession = async (request) => {
    if (providerDown) return keycloakDown.resolveHub({ sessionToken: 's'.repeat(43) })
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
        mastra, controllerId: 'conexus-builder', controller, sessions, origin, resolveCurrentSession,
        admitProject: async ({ accountId: caller, projectId }) => admittedProjects[caller]?.includes(projectId) ?? false,
        conversationOwner: ({ projectId, conversationId }) => conversations.ownerOf(projectId, conversationId),
        projectBusy: async () => busy,
        runContext: () => undefined,
        answerParked: async (input) => { answered.push(input); return answerOutcome(input) },
      })
      return []
    },
    staticRoot: null,
  })
  t.after(async () => {
    await sessions.close()
    await app.close()
    await controller.destroy()
    await storage.close()
    rmSync(root, { recursive: true, force: true })
  })
  return { app, controller, conversations, memory, reachedContexts, sessions, clock }
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
  assert.equal(response.json().type.endsWith('IDENTITY_PROVIDER_UNAVAILABLE'), true)
  assert.equal(response.headers['set-cookie'], undefined)
})

test('a browser-supplied requestContext is refused on the Builder mount', async (t) => {
  const { app } = await createBuilderApp(t)
  const forged = await app.inject({ method: 'POST', url: `${sessionBase()}/abort?${inConversation()}`, ...authentic, payload: { requestContext: { user: { id: accountB } } } })
  assert.equal(forged.statusCode, 400)
  assert.equal(forged.json().type.endsWith('REQUEST_CONTEXT_REFUSED'), true)
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
  assert.equal(taken.json().type.endsWith('CONVERSATION_CONFLICT'), true)
  const read = await app.inject({ method: 'GET', url: `${sessionBase()}?${inConversation(elsewhere)}`, ...authentic })
  assert.equal(read.statusCode, 404, "another Project's conversation is not found under this Project")
})

test("a conversation's model changes only while no run is in flight, and a run's own session refuses it", async (t) => {
  const { app, controller } = await createBuilderApp(t)
  const switched = await app.inject({ method: 'POST', url: `${sessionBase()}/model?${inConversation()}`, ...authentic, payload: { modelId: 'google-ai-pro/gemini-3-flash', scope: 'thread' } })
  assert.equal(switched.statusCode, 200)
  const state = await app.inject({ method: 'GET', url: `${sessionBase()}?${inConversation()}`, ...authentic })
  assert.equal(state.json().modelId, 'google-ai-pro/gemini-3-flash')
  const liveRun = `builder:${randomUUID()}`
  await controller.createSession({ resourceId: `project:${projectA}`, scope: liveRun, threadId: conversationA })
  const onRun = await app.inject({ method: 'POST', url: `${sessionBase()}/model?sessionScope=${liveRun}`, ...authentic, payload: { modelId: 'google-ai-pro/gemini-3-flash', scope: 'thread' } })
  assert.equal(onRun.statusCode, 409)

  const { app: busyApp } = await createBuilderApp(t, { busy: true })
  const refused = await busyApp.inject({ method: 'POST', url: `${sessionBase()}/model?${inConversation()}`, ...authentic, payload: { modelId: 'google-ai-pro/gemini-3-flash', scope: 'thread' } })
  assert.equal(refused.statusCode, 409)
  assert.equal(refused.json().code, 'BUILDER_BUSY')
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

test("a run's own session takes no abort: a parked run's question is settled only by the Hub's stop", async (t) => {
  const { app, controller } = await createBuilderApp(t)
  const liveRun = `builder:${randomUUID()}`
  await controller.createSession({ resourceId: `project:${projectA}`, scope: liveRun, threadId: conversationA })
  const response = await app.inject({ method: 'POST', url: `${sessionBase()}/abort?sessionScope=${liveRun}`, ...authentic, payload: {} })
  assert.deepEqual([response.statusCode, response.json().type], [409, 'urn:conexus:problem:BUILDER_RUN_STOP_REFUSED'])
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

test("an answer to a run's call goes to the Hub, which resumes the parked run, and never to a session that no longer exists", async (t) => {
  const answered = []
  const { app } = await createBuilderApp(t, { answered })
  const runScope = `builder:${conversationA}`
  const answer = (payload) => app.inject({ method: 'POST', url: `${sessionBase()}/tool-suspension?sessionScope=${runScope}`, ...authentic, payload })
  const first = await answer({ toolCallId: 'call-1', resumeData: ['Azul'] })
  assert.deepEqual([first.statusCode, first.json()], [200, { ok: true }])
  assert.deepEqual(answered, [{ accountId: accountA, projectId: projectA, conversationId: conversationA, toolCallId: 'call-1', resumeData: ['Azul'] }])
  assert.equal((await answer({ resumeData: ['Azul'] })).statusCode, 400, 'an answer names its call')
  assert.equal(answered.length, 1)
})

test('each outcome of an answer has its own HTTP status and problem type, which the web card reads', async (t) => {
  const outcomes = { 'call-resumed': async () => 'RESUMED', 'call-again': async () => 'ALREADY_ANSWERED', 'call-forged': async () => 'NOT_PARKED', 'call-down': async () => { throw new Error('BUILDER_STORE_UNAVAILABLE') } }
  const { app } = await createBuilderApp(t, { answerOutcome: ({ toolCallId }) => outcomes[toolCallId]() })
  const answer = async (toolCallId) => {
    const response = await app.inject({ method: 'POST', url: `${sessionBase()}/tool-suspension?sessionScope=builder:${conversationA}`, ...authentic, payload: { toolCallId, resumeData: ['Azul'] } })
    return [response.statusCode, response.json().type ?? response.json()]
  }
  assert.deepEqual(await Promise.all(Object.keys(outcomes).map(answer)), [
    [200, { ok: true }],
    [409, 'urn:conexus:problem:TOOL_ANSWER_ALREADY_GIVEN'],
    [404, 'urn:conexus:problem:PARKED_CALL_NOT_FOUND'],
    [503, 'urn:conexus:problem:BUILDER_ANSWER_UNAVAILABLE'],
  ])
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
  const badLevel = await app.inject({ method: 'PUT', url: stateUrl, ...authentic, payload: { state: { thinkingLevel: 'extreme' } } })
  const mixed = await app.inject({ method: 'PUT', url: stateUrl, ...authentic, payload: { state: { thinkingLevel: 'low', yolo: true } } })
  const extraTopLevel = await app.inject({ method: 'PUT', url: stateUrl, ...authentic, payload: { state: { thinkingLevel: 'low' }, extra: 1 } })
  assert.deepEqual([yolo.statusCode, badLevel.statusCode, mixed.statusCode, extraTopLevel.statusCode], [400, 400, 400, 400])
  for (const response of [yolo, badLevel, mixed, extraTopLevel]) assert.equal(response.json().type.endsWith('SESSION_STATE_REFUSED'), true)
  assert.deepEqual(reachedContexts.filter((entry) => entry.url.includes('/state')), [])
})

test("the reasoning level write admits each of Mastra Code's six levels", async (t) => {
  const { app } = await createBuilderApp(t)
  const stateUrl = `${sessionBase()}/state?${inConversation()}`
  const statuses = []
  for (const thinkingLevel of ['off', 'low', 'medium', 'high', 'xhigh', 'max']) {
    statuses.push((await app.inject({ method: 'PUT', url: stateUrl, ...authentic, payload: { state: { thinkingLevel } } })).statusCode)
  }
  assert.deepEqual(statuses, [200, 200, 200, 200, 200, 200])
})

test("deleting a Project's conversations removes its threads and their messages, leaves another Project's, and repeating it converges", async (t) => {
  const { app, controller, conversations, memory } = await createBuilderApp(t)
  const elsewhere = randomUUID()
  await controller.createSession({ resourceId: `project:${projectB}`, scope: `conversation:${elsewhere}`, threadId: elsewhere })
  const second = randomUUID()
  assert.equal((await openConversation(app, projectA, second)).statusCode, 200)
  await memory.saveMessages({ messages: [{ id: randomUUID(), role: 'assistant', createdAt: new Date(), threadId: second, resourceId: `project:${projectA}`, content: { format: 2, parts: [{ type: 'text', text: 'nota' }] } }] })
  assert.deepEqual([...await conversations.deleteAll(projectA)].sort(), [conversationA, second].sort(), 'it answers the ids it deleted, which the Hub deletes the sessions of')
  assert.deepEqual(await conversations.deleteAll(projectA), [])
  assert.deepEqual(await listConversations(app), [])
  assert.deepEqual(await Promise.all([conversationA, second, elsewhere].map((id) => conversations.ownerOf(projectA, id))), ['NONE', 'NONE', 'OTHER'])
})

test("a conversation's session the browser stops using is deleted by the idle sweep, and its next request opens it again from the thread", async (t) => {
  const { app, controller, sessions, clock } = await createBuilderApp(t)
  const conversation = randomUUID()
  const resource = `project:${projectA}`
  const live = (id) => controller.getSessionByResource(resource, `conversation:${id}`)
  assert.equal((await openConversation(app, projectA, conversation)).statusCode, 200)
  assert.notEqual(await live(conversation), undefined, 'the browser opened the session')
  clock.now += CONVERSATION_SESSION_IDLE_MS - 1
  await sessions.sweep()
  assert.notEqual(await live(conversation), undefined, 'a session idle for less than the limit stays')
  clock.now += 1
  await sessions.sweep()
  assert.equal(await live(conversation), undefined, 'a session idle for the limit is deleted')
  const read = await app.inject({ method: 'GET', url: `${sessionBase()}?${inConversation(conversation)}`, ...authentic })
  assert.equal(read.statusCode, 200)
  assert.notEqual(await live(conversation), undefined, 'the next request opens it from the thread')
  clock.now += CONVERSATION_SESSION_IDLE_MS - 1
  assert.equal((await app.inject({ method: 'GET', url: `${sessionBase()}?${inConversation(conversation)}`, ...authentic })).statusCode, 200)
  clock.now += CONVERSATION_SESSION_IDLE_MS - 1
  await sessions.sweep()
  assert.notEqual(await live(conversation), undefined, 'a request renews the session\'s time')
})

const createBuilderRoutesApp = async (t, { compareSourceRevisions, createBuilderRun, store, session, service: customService, launchPreview } = {}) => {
  const resolveCurrentSession = async (request) => request.cookies['__Host-conexus_session']
    ? { account: { accountId: accountA, displayName: 'Operator' }, issuer: 'https://issuer.test', subject: 'subject-1' }
    : null
  const unused = async () => { throw new Error('unused in this test') }
  const service = customService ?? { compareSourceRevisions: compareSourceRevisions ?? unused, createBuilderRun: createBuilderRun ?? unused }
  const app = await createHttpApp({
    registerRoutes: (instance) => registerBuilderRoutes(instance, {
      store: store ?? {},
      service,
      session,
      resolveCurrentSession,
      origin,
      launchPreview,
    }),
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
  const { logger } = await import(hubModuleUrl('platform/logger.js'))
  const pinoStreamSym = Object.getOwnPropertySymbols(logger).find((s) => s.description === 'pino.stream')
  const stream = logger[pinoStreamSym]
  const logs = []
  const originalWrite = stream.write.bind(stream)
  stream.write = (chunk) => {
    try { logs.push(JSON.parse(chunk)) } catch {}
  }
  t.after(() => { stream.write = originalWrite })

  const base = 'b'.repeat(40)
  const result = 'c'.repeat(40)
  const url = `/api/control/projects/${projectA}/source/compare?baseSourceRevision=${base}&resultSourceRevision=${result}`
  const { app: notFoundApp } = await createBuilderRoutesApp(t, { compareSourceRevisions: async () => { throw new Error('BUILDER_SOURCE_SUBJECT_NOT_FOUND') } })
  const notFound = await notFoundApp.inject({ method: 'GET', url, ...authentic })
  assert.equal(notFound.statusCode, 404)
  assert.equal(notFound.json().type.endsWith('SOURCE_REVISION_NOT_FOUND'), true)

  const { app: unavailableApp } = await createBuilderRoutesApp(t, { compareSourceRevisions: async () => { throw new Error('BUILDER_FACTORY_PROJECT_UNBOUND') } })
  const unavailable = await unavailableApp.inject({ method: 'GET', url, ...authentic })
  assert.equal(unavailable.statusCode, 503)
  assert.equal(unavailable.json().type.endsWith('BUILDER_SOURCE_UNAVAILABLE'), true)
  const sourceLog = logs.find((r) => r.msg === 'BUILDER_SOURCE_UNAVAILABLE')
  assert.ok(sourceLog, 'BUILDER_SOURCE_UNAVAILABLE was logged')
  assert.equal(sourceLog.level, 50)
  assert.equal(sourceLog['exception.message'], 'BUILDER_FACTORY_PROJECT_UNBOUND')
  assert.equal(sourceLog['failure.details.projectId'], projectA)
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

test('a message names its conversation only: mode and promptVariant are refused, an unknown conversation is 404', async (t) => {
  const { logger } = await import(hubModuleUrl('platform/logger.js'))
  const pinoStreamSym = Object.getOwnPropertySymbols(logger).find((s) => s.description === 'pino.stream')
  const stream = logger[pinoStreamSym]
  const logs = []
  const originalWrite = stream.write.bind(stream)
  stream.write = (chunk) => {
    try { logs.push(JSON.parse(chunk)) } catch {}
  }
  t.after(() => { stream.write = originalWrite })

  const received = []
  let failRun = null
  const { app } = await createBuilderRoutesApp(t, {
    createBuilderRun: async (input) => {
      received.push(input)
      if (failRun) throw failRun
      throw new Failure('CONVERSATION_NOT_FOUND')
    },
  })
  const url = `/api/control/projects/${projectA}/builder-session/messages`
  const send = (payload) => app.inject({ method: 'POST', url, headers: { ...authentic.headers, 'idempotency-key': 'k-1' }, cookies: authentic.cookies, payload })
  const withMode = await send({ content: 'altere', conversationId: conversationA, mode: 'BUILD' })
  const withVariant = await send({ content: 'altere', conversationId: conversationA, promptVariant: 'v2' })
  const unknown = await send({ content: 'altere', conversationId: conversationA })
  assert.deepEqual([withMode.statusCode, withVariant.statusCode, unknown.statusCode], [400, 400, 404])
  assert.equal(unknown.json().type.endsWith('CONVERSATION_NOT_FOUND'), true)
  assert.deepEqual(received, [{ accountId: accountA, projectId: projectA, conversationId: conversationA, idempotencyKey: 'k-1', content: 'altere' }])

  failRun = new Failure('BUILDER_CAPACITY_FULL')
  const full = await send({ content: 'altere', conversationId: conversationA })
  assert.deepEqual([full.statusCode, full.json().type, logs.filter((r) => r.msg === 'BUILDER_UNAVAILABLE').length], [503, 'urn:conexus:problem:BUILDER_CAPACITY_FULL', 0], 'a refusal under heap pressure is no failure to log')

  failRun = new Error('STORE_UNAVAILABLE')
  const unavailable = await send({ content: 'altere', conversationId: conversationA })
  assert.equal(unavailable.statusCode, 503)
  assert.equal(unavailable.json().type.endsWith('BUILDER_UNAVAILABLE'), true)
  const runLog = logs.find((r) => r.msg === 'BUILDER_UNAVAILABLE')
  assert.ok(runLog, 'BUILDER_UNAVAILABLE was logged')
  assert.equal(runLog.level, 50)
  assert.equal(runLog['exception.message'], 'STORE_UNAVAILABLE')
  assert.equal(runLog['failure.details.projectId'], projectA)
})

test('builder session, cancel, trace, and preview routes log failure codes on internal errors', async (t) => {
  const { logger } = await import(hubModuleUrl('platform/logger.js'))
  const pinoStreamSym = Object.getOwnPropertySymbols(logger).find((s) => s.description === 'pino.stream')
  const stream = logger[pinoStreamSym]
  const logs = []
  const originalWrite = stream.write.bind(stream)
  stream.write = (chunk) => {
    try { logs.push(JSON.parse(chunk)) } catch {}
  }
  t.after(() => { stream.write = originalWrite })

  const runId = '88888888-8888-4888-8888-888888888888'
  let failRunRead = false
  const { app } = await createBuilderRoutesApp(t, {
    session: {
      read: async () => { throw new Error('SESSION_READ_FAIL') },
      readTrace: async () => { throw new Error('TRACE_READ_FAIL') },
    },
    store: {
      readBuilderRun: async () => {
        if (failRunRead) throw new Error('RUN_READ_FAIL')
        return { builderRunId: runId, accountId: accountA, projectId: projectA, conversationId: conversationA, idempotencyKey: 'k', content: 'c', state: 'PENDING', resultKind: null, runSequence: 1, baseSourceRevision: '0'.repeat(40), resultSourceRevision: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
      },
      readPreviewSubject: async () => ({ lastPreviewSourceRevision: 'a'.repeat(40), lastPreviewArtifactRevisionId: runId, lastPreviewArtifactDigest: 'd'.repeat(64) }),
    },
    service: {
      cancelBuilderRun: async () => { throw new Error('CANCEL_SERVICE_FAIL') },
      compareSourceRevisions: async () => { throw new Error('COMPARE_SERVICE_FAIL') },
      createBuilderRun: async () => { throw new Error('unused') },
      getApplicationBySource: async () => ({ artifactRevisionId: runId, artifactDigest: 'd'.repeat(64) }),
      listSourceTree: async () => { throw new Error('TREE_SERVICE_FAIL') },
      getSourceFile: async () => { throw new Error('FILE_SERVICE_FAIL') },
    },
    launchPreview: async () => { throw new Error('LAUNCH_PREVIEW_FAIL') },
  })

  // 1. GET /builder-session -> BUILDER_SESSION_UNAVAILABLE
  const sessionRes = await app.inject({ method: 'GET', url: `/api/control/projects/${projectA}/builder-session`, ...authentic })
  assert.equal(sessionRes.statusCode, 503)
  const sessionLog = logs.find((r) => r.msg === 'BUILDER_SESSION_UNAVAILABLE')
  assert.ok(sessionLog, 'BUILDER_SESSION_UNAVAILABLE was logged')
  assert.equal(sessionLog.level, 50)
  assert.equal(sessionLog['exception.message'], 'SESSION_READ_FAIL')
  assert.equal(sessionLog['failure.details.projectId'], projectA)

  // 2. POST /runs/:id/cancel -> BUILDER_CANCEL_FAILED
  const cancelRes = await app.inject({ method: 'POST', url: `/api/control/projects/${projectA}/builder-session/runs/${runId}/cancel`, ...authentic, payload: {} })
  assert.equal(cancelRes.statusCode, 503)
  const cancelLog = logs.find((r) => r.msg === 'BUILDER_CANCELLATION_UNAVAILABLE')
  assert.ok(cancelLog, 'BUILDER_CANCELLATION_UNAVAILABLE was logged')
  assert.equal(cancelLog.level, 50)
  assert.equal(cancelLog['exception.message'], 'CANCEL_SERVICE_FAIL')
  assert.equal(cancelLog['failure.details.projectId'], projectA)
  assert.equal(cancelLog['failure.details.builderRunId'], runId)

  // 3. GET /runs/:id/trace -> BUILDER_TRACE_FAILED (the run read is the only failure the route's catch handles)
  failRunRead = true
  const traceRes = await app.inject({ method: 'GET', url: `/api/control/projects/${projectA}/builder-session/runs/${runId}/trace`, ...authentic })
  failRunRead = false
  assert.equal(traceRes.statusCode, 503)
  const traceLog = logs.find((r) => r.msg === 'BUILDER_TRACE_UNAVAILABLE')
  assert.ok(traceLog, 'BUILDER_TRACE_UNAVAILABLE was logged')
  assert.equal(traceLog.level, 50)
  assert.equal(traceLog['exception.message'], 'RUN_READ_FAIL')
  assert.equal(traceLog['failure.details.projectId'], projectA)
  assert.equal(traceLog['failure.details.builderRunId'], runId)

  // 3b. GET /runs/:id/trace with mismatched run ID returns 404 builder-run-not-found
  const mismatchRunId = randomUUID()
  const traceNotFoundRes = await app.inject({ method: 'GET', url: `/api/control/projects/${projectA}/builder-session/runs/${mismatchRunId}/trace`, ...authentic })
  assert.equal(traceNotFoundRes.statusCode, 404)
  assert.deepEqual(JSON.parse(traceNotFoundRes.body), {
    type: 'urn:conexus:problem:BUILDER_RUN_NOT_FOUND',
    title: 'BUILDER_RUN_NOT_FOUND',
    status: 404,
    code: 'BUILDER_RUN_NOT_FOUND',
  })

  // 4. POST /preview -> BUILDER_PREVIEW_FAILED
  const previewRes = await app.inject({ method: 'POST', url: `/api/control/projects/${projectA}/builder-session/preview`, ...authentic, payload: {} })
  assert.equal(previewRes.statusCode, 503)
  const previewLog = logs.find((r) => r.msg === 'PREVIEW_UNAVAILABLE')
  assert.ok(previewLog, 'PREVIEW_UNAVAILABLE was logged')
  assert.equal(previewLog.level, 50)
  assert.equal(previewLog['exception.message'], 'LAUNCH_PREVIEW_FAIL')
  assert.equal(previewLog['failure.details.projectId'], projectA)

  // 5. GET /source/tree -> BUILDER_SOURCE_FAILED
  const treeRes = await app.inject({ method: 'GET', url: `/api/control/projects/${projectA}/source/tree?sourceRevision=${'0'.repeat(40)}`, ...authentic })
  assert.equal(treeRes.statusCode, 503)
  const treeLog = logs.find((r) => r.msg === 'BUILDER_SOURCE_UNAVAILABLE')
  assert.ok(treeLog, 'BUILDER_SOURCE_UNAVAILABLE was logged')
  assert.equal(treeLog.level, 50)
  assert.equal(treeLog['exception.message'], 'TREE_SERVICE_FAIL')
  assert.equal(treeLog['failure.details.projectId'], projectA)
})

test("the browser reaches exactly ten of Mastra's agent-controller routes, each one Mastra's own route table names", async (t) => {
  const { SERVER_ROUTES } = await import('@mastra/server/server-adapter')
  const { app } = await createBuilderApp(t)
  const mounted = SERVER_ROUTES
    .filter((route) => route.path.startsWith('/agent-controller/'))
    .filter((route) => app.hasRoute({ method: route.method, url: `/api/builder${route.path}` }))
    .map((route) => `${route.method} ${route.path.replace('/agent-controller/:controllerId/sessions', '')}`)
  assert.deepEqual(mounted.sort(), [
    'GET /:resourceId', 'GET /:resourceId/stream', 'GET /:resourceId/threads', 'GET /:resourceId/threads/:threadId/messages',
    'POST ', 'POST /:resourceId/abort', 'POST /:resourceId/model', 'POST /:resourceId/tool-approval', 'POST /:resourceId/tool-suspension',
    'PUT /:resourceId/state',
  ])
})

const apiKey = `sk-ant-api03-${'k'.repeat(40)}`
const echoed = (status, type) => () => new Response(JSON.stringify({ type: 'error', error: { type, message: `rejected ${apiKey}` } }), { status, headers: { 'content-type': 'application/json' } })

for (const [label, status, type] of [['401', 401, 'authentication_error'], ['503', 503, 'api_error']]) {
  test(`the stream the browser is served, over a real Anthropic ${label} that echoes the account key, carries the key in no frame`, async (t) => {
    const { createModelRouting } = await import(built('builder/model-routing.js'))
    const { createAnthropicRoute } = await import(built('builder/anthropic/route.js'))
    const { createClaudeHolds } = await import(built('builder/anthropic/credential.js'))
    const routing = createModelRouting({
      routes: { anthropic: createAnthropicRoute(createClaudeHolds({ store: { readById: async () => null, rewrite: async () => false } })) },
      modelAccounts: { usable: async () => ({ modelAccountId: 'row-anthropic', kind: 'api_key', secret: apiKey }) },
      conversationModel: async () => null, readDefault: async () => null, record: async () => {},
    })
    const original = globalThis.fetch
    globalThis.fetch = async (input, init) => {
      const url = new Request(input, init).url
      if (url.startsWith('https://api.anthropic.com/')) return echoed(status, type)()
      return original(input, init)
    }
    t.after(() => { globalThis.fetch = original })
    const { app, controller } = await createBuilderApp(t, { model: (context) => routing.resolve(context) })
    const address = await app.listen({ port: 0, host: '127.0.0.1' })
    const closing = new AbortController()
    const response = await original(`${address}${sessionBase()}/stream?${inConversation()}`, { headers: { cookie: '__Host-conexus_session=session-1; __Host-conexus_csrf=csrf-1' }, signal: closing.signal })
    const frames = []
    const reading = (async () => { for await (const chunk of response.body) frames.push(Buffer.from(chunk).toString()) })().catch(() => undefined)
    const session = await controller.getSessionByResource(`project:${projectA}`, `conversation:${conversationA}`)
    const requestContext = new (await import('@mastra/core/request-context')).RequestContext()
    requestContext.setRaw('conexusBuilderAccountId', accountA)
    requestContext.setRaw('conexusBuilderRunId', randomUUID())
    await session.model.switch({ modelId: 'anthropic/claude-test' })
    requestContext.setRaw('conexusBuilderConversationId', conversationA)
    const ended = new Promise((done) => { session.subscribe((event) => { if (event.type === 'agent_end') setTimeout(done, 50) }) })
    await session.sendMessage({ content: 'Faça o app.', requestContext }).catch(() => undefined)
    await ended
    closing.abort()
    await reading
    const text = frames.join('')
    assert.equal(text.includes('"type":"error"'), true, 'the stream carried the failure')
    assert.equal(text.includes(apiKey), false, 'the key is in no frame the browser reads')
    const stored = await app.inject({ method: 'GET', url: `${sessionBase()}/threads/${conversationA}/messages`, ...authentic })
    assert.equal(stored.statusCode, 200)
    assert.equal(stored.body.includes(apiKey), false, 'the key is in no message the thread serves')
  })
}
