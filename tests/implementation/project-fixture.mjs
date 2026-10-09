import { randomUUID } from 'node:crypto'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { buildHubDatabase, givePasswordToHubRuntime, query } from './hub-database.mjs'
import { hubModuleUrl } from './hub-build.mjs'

const { openDatabase } = await import(hubModuleUrl('platform/db.js'))
const { createProjectStore } = await import(hubModuleUrl('project/store.js'))
const { createProjectDeletion } = await import(hubModuleUrl('project/deletion.js'))
const { builderProjectPorts, purgeProjectBuilder } = await import(hubModuleUrl('builder/project-ports.js'))
const { purgeProjectBindings } = await import(hubModuleUrl('connectors/store.js'))
const { purgeProject } = await import(hubModuleUrl('identity-access/application-access.js'))
const { createRegistryModule } = await import(hubModuleUrl('registry/module.js'))

export const ID = Object.freeze({
  owner: '10000000-0000-4000-8000-000000000001',
  member: '10000000-0000-4000-8000-000000000002',
  outsider: '10000000-0000-4000-8000-000000000003',
  administrator: '10000000-0000-4000-8000-000000000004',
  memberAdministrator: '10000000-0000-4000-8000-000000000005',
  workspace: '20000000-0000-4000-8000-000000000001',
  otherWorkspace: '20000000-0000-4000-8000-000000000002',
})
export const PASSWORD = 'project-test-only'
export const HEAD = 'a'.repeat(40)
export const STARTER = 'b'.repeat(40)

export const setupProjects = async (t, prefix, { repository } = {}) => {
  const fixture = await buildHubDatabase(t, prefix)
  await givePasswordToHubRuntime(fixture.connection, fixture.onCleanup, PASSWORD)
  const directory = mkdtempSync(resolve(tmpdir(), 's1-project-'))
  fixture.onCleanup(() => rmSync(directory, { recursive: true, force: true }))
  const passwordFile = resolve(directory, 'password')
  writeFileSync(passwordFile, PASSWORD)
  chmodSync(passwordFile, 0o600)
  const openRuntimeDatabase = ({ max = 6 } = {}) => {
    const opened = openDatabase({ host: fixture.connection.host, port: fixture.connection.port, database: fixture.database, user: 'hub_runtime', passwordFile, max })
    fixture.onCleanup(() => opened.close())
    return opened
  }
  const database = openRuntimeDatabase()
  const { connection } = fixture
  await query(connection, `INSERT INTO iam.account(account_id, issuer, external_subject, display_name) VALUES
    ($1, 'https://issuer.test', 'owner', 'Owner'), ($2, 'https://issuer.test', 'member', 'Member'),
    ($3, 'https://issuer.test', 'outsider', 'Outsider'), ($4, 'https://issuer.test', 'administrator', 'Administrator'),
    ($5, 'https://issuer.test', 'member-administrator', 'Member Administrator')`,
  [ID.owner, ID.member, ID.outsider, ID.administrator, ID.memberAdministrator])
  await query(connection, "INSERT INTO iam.installation_administrator(account_id, granted_via) VALUES ($1, 'OPERATOR_BOOTSTRAP'), ($2, 'OPERATOR_BOOTSTRAP')", [ID.administrator, ID.memberAdministrator])
  await query(connection, "INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1, 'Operations'), ($2, 'Elsewhere')", [ID.workspace, ID.otherWorkspace])
  await query(connection, `INSERT INTO iam.workspace_membership(account_id, workspace_id, role) VALUES
    ($1, $4, 'owner'), ($2, $4, 'member'), ($3, $4, 'member')`, [ID.owner, ID.member, ID.memberAdministrator, ID.workspace])
  const events = []
  const ports = {
    releaseApplicationData: async () => { events.push('release') },
    killSandboxes: async () => { events.push('kill') },
    deleteRepository: async () => { events.push('repository') },
    purgeIdentityAccess: purgeProject,
    purgeConnectorBindings: purgeProjectBindings,
    purgeRegistry: createRegistryModule({ database }).purge,
    hasOpenProjectRun: builderProjectPorts.hasOpenProjectRun, purgeBuilder: purgeProjectBuilder,
  }
  const repositoryPort = repository ?? { prepare: async () => STARTER }
  const store = createProjectStore({ database, repository: repositoryPort, deletion: ports, builder: builderProjectPorts })
  const deletion = createProjectDeletion({ database, ports })
  const seedProject = async (name = 'Atlas', workspaceId = ID.workspace, projectId = randomUUID()) => {
    await query(connection, `INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision)
      VALUES ($1, $2, $3, 'NEW', $4, $5)`, [projectId, workspaceId, name, HEAD, randomUUID()])
    await query(connection, 'INSERT INTO builder.project_working_state(project_id) VALUES ($1)', [projectId])
    await query(connection, 'INSERT INTO builder.project_repository(project_id) VALUES ($1)', [projectId])
    return projectId
  }
  const settleRun = (projectId, state = 'SUCCEEDED') => query(connection, `INSERT INTO builder.builder_run(builder_run_id, project_id, account_id, conversation_id, idempotency_digest, request_digest, base_source_revision, state)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [randomUUID(), projectId, ID.owner, projectId, randomUUID().replaceAll('-', '').repeat(2), '1'.repeat(64), HEAD, state])
  return { ...fixture, database, openRuntimeDatabase, store, deletion, events, seedProject, settleRun }
}
