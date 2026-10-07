import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'
import { query } from './hub-database.mjs'
import { ID, setupProjects } from './project-fixture.mjs'

const { admitAccount } = await import(hubModuleUrl('identity-access/admission.js'))

test('person reads admit the parent before returning Projects and hide outsider, unknown, and wrong-parent subjects', async (t) => {
  const { connection, database, store, seedProject } = await setupProjects(t, 'conexus_scoped_reads')
  const project = await seedProject('Atlas')
  const otherProject = await seedProject('Elsewhere Project', ID.otherWorkspace)

  assert.deepEqual(await store.listProjects({ accountId: ID.member, workspaceId: ID.workspace }), [
    { projectId: project, workspaceId: ID.workspace, name: 'Atlas', state: 'live', archived: false },
  ])
  await assert.rejects(store.listProjects({ accountId: ID.owner, workspaceId: ID.otherWorkspace }), { id: 'WORKSPACE_NOT_FOUND' })
  await assert.rejects(store.getProject({ accountId: ID.outsider, projectId: project }), { id: 'PROJECT_NOT_FOUND' })
  await assert.rejects(store.getProject({ accountId: ID.member, projectId: '30000000-0000-4000-8000-000000000099' }), { id: 'PROJECT_NOT_FOUND' })
  await assert.rejects(store.getProject({ accountId: ID.member, projectId: otherProject }), { id: 'PROJECT_NOT_FOUND' })

  await assert.rejects(database.read('10000000-0000-4000-8000-000000000099', (gate) => admitAccount(gate)), { id: 'ACCOUNT_NOT_FOUND' })
  await query(connection, 'UPDATE iam.account SET active = false WHERE account_id = $1', [ID.member])
  await assert.rejects(database.read(ID.member, (gate) => admitAccount(gate)), { id: 'ACCOUNT_INACTIVE' })
})
