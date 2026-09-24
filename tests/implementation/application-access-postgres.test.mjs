import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import pg from 'pg'
import { runHubMigrations } from '../../scripts/run-hub-migrations.mjs'

const configured = ['CONEXUS_TEST_DB_HOST', 'CONEXUS_TEST_DB_PORT', 'CONEXUS_TEST_DB_NAME', 'CONEXUS_TEST_DB_USER', 'CONEXUS_TEST_DB_PASSWORD'].every((name) => process.env[name])
const connect = async (connection) => { const client = new pg.Client(connection); await client.connect(); return client }

const refusal = async (run) => {
  try {
    await run()
  } catch (error) {
    return { code: error.code, message: error.message }
  }
  return { code: null, message: null }
}

const applicationDatabase =async (t, label) => {
  const admin = { host: process.env.CONEXUS_TEST_DB_HOST, port: Number(process.env.CONEXUS_TEST_DB_PORT), database: process.env.CONEXUS_TEST_DB_NAME, user: process.env.CONEXUS_TEST_DB_USER, password: process.env.CONEXUS_TEST_DB_PASSWORD }
  const database = `conexus_${label}_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 8)}`
  const rootClient = await connect(admin)
  await rootClient.query(`CREATE DATABASE "${database}"`)
  let client
  t.after(async () => {
    await client?.end()
    await rootClient.query(`DROP DATABASE "${database}" WITH (FORCE)`)
    await rootClient.end()
  })
  const url = new URL('postgresql://localhost')
  url.hostname = admin.host
  url.port = String(admin.port)
  url.pathname = `/${database}`
  url.username = admin.user
  url.password = admin.password
  await runHubMigrations({ connectionString: url.toString() })
  client = await connect({ ...admin, database })
  const account = async (label, { active = true } = {}) => {
    const accountId = randomUUID()
    await client.query('INSERT INTO iam.account(account_id, issuer, external_subject, display_name, email, active) VALUES ($1,$2,$3,$4,$5,$6)',
      [accountId, 'https://application.test', accountId, label, `${label}@application.test`, active])
    return accountId
  }
  const workspace = async (label, members = []) => {
    const workspaceId = randomUUID()
    await client.query('INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1,$2)', [workspaceId, label])
    for (const [accountId, role] of members) {
      await client.query('INSERT INTO iam.workspace_membership(account_id, workspace_id, role) VALUES ($1,$2,$3)', [accountId, workspaceId, role])
    }
    return workspaceId
  }
  const project = async (workspaceId, name) => {
    const projectId = randomUUID()
    await client.query("INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision) VALUES ($1,$2,$3,'NEW',$4,$5)",
      [projectId, workspaceId, name, 'a'.repeat(40), name])
    return projectId
  }
  return { client, account, workspace, project }
}

const inTwoWeeks = () => new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)

test('application access: Owners grant, list and narrow it, and nobody else learns it exists', { skip: configured ? false : 'real PostgreSQL configuration not supplied' }, async (t) => {
  const { client, account, workspace, project } = await applicationDatabase(t, 'application_access')
  const grantAccess = (actor, projectId, email, invitationId = randomUUID()) =>
    client.query('SELECT iam.grant_application_access($1,$2,$3,$4,$5) AS invitation_id', [actor, projectId, invitationId, email, inTwoWeeks()])
  const list = async (actor, projectId) =>
    (await client.query('SELECT kind, entry_id, account_id, display_name, email, slug FROM iam.list_application_access($1,$2) ORDER BY kind, email', [actor, projectId])).rows

  await t.test('the slug comes from the Project name, folds accents and never takes a platform label', async () => {
    const slugs = await client.query('SELECT iam.application_slug_base(name) AS slug FROM unnest($1::text[]) WITH ORDINALITY AS given(name, position) ORDER BY position',
      [['Caderno de Compras', 'Hub', 'Ação & Reação!', 'preview-notes', '2026 Orçamento', '   ', 'x'.repeat(60)]])
    assert.deepEqual(slugs.rows.map((row) => row.slug), [
      'caderno-de-compras', 'app-hub', 'acao-reacao', 'app-preview-notes', 'app-2026-orcamento', 'aplicativo', 'x'.repeat(36),
    ])
  })

  await t.test('the first grant fixes the address, a repeat answers the same invitation, and a second Project with the same name gets -2', async () => {
    const owner = await account('owner')
    const workspaceId = await workspace('purchasing', [[owner, 'owner']])
    const notebook = await project(workspaceId, 'Caderno de Compras')
    const twin = await project(workspaceId, 'Caderno de Compras')

    const first = (await grantAccess(owner, notebook, ' Funcionaria@Application.test ')).rows[0].invitation_id
    const repeat = (await grantAccess(owner, notebook, 'funcionaria@application.test')).rows[0].invitation_id
    assert.equal(repeat, first)
    assert.deepEqual(await list(owner, notebook), [
      { kind: 'application', entry_id: null, account_id: null, display_name: null, email: null, slug: 'caderno-de-compras' },
      { kind: 'invitation', entry_id: first, account_id: null, display_name: null, email: 'funcionaria@application.test', slug: null },
    ])

    await grantAccess(owner, twin, 'funcionaria@application.test')
    assert.equal((await list(owner, twin))[0].slug, 'caderno-de-compras-2')
    await client.query("UPDATE project.project SET name = 'Outro Nome' WHERE project_id = $1", [notebook])
    await grantAccess(owner, notebook, 'outra@application.test')
    assert.equal((await list(owner, notebook))[0].slug, 'caderno-de-compras', 'the address never changes after the first grant')
  })

  await t.test('a member who is not an Owner is refused, and a stranger or an inactive Owner is told nothing', async () => {
    const owner = await account('owner-b')
    const plain = await account('member-b')
    const stranger = await account('stranger-b')
    const dormant = await account('dormant-b', { active: false })
    const workspaceId = await workspace('b', [[owner, 'owner'], [plain, 'member'], [dormant, 'owner']])
    const projectId = await project(workspaceId, 'Notas')
    await grantAccess(owner, projectId, 'x@application.test')

    for (const [actor, expected] of [[plain, { code: '42501', message: 'NOT_ADMITTED' }], [stranger, { code: 'P0002', message: 'APPLICATION_NOT_FOUND' }], [dormant, { code: 'P0002', message: 'APPLICATION_NOT_FOUND' }]]) {
      assert.deepEqual(await refusal(() => list(actor, projectId)), expected)
      assert.deepEqual(await refusal(() => grantAccess(actor, projectId, 'y@application.test')), expected)
    }
    assert.deepEqual(await refusal(() => list(owner, randomUUID())), { code: 'P0002', message: 'APPLICATION_NOT_FOUND' })
  })

  await t.test('narrowing is scoped to the named Project and a revoked grant is kept as a record', async () => {
    const owner = await account('owner-c')
    const grantee = await account('grantee-c')
    const workspaceId = await workspace('c', [[owner, 'owner']])
    const projectId = await project(workspaceId, 'Pedidos')
    const other = await project(workspaceId, 'Outro')
    const invitationId = (await grantAccess(owner, projectId, 'z@application.test')).rows[0].invitation_id
    await grantAccess(owner, other, 'w@application.test')
    const grantId = randomUUID()
    await client.query('INSERT INTO iam.application_grant(grant_id, project_id, account_id, granted_by) VALUES ($1,$2,$3,$4)', [grantId, projectId, grantee, owner])

    const cancel = async (projectRef, id) => (await client.query('SELECT iam.cancel_application_invitation($1,$2,$3) AS found', [owner, projectRef, id])).rows[0].found
    const revoke = async (projectRef, id) => (await client.query('SELECT iam.revoke_application_grant($1,$2,$3) AS found', [owner, projectRef, id])).rows[0].found
    assert.equal(await cancel(other, invitationId), false)
    assert.equal(await revoke(other, grantId), false)
    assert.deepEqual((await list(owner, projectId)).map((row) => row.kind), ['application', 'grant', 'invitation'])

    assert.equal(await revoke(projectId, grantId), true)
    assert.equal(await revoke(projectId, grantId), false)
    assert.equal(await cancel(projectId, invitationId), true)
    assert.deepEqual((await list(owner, projectId)).map((row) => row.kind), ['application'])
    const record = (await client.query('SELECT revoked_by, revoked_at IS NOT NULL AS revoked FROM iam.application_grant WHERE grant_id = $1', [grantId])).rows
    assert.deepEqual(record, [{ revoked_by: owner, revoked: true }])

    await client.query('INSERT INTO iam.application_grant(project_id, account_id, granted_by) VALUES ($1,$2,$3)', [projectId, grantee, owner])
    assert.deepEqual(await refusal(() => client.query('INSERT INTO iam.application_grant(project_id, account_id, granted_by) VALUES ($1,$2,$3)', [projectId, grantee, owner])),
      { code: '23505', message: 'duplicate key value violates unique constraint "application_grant_open_key"' })
  })

  await t.test('the address refuses a label that would share a host with the Hub or a Preview', async () => {
    const owner = await account('owner-d')
    const projectId = await project(await workspace('d', [[owner, 'owner']]), 'd')
    for (const slug of ['hub', 'preview-abc', 'Caps', 'a--b', '-a', 'a'.repeat(41)]) {
      assert.equal((await refusal(() => client.query('INSERT INTO iam.application(project_id, slug, created_by) VALUES ($1,$2,$3)', [projectId, slug, owner]))).code, '23514', slug)
    }
  })
})
