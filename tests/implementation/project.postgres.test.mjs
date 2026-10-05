import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import pg from 'pg'
import { z } from 'zod'
import { query } from './hub-database.mjs'
import { hubModuleUrl } from './hub-build.mjs'
import { ID, PASSWORD, STARTER, setupProjects } from './project-fixture.mjs'

const { sql } = await import(hubModuleUrl('platform/db.js'))

const NEW = { name: 'Atlas', sourceBootstrap: { mode: 'NEW' } }
const create = (store, accountId, key, body = NEW, workspaceId = ID.workspace) => store.createProject({ accountId, workspaceId, idempotencyKey: key, body })
const names = (rows) => rows.map((row) => row.name)

test('PRJ-03 creates the project and its repository rows, replays its answer, and refuses a changed request', async (t) => {
  const { connection, store } = await setupProjects(t, 'conexus_prj03')
  const first = await create(store, ID.owner, 'one')
  assert.equal(first.replayed, false)
  assert.deepEqual(first.reply, { projectId: first.reply.projectId, workspaceId: ID.workspace, name: 'Atlas', projectRevision: first.reply.projectRevision, archived: false })
  assert.deepEqual(await create(store, ID.owner, 'one'), { replayed: true, reply: first.reply })
  await assert.rejects(create(store, ID.owner, 'one', { ...NEW, name: 'Changed' }), { id: 'IDEMPOTENCY_CONFLICT' })
  const rows = await query(connection, `SELECT p.name, p.source_revision, p.project_revision, r.state, r.operation_id,
    (SELECT count(*)::integer FROM builder.project_working_state WHERE project_id = p.project_id) AS working,
    (SELECT count(*)::integer FROM builder.project_repository WHERE project_id = p.project_id) AS repository
    FROM project.project p JOIN platform.operation_receipt r ON r.resource_id = p.project_id`)
  assert.deepEqual(rows.rows, [{ name: 'Atlas', source_revision: STARTER, project_revision: first.reply.projectRevision, state: 'completed', operation_id: 'PRJ-03', working: 1, repository: 1 }])
})

test('PRJ-03 with the same key and body in another workspace creates there', async (t) => {
  const { connection, store } = await setupProjects(t, 'conexus_prj03_other')
  await query(connection, "INSERT INTO iam.workspace_membership(account_id, workspace_id, role) VALUES ($1, $2, 'member')", [ID.owner, ID.otherWorkspace])
  const here = await create(store, ID.owner, 'shared')
  const there = await create(store, ID.owner, 'shared', NEW, ID.otherWorkspace)
  assert.equal(there.replayed, false)
  assert.notEqual(there.reply.projectId, here.reply.projectId)
  assert.equal(there.reply.workspaceId, ID.otherWorkspace)
})

test('PRJ-03 reaches the same project id after a crash between Git and completion', async (t) => {
  const prepared = []
  let failNext = true
  const { connection, store } = await setupProjects(t, 'conexus_prj03_crash', { repository: { prepare: async (projectId) => {
    prepared.push(projectId)
    if (failNext) { failNext = false; throw new Error('CONEXUS_GIT_UNREACHABLE') }
    return STARTER
  } } })
  await assert.rejects(create(store, ID.owner, 'crash'), { id: 'PROJECT_REPOSITORY_UNAVAILABLE', details: { reason: 'CONEXUS_GIT_UNREACHABLE' } })
  assert.deepEqual((await query(connection, 'SELECT state FROM platform.operation_receipt')).rows, [{ state: 'reserved' }])
  const retried = await create(store, ID.owner, 'crash')
  assert.equal(prepared.length, 2)
  assert.equal(prepared[0], prepared[1])
  assert.equal(retried.reply.projectId, prepared[0])
})

test('PRJ-03 refuses a retry after the account lost the workspace, an inactive account and a source it does not offer', async (t) => {
  const { connection, store } = await setupProjects(t, 'conexus_prj03_refused')
  await assert.rejects(create(store, ID.outsider, 'outsider'), { id: 'PROJECT_CREATE_DENIED' })
  await assert.rejects(create(store, ID.owner, 'git', { name: 'Atlas', sourceBootstrap: { mode: 'EXISTING_GIT', repositoryLocator: 'https://git.test/x' } }), { id: 'PROJECT_SOURCE_REFUSED' })
  assert.deepEqual((await query(connection, 'SELECT count(*)::integer AS receipts FROM platform.operation_receipt')).rows, [{ receipts: 0 }])
  const created = await create(store, ID.member, 'lost')
  await query(connection, 'DELETE FROM iam.workspace_membership WHERE account_id = $1', [ID.member])
  await assert.rejects(create(store, ID.member, 'lost'), { id: 'PROJECT_CREATE_DENIED' })
  assert.equal(created.replayed, false)
  await query(connection, 'UPDATE iam.account SET active = false WHERE account_id = $1', [ID.owner])
  await assert.rejects(create(store, ID.owner, 'inactive'), { id: 'ACCOUNT_INACTIVE' })
})

test('a revoke that commits first refuses PRJ-03, and a revoke that waits for it lets it finish', async (t) => {
  const { connection, store, onCleanup } = await setupProjects(t, 'conexus_prj03_revoke')
  const revoker = new pg.Client(connection)
  await revoker.connect()
  onCleanup(() => revoker.end())
  await revoker.query('BEGIN')
  await revoker.query('SELECT iam.remove_workspace_member($1, $2, $3)', [ID.owner, ID.workspace, ID.member])
  let settled = false
  const waiting = create(store, ID.member, 'revoked-first').finally(() => { settled = true })
  waiting.catch(() => undefined)
  await new Promise((resolve) => setTimeout(resolve, 150))
  assert.equal(settled, false)
  await revoker.query('COMMIT')
  await assert.rejects(waiting, { id: 'PROJECT_CREATE_DENIED' })

  await query(connection, "INSERT INTO iam.workspace_membership(account_id, workspace_id, role) VALUES ($1, $2, 'member')", [ID.member, ID.workspace])
  const writer = new pg.Client(connection)
  await writer.connect()
  onCleanup(() => writer.end())
  const created = await create(store, ID.member, 'admitted-first')
  assert.equal(created.replayed, false)
  const removal = await query(connection, 'SELECT iam.remove_workspace_member($1, $2, $3)', [ID.owner, ID.workspace, ID.member])
  assert.equal(removal.rowCount, 1)
  await assert.rejects(create(store, ID.member, 'after-revoke'), { id: 'PROJECT_CREATE_DENIED' })
})

const states = {
  live: async () => undefined,
  tombstoned: async ({ connection }, projectId) => query(connection, `INSERT INTO project.project_deletion(project_id, workspace_id, name, requested_by) VALUES ($1, $2, 'Atlas', $3)`, [projectId, ID.workspace, ID.administrator]),
  purged: async ({ connection }, projectId) => {
    await query(connection, 'DELETE FROM builder.builder_run WHERE project_id = $1', [projectId])
    await query(connection, 'DELETE FROM builder.project_working_state WHERE project_id = $1', [projectId])
    await query(connection, 'DELETE FROM builder.project_repository WHERE project_id = $1', [projectId])
    await query(connection, 'DELETE FROM project.project WHERE project_id = $1', [projectId])
    await query(connection, 'UPDATE project.project_deletion SET purged_at = now() WHERE project_id = $1', [projectId])
  },
  completed: async ({ connection }, projectId) => {
    await query(connection, 'UPDATE project.project_deletion SET completed_at = clock_timestamp() WHERE project_id = $1', [projectId])
  },
}

const readsOf = async ({ store }, accountId, projectId) => ({
  list: names(await store.listProjects({ accountId, workspaceId: ID.workspace })),
  detail: await store.getProject({ accountId, projectId }),
  cards: (await store.listProjectSummariesWithActivity({ accountId, workspaceId: ID.workspace })).map((card) => `${card.name}:${card.deleting}`),
})

test('reads follow the project through its life: live, tombstoned, purged and completed, for each kind of account', async (t) => {
  const fixture = await setupProjects(t, 'conexus_prj_reads')
  const projectId = await fixture.seedProject('Atlas')
  const detail = (revision, deleting) => ({ projectId, workspaceId: ID.workspace, name: 'Atlas', projectRevision: revision, archived: false, deleting })
  const revision = (await query(fixture.connection, 'SELECT project_revision FROM project.project')).rows[0].project_revision
  const expectations = {
    live: {
      member: { list: ['Atlas'], detail: detail(revision, false), cards: ['Atlas:false'] },
      outsider: { list: [], detail: null, cards: [] },
      administrator: { list: [], detail: null, cards: [] },
      memberAdministrator: { list: ['Atlas'], detail: detail(revision, false), cards: ['Atlas:false'] },
    },
    tombstoned: {
      member: { list: [], detail: null, cards: [] },
      outsider: { list: [], detail: null, cards: [] },
      administrator: { list: [], detail: detail('', true), cards: [] },
      memberAdministrator: { list: ['Atlas'], detail: detail(revision, true), cards: ['Atlas:true'] },
    },
    purged: {
      member: { list: [], detail: null, cards: [] },
      outsider: { list: [], detail: null, cards: [] },
      administrator: { list: [], detail: detail('', true), cards: ['Atlas:true'] },
      memberAdministrator: { list: [], detail: detail('', true), cards: ['Atlas:true'] },
    },
    completed: {
      member: { list: [], detail: null, cards: [] },
      outsider: { list: [], detail: null, cards: [] },
      administrator: { list: [], detail: null, cards: [] },
      memberAdministrator: { list: [], detail: null, cards: [] },
    },
  }
  for (const [state, enter] of Object.entries(states)) {
    await enter(fixture, projectId)
    for (const [who, expected] of Object.entries(expectations[state])) {
      assert.deepEqual(await readsOf(fixture, ID[who], projectId), expected, `${state} as ${who}`)
    }
  }
})

test('a list whose WHERE is deleted still returns only the acting account projects', async (t) => {
  const { database, seedProject } = await setupProjects(t, 'conexus_prj_leak')
  await seedProject('Atlas')
  await seedProject('Elsewhere', ID.otherWorkspace)
  const all = z.object({ name: z.string() })
  const read = (accountId) => database.read(accountId, (tx) => tx.rows(all, sql`SELECT name FROM project.project ORDER BY name`))
  assert.deepEqual(await read(ID.member), [{ name: 'Atlas' }])
  assert.deepEqual(await read(ID.outsider), [])
  assert.deepEqual(await read(ID.administrator), [])
})

test('without an account set, project tables and the builder reads show and change nothing', async (t) => {
  const { connection, seedProject, database } = await setupProjects(t, 'conexus_prj_noaccount')
  const projectId = await seedProject('Atlas')
  await query(connection, `INSERT INTO project.project_deletion(project_id, workspace_id, name, requested_by) VALUES ($1, $2, 'Atlas', $3)`, [projectId, ID.workspace, ID.administrator])
  const runtime = { ...connection, user: 'hub_runtime', password: PASSWORD }
  for (const table of ['project.project', 'project.project_deletion', 'builder.builder_run', 'builder.project_working_state']) {
    assert.deepEqual((await query(runtime, `SELECT count(*)::integer AS count FROM ${table}`)).rows, [{ count: 0 }], table)
  }
  assert.equal((await query(runtime, "UPDATE project.project SET archived = true")).rowCount, 0)
  assert.equal((await query(runtime, 'DELETE FROM project.project')).rowCount, 0)
  assert.equal((await query(runtime, 'DELETE FROM project.project_deletion')).rowCount, 0)
  const rows = z.object({ project_id: z.string() })
  assert.deepEqual(await database.read(ID.outsider, (tx) => tx.rows(rows, sql`SELECT project_id FROM builder.builder_run`)), [])
  assert.deepEqual(await database.read(ID.outsider, (tx) => tx.rows(rows, sql`SELECT project_id FROM builder.project_working_state`)), [])
  assert.equal((await database.read(ID.member, (tx) => tx.rows(rows, sql`SELECT project_id FROM builder.project_working_state`))).length, 0)
})

test('the policy helper is false for an administrator whose account is not active', async (t) => {
  const { connection, database } = await setupProjects(t, 'conexus_prj_helper')
  const flag = z.object({ administrator: z.boolean() })
  const read = () => database.read(ID.administrator, (tx) => tx.one(flag, sql`SELECT iam.acting_installation_administrator() AS administrator`, 'INTERNAL_UNEXPECTED'))
  assert.deepEqual(await read(), { administrator: true })
  await query(connection, 'UPDATE iam.account SET active = false WHERE account_id = $1', [ID.administrator])
  assert.deepEqual(await read(), { administrator: false })
})

test('an outsider cannot write a project into a workspace it cannot see', async (t) => {
  const { database } = await setupProjects(t, 'conexus_prj_write')
  const refused = (error) => { assert.equal(error.cause.code, '42501'); return true }
  await assert.rejects(database.transaction(ID.outsider, (tx) => tx.run(sql`
    INSERT INTO project.project (project_id, workspace_id, name, source_mode, source_revision, project_revision)
    VALUES (${randomUUID()}, ${ID.workspace}, 'Planted', 'NEW', ${STARTER}, ${randomUUID()})`)), refused)
})
