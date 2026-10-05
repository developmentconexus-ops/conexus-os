import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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

const CENSUS = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../contracts/technical/hub-catalog-census.json'), 'utf8'))

const OTHER = Object.freeze({ owner: '10000000-0000-4000-8000-0000000000b1', member: '10000000-0000-4000-8000-0000000000b2' })

// How each split table reaches tenant B: $1 is B's Workspace, $2 is B's Project. A split table in the
// register without an entry here, or without a seeded row of B, fails the test below.
const TENANT_B = Object.freeze({
  'workspace.workspace': 'workspace_id = $1',
  'platform.operation_receipt': 'resource_id IN ($1, $2)',
  'project.project': 'workspace_id = $1',
  'project.project_deletion': 'workspace_id = $1',
  'builder.builder_run': 'project_id = $2',
  'builder.project_working_state': 'project_id = $2',
  'iam.account': 'account_id IN (SELECT account_id FROM iam.workspace_membership WHERE workspace_id = $1)',
  'iam.workspace_membership': 'workspace_id = $1',
})

const registerTables = () => CENSUS.register.split.map((entry) => entry.table).sort()

const rowsOfB = async (connection, projectId) => {
  const tables = registerTables()
  assert.deepEqual(tables, Object.keys(TENANT_B).sort(), 'every split table of the register has a tenant path here, and none is listed that the register lacks')
  const found = new Map()
  for (const table of tables) {
    const predicate = TENANT_B[table].replace('$1', `'${ID.otherWorkspace}'`).replace('$2', `'${projectId}'`)
    const { rows } = await query(connection, `SELECT t::text AS row FROM ${table} t WHERE ${predicate} ORDER BY 1`)
    found.set(table, rows.map((row) => row.row))
  }
  return found
}

const seedTenantB = async ({ connection, seedProject }, projectId) => {
  await query(connection, `INSERT INTO iam.account(account_id, issuer, external_subject, display_name) VALUES
    ($1, 'https://issuer.test', 'other-owner', 'Other owner'), ($2, 'https://issuer.test', 'other-member', 'Other member')`, [OTHER.owner, OTHER.member])
  await query(connection, "INSERT INTO iam.workspace_membership(account_id, workspace_id, role) VALUES ($1, $3, 'owner'), ($2, $3, 'member')", [OTHER.owner, OTHER.member, ID.otherWorkspace])
  const doomed = await seedProject('Doomed', ID.otherWorkspace)
  await query(connection, "INSERT INTO project.project_deletion(project_id, workspace_id, name, requested_by) VALUES ($1, $2, 'Doomed', $3)", [doomed, ID.otherWorkspace, OTHER.owner])
  await query(connection, `INSERT INTO platform.operation_receipt(operation_id, authority, account_id, key_digest, request_digest, resource_id, state)
    VALUES ('PRJ-03', 'account:b', $1, $2, $3, $4, 'reserved')`, [OTHER.owner, Buffer.from('k'), Buffer.from('r'), projectId])
}

const digestOfB = async (connection, projectId) => {
  const found = await rowsOfB(connection, projectId)
  return createHash('sha256').update(JSON.stringify([...found])).digest('hex')
}

test('each operation, run as a member of one tenant with the ids of another, answers its refusal and leaves the other tenant rows unchanged', async (t) => {
  const fixture = await setupProjects(t, 'conexus_operation_tenant')
  const { connection, seedProject, settleRun } = fixture
  const projectB = await seedProject('Borealis', ID.otherWorkspace)
  await settleRun(projectB)
  await seedTenantB(fixture, projectB)
  for (const [table, rows] of await rowsOfB(connection, projectB)) assert.ok(rows.length > 0, `${table} has a seeded row of tenant B`)
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
