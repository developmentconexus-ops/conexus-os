import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const hubBuild = mkdtempSync(resolve(repositoryRoot, 'apps/hub/r1-s2-reads-build-'))
process.once('exit', () => rmSync(hubBuild, { recursive: true, force: true }))
const compiled = spawnSync(process.execPath, [
  resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'),
  '--project', resolve(repositoryRoot, 'apps/hub/tsconfig.json'),
  '--noEmit', 'false', '--outDir', hubBuild,
], { encoding: 'utf8' })
if (compiled.status !== 0) throw new Error(`S2_HUB_COMPILE_FAILED\n${compiled.stdout}\n${compiled.stderr}`)
const built = (path) => pathToFileURL(resolve(hubBuild, path)).href
const { createHttpApp } = await import(built('http/app.js'))
const { registerIdentityAccessRoutes } = await import(built('identity-access/routes.js'))
const { createIdentityAccessStore } = await import(built('identity-access/store.js'))
const { createWorkspaceStore } = await import(built('workspace/store.js'))

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111'
const WORKSPACE_ID = '33333333-3333-4333-8333-333333333333'
const CURRENT = Object.freeze({
  account: { accountId: ACCOUNT_ID, displayName: 'Operator' },
  issuer: 'https://issuer.test',
  subject: 'bootstrap',
})

const fakePool = (respond = () => ({ rows: [] })) => {
  const calls = []
  let ends = 0
  const client = {
    async query(text, values) {
      const sql = String(text).trim()
      calls.push({ text: sql, values })
      return respond(sql, values)
    },
    release() { calls.push({ text: 'RELEASE' }) },
  }
  return {
    calls,
    get ends() { return ends },
    pool: {
      connect: async () => client,
      query: async (text, values) => respond(String(text), values),
      end: async () => { ends += 1 },
    },
  }
}

const oidc = Object.freeze({
  begin: async () => { throw new Error('not used') },
  complete: async () => { throw new Error('not used') },
})

test('IAM-01 returns the real membership-derived Workspace projection on creator re-entry', async (t) => {
  const identityPool = fakePool()
  const readPool = fakePool((sql) => sql.includes('list_workspace_summaries')
    ? { rows: [{ workspace_id: WORKSPACE_ID, name: 'Operations' }] }
    : { rows: [] })
  const store = createIdentityAccessStore({ pool: identityPool.pool, workspaceReadPool: readPool.pool })
  const app = await createHttpApp({
    registerRoutes: (server) => registerIdentityAccessRoutes(server, {
      store,
      workspaceReader: store,
      oidc,
      config: { origin: 'https://conexus.test', bootstrapIssuer: CURRENT.issuer, bootstrapSubject: CURRENT.subject },
      resolveCurrentSession: async () => CURRENT,
    }),
  })
  t.after(() => app.close())

  const response = await app.inject({ method: 'GET', url: '/api/control/access-context' })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), {
    account: CURRENT.account,
    workspaces: [{ workspaceId: WORKSPACE_ID, name: 'Operations' }],
    projects: [],
  })
  assert.deepEqual(readPool.calls.map(({ text }) => text === 'RELEASE' ? text : text.replace(/\s+/g, ' ')), [
    'BEGIN READ ONLY',
    'SELECT s.workspace_id, s.name FROM workspace.list_workspace_summaries( ARRAY(SELECT m.workspace_id FROM iam.list_workspace_memberships($1) m) ) s ORDER BY s.name, s.workspace_id',
    'COMMIT',
    'RELEASE',
  ])
  assert.deepEqual(readPool.calls[1].values, [ACCOUNT_ID])
  assert.equal(readPool.calls.filter(({ text }) => text.startsWith('SELECT')).length, 1)
})

test('IAM-01 discloses neither absent nor revoked membership and never reads before authentication', async (t) => {
  const identityPool = fakePool()
  const readPool = fakePool()
  const store = createIdentityAccessStore({ pool: identityPool.pool, workspaceReadPool: readPool.pool })
  const authenticated = await createHttpApp({
    registerRoutes: (server) => registerIdentityAccessRoutes(server, {
      store, workspaceReader: store, oidc,
      config: { origin: 'https://conexus.test', bootstrapIssuer: CURRENT.issuer, bootstrapSubject: CURRENT.subject },
      resolveCurrentSession: async () => CURRENT,
    }),
  })
  t.after(() => authenticated.close())
  const hidden = await authenticated.inject({ method: 'GET', url: '/api/control/access-context' })
  assert.equal(hidden.statusCode, 200)
  assert.deepEqual(hidden.json().workspaces, [])

  const callsAfterAuthenticatedRead = readPool.calls.length
  const unauthenticated = await createHttpApp({
    registerRoutes: (server) => registerIdentityAccessRoutes(server, {
      store, workspaceReader: store, oidc,
      config: { origin: 'https://conexus.test', bootstrapIssuer: CURRENT.issuer, bootstrapSubject: CURRENT.subject },
      resolveCurrentSession: async () => null,
    }),
  })
  t.after(() => unauthenticated.close())
  const denied = await unauthenticated.inject({ method: 'GET', url: '/api/control/access-context' })
  assert.equal(denied.statusCode, 401)
  assert.equal(readPool.calls.length, callsAfterAuthenticatedRead)
})

test('IAM-01 rolls back a failed read and releases the checked-out client', async () => {
  const identityPool = fakePool()
  const readPool = fakePool((sql) => {
    if (sql.includes('list_workspace_summaries')) throw new Error('read failed')
    return { rows: [] }
  })
  const store = createIdentityAccessStore({ pool: identityPool.pool, workspaceReadPool: readPool.pool })
  await assert.rejects(store.listAccessibleWorkspaces(ACCOUNT_ID), /read failed/)
  assert.deepEqual(readPool.calls.map(({ text }) => text), [
    'BEGIN READ ONLY',
    readPool.calls[1].text,
    'ROLLBACK',
    'RELEASE',
  ])
  assert.equal(readPool.calls.filter(({ text }) => text.startsWith('SELECT')).length, 1)
})

test('one shared pool object serves both operation-specific ports and I&A does not own its close', async () => {
  const identityPool = fakePool()
  const sharedReadPool = fakePool()
  const identityStore = createIdentityAccessStore({ pool: identityPool.pool, workspaceReadPool: sharedReadPool.pool })
  const workspaceStore = createWorkspaceStore({ commandPool: fakePool().pool, readPool: sharedReadPool.pool })

  await identityStore.listAccessibleWorkspaces(ACCOUNT_ID)
  await workspaceStore.getWorkspace({ accountId: ACCOUNT_ID, workspaceId: WORKSPACE_ID })
  assert.equal(sharedReadPool.calls.filter(({ text }) => text === 'BEGIN READ ONLY').length, 2)

  await identityStore.close()
  assert.equal(identityPool.ends, 1)
  assert.equal(sharedReadPool.ends, 0)

  const server = readFileSync(resolve(repositoryRoot, 'apps/hub/src/server.ts'), 'utf8')
  assert.match(server, /workspaceReadPool:\s*s2ReadPool/)
  const sharedWorkspacePool = /\breadPool:\s*s2ReadPool\s*[,}]/
  assert.match(server, sharedWorkspacePool)
  assert.doesNotMatch(server.replace('readPool: s2ReadPool,', 'readPool: unrelatedPool,'), sharedWorkspacePool)
  assert.match(server, /config\.database\.workspace\s*&&\s*s2ReadPool\s*\?\s*createWorkspaceModule/)
  assert.equal((server.match(/user:\s*'hub_s2_read'/g) ?? []).length, 1)
})
