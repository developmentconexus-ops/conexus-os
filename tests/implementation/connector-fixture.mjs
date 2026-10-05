import { randomUUID } from 'node:crypto'
import { hubModuleUrl } from './hub-build.mjs'
import { query } from './hub-database.mjs'
import { ID, setupProjects } from './project-fixture.mjs'

const { createBrokerStore, createConnectorStore } = await import(hubModuleUrl('connectors/store.js'))
const { scopeFromArtifactSource } = await import(hubModuleUrl('connectors/scope.js'))
const { createSecretEnvelope } = await import(hubModuleUrl('platform/secrets.js'))

const configured = ['CONEXUS_TEST_DB_HOST', 'CONEXUS_TEST_DB_PORT', 'CONEXUS_TEST_DB_NAME', 'CONEXUS_TEST_DB_USER', 'CONEXUS_TEST_DB_PASSWORD'].every((name) => process.env[name])
export const skip = configured ? false : 'real PostgreSQL configuration not supplied'

/** The Hub's schema behind the real database port: the installation administrator keeps Connections, the Workspace Owner binds them. */
export const setupConnectors = async (t, prefix) => {
  const projects = await setupProjects(t, prefix)
  const { database, connection: superuser } = projects
  const envelope = createSecretEnvelope('ab'.repeat(32))
  const store = createConnectorStore({ database, envelope })
  const brokerStore = createBrokerStore(database)

  const addConnection = async (connectorId, label, credential, { workspaceId = ID.workspace, accountId = ID.administrator } = {}) => {
    const connectionId = randomUUID()
    await store.createConnection({ accountId, workspaceId, body: { connectionId, connectorId, label, credential } })
    return connectionId
  }
  const bind = async (projectId, connectionId, name, accountId = ID.owner) => (await store.bindConnection({ accountId, projectId, body: { connectionId, name } })).binding
  const unbind = (projectId, bindingId, accountId = ID.owner) => store.unbindConnection({ accountId, projectId, bindingId })
  const disable = (connectionId, workspaceId = ID.workspace, accountId = ID.administrator) => store.disableConnection({ accountId, workspaceId, connectionId })
  const archive = (projectId, archived) => query(superuser, 'UPDATE project.project SET archived = $2 WHERE project_id = $1', [projectId, archived])
  const scopeOf = (projectId, accountId = ID.owner) => scopeFromArtifactSource({ via: 'PREVIEW', accountId, projectId })
  return { ...projects, envelope, store, brokerStore, addConnection, bind, unbind, disable, archive, scopeOf }
}
