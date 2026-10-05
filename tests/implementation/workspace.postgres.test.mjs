import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { z } from 'zod'
import { buildHubDatabase, query } from './hub-database.mjs'
import { hubModuleUrl } from './hub-build.mjs'

const { openDatabase, sql } = await import(hubModuleUrl('platform/db.js'))
const { createWorkspaceStore } = await import(hubModuleUrl('workspace/store.js'))
const { admitWorkspace } = await import(hubModuleUrl('identity-access/admission.js'))

const ACCOUNT = '10000000-0000-4000-8000-000000000001'
const MEMBER = '10000000-0000-4000-8000-000000000002'
const OUTSIDER = '10000000-0000-4000-8000-000000000003'
const PASSWORD = 'workspace-test-only'

const setup = async (t) => {
  const fixture = await buildHubDatabase(t, 'conexus_workspace')
  await query(fixture.connection, "ALTER ROLE hub_runtime PASSWORD 'workspace-test-only'")
  fixture.onCleanup(() => query(fixture.connection, 'ALTER ROLE hub_runtime PASSWORD NULL'))
  const directory = mkdtempSync(resolve(tmpdir(), 's1-workspace-'))
  fixture.onCleanup(() => rmSync(directory, { recursive: true, force: true }))
  const passwordFile = resolve(directory, 'password')
  writeFileSync(passwordFile, PASSWORD)
  chmodSync(passwordFile, 0o600)
  const database = openDatabase({ host: fixture.connection.host, port: fixture.connection.port, database: fixture.database, user: 'hub_runtime', passwordFile, max: 3 })
  fixture.onCleanup(() => database.close())
  await query(fixture.connection, `INSERT INTO iam.account(account_id, issuer, external_subject, display_name)
    VALUES ($1, 'https://issuer.test', 'owner', 'Owner'), ($2, 'https://issuer.test', 'member', 'Member'), ($3, 'https://issuer.test', 'outsider', 'Outsider')`, [ACCOUNT, MEMBER, OUTSIDER])
  return { ...fixture, database, store: createWorkspaceStore(database) }
}

test('WS-01 creates one workspace and owner, replays its answer, and refuses a changed request', async (t) => {
  const { connection, store } = await setup(t)
  const first = await store.createWorkspace({ accountId: ACCOUNT, idempotencyKey: 'one', body: { name: 'Operations' } })
  assert.equal(first.replayed, false)
  assert.deepEqual(first.reply, { workspaceId: first.reply.workspaceId, name: 'Operations', creatorAccountId: ACCOUNT, initialAccessEstablished: true })
  assert.deepEqual(await store.createWorkspace({ accountId: ACCOUNT, idempotencyKey: 'one', body: { name: 'Operations' } }), { replayed: true, reply: first.reply })
  await assert.rejects(store.createWorkspace({ accountId: ACCOUNT, idempotencyKey: 'one', body: { name: 'Changed' } }), { id: 'IDEMPOTENCY_CONFLICT' })
  const rows = await query(connection, `SELECT w.created_by, m.role, r.state FROM workspace.workspace w
    JOIN iam.workspace_membership m ON m.workspace_id = w.workspace_id
    JOIN platform.operation_receipt r ON r.resource_id = w.workspace_id`)
  assert.deepEqual(rows.rows, [{ created_by: ACCOUNT, role: 'owner', state: 'completed' }])
  assert.deepEqual(await store.list(ACCOUNT), [{ workspace_id: first.reply.workspaceId, name: 'Operations' }])
  assert.deepEqual(await store.list(OUTSIDER), [])
})

test('WS-01 rolls back both inserts and the receipt after a failed membership insert', async (t) => {
  const { connection, store } = await setup(t)
  await query(connection, 'REVOKE INSERT ON iam.workspace_membership FROM hub_runtime')
  await assert.rejects(store.createWorkspace({ accountId: ACCOUNT, idempotencyKey: 'failed', body: { name: 'Failed' } }), { id: 'INTERNAL_UNEXPECTED' })
  const rows = await query(connection, `SELECT
    (SELECT count(*)::integer FROM workspace.workspace) AS workspaces,
    (SELECT count(*)::integer FROM platform.operation_receipt) AS receipts`)
  assert.deepEqual(rows.rows, [{ workspaces: 0, receipts: 0 }])
})

test('workspace and receipt policies hide rows without an account and refuse an outsider write', async (t) => {
  const { connection, database, store } = await setup(t)
  await store.createWorkspace({ accountId: ACCOUNT, idempotencyKey: 'policy', body: { name: 'Operations' } })
  assert.deepEqual(await database.read(OUTSIDER, (tx) => tx.rows(z.object({ workspace_id: z.string() }), sql`SELECT workspace_id FROM workspace.workspace`)), [])
  await assert.rejects(database.transaction(OUTSIDER, (tx) => tx.run(sql`INSERT INTO workspace.workspace (workspace_id, name, created_by) VALUES (${randomUUID()}, 'Other', ${ACCOUNT})`)), { id: 'INTERNAL_UNEXPECTED' })
  const runtime = { ...connection, user: 'hub_runtime', password: PASSWORD }
  const noAccount = await query(runtime, 'SELECT count(*)::integer AS count FROM workspace.workspace')
  assert.deepEqual(noAccount.rows, [{ count: 0 }])
  assert.deepEqual((await query(runtime, 'SELECT count(*)::integer AS count FROM platform.operation_receipt')).rows, [{ count: 0 }])
})

test('a member cannot update or delete a workspace row and no account can delete a receipt', async (t) => {
  const { connection, database, store } = await setup(t)
  const created = await store.createWorkspace({ accountId: ACCOUNT, idempotencyKey: 'commands', body: { name: 'Operations' } })
  const workspaceId = created.reply.workspaceId
  await query(connection, "INSERT INTO iam.workspace_membership (workspace_id, account_id, role) VALUES ($1, $2, 'member')", [workspaceId, MEMBER])
  const named = () => query(connection, 'SELECT name FROM workspace.workspace').then((result) => result.rows)
  assert.equal(await database.transaction(MEMBER, (tx) => tx.run(sql`DELETE FROM workspace.workspace WHERE workspace_id = ${workspaceId}`)), 0)
  assert.equal(await database.transaction(ACCOUNT, (tx) => tx.run(sql`DELETE FROM workspace.workspace WHERE workspace_id = ${workspaceId}`)), 0)
  await assert.rejects(database.transaction(MEMBER, (tx) => tx.run(sql`UPDATE workspace.workspace SET name = 'Taken' WHERE workspace_id = ${workspaceId}`)), { id: 'INTERNAL_UNEXPECTED' })
  assert.deepEqual(await named(), [{ name: 'Operations' }])
  assert.equal(await database.transaction(ACCOUNT, (tx) => tx.run(sql`DELETE FROM platform.operation_receipt`)), 0)
  assert.equal(await database.transaction(OUTSIDER, (tx) => tx.run(sql`UPDATE platform.operation_receipt SET state = 'reserved'`)), 0)
  assert.equal(await database.transaction(ACCOUNT, (tx) => tx.run(sql`UPDATE platform.operation_receipt SET state = 'completed'`)), 1)
  assert.equal(await database.system('project-purge', (tx) => tx.run(sql`DELETE FROM platform.operation_receipt`)), 1)
})

test('a revoke waits for an admitted writer and the next admission is refused', async (t) => {
  const { connection, database, store } = await setup(t)
  const created = await store.createWorkspace({ accountId: ACCOUNT, idempotencyKey: 'revoke', body: { name: 'Operations' } })
  const workspaceId = created.reply.workspaceId
  await query(connection, "INSERT INTO iam.workspace_membership(account_id, workspace_id, role) VALUES ($1, $2, 'member')", [MEMBER, workspaceId])
  let release
  const held = new Promise((resolve) => { release = resolve })
  let admitted
  const entered = new Promise((resolve) => { admitted = resolve })
  const writer = database.transaction(MEMBER, async (tx) => {
    await admitWorkspace(tx, MEMBER, workspaceId, 'workspace.read')
    admitted()
    await held
  })
  await entered
  let revoked = false
  const revoke = query(connection, 'SELECT iam.remove_workspace_member($1, $2, $3)', [ACCOUNT, workspaceId, MEMBER]).then(() => { revoked = true })
  await new Promise((resolve) => setTimeout(resolve, 50))
  assert.equal(revoked, false)
  release()
  await Promise.all([writer, revoke])
  await assert.rejects(database.transaction(MEMBER, (tx) => admitWorkspace(tx, MEMBER, workspaceId, 'workspace.read')), { id: 'WORKSPACE_NOT_FOUND' })
})
