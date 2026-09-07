import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import pg from 'pg'
import { runR2HubMigrations } from '../../scripts/run-hub-migrations.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const hubBuild = mkdtempSync(resolve(repositoryRoot, 'apps/hub/r2-p6-brain-selection-build-'))
process.once('exit', () => rmSync(hubBuild, { recursive: true, force: true }))
const compiled = spawnSync(process.execPath, [
  resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'),
  '--project', resolve(repositoryRoot, 'apps/hub/tsconfig.json'),
  '--noEmit', 'false', '--outDir', hubBuild,
], { encoding: 'utf8' })
if (compiled.status !== 0) throw new Error(`R2_P6_HUB_COMPILE_FAILED\n${compiled.stdout}\n${compiled.stderr}`)

const built = (path) => pathToFileURL(resolve(hubBuild, path)).href
const { createBrainModule } = await import(built('brain/module.js'))
const { createHttpApp } = await import(built('http/app.js'))
const { createRegistryStore } = await import(built('registry/module.js'))

const databaseConfigured = [
  'CONEXUS_TEST_DB_HOST', 'CONEXUS_TEST_DB_PORT', 'CONEXUS_TEST_DB_NAME',
  'CONEXUS_TEST_DB_USER', 'CONEXUS_TEST_DB_PASSWORD',
].every((name) => process.env[name])

const quoteIdentifier = (value) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error('UNSAFE_TEST_IDENTIFIER')
  return `"${value}"`
}

const databaseHarness = async (t) => {
  const admin = {
    host: process.env.CONEXUS_TEST_DB_HOST,
    port: Number(process.env.CONEXUS_TEST_DB_PORT),
    database: process.env.CONEXUS_TEST_DB_NAME,
    user: process.env.CONEXUS_TEST_DB_USER,
    password: process.env.CONEXUS_TEST_DB_PASSWORD,
  }
  const database = `conexus_r2_p6_brain_selection_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 8)}`
  const query = async (connection, statement, values = []) => {
    const client = new pg.Client(connection)
    await client.connect()
    try { return await client.query(statement, values) } finally { await client.end() }
  }
  await query(admin, `CREATE DATABASE ${quoteIdentifier(database)}`)
  const fresh = { ...admin, database }
  const beforeDrop = []
  t.after(async () => {
    for (const close of beforeDrop.reverse()) await close()
    await query(admin, 'ALTER ROLE hub_r2_brain_read PASSWORD NULL').catch(() => {})
    await query(admin, `DROP DATABASE ${quoteIdentifier(database)} WITH (FORCE)`)
  })
  const url = new URL('postgresql://localhost')
  url.hostname = fresh.host
  url.port = String(fresh.port)
  url.pathname = `/${fresh.database}`
  url.username = fresh.user
  url.password = fresh.password
  return { admin, beforeDrop, fresh, query, url }
}

const source = Object.freeze({
  schemaVersion: 'conexus-brain/v1',
  reviewText: 'Synthetic P6 purpose-bound revision selection proof.',
  knowledgeBrowse: Object.freeze({
    domains: [Object.freeze({
      domainRef: 'proof',
      label: 'Proof',
      concepts: [Object.freeze({
        conceptRef: 'proof.selection',
        label: 'Revision selection',
        summary: 'Synthetic immutable selection proof.',
        contentClasses: ['SEMANTIC'],
        sections: [Object.freeze({ kind: 'DEFINITION', text: 'Synthetic proof only.' })],
        provenanceRefs: ['synthetic://r2-p6/selection'],
      })],
    })],
  }),
})

test('R2-P6 purpose-bound BRN-02 uses only its exact IAM admission and fails closed locally', async () => {
  const accountId = randomUUID()
  const workspaceId = randomUUID()
  const projectId = randomUUID()
  const calls = []
  const makeStore = async (rows) => {
    const { createBrainStore } = await import(built('brain/store.js'))
    const client = {
      async query(statement, values = []) {
        const sql = String(statement).trim()
        calls.push({ sql, values })
        if (sql === 'BEGIN READ ONLY' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] }
        if (sql.includes('iam.admit_brain_revision_selection')) return { rows }
        if (sql.includes('reg.get_workspace_brain')) return { rows: [{ workspace_id: workspaceId, published_brain_revision_id: randomUUID() }] }
        if (sql.includes('reg.list_brain_revisions')) return { rows: [] }
        throw new Error(`UNEXPECTED_QUERY:${sql}`)
      },
      release() { calls.push({ sql: 'RELEASE', values: [] }) },
    }
    return createBrainStore({
      pool: { connect: async () => client, end: async () => {} },
      registry: createRegistryStore(),
    })
  }

  for (const [rows, status] of [
    [[], 'NOT_FOUND'],
    [[{ project_id: projectId, workspace_id: workspaceId, scope_exists: false, permitted: false }], 'NOT_FOUND'],
    [[{ project_id: projectId, workspace_id: workspaceId, scope_exists: true, permitted: false }], 'DENIED'],
  ]) {
    calls.length = 0
    const store = await makeStore(rows)
    assert.equal((await store.listBrainRevisionsForProject({ accountId, workspaceId, projectId })).status, status)
    assert.equal(calls[0].sql, 'BEGIN READ ONLY')
    assert.equal(calls[1].sql.includes('iam.admit_brain_revision_selection'), true)
    assert.equal(calls.some(({ sql }) => sql.startsWith('SELECT * FROM reg.')), false)
    assert.deepEqual(calls.slice(-2).map(({ sql }) => sql), ['COMMIT', 'RELEASE'])
  }

  for (const invalidRows of [
    [{ project_id: randomUUID(), workspace_id: workspaceId, scope_exists: true, permitted: true }],
    [{ project_id: projectId, workspace_id: randomUUID(), scope_exists: true, permitted: true }],
    [{ project_id: projectId, workspace_id: workspaceId, scope_exists: 1, permitted: true }],
    [
      { project_id: projectId, workspace_id: workspaceId, scope_exists: true, permitted: true },
      { project_id: projectId, workspace_id: workspaceId, scope_exists: true, permitted: true },
    ],
  ]) {
    calls.length = 0
    const store = await makeStore(invalidRows)
    await assert.rejects(
      store.listBrainRevisionsForProject({ accountId, workspaceId, projectId }),
      /BRAIN_SELECTION_ADMISSION_INVALID/,
    )
    assert.equal(calls.some(({ sql }) => sql.startsWith('SELECT * FROM reg.')), false)
    assert.deepEqual(calls.slice(-2).map(({ sql }) => sql), ['ROLLBACK', 'RELEASE'])
  }
})

test('R2-P6 actual brain-read role admits only exact purpose-bound revision selection in READ ONLY', {
  skip: databaseConfigured ? false : 'real PostgreSQL configuration not supplied',
}, async (t) => {
  const { beforeDrop, fresh, query, url } = await databaseHarness(t)
  await runR2HubMigrations({ connectionString: url.toString() })

  const workspaceId = randomUUID()
  const siblingWorkspaceId = randomUUID()
  const projectId = randomUUID()
  const siblingProjectId = randomUUID()
  const artifactId = randomUUID()
  const brainRevisionId = randomUUID()
  const sourceRevision = 'c'.repeat(40)
  const brainDigest = 'a'.repeat(64)
  const identities = Object.freeze({
    allowed: randomUUID(),
    missingMembership: randomUUID(),
    revokedManage: randomUUID(),
    revokedBind: randomUUID(),
    genericReader: randomUUID(),
    foreign: randomUUID(),
  })

  for (const [name, accountId] of Object.entries(identities)) {
    await query(fresh, `INSERT INTO iam.account(account_id, issuer, external_subject, display_name)
      VALUES ($1, 'https://issuer.test', $2, $2)`, [accountId, `r2-p6-${name}`])
  }
  await query(fresh, `INSERT INTO workspace.workspace(workspace_id, name) VALUES
    ($1, 'P6 exact Workspace'), ($2, 'P6 sibling Workspace')`, [workspaceId, siblingWorkspaceId])
  await query(fresh, `INSERT INTO project.project(
      project_id, workspace_id, name, source_mode, source_revision, project_revision
    ) VALUES
      ($1, $2, 'P6 exact Project', 'NEW', $4, 'p6-exact'),
      ($3, $5, 'P6 sibling Project', 'NEW', $4, 'p6-sibling')`,
  [projectId, workspaceId, siblingProjectId, sourceRevision, siblingWorkspaceId])
  for (const accountId of [identities.allowed, identities.revokedManage, identities.revokedBind, identities.genericReader]) {
    await query(fresh, `INSERT INTO iam.workspace_membership(
      account_id, workspace_id, can_create_project, can_read_brain
    ) VALUES ($1, $2, false, $3)`, [accountId, workspaceId, accountId === identities.genericReader])
  }
  for (const [accountId, canManage, canBindBrain] of [
    [identities.allowed, true, true],
    [identities.missingMembership, true, true],
    [identities.revokedBind, true, false],
  ]) {
    await query(fresh, `INSERT INTO iam.account_project_grant(
      account_id, project_id, can_read, can_manage, can_bind_brain
    ) VALUES ($1, $2, true, $3, $4)`, [accountId, projectId, canManage, canBindBrain])
  }
  await query(fresh, 'SELECT reg.bootstrap_workspace_brain($1, $2, $3, $4, $5, $6)', [
    artifactId, workspaceId, brainRevisionId, sourceRevision, brainDigest, source,
  ])

  const password = `r2-p6-${randomUUID()}`
  await query(fresh, `ALTER ROLE hub_r2_brain_read PASSWORD '${password}'`)
  const roleUrl = new URL(url)
  roleUrl.username = 'hub_r2_brain_read'
  roleUrl.password = password
  const rolePool = new pg.Pool({ connectionString: roleUrl.toString(), max: 2 })
  beforeDrop.push(() => rolePool.end())

  const restricted = await rolePool.connect()
  try {
    await restricted.query('BEGIN READ ONLY')
    assert.deepEqual((await restricted.query(
      'SELECT * FROM iam.admit_brain_revision_selection($1, $2, $3)',
      [identities.allowed, projectId, workspaceId],
    )).rows, [{ project_id: projectId, workspace_id: workspaceId, scope_exists: true, permitted: true }])
    await restricted.query('ROLLBACK')
  } finally {
    restricted.release()
  }
  await assert.rejects(query({ connectionString: roleUrl.toString() }, 'SELECT * FROM project.project'), /permission denied/)
  assert.equal((await query(fresh, `SELECT has_function_privilege(
    'hub_r2_brain_read', 'iam.admit_brain_revision_selection(uuid, uuid, uuid)', 'EXECUTE'
  ) AS admitted,
  has_function_privilege(
    'hub_r2_project_binding', 'iam.admit_brain_revision_selection(uuid, uuid, uuid)', 'EXECUTE'
  ) AS binding_role_admitted`)).rows[0].admitted, true)
  assert.equal((await query(fresh, `SELECT has_function_privilege(
    'hub_r2_project_binding', 'iam.admit_brain_revision_selection(uuid, uuid, uuid)', 'EXECUTE'
  ) AS admitted`)).rows[0].admitted, false)

  const brain = createBrainModule({
    pool: rolePool,
    registry: createRegistryStore(),
    resolveCurrentSession: async (request) => {
      const accountId = request.headers['x-proof-account']
      return typeof accountId === 'string' ? { account: { accountId } } : null
    },
  })
  const app = await createHttpApp({ staticRoot: null, registerRoutes: (server) => brain.registerBrainRoutes(server) })
  beforeDrop.push(() => app.close())
  const historyUrl = `/api/control/workspaces/${workspaceId}/brain/revisions`
  const request = (accountId, requestWorkspaceId = workspaceId, requestProjectId = projectId) => app.inject({
    method: 'GET',
    url: `/api/control/workspaces/${requestWorkspaceId}/brain/revisions?forProjectId=${requestProjectId}`,
    headers: { 'x-proof-account': accountId },
  })

  const allowed = await request(identities.allowed)
  assert.equal(allowed.statusCode, 200)
  assert.deepEqual(allowed.json(), [{
    brainRevisionId,
    brainDigest,
    sourceRevision,
    availability: 'AVAILABLE',
    reviewText: source.reviewText,
  }])
  const ordinary = await app.inject({
    method: 'GET', url: historyUrl, headers: { 'x-proof-account': identities.allowed },
  })
  assert.equal(ordinary.statusCode, 403, 'brain.bind must not imply generic brain.read')
  assert.equal((await app.inject({
    method: 'GET', url: historyUrl, headers: { 'x-proof-account': identities.genericReader },
  })).statusCode, 200, 'ordinary brain.read remains unchanged')

  for (const accountId of [identities.revokedBind]) {
    const denied = await request(accountId)
    assert.equal(denied.statusCode, 403)
    assert.equal(denied.json().type, 'urn:conexus:problem:brain-binding-selection-required')
  }
  for (const response of [
    await request(identities.missingMembership),
    await request(identities.revokedManage),
    await request(identities.foreign),
    await request(identities.allowed, siblingWorkspaceId, projectId),
    await request(identities.allowed, workspaceId, siblingProjectId),
    await request(identities.allowed, workspaceId, randomUUID()),
  ]) {
    assert.equal(response.statusCode, 404)
    assert.equal(response.json().type, 'urn:conexus:problem:brain-not-found')
  }

  await query(fresh, 'UPDATE reg.artifact_revision SET payload = $1 WHERE artifact_revision_id = $2', [
    { schemaVersion: 'malformed' }, brainRevisionId,
  ])
  const malformed = await request(identities.allowed)
  assert.equal(malformed.statusCode, 500)
  assert.equal(malformed.body.includes('malformed'), false)
})
