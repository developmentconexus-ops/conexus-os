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
import { oneAccount } from './model-accounts-fake.mjs'
import { bindRunContext } from './run-context.mjs'
import { testConversations } from './builder-conversation-fixture.mjs'
import { hubJsonWrite, hubSessionCookie, opaque, testListener } from './access/test-listener.mjs'

const built = hubModuleUrl
const { Failure } = await import(built('platform/failure.js'))
const { registerBuilderSessionRoutes } = await import(built('builder/mastra-session-routes.js'))
const { registerBuilderRoutes } = await import(built('builder/routes.js'))
const { createBuilderController } = await import(built('builder/harness/controller.js'))
const { createConversations } = await import(built('builder/conversations.js'))

const CONVERSATION_SESSION_IDLE_MS = 10 * 60_000
const SESSION_TOKEN = opaque('operator')
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
const createBuilderApp = async (t, { accountId = accountA, providerDown = false, busy = false, answered = [], answerOutcome = () => 'ACCEPTED', model: modelOf = model } = {}) => {
  const root = mkdtempSync(join(tmpdir(), 'conexus-builder-routes-'))
  const storage = new LibSQLStore({ id: `builder-boundary-${randomUUID()}`, url: `file:${join(root, 'session.db')}` })
  const memory = new Memory({ storage, options: { lastMessages: 20 } })
  const controller = createBuilderController({ id: 'conexus-builder', model: modelOf, storage, memory, modelRetryDelayMs: () => 1, skillsPath: resolve(import.meta.dirname, '../../builder-skills') })
  const mastra = new Mastra({ storage, agentControllers: { 'conexus-builder': controller }, logger: false })
  await controller.init()
  const conversations = createConversations(async () => storage.getStore('memory'))
  const clock = { now: 0 }
  const sessions = testConversations(controller, () => undefined, { now: () => clock.now })
  await controller.createSession({ resourceId: `project:${projectA}`, scope: `conversation:${conversationA}`, threadId: conversationA })
  const reachedContexts = []
  const operator = { account: { accountId, displayName: 'Operator' }, issuer: 'https://issuer.test', subject: 'subject-1' }
  const { app } = await testListener({
    sessions: { [SESSION_TOKEN]: providerDown ? () => { throw new Failure('IDENTITY_PROVIDER_UNAVAILABLE') } : operator },
    registerRoutes: async (instance) => {
      instance.addHook('onResponse', async (request) => {
        if (request.requestContext) reachedContexts.push({ url: request.url, user: request.requestContext.get('user') })
      })
      await registerBuilderSessionRoutes(instance, {
        mastra, controllerId: 'conexus-builder', controller, conversations: sessions,
        mayBuild: async ({ accountId: caller, projectId }) => admittedProjects[caller]?.includes(projectId) ?? false,
        conversationOwner: ({ projectId, conversationId }) => conversations.ownerOf(projectId, conversationId),
        projectBusy: async () => busy,
        answerQuestion: (input) => { answered.push(input); return answerOutcome(input) },
      })
      return []
    },
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
  headers: hubJsonWrite,
  cookies: { '__Host-conexus_session': SESSION_TOKEN },
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

test("a conversation's model changes only while no run is in flight", async (t) => {
  const { app } = await createBuilderApp(t)
  const switched = await app.inject({ method: 'POST', url: `${sessionBase()}/model?${inConversation()}`, ...authentic, payload: { modelId: 'google-ai-pro/gemini-3-flash', scope: 'thread' } })
  assert.equal(switched.statusCode, 200)
  const state = await app.inject({ method: 'GET', url: `${sessionBase()}?${inConversation()}`, ...authentic })
  assert.equal(state.json().modelId, 'google-ai-pro/gemini-3-flash')

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

test("a conversation's session takes no abort: the question a run waits on ends only through the Hub's stop", async (t) => {
  const { app } = await createBuilderApp(t)
  const response = await app.inject({ method: 'POST', url: `${sessionBase()}/abort?${inConversation()}`, ...authentic, payload: {} })
  assert.deepEqual([response.statusCode, response.json().type], [409, 'urn:conexus:problem:BUILDER_RUN_STOP_REFUSED'])
})

test('a scope other than a conversation\'s is not served, never a fresh empty session', async (t) => {
  const { app, controller } = await createBuilderApp(t)
  const response = await app.inject({ method: 'GET', url: `${sessionBase()}/stream?sessionScope=builder:${conversationA}`, ...authentic })
  assert.equal(response.statusCode, 404)
  assert.equal(await controller.getSessionByResource(`project:${projectA}`, `builder:${conversationA}`), undefined)
})

test('a conversation scope whose id is not a UUID is refused when a session opens and when one is read, and no session exists for it', async (t) => {
  const { app, controller } = await createBuilderApp(t)
  const opened = await app.inject({ method: 'POST', url: `${PREFIX}/sessions`, ...authentic, payload: { resourceId: `project:${projectA}`, sessionScope: 'conversation:not-a-uuid', threadId: 'not-a-uuid' } })
  const read = await app.inject({ method: 'GET', url: `${sessionBase()}/stream?sessionScope=conversation:not-a-uuid`, ...authentic })
  assert.deepEqual([opened.statusCode, opened.json().type, read.statusCode, read.json().type], [
    400, 'urn:conexus:problem:CONVERSATION_SESSION_REFUSED', 404, 'urn:conexus:problem:BUILDER_SESSION_NOT_FOUND',
  ])
  assert.equal(await controller.getSessionByResource(`project:${projectA}`, 'conversation:not-a-uuid'), undefined)
})

test('a conversation takes no message, steer or follow-up through Mastra; a message goes through the Hub', async (t) => {
  const { app } = await createBuilderApp(t)
  const answered = []
  for (const operation of ['messages', 'steer', 'follow-up']) {
    const response = await app.inject({ method: 'POST', url: `${sessionBase()}/${operation}?${inConversation()}`, ...authentic, payload: { message: 'apague tudo', content: 'apague tudo' } })
    answered.push([operation, response.statusCode])
  }
  assert.equal(await turnsWithin(3_000), 0, 'no request reached the model')
  assert.deepEqual(answered, [['messages', 404], ['steer', 404], ['follow-up', 404]])
})

test("an answer to a run's call goes to the run waiting on it through the Hub, never to Mastra's own route", async (t) => {
  const answered = []
  const { app } = await createBuilderApp(t, { answered })
  const answer = (payload) => app.inject({ method: 'POST', url: `${sessionBase()}/tool-suspension?${inConversation()}`, ...authentic, payload })
  const first = await answer({ toolCallId: 'call-1', resumeData: ['Azul'] })
  assert.deepEqual([first.statusCode, first.json()], [200, { ok: true }])
  assert.deepEqual(answered, [{ projectId: projectA, conversationId: conversationA, toolCallId: 'call-1', resumeData: ['Azul'] }])
  assert.equal((await answer({ resumeData: ['Azul'] })).statusCode, 400, 'an answer names its call')
  assert.equal(answered.length, 1)
})

test('each outcome of an answer has its own HTTP status and problem type, which the web card reads', async (t) => {
  const outcomes = { 'call-taken': () => 'ACCEPTED', 'call-again': () => 'ALREADY_ANSWERED', 'call-forged': () => 'UNKNOWN_CALL', 'call-ended': () => 'ENDED' }
  const { app } = await createBuilderApp(t, { answerOutcome: ({ toolCallId }) => outcomes[toolCallId]() })
  const answer = async (toolCallId) => {
    const response = await app.inject({ method: 'POST', url: `${sessionBase()}/tool-suspension?${inConversation()}`, ...authentic, payload: { toolCallId, resumeData: ['Azul'] } })
    return [response.statusCode, response.json().type ?? response.json()]
  }
  assert.deepEqual(await Promise.all(Object.keys(outcomes).map(answer)), [
    [200, { ok: true }],
    [409, 'urn:conexus:problem:TOOL_ANSWER_ALREADY_GIVEN'],
    [409, 'urn:conexus:problem:QUESTION_ENDED'],
    [409, 'urn:conexus:problem:QUESTION_ENDED'],
  ])
})

test('a state-changing request that is not the Hub page writing is refused on the mount before the session is read', async (t) => {
  const { app } = await createBuilderApp(t)
  const forgeries = [
    { origin: 'https://evil.test' },
    { 'sec-fetch-site': 'cross-site' },
    { 'sec-fetch-site': 'same-site' },
    { 'sec-fetch-mode': 'navigate' },
    { 'content-type': 'application/x-www-form-urlencoded' },
  ]
  for (const forgery of forgeries) {
    const headers = { ...authentic.headers, ...forgery }
    const open = { resourceId: `project:${projectA}`, sessionScope: `conversation:${conversationA}`, threadId: conversationA }
    for (const [url, payload] of [[`${sessionBase()}/abort?${inConversation()}`, {}], [`${PREFIX}/sessions`, open]]) {
      const refused = await app.inject({ method: 'POST', url, headers, cookies: authentic.cookies, payload })
      assert.deepEqual([refused.statusCode, refused.json().code], [403, 'REQUEST_AUTHENTICITY_DENIED'], JSON.stringify(forgery))
    }
  }
})

test('the mount checks the request before its body and its body before the session', async (t) => {
  const { app } = await createBuilderApp(t)
  const url = `${sessionBase()}/abort?${inConversation()}`
  const malformed = await app.inject({ method: 'POST', url, headers: { ...hubJsonWrite, origin: 'https://evil.test' }, payload: '{bad' })
  assert.deepEqual([malformed.statusCode, malformed.json().code], [403, 'REQUEST_AUTHENTICITY_DENIED'])
  const unparsable = await app.inject({ method: 'POST', url, headers: hubJsonWrite, payload: '{bad' })
  assert.deepEqual([unparsable.statusCode, unparsable.json().code], [400, 'REQUEST_JSON_INVALID'])
  const anonymous = await app.inject({ method: 'POST', url, headers: hubJsonWrite, payload: {} })
  assert.deepEqual([anonymous.statusCode, anonymous.json().code], [401, 'AUTHENTICATION_REQUIRED'])
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
  await sessions.sweep(new AbortController().signal)
  assert.notEqual(await live(conversation), undefined, 'a session idle for less than the limit stays')
  clock.now += 1
  await sessions.sweep(new AbortController().signal)
  assert.equal(await live(conversation), undefined, 'a session idle for the limit is deleted')
  const read = await app.inject({ method: 'GET', url: `${sessionBase()}?${inConversation(conversation)}`, ...authentic })
  assert.equal(read.statusCode, 200)
  assert.notEqual(await live(conversation), undefined, 'the next request opens it from the thread')
  clock.now += CONVERSATION_SESSION_IDLE_MS - 1
  assert.equal((await app.inject({ method: 'GET', url: `${sessionBase()}?${inConversation(conversation)}`, ...authentic })).statusCode, 200)
  clock.now += CONVERSATION_SESSION_IDLE_MS - 1
  await sessions.sweep(new AbortController().signal)
  assert.notEqual(await live(conversation), undefined, 'a request renews the session\'s time')
})

const createBuilderRoutesApp = async (t, { compareSourceRevisions, sendBuilderMessage, store, session, service: customService, launchPreview } = {}) => {
  const unused = async () => { throw new Error('unused in this test') }
  const service = customService ?? { compareSourceRevisions: compareSourceRevisions ?? unused, sendBuilderMessage: sendBuilderMessage ?? unused }
  const { app } = await testListener({
    sessions: { [SESSION_TOKEN]: { account: { accountId: accountA, displayName: 'Operator' }, issuer: 'https://issuer.test', subject: 'subject-1' } },
    registerRoutes: (instance) => registerBuilderRoutes(instance, {
      store: store ?? {},
      service,
      session,
      launchPreview,
    }),
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

test('the source compare route maps a not-found revision to 404, a named Git failure to 503 with its reason, and an unnamed failure to 500', async (t) => {
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
  const answer = async (failure) => {
    const { app } = await createBuilderRoutesApp(t, { compareSourceRevisions: async () => { throw failure } })
    const response = await app.inject({ method: 'GET', url, ...authentic })
    return [response.statusCode, response.json().type]
  }
  assert.deepEqual(await answer(new Failure('SOURCE_REVISION_NOT_FOUND')), [404, 'urn:conexus:problem:SOURCE_REVISION_NOT_FOUND'])
  assert.deepEqual(await answer(new Failure('BUILDER_SOURCE_UNAVAILABLE', { cause: new Error('CONEXUS_GIT_FAILED'), details: { reason: 'CONEXUS_GIT_FAILED' } })), [503, 'urn:conexus:problem:BUILDER_SOURCE_UNAVAILABLE'])
  const sourceLog = logs.find((r) => r.msg === 'BUILDER_SOURCE_UNAVAILABLE')
  assert.deepEqual([sourceLog?.level, sourceLog?.['failure.details.reason']], [50, 'CONEXUS_GIT_FAILED'])
  assert.deepEqual(await answer(new Error('BUILDER_FACTORY_PROJECT_UNBOUND')), [500, 'urn:conexus:problem:INTERNAL_UNEXPECTED'])
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
    sendBuilderMessage: async (input) => {
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
  const blank = await send({ content: '   ', conversationId: conversationA })
  const notUuid = await send({ content: 'altere', conversationId: 'conversa' })
  assert.deepEqual([blank, notUuid].map((reply) => [reply.statusCode, reply.json().type]), [[422, 'urn:conexus:problem:BUILDER_MESSAGE_REFUSED'], [404, 'urn:conexus:problem:CONVERSATION_NOT_FOUND']])
  assert.equal(received.length, 1, 'a body the contract refuses never reaches the service')

  failRun = new Failure('BUILDER_CAPACITY_FULL')
  const full = await send({ content: 'altere', conversationId: conversationA })
  assert.deepEqual([full.statusCode, full.json().type, logs.filter((r) => r.msg === 'BUILDER_UNAVAILABLE').length], [503, 'urn:conexus:problem:BUILDER_CAPACITY_FULL', 0], 'a refusal under heap pressure is no failure to log')

  failRun = new Error('STORE_UNAVAILABLE')
  const unnamed = await send({ content: 'altere', conversationId: conversationA })
  assert.deepEqual([unnamed.statusCode, unnamed.json().type], [500, 'urn:conexus:problem:INTERNAL_UNEXPECTED'], 'a failure with no name is no 503')
})

test('the session read serves the latest run with the calls its live run in this Hub waits on, and none for a run this Hub does not hold', async (t) => {
  const runId = '99999999-9999-4999-8999-999999999999'
  const waiting = { builderRunId: runId, projectId: projectA, conversationId: conversationA, state: 'RUNNING', phase: 'WAITING', baseSourceRevision: '0'.repeat(40), resultSourceRevision: null, resultKind: null, failureCode: null, requestText: 'c', createdAt: new Date().toISOString(), cancellationRequested: false }
  let held = ['call-1']
  const { app } = await createBuilderRoutesApp(t, {
    session: { read: async () => ({ preview: { workingSourceRevision: null, lastPreviewSourceRevision: null, lastPreviewArtifactRevisionId: null, lastPreviewArtifactDigest: null }, runHistory: [] }) },
    store: { readBuilderRun: async () => waiting, readLatestCodeChangingBuilderRun: async () => null },
    service: { pendingCalls: (projectId, conversationId) => (projectId === projectA && conversationId === conversationA ? held : ['wrong']) },
  })
  const read = async () => (await app.inject({ method: 'GET', url: `/api/control/projects/${projectA}/builder-session`, ...authentic })).json().latestBuilderRun.pendingCalls
  assert.deepEqual(await read(), ['call-1'])
  held = []
  assert.deepEqual(await read(), [], 'after a restart the row still says WAITING, and nothing is answerable')
})

test('the trace route answers a Project the account cannot build in with PROJECT_BUILD_DENIED, and an older run id with BUILDER_RUN_NOT_FOUND', async (t) => {
  const latest = '88888888-8888-4888-8888-888888888888'
  const older = '99999999-9999-4999-8999-999999999999'
  let subject = null
  const { app } = await createBuilderRoutesApp(t, {
    session: { read: async () => { throw new Error('unused') }, readTrace: async () => { throw new Error('unused') } },
    store: {
      readPreviewSubject: async () => subject,
      readBuilderRun: async () => {
        if (!subject) throw new Error('the run is read only after the Project admits the account')
        return { builderRunId: latest }
      },
    },
  })
  const trace = (id) => app.inject({ method: 'GET', url: `/api/control/projects/${projectA}/builder-session/runs/${id}/trace`, ...authentic })
  const hidden = await trace(latest)
  assert.deepEqual([hidden.statusCode, hidden.json().code], [403, 'PROJECT_BUILD_DENIED'])
  subject = { lastPreviewSourceRevision: null, lastPreviewArtifactRevisionId: null, lastPreviewArtifactDigest: null }
  const stale = await trace(older)
  assert.deepEqual([stale.statusCode, stale.json().code], [404, 'BUILDER_RUN_NOT_FOUND'])
})

test('a failure the Builder routes cannot name is a 500, and a trace store failure keeps its cause behind a 503', async (t) => {
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
  const traceStoreDown = new Failure('BUILDER_TRACE_UNAVAILABLE', { cause: new Error('TRACE_STORE_DOWN'), details: { projectId: projectA, builderRunId: runId } })
  const { app } = await createBuilderRoutesApp(t, {
    session: {
      read: async () => { throw new Error('SESSION_READ_FAIL') },
      readTrace: async () => { throw traceStoreDown },
    },
    store: {
      readBuilderRun: async () => ({ builderRunId: runId }),
      readLaunchSubject: async () => ({ artifactRevisionId: runId, digest: 'd'.repeat(64), sourceRevision: 'a'.repeat(40), entryPath: 'index.html', files: [] }),
      readPreviewSubject: async () => ({ lastPreviewSourceRevision: null, lastPreviewArtifactRevisionId: null, lastPreviewArtifactDigest: null }),
    },
    service: {
      cancelBuilderRun: async () => { throw new Error('CANCEL_SERVICE_FAIL') },
      sendBuilderMessage: async () => { throw new Error('unused') },
      listSourceTree: async () => { throw new Error('TREE_SERVICE_FAIL') },
      getSourceFile: async () => { throw new Error('FILE_SERVICE_FAIL') },
    },
    launchPreview: async () => { throw new Error('LAUNCH_PREVIEW_FAIL') },
  })
  const base = `/api/control/projects/${projectA}`
  const answers = []
  for (const [method, url, payload] of [
    ['GET', `${base}/builder-session`],
    ['POST', `${base}/builder-session/runs/${runId}/cancel`, {}],
    ['POST', `${base}/builder-session/preview`, {}],
    ['GET', `${base}/source/tree?sourceRevision=${'0'.repeat(40)}`],
  ]) {
    const response = await app.inject({ method, url, ...authentic, ...(payload ? { payload } : {}) })
    answers.push([response.statusCode, response.json().type])
  }
  assert.deepEqual(answers, Array(4).fill([500, 'urn:conexus:problem:INTERNAL_UNEXPECTED']))

  const trace = await app.inject({ method: 'GET', url: `${base}/builder-session/runs/${runId}/trace`, ...authentic })
  assert.deepEqual([trace.statusCode, trace.json().type], [503, 'urn:conexus:problem:BUILDER_TRACE_UNAVAILABLE'])
  const traceLog = logs.find((r) => r.msg === 'BUILDER_TRACE_UNAVAILABLE')
  assert.deepEqual([traceLog?.level, traceLog?.['exception.type'], traceLog?.['failure.details.projectId'], traceLog?.['failure.details.builderRunId']], [50, 'Error', projectA, runId])
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
    'POST ', 'POST /:resourceId/abort', 'POST /:resourceId/model', 'POST /:resourceId/tool-suspension',
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
      routes: { anthropic: createAnthropicRoute(createClaudeHolds({})) },
      modelAccounts: oneAccount({ modelAccountId: 'row-anthropic', provider: 'anthropic', kind: 'api_key', secret: apiKey }),
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
    const response = await original(`${address}${sessionBase()}/stream?${inConversation()}`, { headers: { cookie: hubSessionCookie(SESSION_TOKEN) }, signal: closing.signal })
    const frames = []
    const reading = (async () => { for await (const chunk of response.body) frames.push(Buffer.from(chunk).toString()) })().catch(() => undefined)
    const session = await controller.getSessionByResource(`project:${projectA}`, `conversation:${conversationA}`)
    const requestContext = new (await import('@mastra/core/request-context')).RequestContext()
    bindRunContext(requestContext, { builderRunId: randomUUID(), accountId: accountA, conversationId: conversationA })
    await session.model.switch({ modelId: 'anthropic/claude-test' })
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

test('a message that starts a run answers 201, and one a waiting run takes answers 200 with that run', async (t) => {
  const run = {
    builderRunId: '88888888-8888-4888-8888-888888888888', projectId: projectA, conversationId: conversationA, state: 'RUNNING', phase: 'WAITING', baseSourceRevision: '0'.repeat(40),
    resultSourceRevision: null, resultKind: null, failureCode: null, requestText: 'altere', createdAt: '2026-10-05T12:00:00.000Z', cancellationRequested: false,
  }
  let created = true
  const { app } = await createBuilderRoutesApp(t, { sendBuilderMessage: async () => ({ builderRun: run, created }) })
  const send = () => app.inject({ method: 'POST', url: `/api/control/projects/${projectA}/builder-session/messages`, headers: { ...authentic.headers, 'idempotency-key': 'k-1' }, cookies: authentic.cookies, payload: { content: 'altere', conversationId: conversationA } })
  const started = await send()
  created = false
  const taken = await send()
  assert.deepEqual([started.statusCode, taken.statusCode], [201, 200])
  assert.deepEqual(taken.json(), { builderRun: run })
})
