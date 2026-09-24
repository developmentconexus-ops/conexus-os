import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { test } from 'node:test'
import pg from 'pg'
import { runHubMigrations } from '../../scripts/run-hub-migrations.mjs'
import { hubModuleUrl } from './hub-build.mjs'

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

const applicationDatabase = async (t, label) => {
  const admin = { host: process.env.CONEXUS_TEST_DB_HOST, port: Number(process.env.CONEXUS_TEST_DB_PORT), database: process.env.CONEXUS_TEST_DB_NAME, user: process.env.CONEXUS_TEST_DB_USER, password: process.env.CONEXUS_TEST_DB_PASSWORD }
  const database = `conexus_${label}_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 8)}`
  const rootClient = await connect(admin)
  await rootClient.query(`CREATE DATABASE "${database}"`)
  let client
  const closeFirst = []
  t.after(async () => {
    for (const close of closeFirst) await close()
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
  return { client, connection: { ...admin, database }, closeFirst: (close) => closeFirst.push(close), account, workspace, project }
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

test('application sessions: sign-in, handoff, per-request authority, the Keycloak re-check and the Hub session refusal', { skip: configured ? false : 'real PostgreSQL configuration not supplied' }, async (t) => {
  const { createApplicationSessions } = await import(hubModuleUrl('identity-access/application-session.js'))
  const { createIdentityAccessStore } = await import(hubModuleUrl('identity-access/store.js'))
  const { client, connection, closeFirst, account, workspace, project } = await applicationDatabase(t, 'application_session')
  const pool = new pg.Pool({ ...connection, max: 4 })
  closeFirst(() => pool.end())
  const refreshes = []
  let providerAnswer = { kind: 'ACTIVE', refreshToken: 'refresh-2' }
  const sessions = createApplicationSessions({ pool, refresh: async (input) => { refreshes.push(input); return providerAnswer } })
  const hubStore = createIdentityAccessStore({ pool })

  const owner = await account('owner-s')
  const control = await account('control-s')
  const workspaceId = await workspace('purchasing-s', [[owner, 'owner']])
  await workspace('elsewhere-s', [[control, 'owner']])
  const projectId = await project(workspaceId, 'Caderno de Compras')
  const otherProject = await project(workspaceId, 'Outro')
  const grantAccess = (projectRef, email) => client.query('SELECT iam.grant_application_access($1,$2,$3,$4,$5)', [owner, projectRef, randomUUID(), email, inTwoWeeks()])
  await grantAccess(projectId, 'funcionaria@application.test')
  await grantAccess(otherProject, 'ninguem@application.test')

  const identity = (subject, email, displayName = null) => ({ issuer: 'https://application.test', subject, verifiedEmail: email, displayName, refreshToken: `refresh-${subject}` })
  const binding = 'binding-secret'
  const bindingDigest = createHash('sha256').update(binding).digest()
  const T0 = new Date('2026-09-23T12:00:00.000Z')
  const at = (ms) => new Date(T0.getTime() + ms)
  const signIn = (who, existingAccountId = null, projectRef = projectId, now = T0) =>
    sessions.signIn({ identity: who, existingAccountId, projectId: projectRef, bindingDigest, now })
  const sessionRow = async (accountId) => (await client.query('SELECT ended_reason, provider_refresh_token FROM iam.application_session WHERE account_id = $1 ORDER BY authenticated_at DESC, ended_at DESC NULLS FIRST LIMIT 1', [accountId])).rows[0]

  const employee = identity('employee-sub', 'Funcionaria@Application.test', 'Funcionária Teste')
  let employeeId
  let token

  await t.test('an invited email gets an app-only Account named by the provider, and the Hub refuses it a session', async () => {
    const outcome = await signIn(employee)
    assert.equal(outcome.kind, 'HANDOFF')
    assert.equal(outcome.slug, 'caderno-de-compras')
    const created = (await client.query("SELECT account_id, display_name, email, origin FROM iam.account WHERE external_subject = 'employee-sub'")).rows[0]
    employeeId = created.account_id
    assert.deepEqual({ displayName: created.display_name, email: created.email, origin: created.origin },
      { displayName: 'Funcionária Teste', email: 'funcionaria@application.test', origin: 'APPLICATION_INVITATION' })
    assert.equal((await client.query('SELECT iam.account_access_scope($1) AS scope', [employeeId])).rows[0].scope, 'APPLICATION_ONLY')
    assert.equal((await client.query('SELECT count(*)::int AS n FROM iam.application_grant WHERE account_id = $1 AND revoked_at IS NULL', [employeeId])).rows[0].n, 1)
    assert.equal((await client.query('SELECT count(*)::int AS n FROM iam.workspace_membership WHERE account_id = $1', [employeeId])).rows[0].n, 0)
    await assert.rejects(hubStore.createSession({ accountId: employeeId }), /IDENTITY_NOT_ELIGIBLE/)
    assert.equal((await client.query('SELECT count(*)::int AS n FROM iam.session WHERE account_id = $1', [employeeId])).rows[0].n, 0)

    const redeemed = await sessions.redeem({ handoff: outcome.handoff, projectId, binding, now: at(1_000) })
    assert.equal(redeemed.maxAgeSeconds, 8 * 60 * 60 - 1)
    token = redeemed.sessionToken
  })

  await t.test('without a provider name the display name is the verified email, and a stranger gets no Account', async () => {
    await grantAccess(projectId, 'sem-nome@application.test')
    assert.equal((await signIn(identity('no-name-sub', 'sem-nome@application.test'))).kind, 'HANDOFF')
    assert.equal((await client.query("SELECT display_name FROM iam.account WHERE external_subject = 'no-name-sub'")).rows[0].display_name, 'sem-nome@application.test')
    assert.deepEqual(await signIn(identity('stranger-sub', 'stranger@application.test')), { kind: 'NO_ACCESS', slug: 'caderno-de-compras' })
    assert.deepEqual(await signIn(identity('unverified-sub', null)), { kind: 'NO_ACCESS', slug: 'caderno-de-compras' })
    assert.equal((await client.query("SELECT count(*)::int AS n FROM iam.account WHERE external_subject IN ('stranger-sub', 'unverified-sub')")).rows[0].n, 0)
  })

  await t.test('a handoff dies on first use, on the wrong binding, on another application and after sixty seconds', async () => {
    const redeem = async (handoff, overrides = {}) => sessions.redeem({ handoff, projectId, binding, now: at(1_000), ...overrides })
    const fresh = async () => (await signIn(employee, employeeId)).handoff
    const once = await fresh()
    assert.ok(await redeem(once))
    assert.equal(await redeem(once), null, 'second redemption')
    const wrongBinding = await fresh()
    assert.equal(await redeem(wrongBinding, { binding: 'another-browser' }), null)
    assert.equal(await redeem(wrongBinding), null, 'the wrong binding burnt it')
    const wrongApplication = await fresh()
    assert.equal(await redeem(wrongApplication, { projectId: otherProject }), null)
    const late = await fresh()
    assert.equal(await redeem(late, { now: at(60_000) }), null, 'sixty seconds after the sign-in')
  })

  await t.test('a session resolves to its caller only on its own application and before eight hours', async () => {
    assert.deepEqual(await sessions.authority({ sessionToken: token, projectId, now: at(60_000) }),
      { kind: 'SIGNED_IN', caller: { accountId: employeeId, email: 'funcionaria@application.test', displayName: 'Funcionária Teste' } })
    assert.deepEqual(await sessions.authority({ sessionToken: token, projectId: otherProject, now: at(60_000) }), { kind: 'SIGN_IN_REQUIRED' })
    assert.deepEqual(await sessions.authority({ sessionToken: 'x'.repeat(43), projectId, now: at(60_000) }), { kind: 'SIGN_IN_REQUIRED' })
    assert.deepEqual(refreshes, [], 'no Keycloak check inside five minutes')
    const eight = (await signIn(employee, employeeId)).handoff
    const long = (await sessions.redeem({ handoff: eight, projectId, binding, now: at(1_000) })).sessionToken
    providerAnswer = { kind: 'ACTIVE', refreshToken: 'refresh-long' }
    assert.equal((await sessions.authority({ sessionToken: long, projectId, now: at(8 * 60 * 60 * 1000 - 1) })).kind, 'SIGNED_IN')
    assert.deepEqual(await sessions.authority({ sessionToken: long, projectId, now: at(8 * 60 * 60 * 1000) }), { kind: 'SIGN_IN_REQUIRED' })
    assert.deepEqual((await client.query("SELECT ended_reason, provider_refresh_token FROM iam.application_session WHERE ended_reason = 'EXPIRED'")).rows,
      [{ ended_reason: 'EXPIRED', provider_refresh_token: null }])
    assert.deepEqual(await refusal(() => client.query("UPDATE iam.application_session SET absolute_expires_at = absolute_expires_at + interval '1 minute'")),
      { code: '23514', message: 'new row for relation "application_session" violates check constraint "application_session_absolute_check"' })
  })

  await t.test('after five minutes Keycloak is asked again: unreachable refuses, active rotates the token, refused ends the session', async () => {
    providerAnswer = { kind: 'UNAVAILABLE' }
    refreshes.length = 0
    assert.deepEqual(await sessions.authority({ sessionToken: token, projectId, now: at(5 * 60 * 1000 + 1_000) }), { kind: 'PROVIDER_UNAVAILABLE' })
    assert.deepEqual(refreshes, [{ refreshToken: 'refresh-employee-sub', expectedSubject: 'employee-sub' }])
    assert.equal((await client.query('SELECT count(*)::int AS n FROM iam.application_session WHERE account_id = $1 AND ended_at IS NULL', [employeeId])).rows[0].n > 0, true)

    providerAnswer = { kind: 'ACTIVE', refreshToken: 'refresh-rotated' }
    const [first, second] = await Promise.all([
      sessions.authority({ sessionToken: token, projectId, now: at(5 * 60 * 1000 + 2_000) }),
      sessions.authority({ sessionToken: token, projectId, now: at(5 * 60 * 1000 + 2_000) }),
    ])
    assert.equal(first.kind, 'SIGNED_IN')
    assert.equal(second.kind, 'SIGNED_IN')
    assert.equal((await client.query('SELECT count(*)::int AS n FROM iam.application_session WHERE provider_refresh_token = $1', ['refresh-rotated'])).rows[0].n, 1)

    providerAnswer = { kind: 'REFUSED' }
    assert.deepEqual(await sessions.authority({ sessionToken: token, projectId, now: at(10 * 60 * 1000 + 3_000) }), { kind: 'SIGN_IN_REQUIRED' })
    assert.deepEqual(await sessions.authority({ sessionToken: token, projectId, now: at(10 * 60 * 1000 + 4_000) }), { kind: 'SIGN_IN_REQUIRED' })
    assert.deepEqual((await client.query("SELECT ended_reason, provider_refresh_token FROM iam.application_session WHERE ended_reason = 'PROVIDER_REFUSED'")).rows,
      [{ ended_reason: 'PROVIDER_REFUSED', provider_refresh_token: null }])
  })

  await t.test('revoking the grant stops the next request and drops the refresh token', async () => {
    providerAnswer = { kind: 'ACTIVE', refreshToken: 'refresh-3' }
    const handoff = (await signIn(employee, employeeId)).handoff
    const live = (await sessions.redeem({ handoff, projectId, binding, now: at(1_000) })).sessionToken
    assert.equal((await sessions.authority({ sessionToken: live, projectId, now: at(2_000) })).kind, 'SIGNED_IN')
    const grantId = (await client.query('SELECT grant_id FROM iam.application_grant WHERE account_id = $1 AND revoked_at IS NULL', [employeeId])).rows[0].grant_id
    assert.equal((await client.query('SELECT iam.revoke_application_grant($1,$2,$3) AS found', [owner, projectId, grantId])).rows[0].found, true)
    assert.equal((await client.query('SELECT count(*)::int AS n FROM iam.application_session WHERE account_id = $1 AND ended_at IS NULL', [employeeId])).rows[0].n, 0,
      'revocation ended every open session of the person for this application')
    assert.deepEqual(await sessions.authority({ sessionToken: live, projectId, now: at(3_000) }), { kind: 'SIGN_IN_REQUIRED' })
    assert.deepEqual(await signIn(employee, employeeId), { kind: 'NO_ACCESS', slug: 'caderno-de-compras' })
  })

  await t.test('a revoke holds: re-granting a person who holds a grant opens no invitation, and revoking withdraws any invitation left for them', async () => {
    const person = identity('revoke-sub', 'revoga@application.test', 'Revogada')
    const openInvitations = async () => (await client.query('SELECT count(*)::int AS n FROM iam.application_invitation WHERE project_id = $1 AND email = $2', [projectId, 'revoga@application.test'])).rows[0].n
    const openGrants = async (accountId) => (await client.query('SELECT count(*)::int AS n FROM iam.application_grant WHERE project_id = $1 AND account_id = $2 AND revoked_at IS NULL', [projectId, accountId])).rows[0].n

    await grantAccess(projectId, 'revoga@application.test')
    assert.equal((await signIn(person)).kind, 'HANDOFF')
    const personId = (await client.query("SELECT account_id FROM iam.account WHERE external_subject = 'revoke-sub'")).rows[0].account_id
    assert.equal(await openGrants(personId), 1)

    await grantAccess(projectId, ' Revoga@Application.test ')
    assert.equal(await openInvitations(), 0, 're-granting a person who already holds a grant is a no-op')

    await client.query('INSERT INTO iam.application_invitation(invitation_id, project_id, email, invited_by, expires_at) VALUES ($1,$2,$3,$4,$5)',
      [randomUUID(), projectId, 'revoga@application.test', owner, inTwoWeeks()])
    const grantId = (await client.query('SELECT grant_id FROM iam.application_grant WHERE project_id = $1 AND account_id = $2 AND revoked_at IS NULL', [projectId, personId])).rows[0].grant_id
    assert.equal((await client.query('SELECT iam.revoke_application_grant($1,$2,$3) AS found', [owner, projectId, grantId])).rows[0].found, true)
    assert.equal(await openInvitations(), 0, 'revoking withdrew the invitation a pre-fix re-grant left open')

    assert.deepEqual(await signIn(person, personId), { kind: 'NO_ACCESS', slug: 'caderno-de-compras' })
    assert.equal(await openGrants(personId), 0, 'the next sign-in claimed nothing')
  })

  await t.test('a member of the Workspace uses the application without a grant; a member of another Workspace does not', async () => {
    assert.deepEqual(await signIn(identity('control-sub', 'control-s@application.test'), control), { kind: 'NO_ACCESS', slug: 'caderno-de-compras' })
    const handoff = (await signIn(identity('owner-sub', 'owner-s@application.test'), owner)).handoff
    const ownerToken = (await sessions.redeem({ handoff, projectId, binding, now: at(1_000) })).sessionToken
    assert.equal((await sessions.authority({ sessionToken: ownerToken, projectId, now: at(2_000) })).caller.accountId, owner)

    await client.query('UPDATE project.project SET archived = true WHERE project_id = $1', [projectId])
    assert.deepEqual(await sessions.authority({ sessionToken: ownerToken, projectId, now: at(3_000) }), { kind: 'SIGN_IN_REQUIRED' }, 'an archived Project serves no application')
    await client.query('UPDATE project.project SET archived = false WHERE project_id = $1', [projectId])
  })

  await t.test('an app-only Account that joins a Workspace becomes a Control Plane Account, and drops back when removed', async () => {
    await client.query('INSERT INTO iam.workspace_membership(account_id, workspace_id, role) VALUES ($1,$2,$3)', [employeeId, workspaceId, 'member'])
    assert.equal((await client.query('SELECT iam.account_access_scope($1) AS scope', [employeeId])).rows[0].scope, 'CONTROL_PLANE')
    const hubSession = await hubStore.createSession({ accountId: employeeId })
    assert.ok(await hubStore.validateSession({ sessionToken: hubSession.sessionToken }))
    await client.query('DELETE FROM iam.workspace_membership WHERE account_id = $1', [employeeId])
    assert.equal(await hubStore.validateSession({ sessionToken: hubSession.sessionToken }), null, 'removed again, the Hub session no longer resolves')
  })

  await t.test('the served artifact is read only through application access', async () => {
    const reads = async (accountId) => (await client.query('SELECT * FROM reg.get_served_application($1,$2)', [accountId, otherProject])).rows
    assert.deepEqual(await reads(control), [])
    assert.deepEqual(await reads(owner), [], 'no Preview has been built, so nothing is served')
  })
})
