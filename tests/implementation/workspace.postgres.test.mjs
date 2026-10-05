import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { test } from 'node:test'
import pg from 'pg'
import { z } from 'zod'
import { buildHubDatabase, givePasswordToHubRuntime, query } from './hub-database.mjs'
import { hubModuleUrl } from './hub-build.mjs'

const { openDatabase, sql } = await import(hubModuleUrl('platform/db.js'))
const { createWorkspaceStore } = await import(hubModuleUrl('workspace/store.js'))
const { admitAccount, admitWorkspace } = await import(hubModuleUrl('identity-access/admission.js'))

const ACCOUNT = '10000000-0000-4000-8000-000000000001'
const MEMBER = '10000000-0000-4000-8000-000000000002'
const OUTSIDER = '10000000-0000-4000-8000-000000000003'
const PASSWORD = 'workspace-test-only'

const refusedByPostgres = (error) => {
  assert.equal(error.id, 'INTERNAL_UNEXPECTED')
  assert.equal(error.cause.code, '42501')
  return true
}

const leakSessionSettings = async (connection) => {
  await query(connection, `ALTER ROLE hub_runtime IN DATABASE "${connection.database}" SET conexus.scope = 'system'`)
  await query(connection, `ALTER ROLE hub_runtime IN DATABASE "${connection.database}" SET conexus.account_id = '${ACCOUNT}'`)
}

const setup = async (t) => {
  const fixture = await buildHubDatabase(t, 'conexus_workspace')
  await givePasswordToHubRuntime(fixture.connection, fixture.onCleanup, 'workspace-test-only')
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
  await assert.rejects(store.createWorkspace({ accountId: ACCOUNT, idempotencyKey: 'failed', body: { name: 'Failed' } }), refusedByPostgres)
  const rows = await query(connection, `SELECT
    (SELECT count(*)::integer FROM workspace.workspace) AS workspaces,
    (SELECT count(*)::integer FROM platform.operation_receipt) AS receipts`)
  assert.deepEqual(rows.rows, [{ workspaces: 0, receipts: 0 }])
})

test('workspace and receipt policies hide rows without an account and refuse an outsider write', async (t) => {
  const { connection, database, store } = await setup(t)
  await store.createWorkspace({ accountId: ACCOUNT, idempotencyKey: 'policy', body: { name: 'Operations' } })
  assert.deepEqual(await database.read(OUTSIDER, (tx) => tx.rows(z.object({ workspace_id: z.string() }), sql`SELECT workspace_id FROM workspace.workspace`)), [])
  await assert.rejects(database.transaction(OUTSIDER, (tx) => tx.run(sql`INSERT INTO workspace.workspace (workspace_id, name, created_by) VALUES (${randomUUID()}, 'Other', ${ACCOUNT})`)), refusedByPostgres)
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
  await assert.rejects(database.transaction(MEMBER, (tx) => tx.run(sql`UPDATE workspace.workspace SET name = 'Taken' WHERE workspace_id = ${workspaceId}`)), refusedByPostgres)
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

test('hub_runtime holds EXECUTE on the four project purges and on no owner helper', async (t) => {
  const { connection } = await setup(t)
  const runtime = { ...connection, user: 'hub_runtime', password: PASSWORD }
  const held = await query(connection, `SELECT proc.oid::regprocedure::text AS signature FROM pg_proc proc
    JOIN pg_namespace namespace ON namespace.oid = proc.pronamespace
    WHERE proc.proname = 'purge_project' AND namespace.nspname IN ('iam', 'builder', 'connector', 'reg')
      AND has_function_privilege('hub_runtime', proc.oid, 'EXECUTE') ORDER BY 1`)
  assert.deepEqual(held.rows.map((row) => row.signature), ['builder.purge_project(uuid)', 'connector.purge_project(uuid)', 'iam.purge_project(uuid)', 'reg.purge_project(uuid)'])
  await assert.rejects(query(runtime, 'SELECT iam.visible_projects($1)', [randomUUID()]), { code: '42501' })
  const ownerHeld = await query(connection, `SELECT count(*)::integer AS held FROM pg_proc proc
    WHERE proc.proname IN ('purge_project', 'register_project_repository') AND proc.pronamespace::regnamespace::text IN ('iam', 'builder', 'connector', 'reg')
      AND has_function_privilege('project_owner', proc.oid, 'EXECUTE')`)
  assert.deepEqual(ownerHeld.rows, [{ held: 0 }])
})

test('an admission proof for one account is refused inside the transaction of another', async (t) => {
  const { database, store } = await setup(t)
  const created = await store.createWorkspace({ accountId: ACCOUNT, idempotencyKey: 'mismatch', body: { name: 'Operations' } })
  const mismatch = (error) => {
    assert.equal(error.id, 'INTERNAL_UNEXPECTED')
    assert.equal(error.details.invariant, 'ADMITTED_ACCOUNT_IS_NOT_THE_TRANSACTION_ACCOUNT')
    return true
  }
  await assert.rejects(database.transaction(OUTSIDER, (tx) => admitAccount(tx, ACCOUNT)), mismatch)
  await assert.rejects(database.transaction(OUTSIDER, (tx) => admitWorkspace(tx, ACCOUNT, created.reply.workspaceId, 'workspace.read')), mismatch)
  await assert.rejects(database.read(OUTSIDER, (tx) => admitWorkspace(tx, ACCOUNT, created.reply.workspaceId, 'workspace.read')), mismatch)
  await assert.rejects(database.system('migration', (tx) => admitAccount(tx, ACCOUNT)), mismatch)
})

test('every entry sets both settings, so a session level scope never leaks into a person transaction', async (t) => {
  const { connection, database, store } = await setup(t)
  await leakSessionSettings(connection)
  await store.createWorkspace({ accountId: ACCOUNT, idempotencyKey: 'leak', body: { name: 'Operations' } })
  const settings = z.object({ scope: z.string(), account: z.string() })
  const read = (tx) => tx.one(settings, sql`SELECT current_setting('conexus.scope', true) AS scope, current_setting('conexus.account_id', true) AS account`, 'INTERNAL_UNEXPECTED')
  assert.deepEqual(await database.read(OUTSIDER, read), { scope: '', account: OUTSIDER })
  assert.deepEqual(await database.transaction(OUTSIDER, read), { scope: '', account: OUTSIDER })
  assert.deepEqual(await database.system('migration', read), { scope: 'system', account: '' })
  assert.deepEqual(await database.read(OUTSIDER, (tx) => tx.rows(z.object({ workspace_id: z.string() }), sql`SELECT workspace_id FROM workspace.workspace`)), [])
})

test('concurrent WS-01 calls with one key replay one answer for one body and conflict for another', async (t) => {
  const { connection, store } = await setup(t)
  const same = await Promise.all([1, 2].map(() => store.createWorkspace({ accountId: ACCOUNT, idempotencyKey: 'race', body: { name: 'Operations' } })))
  assert.deepEqual(same.map((call) => call.replayed).sort(), [false, true])
  assert.deepEqual(same[0].reply, same[1].reply)
  const different = await Promise.allSettled(['First', 'Second'].map((name) => store.createWorkspace({ accountId: ACCOUNT, idempotencyKey: 'race-other', body: { name } })))
  assert.deepEqual(different.map((outcome) => outcome.status).sort(), ['fulfilled', 'rejected'])
  assert.equal(different.find((outcome) => outcome.status === 'rejected').reason.id, 'IDEMPOTENCY_CONFLICT')
  const rows = await query(connection, 'SELECT count(*)::integer AS workspaces FROM workspace.workspace')
  assert.deepEqual(rows.rows, [{ workspaces: 2 }])
})

test('a revoke that commits first makes the waiting admission refuse', async (t) => {
  const { connection, database, store, onCleanup } = await setup(t)
  const created = await store.createWorkspace({ accountId: ACCOUNT, idempotencyKey: 'revoke-first', body: { name: 'Operations' } })
  const workspaceId = created.reply.workspaceId
  await query(connection, "INSERT INTO iam.workspace_membership(account_id, workspace_id, role) VALUES ($1, $2, 'member')", [MEMBER, workspaceId])
  const revoker = new pg.Client(connection)
  await revoker.connect()
  onCleanup(() => revoker.end())
  await revoker.query('BEGIN')
  await revoker.query('SELECT iam.remove_workspace_member($1, $2, $3)', [ACCOUNT, workspaceId, MEMBER])
  let settled = false
  const admission = database.transaction(MEMBER, (tx) => admitWorkspace(tx, MEMBER, workspaceId, 'workspace.read')).finally(() => { settled = true })
  admission.catch(() => undefined)
  await new Promise((resolve) => setTimeout(resolve, 100))
  assert.equal(settled, false)
  await revoker.query('COMMIT')
  await assert.rejects(admission, { id: 'WORKSPACE_NOT_FOUND' })
})

test('a deactivation that commits while the owner set is locked is seen by the admission that waited', async (t) => {
  const { connection, database, store, onCleanup } = await setup(t)
  const created = await store.createWorkspace({ accountId: ACCOUNT, idempotencyKey: 'owners', body: { name: 'Operations' } })
  const workspaceId = created.reply.workspaceId
  await query(connection, "INSERT INTO iam.workspace_membership(account_id, workspace_id, role) VALUES ($1, $2, 'owner')", [MEMBER, workspaceId])
  const holder = new pg.Client(connection)
  await holder.connect()
  onCleanup(() => holder.end())
  await holder.query('BEGIN')
  await holder.query("SELECT 1 FROM iam.workspace_membership WHERE workspace_id = $1 AND role = 'owner' FOR UPDATE", [workspaceId])
  const admission = database.transaction(ACCOUNT, (tx) => admitWorkspace(tx, ACCOUNT, workspaceId, 'members.manage'))
  await new Promise((resolve) => setTimeout(resolve, 100))
  await holder.query('UPDATE iam.account SET active = false WHERE account_id = $1', [MEMBER])
  await holder.query('COMMIT')
  const proof = await admission
  assert.deepEqual(proof.scope.owners.map((owner) => [owner.accountId, owner.active]), [[ACCOUNT, true], [MEMBER, false]])
})
