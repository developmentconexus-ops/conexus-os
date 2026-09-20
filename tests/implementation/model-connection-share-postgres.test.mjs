import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import pg from 'pg'
import { runHubMigrations } from '../../scripts/run-hub-migrations.mjs'
import { refuseProtectedCluster } from './protected-cluster.mjs'

// Whether an owned connection is shared is decided against a real database, because the decision is
// model_connection.list_connections's. The regression this file exists for: an owner row's
// workspace_id is a Workspace the owner can see, not one the connection is in, and Settings read it
// as a share and offered to withdraw one that model_connection.workspace_share never held.

const configured = ['CONEXUS_TEST_DB_HOST', 'CONEXUS_TEST_DB_PORT', 'CONEXUS_TEST_DB_NAME', 'CONEXUS_TEST_DB_USER', 'CONEXUS_TEST_DB_PASSWORD'].every((name) => process.env[name])
const repositoryRoot = resolve(import.meta.dirname, '../..')
const origin = 'https://hub.test'
const connect = async (connection) => { const client = new pg.Client(connection); await client.connect(); return client }

const compileHub = (t) => {
  const build = mkdtempSync(resolve(repositoryRoot, 'apps/hub/model-connection-share-build-'))
  t.after(() => rmSync(build, { recursive: true, force: true }))
  const compiled = spawnSync(process.execPath, [
    resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'), '--project',
    resolve(repositoryRoot, 'apps/hub/tsconfig.json'), '--noEmit', 'false', '--outDir', build,
  ], { cwd: repositoryRoot, encoding: 'utf8' })
  assert.equal(compiled.status, 0, `${compiled.stdout}\n${compiled.stderr}`)
  return (path) => pathToFileURL(resolve(build, path)).href
}

test('an owned connection is listed once per visible Workspace, and only shared says which ones hold it', {
  skip: configured ? false : 'real PostgreSQL configuration not supplied',
}, async (t) => {
  await refuseProtectedCluster()
  const built = compileHub(t)
  const admin = {
    host: process.env.CONEXUS_TEST_DB_HOST, port: Number(process.env.CONEXUS_TEST_DB_PORT),
    database: process.env.CONEXUS_TEST_DB_NAME, user: process.env.CONEXUS_TEST_DB_USER, password: process.env.CONEXUS_TEST_DB_PASSWORD,
  }
  const database = `conexus_connection_share_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 8)}`
  const ownerClient = await connect(admin)
  await ownerClient.query(`CREATE DATABASE "${database}"`)
  const current = { ...admin, database }
  let adminClient
  const closeable = []
  t.after(async () => {
    for (const item of closeable) await item.close().catch(() => {})
    await adminClient?.end()
    await ownerClient.query(`DROP DATABASE "${database}" WITH (FORCE)`); await ownerClient.end()
  })
  const connectionString = new URL('postgresql://localhost')
  connectionString.hostname = current.host; connectionString.port = String(current.port)
  connectionString.pathname = `/${database}`; connectionString.username = current.user; connectionString.password = current.password
  await runHubMigrations({ connectionString: connectionString.toString() })

  const secretRoot = mkdtempSync(resolve(tmpdir(), 'conexus-connection-share-'))
  t.after(() => rmSync(secretRoot, { recursive: true, force: true }))
  const passwordFile = resolve(secretRoot, 'model-connection-password')
  writeFileSync(passwordFile, 'share-model-connection\n', 'utf8')

  adminClient = await connect(current)
  await adminClient.query("ALTER ROLE hub_model_connection PASSWORD 'share-model-connection'")

  const ownerId = randomUUID(); const memberId = randomUUID()
  const oficina = randomUUID(); const estudio = randomUUID()
  const account = async (accountId, name) => adminClient.query('INSERT INTO iam.account(account_id, issuer, external_subject, display_name) VALUES ($1,$2,$3,$4)', [accountId, 'https://share.test', accountId, name])
  const workspace = async (workspaceId, name) => adminClient.query('INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1,$2)', [workspaceId, name])
  const membership = async (accountId, workspaceId, role) => adminClient.query('INSERT INTO iam.workspace_membership(account_id, workspace_id, role) VALUES ($1,$2,$3)', [accountId, workspaceId, role])
  await account(ownerId, 'Leandro'); await account(memberId, 'Colega')
  await workspace(oficina, 'Oficina'); await workspace(estudio, 'Estúdio')
  await membership(ownerId, oficina, 'owner'); await membership(ownerId, estudio, 'owner')
  await membership(memberId, oficina, 'member')

  let actor = ownerId
  const { createHttpApp } = await import(built('http/app.js'))
  const { createModelConnectionModule } = await import(built('model-connection-account/module.js'))
  const module = createModelConnectionModule({
    database: { host: current.host, port: current.port, database },
    passwordFile,
    credentialBackend: { publishOrMatch: async () => undefined, materialize: async () => Buffer.alloc(0) },
    origin,
    resolveCurrentSession: async () => ({ account: { accountId: actor } }),
  })
  closeable.push(module)
  const app = await createHttpApp({ registerRoutes: (instance) => module.registerRoutes(instance), staticRoot: null })
  closeable.push(app)

  const authentic = {
    headers: { origin, 'x-conexus-csrf': 'csrf-1', 'content-type': 'application/json' },
    cookies: { '__Host-conexus_session': 'session-1', '__Host-conexus_csrf': 'csrf-1' },
  }
  const listAs = async (accountId) => {
    actor = accountId
    const response = await app.inject({ method: 'GET', url: '/api/control/me/model-connections', cookies: authentic.cookies })
    assert.equal(response.statusCode, 200)
    return response.json().connections
  }
  const post = async (accountId, path, payload) => {
    actor = accountId
    const response = await app.inject({ method: 'POST', url: `/api/control/me/model-connections/${path}`, ...authentic, payload })
    assert.equal(response.statusCode, 204, response.body)
  }

  const connectionId = randomUUID()
  assert.equal((await adminClient.query('SELECT model_connection.publish_connection($1,$2,$3,$4,$5,$6) AS value', [ownerId, connectionId, 'anthropic', 'OAUTH_TOKEN_SET', 'Meu Claude', 1])).rows[0].value, true)
  assert.equal((await adminClient.query('SELECT model_connection.select_connection($1,$2) AS value', [ownerId, connectionId])).rows[0].value, true)

  const ownerRow = (workspaceId, shared) => ({
    connectionId, label: 'Meu Claude', state: 'ACTIVE', generation: '1',
    ownerAccountId: ownerId, workspaceId, role: 'OWNER', revokedAt: null,
    providerId: 'anthropic', credentialKind: 'OAUTH_TOKEN_SET', selected: true, shared,
  })
  const memberRow = (workspaceId) => ({
    connectionId, label: 'Meu Claude', state: 'ACTIVE', generation: '1',
    ownerAccountId: ownerId, workspaceId, role: 'USER', revokedAt: null,
    providerId: 'anthropic', credentialKind: 'OAUTH_TOKEN_SET', selected: false, shared: true,
  })
  const byWorkspace = (rows) => [...rows].sort((left, right) => left.workspaceId.localeCompare(right.workspaceId))
  const bothWorkspaces = byWorkspace([ownerRow(oficina, false), ownerRow(estudio, false)])

  assert.deepEqual(byWorkspace(await listAs(ownerId)), bothWorkspaces)
  assert.deepEqual(await listAs(memberId), [])

  await post(ownerId, 'share', { connectionId, workspaceId: oficina })
  assert.deepEqual(byWorkspace(await listAs(ownerId)), byWorkspace([ownerRow(oficina, true), ownerRow(estudio, false)]))
  assert.deepEqual(await listAs(memberId), [memberRow(oficina)])

  await post(ownerId, 'unshare', { connectionId, workspaceId: oficina })
  assert.deepEqual(await listAs(memberId), [])
  assert.deepEqual(byWorkspace(await listAs(ownerId)), bothWorkspaces)
})
