import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import pg from 'pg'
import { hubModuleUrl } from './hub-build.mjs'
import { query } from './hub-database.mjs'
import { ID, setupProjects } from './project-fixture.mjs'
import { waitUntilBlocked } from './race.mjs'

const { admitApplication, admitInstallationAdministrator, admitWorkspace } = await import(hubModuleUrl('identity-access/admission.js'))
const { createWorkspaceModule } = await import(hubModuleUrl('workspace/module.js'))

test('an active nonmember administrator reads an existing Workspace, while an unknown Workspace is hidden', async (t) => {
  const { database } = await setupProjects(t, 'conexus_admin_nonmember_reader')
  const workspaces = createWorkspaceModule({ database })

  assert.deepEqual(await workspaces.listAccessibleWorkspaces(ID.administrator), [
    { workspaceId: ID.otherWorkspace, name: 'Elsewhere' },
    { workspaceId: ID.workspace, name: 'Operations' },
  ])
  await database.read(ID.administrator, (gate) => admitInstallationAdministrator(gate, { action: 'connection.manage', workspaceId: ID.workspace }))
  await assert.rejects(database.read(ID.administrator, (gate) => admitInstallationAdministrator(gate, { action: 'connection.manage', workspaceId: '20000000-0000-4000-8000-000000000099' })), { id: 'WORKSPACE_NOT_FOUND' })
  await assert.rejects(database.read(ID.owner, (gate) => admitInstallationAdministrator(gate, { action: 'connection.manage', workspaceId: ID.workspace })), { id: 'INSTALLATION_ADMINISTRATOR_REQUIRED' })
  await assert.rejects(database.read(ID.administrator, (gate) => admitWorkspace(gate, { workspaceId: ID.workspace, action: 'workspace.read' })), { id: 'WORKSPACE_NOT_FOUND' })
  assert.deepEqual(await workspaces.listAccessibleWorkspaces(ID.owner), [{ workspaceId: ID.workspace, name: 'Operations' }])
})

const pending = (promise) => {
  const state = { settled: false }
  promise.then(() => { state.settled = true }, () => { state.settled = true })
  return state
}
const hold = async (connection, onCleanup) => {
  const client = new pg.Client(connection)
  await client.connect()
  onCleanup(() => client.end().catch(() => undefined))
  await client.query('BEGIN')
  return client
}

const seedApplication = async (connection, projectId) => {
  await query(connection, "INSERT INTO iam.application(project_id, slug, created_by) VALUES ($1, $2, $3)", [projectId, `app-${randomUUID().slice(0, 8)}`, ID.owner])
}

test('admitApplication admits a member and a grantee, and refuses a revoked grant, an archived project and a project in deletion', async (t) => {
  const { connection, database, seedProject } = await setupProjects(t, 'conexus_admit_application')
  const admit = (accountId, projectId) => database.transaction(accountId, (gate) => admitApplication(gate, projectId))
  const projectId = await seedProject('Atlas')
  const refused = { id: 'APPLICATION_NOT_FOUND' }
  await assert.rejects(admit(ID.member, projectId), refused)
  await seedApplication(connection, projectId)
  assert.equal((await admit(ID.member, projectId)).scope.via, 'membership')
  await assert.rejects(admit(ID.outsider, projectId), refused)
  await query(connection, 'INSERT INTO iam.application_grant(project_id, account_id, granted_by) VALUES ($1, $2, $3)', [projectId, ID.outsider, ID.owner])
  assert.equal((await admit(ID.outsider, projectId)).scope.via, 'grant')
  await query(connection, 'UPDATE iam.application_grant SET revoked_at = now(), revoked_by = $2 WHERE account_id = $1', [ID.outsider, ID.owner])
  await assert.rejects(admit(ID.outsider, projectId), refused)
  await query(connection, 'UPDATE project.project SET archived = true WHERE project_id = $1', [projectId])
  await assert.rejects(admit(ID.member, projectId), refused)
  await query(connection, 'UPDATE project.project SET archived = false WHERE project_id = $1', [projectId])
  await query(connection, "INSERT INTO project.project_deletion(project_id, workspace_id, name, requested_by) VALUES ($1, $2, 'Atlas', $3)", [projectId, ID.workspace, ID.administrator])
  await assert.rejects(admit(ID.member, projectId), refused)
})

test('an admitApplication that waited on a project whose tombstone committed meanwhile is refused', async (t) => {
  const { connection, database, seedProject, onCleanup } = await setupProjects(t, 'conexus_admit_application_race')
  const projectId = await seedProject('Atlas')
  await seedApplication(connection, projectId)
  const holder = await hold(connection, onCleanup)
  await holder.query('SELECT 1 FROM project.project WHERE project_id = $1 FOR UPDATE', [projectId])
  await holder.query("INSERT INTO project.project_deletion(project_id, workspace_id, name, requested_by) VALUES ($1, $2, 'Atlas', $3)", [projectId, ID.workspace, ID.administrator])
  const admission = database.transaction(ID.member, (gate) => admitApplication(gate, projectId))
  const state = pending(admission)
  admission.catch(() => undefined)
  await waitUntilBlocked(connection)
  assert.equal(state.settled, false)
  await holder.query('COMMIT')
  await assert.rejects(admission, { id: 'APPLICATION_NOT_FOUND' })
})

test('one member leaving twice at once: the second admission waits for the first and answers WORKSPACE_NOT_FOUND', async (t) => {
  const { connection, database, onCleanup } = await setupProjects(t, 'conexus_double_leave')
  const holder = await hold(connection, onCleanup)
  await holder.query('SELECT 1 FROM iam.workspace_membership WHERE account_id = $1 AND workspace_id = $2 FOR UPDATE', [ID.member, ID.workspace])
  const leaving = database.transaction(ID.member, (gate) => admitWorkspace(gate, { workspaceId: ID.workspace, action: 'members.leave' }))
  const state = pending(leaving)
  leaving.catch(() => undefined)
  await waitUntilBlocked(connection)
  assert.equal(state.settled, false)
  await holder.query('DELETE FROM iam.workspace_membership WHERE account_id = $1 AND workspace_id = $2', [ID.member, ID.workspace])
  await holder.query('COMMIT')
  await assert.rejects(leaving, { id: 'WORKSPACE_NOT_FOUND' })
})

test('an owner removed while deletion waits for its membership is refused', async (t) => {
  const { connection, store, seedProject, onCleanup } = await setupProjects(t, 'conexus_owner_removed_wait')
  const projectId = await seedProject('Atlas')
  const holder = await hold(connection, onCleanup)
  await holder.query('DELETE FROM iam.workspace_membership WHERE account_id = $1 AND workspace_id = $2', [ID.owner, ID.workspace])
  const deletion = store.deleteProject({ accountId: ID.owner, projectId, confirmName: 'Atlas' })
  const state = pending(deletion)
  deletion.catch(() => undefined)
  await waitUntilBlocked(connection)
  assert.equal(state.settled, false)
  await holder.query('COMMIT')
  await assert.rejects(deletion, { id: 'PROJECT_NOT_FOUND' })
  assert.deepEqual((await query(connection, 'SELECT count(*)::integer AS tombstones FROM project.project_deletion')).rows, [{ tombstones: 0 }])
})

test('two administrators managing administrators at once serialize on the tenure lock without a deadlock', async (t) => {
  const { connection, database } = await setupProjects(t, 'conexus_admin_manage_race')
  let release
  const held = new Promise((resolve) => { release = resolve })
  let admitted
  const entered = new Promise((resolve) => { admitted = resolve })
  const first = database.transaction(ID.administrator, async (gate) => {
    await admitInstallationAdministrator(gate, { action: 'administrators.manage' })
    admitted()
    await held
  })
  await entered
  const second = database.transaction(ID.memberAdministrator, (gate) => admitInstallationAdministrator(gate, { action: 'administrators.manage' }))
  const state = pending(second)
  await waitUntilBlocked(connection)
  assert.equal(state.settled, false, 'the second waits on the first')
  release()
  await Promise.all([first, second])
})
