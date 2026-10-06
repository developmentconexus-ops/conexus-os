import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import pg from 'pg'
import { z } from 'zod'
import { addInstallationAdministrator, createWorkspace } from '@conexus/contract'
import { hubModuleUrl } from './hub-build.mjs'
import { query } from './hub-database.mjs'
import { ID, setupProjects } from './project-fixture.mjs'

const { sql, bindAccount } = await import(hubModuleUrl('platform/db.js'))
const { admitAccount, admitBootstrap, admitInstallationAdministrator, admitWorkspace, checkApplication, checkProject, configuredIdentity, receiptOf } = await import(hubModuleUrl('identity-access/admission.js'))
const { reserve } = await import(hubModuleUrl('platform/receipt.js'))

const Entry = z.object({ role: z.string(), isolation: z.string() })
const entryOf = (tx) => tx.one(Entry, sql`SELECT current_user AS role, (SELECT setting FROM pg_settings WHERE name = 'transaction_isolation') AS isolation`, 'INTERNAL_UNEXPECTED')
const gateRefused = { details: { invariant: 'GATE_ACTOR_REFUSED' } }
const seedApplication = (connection, projectId) =>
  query(connection, 'INSERT INTO iam.application(project_id, slug, created_by) VALUES ($1, $2, $3)', [projectId, `app-${randomUUID().slice(0, 8)}`, ID.owner])

test('authenticate runs as hub_command in READ COMMITTED and admits only once an account is bound, and only one account', async (t) => {
  const { connection, database, seedProject } = await setupProjects(t, 'conexus_iam_authenticate')
  const projectId = await seedProject('Atlas')
  await seedApplication(connection, projectId)
  let seen
  await database.authenticate(async (gate) => {
    await assert.rejects(admitAccount(gate), gateRefused)
    await assert.rejects(checkApplication(gate, projectId), gateRefused)
    bindAccount(gate, ID.member)
    bindAccount(gate, ID.member)
    assert.throws(() => bindAccount(gate, ID.owner), gateRefused)
    const proof = await admitAccount(gate)
    assert.deepEqual(proof.scope, { kind: 'account', accountId: ID.member })
    seen = await entryOf(proof.tx)
    assert.deepEqual((await checkApplication(gate, projectId)).scope, { kind: 'application', accountId: ID.member, projectId, via: 'membership' })
  })
  assert.deepEqual(seen, { role: 'hub_command', isolation: 'read committed' })
  await database.transaction(ID.member, async (gate) => {
    assert.throws(() => bindAccount(gate, ID.member), gateRefused)
  })
})

test('checkProject admits a member of the Project\'s Workspace and refuses an outsider, an inactive account and a Project in deletion', async (t) => {
  const { connection, database, seedProject } = await setupProjects(t, 'conexus_iam_check_project')
  const projectId = await seedProject('Atlas')
  const check = (accountId) => database.authenticate(async (gate) => {
    bindAccount(gate, accountId)
    return checkProject(gate, projectId)
  })
  const refused = { id: 'PROJECT_NOT_FOUND' }
  assert.deepEqual((await check(ID.member)).scope, { kind: 'project', accountId: ID.member, workspaceId: ID.workspace, projectId, action: 'project.read' })
  await assert.rejects(check(ID.outsider), refused)
  await query(connection, 'UPDATE iam.account SET active = false WHERE account_id = $1', [ID.member])
  await assert.rejects(check(ID.member), refused)
  await query(connection, 'UPDATE iam.account SET active = true WHERE account_id = $1', [ID.member])
  await query(connection, "INSERT INTO project.project_deletion(project_id, workspace_id, name, requested_by) VALUES ($1, $2, 'Atlas', $3)", [projectId, ID.workspace, ID.administrator])
  await assert.rejects(check(ID.member), refused)
})

test('the read admission of a Workspace answers an inactive member as an outsider, under hub_reader, and a command still answers ACCOUNT_INACTIVE', async (t) => {
  const { connection, database } = await setupProjects(t, 'conexus_iam_read_admission')
  const read = (accountId) => database.read(accountId, async (tx) => (await admitWorkspace(tx, ID.workspace, 'workspace.read')).scope.role)
  assert.equal(await read(ID.member), 'member')
  await assert.rejects(read(ID.outsider), { id: 'WORKSPACE_NOT_FOUND' })
  await query(connection, 'UPDATE iam.account SET active = false WHERE account_id = $1', [ID.member])
  await assert.rejects(read(ID.member), { id: 'WORKSPACE_NOT_FOUND' })
  await assert.rejects(database.transaction(ID.member, (gate) => admitWorkspace(gate, ID.workspace, 'project.create')), { id: 'ACCOUNT_INACTIVE' })
})

test('admitBootstrap answers null while any account exists, and a bootstrap proof of the configured pair on an empty installation', async (t) => {
  const { connection, database, onCleanup } = await setupProjects(t, 'conexus_iam_bootstrap')
  const identity = configuredIdentity({ issuer: 'https://keycloak.test/realms/conexus', subject: '00000000-0000-4000-8000-000000000001' })
  assert.equal(await database.authenticate((gate) => admitBootstrap(gate, identity)), null)
  await database.authenticate(async (gate) => {
    bindAccount(gate, ID.owner)
    await assert.rejects(admitBootstrap(gate, identity), gateRefused)
  })
  const admin = new pg.Client(connection)
  await admin.connect()
  onCleanup(() => admin.end())
  await admin.query('BEGIN')
  await admin.query('SET LOCAL session_replication_role = replica')
  await admin.query('DELETE FROM iam.account')
  await admin.query('COMMIT')
  const founded = await database.authenticate((gate) => admitBootstrap(gate, identity))
  assert.deepEqual(founded.scope, { kind: 'bootstrap', issuer: 'https://keycloak.test/realms/conexus', subject: '00000000-0000-4000-8000-000000000001' })
})

test('receiptOf derives the stored authority from the proof: a Workspace keeps its text, an administrator gets installation:account', async (t) => {
  const { connection, database } = await setupProjects(t, 'conexus_iam_receipt_of')
  const key = randomUUID()
  const authorities = async () => (await query(connection, 'SELECT operation_id, authority, account_id FROM platform.operation_receipt ORDER BY operation_id')).rows
  await database.transaction(ID.administrator, async (gate) => {
    const proof = await admitInstallationAdministrator(gate, 'administrators.manage')
    assert.deepEqual(receiptOf(proof).authority, { kind: 'installation', accountId: ID.administrator })
    await reserve(receiptOf(proof), addInstallationAdministrator, key, { params: undefined, query: undefined, body: { email: 'ana@x.com' } }, z.uuid())
  })
  await database.transaction(ID.owner, async (gate) => {
    const proof = await admitWorkspace(gate, ID.workspace, 'project.create')
    assert.deepEqual(receiptOf(proof).authority, { kind: 'workspace', workspaceId: ID.workspace, accountId: ID.owner })
    await reserve(receiptOf(await admitAccount(gate)), createWorkspace, key, { params: undefined, query: undefined, body: { name: 'W' } }, z.uuid())
  })
  assert.deepEqual(await authorities(), [
    { operation_id: 'addInstallationAdministrator', authority: `installation:account:${ID.administrator}`, account_id: ID.administrator },
    { operation_id: 'createWorkspace', authority: `account:${ID.owner}`, account_id: ID.owner },
  ])
})

test('a named session connection carries its name, takes the shared lock that a transaction lock waits on, and answers DATABASE_BUSY when it cannot get it', async (t) => {
  const { connection, database, onCleanup } = await setupProjects(t, 'conexus_iam_presence_session')
  const key = 4242n
  const admin = new pg.Client(connection)
  await admin.connect()
  onCleanup(() => admin.end())
  const names = async () => (await admin.query("SELECT application_name FROM pg_stat_activity WHERE datname = current_database() AND application_name LIKE 'conexus-hub:%-%' ORDER BY 1")).rows.map((row) => row.application_name)
  const holder = database.session('conexus-hub:application-presence', async (lock) => {
    await lock.advisoryLockShared(key)
    const seen = await names()
    const waited = await admin.query("SELECT pg_try_advisory_xact_lock($1) AS taken", [key])
    await lock.advisoryUnlockShared(key)
    const free = await admin.query("SELECT pg_try_advisory_xact_lock($1) AS taken", [key])
    return { seen, blocked: !waited.rows[0].taken, freed: free.rows[0].taken }
  })
  assert.deepEqual(await holder, { seen: ['conexus-hub:application-presence'], blocked: true, freed: true })
  await admin.query('BEGIN')
  await admin.query('SELECT pg_advisory_xact_lock($1)', [key])
  const started = Date.now()
  await assert.rejects(database.session('conexus-hub:application-presence', (lock) => lock.advisoryLockShared(key)), { id: 'DATABASE_BUSY' })
  await admin.query('ROLLBACK')
  assert.ok(Date.now() - started >= 4500, 'the wait is bounded by the login role\'s 5 s lock_timeout')
})
