import assert from 'node:assert/strict'
import { test } from 'node:test'
import pg from 'pg'
import { z } from 'zod'
import { hubModuleUrl } from './hub-build.mjs'
import { waitUntilBlocked } from './race.mjs'
import { query } from './hub-database.mjs'
import { openRuntimeFixture } from './hub-runtime-fixture.mjs'

const { sql } = await import(hubModuleUrl('platform/db.js'))
const { createWorkspaceStore } = await import(hubModuleUrl('workspace/store.js'))
const { admitAccount, admitSystem, admitWorkspace } = await import(hubModuleUrl('identity-access/admission.js'))

const ACCOUNT = '10000000-0000-4000-8000-000000000001'
const MEMBER = '10000000-0000-4000-8000-000000000002'
const OUTSIDER = '10000000-0000-4000-8000-000000000003'

const refusedByPostgres = (error) => {
  assert.equal(error.id, 'INTERNAL_UNEXPECTED')
  assert.equal(error.cause.code, '42501')
  return true
}

const setup = async (t) => {
  const fixture = await openRuntimeFixture(t, 'conexus_workspace', { accounts: [[ACCOUNT, 'owner'], [MEMBER, 'member'], [OUTSIDER, 'outsider']] })
  return { ...fixture, store: createWorkspaceStore(fixture.database) }
}

test('WS-01 creates one workspace and owner, replays its answer, and refuses a changed request', async (t) => {
  const { connection, store } = await setup(t)
  const first = await store.createWorkspace({ accountId: ACCOUNT, idempotencyKey: 'one', body: { name: 'Operations' } })
  assert.equal(first.replayed, false)
  assert.deepEqual(first.reply, { workspaceId: first.reply.workspaceId, name: 'Operations', creatorAccountId: ACCOUNT, initialAccessEstablished: true })
  assert.deepEqual(await store.createWorkspace({ accountId: ACCOUNT, idempotencyKey: 'one', body: { name: 'Operations' } }), { replayed: true, reply: first.reply })
  await assert.rejects(store.createWorkspace({ accountId: ACCOUNT, idempotencyKey: 'one', body: { name: 'Changed' } }), { id: 'IDEMPOTENCY_CONFLICT' })
  const rows = await query(connection, `SELECT m.account_id, m.role, r.state FROM workspace.workspace w
    JOIN iam.workspace_membership m ON m.workspace_id = w.workspace_id
    JOIN platform.operation_receipt r ON r.resource_id = w.workspace_id`)
  assert.deepEqual(rows.rows, [{ account_id: ACCOUNT, role: 'owner', state: 'completed' }])
  assert.deepEqual(await store.list(ACCOUNT), [{ workspace_id: first.reply.workspaceId, name: 'Operations' }])
  assert.deepEqual(await store.list(OUTSIDER), [])
})

test('WS-01 rolls back both inserts and the receipt after a failed membership insert', async (t) => {
  const { connection, store } = await setup(t)
  await query(connection, 'REVOKE INSERT ON iam.workspace_membership FROM hub_command')
  await assert.rejects(store.createWorkspace({ accountId: ACCOUNT, idempotencyKey: 'failed', body: { name: 'Failed' } }), refusedByPostgres)
  const rows = await query(connection, `SELECT
    (SELECT count(*)::integer FROM workspace.workspace) AS workspaces,
    (SELECT count(*)::integer FROM platform.operation_receipt) AS receipts`)
  assert.deepEqual(rows.rows, [{ workspaces: 0, receipts: 0 }])
})

test('a workspace read shows only the workspaces of the acting account, and the login role alone reads nothing', async (t) => {
  const { database, runtime, store } = await setup(t)
  await store.createWorkspace({ accountId: ACCOUNT, idempotencyKey: 'policy', body: { name: 'Operations' } })
  const rows = z.object({ workspace_id: z.string() })
  assert.deepEqual(await database.read(OUTSIDER, (tx) => tx.rows(rows, sql`SELECT workspace_id FROM workspace.workspace`)), [])
  assert.equal((await database.read(ACCOUNT, (tx) => tx.rows(rows, sql`SELECT workspace_id FROM workspace.workspace`))).length, 1)
  await assert.rejects(query(runtime, 'SELECT count(*) FROM workspace.workspace'), { code: '42501' })
  await assert.rejects(query(runtime, 'SELECT count(*) FROM platform.operation_receipt'), { code: '42501' })
})

test('the command role cannot update or delete a workspace, change a receipt key, or read the receipt as a reader', async (t) => {
  const { connection, database, store } = await setup(t)
  const created = await store.createWorkspace({ accountId: ACCOUNT, idempotencyKey: 'commands', body: { name: 'Operations' } })
  const workspaceId = created.reply.workspaceId
  const named = () => query(connection, 'SELECT name FROM workspace.workspace').then((result) => result.rows)
  const inCommand = (statement) => database.transaction(ACCOUNT, async (gate) => (await admitAccount(gate)).tx.run(statement))
  await assert.rejects(inCommand(sql`DELETE FROM workspace.workspace WHERE workspace_id = ${workspaceId}`), refusedByPostgres)
  await assert.rejects(inCommand(sql`UPDATE workspace.workspace SET name = 'Taken' WHERE workspace_id = ${workspaceId}`), refusedByPostgres)
  await assert.rejects(inCommand(sql`UPDATE platform.operation_receipt SET account_id = ${OUTSIDER} WHERE resource_id = ${workspaceId}`), refusedByPostgres)
  assert.deepEqual(await named(), [{ name: 'Operations' }])
  await assert.rejects(database.read(ACCOUNT, (tx) => tx.rows(z.object({ state: z.string() }), sql`SELECT state FROM platform.operation_receipt`)), refusedByPostgres)
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
  const writer = database.transaction(MEMBER, async (gate) => {
    await admitWorkspace(gate, workspaceId, 'workspace.read')
    admitted()
    await held
  })
  await entered
  let revoked = false
  const revoke = query(connection, 'SELECT iam.remove_workspace_member($1, $2, $3)', [ACCOUNT, workspaceId, MEMBER]).then(() => { revoked = true })
  await waitUntilBlocked(connection)
  assert.equal(revoked, false)
  release()
  await Promise.all([writer, revoke])
  await assert.rejects(database.transaction(MEMBER, (gate) => admitWorkspace(gate, workspaceId, 'workspace.read')), { id: 'WORKSPACE_NOT_FOUND' })
})

test('hub_command holds EXECUTE on the project purges and the tenure lock, and hub_runtime holds none of them', async (t) => {
  const { connection } = await setup(t)
  const held = (role) => query(connection, `SELECT proc.oid::regprocedure::text AS signature FROM pg_proc proc
    JOIN pg_namespace namespace ON namespace.oid = proc.pronamespace
    WHERE (proc.proname = 'purge_project' AND namespace.nspname IN ('iam', 'builder', 'connector', 'reg')
      OR proc.proname = 'lock_administrators' AND namespace.nspname = 'iam')
      AND has_function_privilege($1, proc.oid, 'EXECUTE') ORDER BY 1`, [role]).then((result) => result.rows.map((row) => row.signature))
  assert.deepEqual(await held('hub_command'), [
    'iam.lock_administrators()', 'iam.purge_project(uuid)', 'reg.purge_project(uuid)',
  ])
  assert.deepEqual(await held('hub_runtime'), [])
  assert.deepEqual(await held('project_owner'), [])
})

test('an admission reads its actor from the gate and refuses a gate of another kind', async (t) => {
  const { database, store } = await setup(t)
  const created = await store.createWorkspace({ accountId: ACCOUNT, idempotencyKey: 'actor', body: { name: 'Operations' } })
  const refused = (error) => error.id === 'INTERNAL_UNEXPECTED' && error.details?.invariant === 'GATE_ACTOR_REFUSED'
  await assert.rejects(database.system('project-purge', (gate) => admitAccount(gate)), refused)
  await assert.rejects(database.system('project-purge', (gate) => admitWorkspace(gate, created.reply.workspaceId, 'workspace.read')), refused)
  await assert.rejects(database.transaction(ACCOUNT, (gate) => admitSystem(gate, 'project-purge')), refused)
  await assert.rejects(database.system('iam-reaper', (gate) => admitSystem(gate, 'project-purge')),
    (error) => error.id === 'INTERNAL_UNEXPECTED' && error.details?.invariant === 'GATE_JOB_MISMATCH')
  const proof = await database.system('project-purge', (gate) => admitSystem(gate, 'project-purge'))
  assert.deepEqual(proof.scope, { kind: 'system', job: 'project-purge' })
  await assert.rejects(proof.tx.rows(z.object({ one: z.number() }), sql`SELECT 1 AS one`), { id: 'INTERNAL_UNEXPECTED' })
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
  const admission = database.transaction(MEMBER, (gate) => admitWorkspace(gate, workspaceId, 'workspace.read')).finally(() => { settled = true })
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
  const admission = database.transaction(ACCOUNT, (gate) => admitWorkspace(gate, workspaceId, 'members.manage'))
  await new Promise((resolve) => setTimeout(resolve, 100))
  await holder.query('UPDATE iam.account SET active = false WHERE account_id = $1', [MEMBER])
  await holder.query('COMMIT')
  const proof = await admission
  assert.deepEqual(proof.scope.owners.map((owner) => [owner.accountId, owner.active]), [[ACCOUNT, true], [MEMBER, false]])
})

test('grantCreatorMembership founds only an empty workspace', async (t) => {
  const { connection, database, store } = await setup(t)
  const created = await store.createWorkspace({ accountId: ACCOUNT, idempotencyKey: 'founded', body: { name: 'Operations' } })
  const { grantCreatorMembership } = await import(hubModuleUrl('identity-access/admission.js'))
  await assert.rejects(database.transaction(OUTSIDER, async (gate) => grantCreatorMembership(await admitAccount(gate), created.reply.workspaceId)),
    (error) => error.id === 'INTERNAL_UNEXPECTED' && error.details?.invariant === 'WORKSPACE_ALREADY_FOUNDED')
  assert.deepEqual((await query(connection, 'SELECT account_id FROM iam.workspace_membership')).rows, [{ account_id: ACCOUNT }])
})
