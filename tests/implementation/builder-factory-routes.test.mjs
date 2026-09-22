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
const hubBuild = mkdtempSync(resolve(repositoryRoot, 'apps/hub/builder-factory-routes-build-'))
process.once('exit', () => rmSync(hubBuild, { recursive: true, force: true }))
const compiled = spawnSync(process.execPath, [
  resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'),
  '--project', resolve(repositoryRoot, 'apps/hub/tsconfig.json'),
  '--noEmit', 'false', '--outDir', hubBuild,
], { encoding: 'utf8' })
if (compiled.status !== 0) throw new Error(`HUB_COMPILE_FAILED\n${compiled.stdout}\n${compiled.stderr}`)
const built = (path) => pathToFileURL(resolve(hubBuild, path)).href
const { createHttpApp } = await import(built('http/app.js'))
const { registerFactoryMastraRoutes } = await import(built('builder/mastra-session-routes.js'))
const { admitFactoryConversation, openFactoryConversationThread, registerFactoryConversationRoutes } = await import(built('builder/factory-routes.js'))

const origin = 'https://conexus.test'
const ORG = 'conexus-installation'
const accountA = '22222222-2222-4222-8222-222222222222'
const accountB = '55555555-5555-4555-8555-555555555555'
const projectA = '33333333-3333-4333-8333-333333333333'
const projectB = '66666666-6666-4666-8666-666666666666'
const conversationA = '77777777-7777-4777-8777-777777777777'
const repositoryOf = { [projectA]: 'project-repository-a', [projectB]: 'project-repository-b' }
const admittedProjects = { [accountA]: [projectA], [accountB]: [projectB] }
const model = {
  specificationVersion: 'v2', provider: 'conexus-boundary', modelId: 'boundary-probe', supportedUrls: {},
  async doGenerate() { throw new Error('the boundary test never reaches the model') },
  async doStream() { throw new Error('the boundary test never reaches the model') },
}

const createSessions = () => {
  const rows = new Map()
  const created = []
  return {
    rows,
    created,
    getBySessionId: async (sessionId) => rows.get(sessionId) ?? null,
    list: async ({ projectRepositoryId }) => [...rows.values()].filter((row) => row.projectRepositoryId === projectRepositoryId),
    create: async (input) => {
      created.push(input)
      const row = { ...input, id: randomUUID(), title: input.title ?? null, createdAt: new Date('2026-09-21T12:00:00.000Z') }
      rows.set(input.sessionId, row)
      return row
    },
  }
}

const createFactoryApp = async (t, { accountId = accountA } = {}) => {
  const root = mkdtempSync(join(tmpdir(), 'conexus-factory-routes-'))
  const storage = new LibSQLStore({ id: `factory-boundary-${randomUUID()}`, url: `file:${join(root, 'session.db')}` })
  const memory = new Memory({ storage, options: { lastMessages: 20 } })
  const agent = createCodingAgent({ id: 'boundary-agent', name: 'Boundary Probe', model, instructions: 'Mechanical probe.', memory, workspace: undefined })
  const controller = new AgentController({ id: 'mastra-code', storage, memory, agent, modes: [{ id: 'build', name: 'Build', availableTools: [] }], defaultModeId: 'build' })
  await controller.init()
  const mastra = new Mastra({ storage, agentControllers: { code: controller }, logger: false })
  const sessions = createSessions()
  sessions.rows.set(conversationA, { sessionId: conversationA, projectRepositoryId: repositoryOf[projectA], orgId: ORG, title: null, createdAt: new Date('2026-09-21T11:00:00.000Z') })
  const resolveFactoryProject = async ({ accountId: caller, projectRepositoryId }) => {
    const projectId = Object.keys(repositoryOf).find((id) => repositoryOf[id] === projectRepositoryId)
    return projectId && admittedProjects[caller]?.includes(projectId) ? projectId : null
  }
  const readFactoryBinding = async ({ accountId: caller, projectId }) => {
    if (!admittedProjects[caller]?.includes(projectId)) throw new Error('NOT_AUTHORIZED')
    return { projectId, projectRepositoryId: repositoryOf[projectId], defaultBranch: 'main' }
  }
  const reachedContexts = []
  const resolveCurrentSession = async (request) => request.cookies['__Host-conexus_session']
    ? { account: { accountId, displayName: 'Operator' }, issuer: 'https://issuer.test', subject: 'subject-1' }
    : null
  const app = await createHttpApp({
    registerRoutes: async (instance) => {
      instance.addHook('onResponse', async (request) => {
        if (request.requestContext) reachedContexts.push({ url: request.url, user: request.requestContext.get('user') })
      })
      await registerFactoryMastraRoutes(instance, {
        mastra, controllerId: 'code', controller, origin, orgId: ORG, resolveCurrentSession,
        admitConversation: admitFactoryConversation({ sessions, resolveFactoryProject }),
      })
      return registerFactoryConversationRoutes(instance, {
        readFactoryBinding, sessions, orgId: ORG, origin, resolveCurrentSession, openThread: openFactoryConversationThread({ controller, orgId: ORG }),
      })
    },
    staticRoot: null,
  })
  t.after(async () => {
    await app.close()
    await controller.destroy()
    await storage.close()
    rmSync(root, { recursive: true, force: true })
  })
  return { app, sessions, reachedContexts }
}

const authentic = {
  headers: { origin, 'x-conexus-csrf': 'csrf-1', 'content-type': 'application/json' },
  cookies: { '__Host-conexus_session': 'session-1', '__Host-conexus_csrf': 'csrf-1' },
}
const sessionBase = (conversationId = conversationA) => `/api/mastra-factory/agent-controller/code/sessions/${conversationId}`

test('a browser-supplied requestContext is refused on the Factory mount', async (t) => {
  const { app } = await createFactoryApp(t)
  const forged = await app.inject({ method: 'POST', url: `${sessionBase()}/abort`, ...authentic, payload: { requestContext: { user: { id: accountB, organizationId: ORG } } } })
  assert.equal(forged.statusCode, 400)
  assert.equal(forged.json().type.endsWith('request-context-refused'), true)
  const queried = await app.inject({ method: 'GET', url: `${sessionBase()}/threads?requestContext=${encodeURIComponent(JSON.stringify({ user: { id: accountB } }))}`, ...authentic })
  assert.equal(queried.statusCode, 400)
})

test('a conversation of Project A is refused to an Account admitted only to Project B', async (t) => {
  const { app } = await createFactoryApp(t, { accountId: accountB })
  const response = await app.inject({ method: 'GET', url: `${sessionBase()}/threads`, ...authentic })
  assert.equal(response.statusCode, 403)
  const unknown = await app.inject({ method: 'GET', url: `${sessionBase(randomUUID())}/threads`, ...authentic })
  assert.equal(unknown.statusCode, 403)
})

test('the Factory mount answers the admitted Account with the Hub-set caller identity', async (t) => {
  const { app, reachedContexts } = await createFactoryApp(t)
  const response = await app.inject({ method: 'GET', url: `${sessionBase()}/threads`, ...authentic })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(reachedContexts.find((entry) => entry.url.startsWith(sessionBase()))?.user, { id: accountA, organizationId: ORG })
})

test('only the Factory controller id is served, and the browser may not create or switch threads', async (t) => {
  const { app } = await createFactoryApp(t)
  assert.equal((await app.inject({ method: 'GET', url: `/api/mastra-factory/agent-controller/mastra-code/sessions/${conversationA}/threads`, ...authentic })).statusCode, 404)
  assert.equal((await app.inject({ method: 'POST', url: `${sessionBase()}/threads`, ...authentic, payload: { title: 'x' } })).statusCode, 404)
  assert.equal((await app.inject({ method: 'POST', url: `${sessionBase()}/thread`, ...authentic, payload: { threadId: conversationA } })).statusCode, 404)
})

test('a state-changing request without CSRF is refused on both the mount and the conversation route', async (t) => {
  const { app, sessions } = await createFactoryApp(t)
  const withoutCsrf = { headers: { origin, 'content-type': 'application/json' }, cookies: { '__Host-conexus_session': 'session-1' } }
  assert.equal((await app.inject({ method: 'POST', url: `${sessionBase()}/abort`, ...withoutCsrf, payload: {} })).statusCode, 403)
  const created = await app.inject({ method: 'POST', url: `/api/control/projects/${projectA}/conversations`, ...withoutCsrf, payload: { conversationId: randomUUID() } })
  assert.equal(created.statusCode, 403)
  assert.deepEqual(sessions.created, [])
})

test('a conversation is a Factory session row on its own branch, and a retry returns the same row', async (t) => {
  const { app, sessions } = await createFactoryApp(t)
  const conversationId = randomUUID()
  const first = await app.inject({ method: 'POST', url: `/api/control/projects/${projectA}/conversations`, ...authentic, payload: { conversationId, title: 'Contador' } })
  assert.equal(first.statusCode, 201)
  assert.deepEqual(first.json(), { conversation: { conversationId, title: 'Contador', createdAt: '2026-09-21T12:00:00.000Z' } })
  assert.deepEqual(sessions.created, [{
    sessionId: conversationId, projectRepositoryId: 'project-repository-a', orgId: ORG, userId: accountA,
    branch: `conexus/${conversationId}`, baseBranch: 'main', title: 'Contador', visibility: 'org',
  }])
  const retried = await app.inject({ method: 'POST', url: `/api/control/projects/${projectA}/conversations`, ...authentic, payload: { conversationId, title: 'Contador' } })
  assert.equal(retried.statusCode, 200)
  assert.deepEqual(retried.json(), first.json())
  assert.equal(sessions.created.length, 1)

  const listed = await app.inject({ method: 'GET', url: `/api/control/projects/${projectA}/conversations`, ...authentic })
  assert.deepEqual(listed.json().conversations.map((entry) => entry.conversationId), [conversationId, conversationA])
})

test('the conversation routes refuse a Project the Account may not build, and an id another Project holds', async (t) => {
  const { app } = await createFactoryApp(t, { accountId: accountB })
  assert.equal((await app.inject({ method: 'GET', url: `/api/control/projects/${projectA}/conversations`, ...authentic })).statusCode, 403)
  const clash = await app.inject({ method: 'POST', url: `/api/control/projects/${projectB}/conversations`, ...authentic, payload: { conversationId: conversationA } })
  assert.equal(clash.statusCode, 409)
})

test('creating a conversation opens its Mastra thread, so the browser session reads and sets the model on that thread', async (t) => {
  const { app } = await createFactoryApp(t)
  const conversationId = randomUUID()
  const created = await app.inject({ method: 'POST', url: `/api/control/projects/${projectA}/conversations`, ...authentic, payload: { conversationId } })
  assert.equal(created.statusCode, 201)
  const threads = await app.inject({ method: 'GET', url: `${sessionBase(conversationId)}/threads`, ...authentic })
  assert.equal(threads.statusCode, 200)
  assert.deepEqual(threads.json().threads.map((thread) => thread.id), [conversationId])
  const retried = await app.inject({ method: 'POST', url: `/api/control/projects/${projectA}/conversations`, ...authentic, payload: { conversationId } })
  assert.equal(retried.statusCode, 200)
  const again = await app.inject({ method: 'GET', url: `${sessionBase(conversationId)}/threads`, ...authentic })
  assert.deepEqual(again.json().threads.map((thread) => thread.id), [conversationId])
})
