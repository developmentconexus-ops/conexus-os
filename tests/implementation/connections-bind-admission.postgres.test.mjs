import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'
import { ID, setupProjects } from './project-fixture.mjs'

const { admitProject } = await import(hubModuleUrl('identity-access/admission.js'))

test('connections.bind is an owner only action, as a read and as a command, refused with the codes the Connector routes map', async (t) => {
  const { database, seedProject } = await setupProjects(t, 'conexus_connections_bind')
  const projectId = await seedProject('Atlas')
  const asRead = (accountId) => database.read(accountId, (tx) => admitProject(tx, projectId, 'connections.bind'))
  const asCommand = (accountId) => database.transaction(accountId, (gate) => admitProject(gate, { projectId: projectId, action: 'connections.bind' }))

  assert.equal((await asRead(ID.owner)).scope.workspaceId, ID.workspace)
  assert.equal((await asCommand(ID.owner)).scope.action, 'connections.bind')
  for (const admit of [asRead, asCommand]) {
    await assert.rejects(admit(ID.member), { id: 'CONNECTOR_BINDING_MANAGE_REQUIRED' })
    await assert.rejects(admit(ID.outsider), { id: 'PROJECT_NOT_FOUND' })
  }
})
