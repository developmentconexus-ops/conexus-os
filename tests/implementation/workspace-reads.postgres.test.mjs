import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { buildHubDatabase, givePasswordToHubRuntime, query } from './hub-database.mjs'
import { hubModuleUrl } from './hub-build.mjs'
import { hubSessionCookie, opaque, testListener } from './access/test-listener.mjs'

const { openDatabase } = await import(hubModuleUrl('platform/db.js'))
const { createWorkspaceModule } = await import(hubModuleUrl('workspace/module.js'))
const { createSessions } = await import(hubModuleUrl('identity-access/sessions.js'))
const ACCOUNT = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const WORKSPACE = '33333333-3333-4333-8333-333333333333'
const TOKEN = opaque('operator')

test('IAM-01 lists only active memberships through the workspace policy', async (t) => {
  const fixture = await buildHubDatabase(t, 'conexus_workspace_reads')
  await givePasswordToHubRuntime(fixture.connection, fixture.onCleanup, 'workspace-read-test-only')
  const directory = mkdtempSync(resolve(tmpdir(), 's1-workspace-read-'))
  fixture.onCleanup(() => rmSync(directory, { recursive: true, force: true }))
  const passwordFile = resolve(directory, 'password')
  writeFileSync(passwordFile, 'workspace-read-test-only')
  chmodSync(passwordFile, 0o600)
  const database = openDatabase({ host: fixture.connection.host, port: fixture.connection.port, database: fixture.database, user: 'hub_runtime', passwordFile })
  fixture.onCleanup(() => database.close())
  await query(fixture.connection, `INSERT INTO iam.account(account_id, issuer, external_subject, display_name)
    VALUES ($1, 'https://issuer.test', 'owner', 'Owner'), ($2, 'https://issuer.test', 'other', 'Other')`, [ACCOUNT, OTHER])
  await query(fixture.connection, "INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1, 'Operations')", [WORKSPACE])
  await query(fixture.connection, "INSERT INTO iam.workspace_membership(account_id, workspace_id, role) VALUES ($1, $2, 'owner')", [ACCOUNT, WORKSPACE])
  const store = createWorkspaceModule({ database })
  assert.deepEqual(await store.listAccessibleWorkspaces(ACCOUNT), [{ workspaceId: WORKSPACE, name: 'Operations' }])
  assert.deepEqual(await store.listAccessibleWorkspaces(OTHER), [])

  const current = Object.freeze({ account: { accountId: ACCOUNT, displayName: 'Owner' }, issuer: 'https://issuer.test', subject: 'owner' })
  const { app } = await testListener({
    sessions: { [TOKEN]: current },
    registerRoutes: (server) => createSessions({ database, envelope: {}, provider: {} }).registerRoutes(server, store),
  })
  t.after(() => app.close())
  const response = await app.inject({ method: 'GET', url: '/api/session', headers: { cookie: hubSessionCookie(TOKEN) } })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json().workspaces, [{ workspaceId: WORKSPACE, name: 'Operations' }])
  assert.equal(response.json().administrator, false)

  await query(fixture.connection, 'UPDATE iam.account SET active = false WHERE account_id = $1', [ACCOUNT])
  await assert.rejects(store.listAccessibleWorkspaces(ACCOUNT), { id: 'ACCOUNT_INACTIVE' })
  await query(fixture.connection, 'UPDATE iam.account SET active = true WHERE account_id = $1', [ACCOUNT])
  assert.deepEqual(await store.listAccessibleWorkspaces(ACCOUNT), [{ workspaceId: WORKSPACE, name: 'Operations' }])

  await query(fixture.connection, 'DELETE FROM iam.workspace_membership WHERE account_id = $1 AND workspace_id = $2', [ACCOUNT, WORKSPACE])
  assert.deepEqual(await store.listAccessibleWorkspaces(ACCOUNT), [])
})

test('membership ids and Workspace names share the account read snapshot', async (t) => {
  const { default: pg } = await import('pg')
  const { setupProjects, ID } = await import('./project-fixture.mjs')
  const { connection, database } = await setupProjects(t, 'conexus_workspace_snapshot')
  const module = createWorkspaceModule({ database })
  const original = pg.Client.prototype.query
  let changed = false
  pg.Client.prototype.query = async function (...args) {
    const text = typeof args[0] === 'string' ? args[0] : args[0]?.text
    if (!changed && /SELECT stored\.workspace_id, stored\.name FROM workspace\.workspace/.test(text ?? '')) {
      changed = true
      await query(connection, 'DELETE FROM iam.workspace_membership WHERE account_id = $1', [ID.member])
      await query(connection, "UPDATE workspace.workspace SET name = 'Renamed' WHERE workspace_id = $1", [ID.workspace])
    }
    return original.apply(this, args)
  }
  try {
    assert.deepEqual(await module.listAccessibleWorkspaces(ID.member), [{ workspaceId: ID.workspace, name: 'Operations' }])
    assert.equal(changed, true)
  } finally {
    pg.Client.prototype.query = original
  }
  assert.deepEqual(await module.listAccessibleWorkspaces(ID.member), [])
  assert.deepEqual(await module.listAccessibleWorkspaces(ID.administrator), [
    { workspaceId: ID.otherWorkspace, name: 'Elsewhere' }, { workspaceId: ID.workspace, name: 'Renamed' },
  ])
})
