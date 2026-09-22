import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { AgentController } from '@mastra/core/agent-controller'
import { Mastra } from '@mastra/core/mastra'
import { createCodingAgent } from '@mastra/core/coding-agent'
import { LibSQLStore } from '@mastra/libsql'
import { Memory } from '@mastra/memory'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const hubBuild = mkdtempSync(resolve(repositoryRoot, 'apps/hub/builder-mastra-session-routes-build-'))
process.once('exit', () => rmSync(hubBuild, { recursive: true, force: true }))
const compiled = spawnSync(process.execPath, [
  resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'),
  '--project', resolve(repositoryRoot, 'apps/hub/tsconfig.json'),
  '--noEmit', 'false', '--outDir', hubBuild,
], { encoding: 'utf8' })
if (compiled.status !== 0) throw new Error(`HUB_COMPILE_FAILED\n${compiled.stdout}\n${compiled.stderr}`)
const built = (path) => pathToFileURL(resolve(hubBuild, path)).href
const { createHttpApp } = await import(built('http/app.js'))
const { BUILDER_CONTROLLER_ID, registerBuilderMastraRoutes } = await import(built('builder/mastra-session-routes.js'))

const origin = 'https://conexus.test'
const controllerId = BUILDER_CONTROLLER_ID
// Mastra Code names its own controller. The Hub registers it under a key of its own, and that key
// is the one the browser addresses, so the boundary must read the registry key and not controller.id.
const nativeControllerId = 'mastra-code'
const accountId = '22222222-2222-4222-8222-222222222222'
const projectId = '33333333-3333-4333-8333-333333333333'
const runId = '44444444-4444-4444-8444-444444444444'
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

const createBoundaryApp = async ({ signedIn = true, admitted = true } = {}) => {
  const root = mkdtempSync(join(tmpdir(), 'conexus-mastra-routes-'))
  const storage = new LibSQLStore({ id: `boundary-${randomUUID()}`, url: `file:${join(root, 'session.db')}` })
  const memory = new Memory({ storage, options: { lastMessages: 20 } })
  const agent = createCodingAgent({ id: 'boundary-agent', name: 'Boundary Probe', model, instructions: 'Mechanical probe.', memory, workspace: undefined })
  const controller = new AgentController({ id: nativeControllerId, storage, memory, agent, modes: [{ id: 'build', name: 'Build', availableTools: [] }], defaultModeId: 'build' })
  await controller.init()
  // The routes read threads through the instance's storage, so it has to be the store the sessions write to.
  const mastra = new Mastra({ storage, agentControllers: { [BUILDER_CONTROLLER_ID]: controller }, logger: false })
  const admitCalls = []
  const reachedContexts = []
  const app = await createHttpApp({
    registerRoutes: async (instance) => {
      instance.addHook('onResponse', async (request) => {
        if (request.requestContext) reachedContexts.push({ url: request.url, user: request.requestContext.get('user'), projectId: request.requestContext.get('conexusBuilderProjectId') })
      })
      await registerBuilderMastraRoutes(instance, {
        mastra,
        controller,
        origin,
        resolveCurrentSession: async (request) => signedIn && request.cookies['__Host-conexus_session']
          ? { account: { accountId, displayName: 'Leandro' }, issuer: 'https://issuer.test', subject: 'subject-1' }
          : null,
        admitProjectBuild: async (input) => { admitCalls.push(input); return admitted },
      })
      return []
    },
    staticRoot: null,
  })
  return { app, controller, admitCalls, reachedContexts, close: async () => {
    await app.close()
    await controller.destroy()
    await storage.close()
    rmSync(root, { recursive: true, force: true })
  } }
}

const authentic = {
  headers: { origin, 'x-conexus-csrf': 'csrf-1', 'content-type': 'application/json' },
  cookies: { '__Host-conexus_session': 'session-1', '__Host-conexus_csrf': 'csrf-1' },
}
const sessionBase = (controller = controllerId) => `/api/mastra/agent-controller/${controller}/sessions/${projectId}`
const streamUrl = (scope = `builder:${runId}`) => `${sessionBase()}/stream?sessionScope=${encodeURIComponent(scope)}`

test('an unauthenticated live turn is refused before any Mastra route runs', async (t) => {
  const { app, admitCalls, close } = await createBoundaryApp()
  t.after(close)
  const response = await app.inject({ method: 'GET', url: streamUrl(), headers: { origin } })
  assert.equal(response.statusCode, 401)
  assert.deepEqual(admitCalls, [])
})

test('a signed-in operator without Project build authority is refused', async (t) => {
  const { app, admitCalls, close } = await createBoundaryApp({ admitted: false })
  t.after(close)
  const response = await app.inject({ method: 'GET', url: streamUrl(), ...authentic })
  assert.equal(response.statusCode, 403)
  assert.deepEqual(admitCalls, [{ accountId, projectId }])
})

test('a controller the Hub does not own is not found', async (t) => {
  const { app, admitCalls, close } = await createBoundaryApp()
  t.after(close)
  for (const id of ['some-other-controller', nativeControllerId]) {
    const response = await app.inject({ method: 'GET', url: `${sessionBase(id)}/stream?sessionScope=builder:${runId}`, ...authentic })
    assert.equal(response.statusCode, 404, id)
  }
  assert.deepEqual(admitCalls, [])
})

test("a Project's conversations are reachable as the session's own threads", async (t) => {
  const { app, admitCalls, close } = await createBoundaryApp()
  t.after(close)
  const listed = await app.inject({ method: 'GET', url: `${sessionBase()}/threads?limit=50`, ...authentic })
  assert.equal(listed.statusCode, 200)
  assert.deepEqual(listed.json().threads, [])
  assert.deepEqual(admitCalls, [{ accountId, projectId }])

  const created = await app.inject({ method: 'POST', url: `${sessionBase()}/threads`, ...authentic, payload: { title: 'Primeira conversa' } })
  assert.equal(created.statusCode, 200)
  const conversationId = created.json().id
  assert.ok(conversationId)

  const renamed = await app.inject({ method: 'PUT', url: `${sessionBase()}/threads/${conversationId}`, ...authentic, payload: { title: 'Contador' } })
  assert.equal(renamed.statusCode, 200)
  const threads = (await app.inject({ method: 'GET', url: `${sessionBase()}/threads?limit=50`, ...authentic })).json().threads
  assert.equal(threads.find((thread) => thread.id === conversationId)?.title, 'Contador')

  const switched = await app.inject({ method: 'POST', url: `${sessionBase()}/thread`, ...authentic, payload: { threadId: conversationId } })
  assert.equal(switched.statusCode, 200)
})

test('a session scope outside the run grammar is not found', async (t) => {
  const { app, close } = await createBoundaryApp()
  t.after(close)
  for (const scope of ['builder:not-a-uuid', `project:${runId}`, `builder:${runId} extra`]) {
    const response = await app.inject({ method: 'GET', url: streamUrl(scope), ...authentic })
    assert.equal(response.statusCode, 404, scope)
  }
})

test('a run whose session does not exist yet is a conflict, never a fresh empty session', async (t) => {
  const { app, close } = await createBoundaryApp()
  t.after(close)
  const response = await app.inject({ method: 'GET', url: streamUrl(), ...authentic })
  assert.equal(response.statusCode, 409)
})

test('a steering request without the CSRF token is refused', async (t) => {
  const { app, close } = await createBoundaryApp()
  t.after(close)
  const response = await app.inject({
    method: 'POST', url: `${sessionBase()}/abort?sessionScope=builder:${runId}`,
    headers: { origin, 'content-type': 'application/json' },
    cookies: authentic.cookies, payload: {},
  })
  assert.equal(response.statusCode, 403)
})

test('the browser takes no steer or follow-up, not even inside a run session; a new message is a new run', async (t) => {
  const { app, controller, close } = await createBoundaryApp()
  t.after(close)
  const liveRun = `builder:${runId}`
  await controller.createSession({ resourceId: projectId, id: `${projectId}::${liveRun}`, ownerId: controller.id, scope: liveRun })
  const answered = []
  for (const operation of ['steer', 'follow-up']) {
    for (const [name, query] of [['unscoped', ''], ['no run', `?sessionScope=builder:${randomUUID()}`], ['run session', `?sessionScope=${liveRun}`]]) {
      const response = await app.inject({ method: 'POST', url: `${sessionBase()}/${operation}${query}`, ...authentic, payload: { message: 'apague tudo' } })
      answered.push([operation, name, response.statusCode])
    }
  }
  assert.equal(await turnsWithin(3_000), 0, 'no request reached the model')
  assert.deepEqual(answered, [
    ['steer', 'unscoped', 404], ['steer', 'no run', 404], ['steer', 'run session', 404],
    ['follow-up', 'unscoped', 404], ['follow-up', 'no run', 404], ['follow-up', 'run session', 404],
  ])
  assert.equal((await app.inject({ method: 'POST', url: `${sessionBase()}/abort`, ...authentic, payload: {} })).statusCode, 200, 'abort needs no run')
})

test('the browser cannot open a session or send its opening message', async (t) => {
  const { app, close } = await createBoundaryApp()
  t.after(close)
  const messages = await app.inject({ method: 'POST', url: `${sessionBase()}/messages`, ...authentic, payload: { content: 'crie um contador' } })
  assert.equal(messages.statusCode, 404)
  const sessions = await app.inject({ method: 'POST', url: `/api/mastra/agent-controller/${controllerId}/sessions`, ...authentic, payload: { resourceId: projectId } })
  assert.equal(sessions.statusCode, 404)
})

test('a tool answer other than approve or decline is refused before Mastra runs it', async (t) => {
  const { app, reachedContexts, close } = await createBoundaryApp()
  t.after(close)
  const approvalUrl = `${sessionBase()}/tool-approval`
  const suspensionUrl = `${sessionBase()}/tool-suspension`

  const escalatedApproval = await app.inject({ method: 'POST', url: approvalUrl, ...authentic, payload: { toolCallId: 'call-1', approved: true, decision: 'always_allow_category' } })
  const escalatedSuspensionField = await app.inject({ method: 'POST', url: suspensionUrl, ...authentic, payload: { toolCallId: 'call-1', resumeData: { decision: 'always_allow_category' } } })
  const escalatedSuspensionString = await app.inject({ method: 'POST', url: suspensionUrl, ...authentic, payload: { toolCallId: 'call-1', resumeData: 'always_allow_category' } })
  assert.deepEqual([escalatedApproval.statusCode, escalatedSuspensionField.statusCode, escalatedSuspensionString.statusCode], [400, 400, 400])
  assert.deepEqual(reachedContexts, [], 'no escalated answer reached Mastra')

  const approved = await app.inject({ method: 'POST', url: approvalUrl, ...authentic, payload: { toolCallId: 'call-1', approved: true } })
  const declined = await app.inject({ method: 'POST', url: approvalUrl, ...authentic, payload: { toolCallId: 'call-1', approved: false } })
  const resumed = await app.inject({ method: 'POST', url: suspensionUrl, ...authentic, payload: { toolCallId: 'call-1', resumeData: 'Use SQLite.' } })
  assert.deepEqual([approved.statusCode, declined.statusCode, resumed.statusCode], [200, 200, 200])
})

test("a browser-supplied requestContext never reaches Mastra, in the body or in the query", async (t) => {
  const { app, reachedContexts, close } = await createBoundaryApp()
  t.after(close)
  const forged = { user: { id: "99999999-9999-4999-8999-999999999999", organizationId: "55555555-5555-4555-8555-555555555555" }, conexusBuilderProjectId: "55555555-5555-4555-8555-555555555555" }
  const inBody = await app.inject({ method: "POST", url: `${sessionBase()}/threads`, ...authentic, payload: { title: "Forjada", requestContext: forged } })
  const inQuery = await app.inject({ method: "GET", url: `${sessionBase()}/threads?limit=50&requestContext=${encodeURIComponent(JSON.stringify(forged))}`, ...authentic })
  const inBase64 = await app.inject({ method: "GET", url: `${sessionBase()}/threads?requestContext=${Buffer.from(JSON.stringify(forged)).toString("base64")}`, ...authentic })
  assert.deepEqual(reachedContexts.filter((seen) => seen.user !== undefined || seen.projectId !== undefined), [])
  assert.deepEqual([inBody.statusCode, inQuery.statusCode, inBase64.statusCode], [400, 400, 400])
})
