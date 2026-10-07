import assert from 'node:assert/strict'
import { test } from 'node:test'
import pg from 'pg'
import { loginPoolOf, query } from './hub-database.mjs'
import { hubModuleUrl } from './hub-build.mjs'
import { ID, STARTER, setupProjects } from './project-fixture.mjs'

const { Failure } = await import(hubModuleUrl('platform/failure.js'))
const { admitSystem, admitWorkspace } = await import(hubModuleUrl('identity-access/admission.js'))
const { purgeProject } = await import(hubModuleUrl('identity-access/application-access.js'))

const NEW = { name: 'Atlas', sourceBootstrap: { mode: 'NEW' } }
const create = (store, accountId, key, body = NEW, workspaceId = ID.workspace) => store.createProject({ accountId, workspaceId, idempotencyKey: key, body })

test('createProject creates the project and its repository rows, replays its answer, and refuses a changed request', async (t) => {
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
  assert.deepEqual(rows.rows, [{ name: 'Atlas', source_revision: STARTER, project_revision: first.reply.projectRevision, state: 'completed', operation_id: 'createProject', working: 1, repository: 1 }])
})

test('createProject with the same key and body in another workspace creates there', async (t) => {
  const { connection, store } = await setupProjects(t, 'conexus_prj03_other')
  await query(connection, "INSERT INTO iam.workspace_membership(account_id, workspace_id, role) VALUES ($1, $2, 'member')", [ID.owner, ID.otherWorkspace])
  const here = await create(store, ID.owner, 'shared')
  const there = await create(store, ID.owner, 'shared', NEW, ID.otherWorkspace)
  assert.equal(there.replayed, false)
  assert.notEqual(there.reply.projectId, here.reply.projectId)
  assert.equal(there.reply.workspaceId, ID.otherWorkspace)
})

test('createProject reaches the same project id after a crash between Git and completion', async (t) => {
  const prepared = []
  let failNext = true
  const { connection, store } = await setupProjects(t, 'conexus_prj03_crash', { repository: { prepare: async (projectId) => {
    prepared.push(projectId)
    if (failNext) { failNext = false; throw new Failure('CONEXUS_GIT_FAILED') }
    return STARTER
  } } })
  await assert.rejects(create(store, ID.owner, 'crash'), { id: 'PROJECT_REPOSITORY_UNAVAILABLE', details: { reason: 'CONEXUS_GIT_FAILED' } })
  assert.deepEqual((await query(connection, 'SELECT state FROM platform.operation_receipt')).rows, [{ state: 'reserved' }])
  const retried = await create(store, ID.owner, 'crash')
  assert.equal(prepared.length, 2)
  assert.equal(prepared[0], prepared[1])
  assert.equal(retried.reply.projectId, prepared[0])
})

test('createProject refuses a retry after the account lost the workspace, an inactive account and a source it does not offer', async (t) => {
  const { connection, store } = await setupProjects(t, 'conexus_prj03_refused')
  await assert.rejects(create(store, ID.outsider, 'outsider'), { id: 'WORKSPACE_NOT_FOUND' })
  await assert.rejects(create(store, ID.owner, 'git', { name: 'Atlas', sourceBootstrap: { mode: 'EXISTING_GIT', repositoryLocator: 'https://git.test/x' } }), { id: 'PROJECT_SOURCE_REFUSED' })
  assert.deepEqual((await query(connection, 'SELECT count(*)::integer AS receipts FROM platform.operation_receipt')).rows, [{ receipts: 0 }])
  const created = await create(store, ID.member, 'lost')
  await query(connection, 'DELETE FROM iam.workspace_membership WHERE account_id = $1', [ID.member])
  await assert.rejects(create(store, ID.member, 'lost'), { id: 'WORKSPACE_NOT_FOUND' })
  assert.equal(created.replayed, false)
  await query(connection, 'UPDATE iam.account SET active = false WHERE account_id = $1', [ID.owner])
  await assert.rejects(create(store, ID.owner, 'inactive'), { id: 'ACCOUNT_INACTIVE' })
})

test('a revoke that commits first refuses createProject', async (t) => {
  const { connection, store, onCleanup } = await setupProjects(t, 'conexus_prj03_revoke')
  const revoker = new pg.Client(connection)
  await revoker.connect()
  onCleanup(() => revoker.end())
  await revoker.query('BEGIN')
  await revoker.query('DELETE FROM iam.workspace_membership WHERE workspace_id = $1 AND account_id = $2', [ID.workspace, ID.member])
  let settled = false
  const waiting = create(store, ID.member, 'revoked-first').finally(() => { settled = true })
  waiting.catch(() => undefined)
  await new Promise((resolve) => setTimeout(resolve, 150))
  assert.equal(settled, false)
  await revoker.query('COMMIT')
  await assert.rejects(waiting, { id: 'WORKSPACE_NOT_FOUND' })
})

test('a revoke waits for an admitted createProject and the next admission is refused', async (t) => {
  let holder
  const { connection, store, onCleanup } = await setupProjects(t, 'conexus_prj03_admitted', { repository: { prepare: async () => {
    await holder.query('BEGIN')
    await holder.query('SELECT 1 FROM platform.operation_receipt FOR UPDATE')
    return STARTER
  } } })
  holder = new pg.Client(connection)
  await holder.connect()
  onCleanup(() => holder.end())
  const creating = create(store, ID.member, 'admitted-first')
  const creation = { settled: false }
  creating.then(() => { creation.settled = true }, () => { creation.settled = true })
  await new Promise((resolve) => setTimeout(resolve, 300))
  assert.equal(creation.settled, false, 'the second transaction is admitted and waits on its receipt')
  const revoking = query(connection, 'DELETE FROM iam.workspace_membership WHERE workspace_id = $1 AND account_id = $2', [ID.workspace, ID.member])
  const revocation = { settled: false }
  revoking.then(() => { revocation.settled = true }, () => { revocation.settled = true })
  await new Promise((resolve) => setTimeout(resolve, 300))
  assert.equal(revocation.settled, false, 'the revoke waits for the admitted writer')
  await holder.query('COMMIT')
  const [created] = await Promise.all([creating, revoking])
  assert.equal(created.replayed, false)
  assert.equal((await query(connection, 'SELECT count(*)::integer AS projects FROM project.project')).rows[0].projects, 1)
  await assert.rejects(create(store, ID.member, 'after-revoke'), { id: 'WORKSPACE_NOT_FOUND' })
})

const readsOf = async ({ store }, accountId, projectId) => ({
  list: await store.listProjects({ accountId, workspaceId: ID.workspace }),
  detail: await store.getProject({ accountId, projectId }),
  cards: await store.listProjectSummariesWithActivity({ accountId, workspaceId: ID.workspace }),
})

test('members read live and deleting Project variants, and completion removes the Project', async (t) => {
  const fixture = await setupProjects(t, 'conexus_prj_reads')
  const projectId = await fixture.seedProject('Atlas')
  const revision = (await query(fixture.connection, 'SELECT project_revision FROM project.project')).rows[0].project_revision
  const live = {
    list: [{ projectId, workspaceId: ID.workspace, name: 'Atlas', state: 'live', archived: false }],
    detail: { projectId, workspaceId: ID.workspace, name: 'Atlas', state: 'live', projectRevision: revision, archived: false },
  }
  const [ownerLive, memberLive] = await Promise.all([readsOf(fixture, ID.owner, projectId), readsOf(fixture, ID.member, projectId)])
  for (const reads of [ownerLive, memberLive]) {
    assert.deepEqual(reads.list, live.list)
    assert.deepEqual(reads.detail, live.detail)
    assert.equal(reads.cards.length, 1)
    assert.equal(reads.cards[0].state, 'live')
    assert.equal(reads.cards[0].projectId, projectId)
  }
  await assert.rejects(fixture.store.listProjects({ accountId: ID.outsider, workspaceId: ID.workspace }), { id: 'WORKSPACE_NOT_FOUND' })
  await assert.rejects(fixture.store.getProject({ accountId: ID.outsider, projectId }), { id: 'PROJECT_NOT_FOUND' })
  await assert.rejects(fixture.store.getProject({ accountId: ID.administrator, projectId }), { id: 'PROJECT_NOT_FOUND' })

  await query(fixture.connection, `INSERT INTO project.project_deletion(project_id, workspace_id, name, requested_by) VALUES ($1, $2, 'Atlas', $3)`, [projectId, ID.workspace, ID.owner])
  for (const accountId of [ID.owner, ID.member]) {
    assert.deepEqual(await readsOf(fixture, accountId, projectId), {
      list: [{ projectId, workspaceId: ID.workspace, name: 'Atlas', state: 'deleting' }],
      detail: { projectId, workspaceId: ID.workspace, name: 'Atlas', state: 'deleting' },
      cards: [{ projectId, name: 'Atlas', state: 'deleting' }],
    })
  }
  await fixture.store.deleteProject({ accountId: ID.owner, projectId, confirmName: 'Atlas' })
  assert.deepEqual(await fixture.store.listProjects({ accountId: ID.owner, workspaceId: ID.workspace }), [])
  await assert.rejects(fixture.store.getProject({ accountId: ID.owner, projectId }), { id: 'PROJECT_NOT_FOUND' })
})

test('the runtime role holds native read grants while stores scope person reads with admission', async (t) => {
  const { seedProject, database } = await setupProjects(t, 'conexus_prj_noaccount')
  const projectId = await seedProject('Atlas')
  const otherId = await seedProject('Elsewhere', ID.otherWorkspace)
  const runtime = await loginPoolOf(database)
  assert.deepEqual((await runtime.query('SELECT project_id FROM project.project ORDER BY project_id')).rows.map((row) => row.project_id).sort(), [projectId, otherId].sort())
  assert.equal((await database.read(ID.member, (gate) => admitWorkspace(gate, { workspaceId: ID.workspace, action: 'workspace.read' }))).scope.workspaceId, ID.workspace)
  await assert.rejects(runtime.query('SELECT * FROM factory.project'), { code: '42501' })
})

test('a person transaction cannot run a project purge, and the rows stay', async (t) => {
  const { connection, database, seedProject } = await setupProjects(t, 'conexus_prj_purge_guard')
  const projectId = await seedProject('Atlas')
  const refused = (error) => error.id === 'INTERNAL_UNEXPECTED' && error.details?.invariant === 'GATE_ACTOR_REFUSED'
  await assert.rejects(database.transaction(ID.member, async (gate) => purgeProject(await admitSystem(gate, 'project-purge'), projectId)), refused)
  assert.deepEqual((await query(connection, 'SELECT (SELECT count(*)::integer FROM builder.project_working_state WHERE project_id = $1) AS working, (SELECT count(*)::integer FROM builder.project_repository WHERE project_id = $1) AS repository', [projectId])).rows, [{ working: 1, repository: 1 }])
})

test('an outsider is refused at admission before any project write is reachable', async (t) => {
  const { database } = await setupProjects(t, 'conexus_prj_write')
  const { admitWorkspace } = await import(hubModuleUrl('identity-access/admission.js'))
  await assert.rejects(database.transaction(ID.outsider, (gate) => admitWorkspace(gate, { workspaceId: ID.workspace, action: 'workspace.read' })), { id: 'WORKSPACE_NOT_FOUND' })
})
