import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { buildHubDatabase, givePasswordToHubRuntime, query } from './hub-database.mjs'
import { hubModuleUrl } from './hub-build.mjs'
import { hubSessionCookie, opaque, testListener } from './access/test-listener.mjs'

const { openDatabase } = await import(hubModuleUrl('platform/db.js'))
const { createIdentityAccessStore } = await import(hubModuleUrl('identity-access/store.js'))
const { createWorkspaceModule } = await import(hubModuleUrl('workspace/module.js'))
const { registerIdentityAccessRoutes } = await import(hubModuleUrl('identity-access/routes.js'))
const ACCOUNT = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const WORKSPACE = '33333333-3333-4333-8333-333333333333'
const TOKEN = opaque('operator')

const oidc = Object.freeze({
  begin: async () => { throw new Error('not used') },
  complete: async () => { throw new Error('not used') },
})

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
  await query(fixture.connection, "INSERT INTO workspace.workspace(workspace_id, name, created_by) VALUES ($1, 'Operations', $2)", [WORKSPACE, ACCOUNT])
  await query(fixture.connection, "INSERT INTO iam.workspace_membership(account_id, workspace_id, role) VALUES ($1, $2, 'owner')", [ACCOUNT, WORKSPACE])
  const store = createIdentityAccessStore({ pool: {}, workspaceReader: createWorkspaceModule({ database }) })
  assert.deepEqual(await store.listAccessibleWorkspaces(ACCOUNT), [{ workspaceId: WORKSPACE, name: 'Operations' }])
  assert.deepEqual(await store.listAccessibleWorkspaces(OTHER), [])

  const current = Object.freeze({ account: { accountId: ACCOUNT, displayName: 'Owner' }, issuer: 'https://issuer.test', subject: 'owner' })
  const { app } = await testListener({
    sessions: { [TOKEN]: current },
    registerRoutes: (server) => registerIdentityAccessRoutes(server, {
      store, workspaceReader: store, oidc,
      config: { origin: 'https://conexus.test', bootstrapIssuer: current.issuer, bootstrapSubject: current.subject },
    }),
  })
  t.after(() => app.close())
  const response = await app.inject({ method: 'GET', url: '/api/control/access-context', headers: { cookie: hubSessionCookie(TOKEN) } })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json().workspaces, [{ workspaceId: WORKSPACE, name: 'Operations' }])

  await query(fixture.connection, 'UPDATE iam.account SET active = false WHERE account_id = $1', [ACCOUNT])
  assert.deepEqual(await store.listAccessibleWorkspaces(ACCOUNT), [], 'a deactivated account lists nothing although its membership remains')
  await query(fixture.connection, 'UPDATE iam.account SET active = true WHERE account_id = $1', [ACCOUNT])
  assert.deepEqual(await store.listAccessibleWorkspaces(ACCOUNT), [{ workspaceId: WORKSPACE, name: 'Operations' }])

  await query(fixture.connection, 'DELETE FROM iam.workspace_membership WHERE account_id = $1 AND workspace_id = $2', [ACCOUNT, WORKSPACE])
  assert.deepEqual(await store.listAccessibleWorkspaces(ACCOUNT), [])
})
