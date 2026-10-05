import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { OPERATIONS } from '../../packages/contract/dist/index.js'
import { hubModuleUrl } from './hub-build.mjs'
import { query } from './hub-database.mjs'
import { ID, STARTER, setupProjects } from './project-fixture.mjs'

const { createProjectStore } = await import(hubModuleUrl('project/store.js'))
const { createWorkspaceStore } = await import(hubModuleUrl('workspace/store.js'))
const { createServedApplicationReader } = await import(hubModuleUrl('registry/served-application.js'))

const BODY = { name: 'Intruder', sourceBootstrap: { mode: 'NEW' } }

const recording = (database, entries) => new Proxy(database, {
  get: (target, name) => (['read', 'transaction', 'system'].includes(name)
    ? (...args) => { entries.push(name); return target[name](...args) }
    : target[name]),
})

const digestOfB = async (connection, projectId) => {
  const rows = await query(connection, `SELECT t FROM (
    SELECT 'w' || w::text AS t FROM workspace.workspace w WHERE workspace_id = $1
    UNION ALL SELECT 'p' || p::text FROM project.project p WHERE workspace_id = $1
    UNION ALL SELECT 'd' || d::text FROM project.project_deletion d WHERE workspace_id = $1
    UNION ALL SELECT 'r' || r::text FROM builder.builder_run r WHERE project_id = $2
    UNION ALL SELECT 's' || s::text FROM builder.project_working_state s WHERE project_id = $2
    UNION ALL SELECT 'm' || m::text FROM iam.workspace_membership m WHERE workspace_id = $1
    UNION ALL SELECT 'x' || x::text FROM platform.operation_receipt x WHERE resource_id IN ($1, $2)) rows ORDER BY t`, [ID.otherWorkspace, projectId])
  return createHash('sha256').update(JSON.stringify(rows.rows)).digest('hex')
}

test('each operation, run as a member of one tenant with the ids of another, answers its refusal and leaves the other tenant rows unchanged', async (t) => {
  const fixture = await setupProjects(t, 'conexus_operation_tenant')
  const { connection, seedProject, settleRun } = fixture
  const projectB = await seedProject('Borealis', ID.otherWorkspace)
  await settleRun(projectB)
  const entries = []
  const database = recording(fixture.database, entries)
  const projects = createProjectStore({ database, repository: { prepare: async () => STARTER }, deletion: { releaseApplicationData: async () => undefined, killSandboxes: async () => undefined, deleteRepository: async () => undefined } })
  const workspaces = createWorkspaceStore(database)
  const served = createServedApplicationReader(database)
  const member = ID.member
  const before = await digestOfB(connection, projectB)

  const attempts = {
    'WS-01': async () => {
      const created = await workspaces.createWorkspace({ accountId: member, idempotencyKey: 'tenant', body: { name: 'Mine' } })
      assert.equal(created.reply.creatorAccountId, member)
    },
    'PRJ-01': async () => assert.deepEqual(await projects.listProjects({ accountId: member, workspaceId: ID.otherWorkspace }), []),
    'PRJ-02': async () => assert.equal(await projects.getProject({ accountId: member, projectId: projectB }), null),
    'PRJ-03': () => assert.rejects(projects.createProject({ accountId: member, workspaceId: ID.otherWorkspace, idempotencyKey: 'intruder', body: BODY }), { id: 'PROJECT_CREATE_DENIED' }),
    'PRJ-04': () => assert.rejects(projects.deleteProject({ accountId: member, projectId: projectB, confirmName: 'Borealis' }), { id: 'PROJECT_DELETE_DENIED' }),
    'PRJ-SUMMARIES': async () => assert.deepEqual(await projects.listProjectSummariesWithActivity({ accountId: member, workspaceId: ID.otherWorkspace }), []),
    'PRJ-THUMBNAIL': async () => assert.equal(await served.readThumbnail({ accountId: member, projectId: projectB }), null),
  }
  assert.deepEqual(Object.keys(attempts).sort(), OPERATIONS.map((operation) => operation.id).sort(), 'every operation of the contract has an attempt')

  for (const operation of OPERATIONS) {
    entries.length = 0
    await attempts[operation.id]()
    assert.equal(await digestOfB(connection, projectB), before, `${operation.id} left the other tenant's rows unchanged`)
    if (operation.method === 'GET') assert.deepEqual([...new Set(entries)], entries.length === 0 ? [] : ['read'], `${operation.id} is a read and opens only read()`)
    else assert.ok(entries.length > 0 && !entries.includes('system'), `${operation.id} opens a person entry`)
  }
})
