import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { test } from 'node:test'
import pg from 'pg'
import { loadHubMigrationFiles, runHubMigrations, runMigrations } from '../../scripts/run-hub-migrations.mjs'
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

const applicationDatabase = async (t, label, { migrate = (connectionString) => runHubMigrations({ connectionString }) } = {}) => {
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
  await migrate(url.toString())
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
  return { client, url: url.toString(), connection: { ...admin, database }, closeFirst: (close) => closeFirst.push(close), account, workspace, project }
}

const inTwoWeeks = () => new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)

test('application access: Owners grant, list and narrow it, and nobody else learns it exists', { skip: configured ? false : 'real PostgreSQL configuration not supplied' }, async (t) => {
  const { client, account, workspace, project } = await applicationDatabase(t, 'application_access')
  const grantAccess = (actor, projectId, email, invitationId = randomUUID()) =>
    client.query('SELECT entry_id AS invitation_id FROM iam.grant_application_access($1,$2,$3,$4,$5)', [actor, projectId, invitationId, email, inTwoWeeks()])
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

test('upgrading withdraws the invitations a revoke left open before 0024, and keeps one an Owner issued after the revoke', { skip: configured ? false : 'real PostgreSQL configuration not supplied' }, async (t) => {
  const { client, url, account, workspace, project } = await applicationDatabase(t, 'leftover_invitations', {
    migrate: (connectionString) => runMigrations({ connectionString, migrations: loadHubMigrationFiles().filter((migration) => migration.version <= '0024'), catalogSnapshot: null }),
  })
  const owner = await account('owner-l')
  const left = await account('left-l')
  const regranted = await account('regranted-l')
  const projectId = await project(await workspace('l', [[owner, 'owner']]), 'Sobras')
  await client.query('SELECT iam.grant_application_access($1,$2,$3,$4,$5)', [owner, projectId, randomUUID(), 'pendente@application.test', inTwoWeeks()])
  for (const person of [left, regranted]) {
    await client.query("INSERT INTO iam.application_grant(project_id, account_id, granted_by, granted_at, revoked_at, revoked_by) VALUES ($1, $2, $3, now() - interval '3 days', now() - interval '1 day', $3)",
      [projectId, person, owner])
  }
  // A re-grant before 0024 opened this one while the grant was held, and the revoke left it open.
  await client.query("INSERT INTO iam.application_invitation(invitation_id, project_id, email, invited_by, created_at, expires_at) VALUES ($1, $2, 'left-l@application.test', $3, now() - interval '2 days', now() + interval '12 days')",
    [randomUUID(), projectId, owner])
  // An Owner granted this person again after the revoke.
  await client.query("INSERT INTO iam.application_invitation(invitation_id, project_id, email, invited_by, expires_at) VALUES ($1, $2, 'regranted-l@application.test', $3, now() + interval '14 days')",
    [randomUUID(), projectId, owner])

  await runHubMigrations({ connectionString: url })
  assert.deepEqual((await client.query('SELECT email FROM iam.application_invitation WHERE project_id = $1 ORDER BY email', [projectId])).rows.map((row) => row.email),
    ['pendente@application.test', 'regranted-l@application.test'])
})

test('application sessions: sign-in, handoff, per-request authority, the Keycloak re-check and the Hub session refusal', { skip: configured ? false : 'real PostgreSQL configuration not supplied' }, async (t) => {
  const { createApplicationSessions } = await import(hubModuleUrl('identity-access/application-session.js'))
  const { createIdentityAccessStore } = await import(hubModuleUrl('identity-access/store.js'))
  const { createApplicationAccessStore } = await import(hubModuleUrl('identity-access/application-access.js'))
  const { client, connection, closeFirst, account, workspace, project } = await applicationDatabase(t, 'application_session')
  const pool = new pg.Pool({ ...connection, max: 4 })
  closeFirst(() => pool.end())
  const accessStore = createApplicationAccessStore({ pool })
  const refreshes = []
  let providerAnswer = { kind: 'ACTIVE', refreshToken: 'refresh-2' }
  const { createSecretEnvelope } = await import(hubModuleUrl('platform/secrets.js'))
  const envelope = createSecretEnvelope('ab'.repeat(32))
  const sessions = createApplicationSessions({ pool, refresh: async (input) => { refreshes.push(input); return providerAnswer }, envelope })
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

  await t.test('two first sign-ins of one identity that race both get in, as one Account', async () => {
    await grantAccess(projectId, 'corrida@application.test')
    const racer = identity('race-sub', 'corrida@application.test', 'Corrida')
    // Both callbacks looked the identity up before either provisioned it, so both pass no Account.
    const first = await signIn(racer)
    const second = await signIn(racer)
    assert.deepEqual([first.kind, second.kind], ['HANDOFF', 'HANDOFF'])
    assert.equal((await client.query("SELECT count(*)::int AS n FROM iam.account WHERE external_subject = 'race-sub'")).rows[0].n, 1)
  })

  await t.test('a first sign-in that loses the race between looking the identity up and reading its invitation still gets the Account', async () => {
    await grantAccess(projectId, 'intercalada@application.test')
    const provision = (connection) => connection.query('SELECT iam.provision_application_account($1, $2, $3, $4, $5) AS account_id',
      [randomUUID(), 'https://application.test', 'interleave-sub', 'intercalada@application.test', 'Intercalada'])
    const winner = new pg.Client(connection)
    const loser = new pg.Client(connection)
    await winner.connect()
    await loser.connect()
    try {
      // The winner holds the invitations, so the loser looks the identity up, finds no Account, and
      // then waits to read its invitation while the winner provisions the Account and claims it.
      await winner.query('BEGIN')
      await winner.query('LOCK TABLE iam.application_invitation IN ACCESS EXCLUSIVE MODE')
      const loserPid = (await loser.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
      const lost = provision(loser)
      for (let polls = 0; ; polls += 1) {
        const waiting = (await client.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid = $1', [loserPid])).rows[0]?.wait_event_type
        if (waiting === 'Lock') break
        if (polls === 200) throw new Error('the loser never reached the invitation read')
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
      const accountId = (await provision(winner)).rows[0].account_id
      await winner.query('SELECT iam.claim_application_invitations($1, $2)', [accountId, 'intercalada@application.test'])
      await winner.query('COMMIT')
      assert.equal((await lost).rows[0].account_id, accountId)
    } finally {
      await winner.end()
      await loser.end()
    }
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
    const checked = (await client.query('SELECT provider_refresh_token FROM iam.application_session WHERE token_digest = $1', [createHash('sha256').update(token).digest()])).rows[0]
    assert.equal(await envelope.open(checked.provider_refresh_token), 'refresh-rotated')

    providerAnswer = { kind: 'REFUSED', reason: 'USER_DISABLED' }
    assert.deepEqual(await sessions.authority({ sessionToken: token, projectId, now: at(10 * 60 * 1000 + 3_000) }), { kind: 'SIGN_IN_REQUIRED' })
    assert.deepEqual(await sessions.authority({ sessionToken: token, projectId, now: at(10 * 60 * 1000 + 4_000) }), { kind: 'SIGN_IN_REQUIRED' })
    assert.deepEqual((await client.query('SELECT ended_reason, provider_refresh_token FROM iam.application_session WHERE token_digest = $1', [createHash('sha256').update(token).digest()])).rows,
      [{ ended_reason: 'PROVIDER_USER_DISABLED', provider_refresh_token: null }], 'the ending names a disable')
  })

  await t.test('under Keycloak rotation, concurrent requests on two Hubs refresh once, keep the person signed in, and store only sealed tokens', async () => {
    const live = new Map()
    let issued = 0
    let refreshCalls = 0
    const issue = () => { const token = `rotating-${++issued}`; live.set(token, true); return token }
    // Keycloak with revokeRefreshToken and refreshTokenMaxReuse 0: a token works once, and reusing it is refused.
    const rotatingRefresh = async ({ refreshToken }) => {
      refreshCalls += 1
      await new Promise((resolve) => setTimeout(resolve, 25))
      if (!live.get(refreshToken)) return { kind: 'REFUSED', reason: 'REFUSED' }
      live.set(refreshToken, false)
      return { kind: 'ACTIVE', refreshToken: issue() }
    }
    const hubA = createApplicationSessions({ pool, refresh: rotatingRefresh, envelope })
    const hubB = createApplicationSessions({ pool, refresh: rotatingRefresh, envelope })
    const sealed = (value) => typeof value === 'string' && value.startsWith('mastra:factory-secret:v1:') && !value.includes('rotating-')

    await grantAccess(projectId, 'rotacao@application.test')
    const outcome = await hubA.signIn({ identity: { ...identity('rotation-sub', 'rotacao@application.test', 'Rotação'), refreshToken: issue() }, existingAccountId: null, projectId, bindingDigest, now: T0 })
    assert.equal(sealed((await client.query('SELECT provider_refresh_token FROM iam.application_handoff')).rows.at(-1).provider_refresh_token), true, 'the handoff holds the refresh token sealed')
    const sessionToken = (await hubB.redeem({ handoff: outcome.handoff, projectId, binding, now: at(1_000) })).sessionToken
    const stored = async () => (await client.query('SELECT s.provider_refresh_token FROM iam.application_session s JOIN iam.account a ON a.account_id = s.account_id WHERE a.external_subject = $1', ['rotation-sub'])).rows[0].provider_refresh_token
    assert.equal(sealed(await stored()), true, 'the session holds the refresh token sealed')

    const due = at(5 * 60 * 1000 + 1_000)
    const answers = await Promise.all([hubA, hubB, hubA, hubB].map((hub) => hub.authority({ sessionToken, projectId, now: due })))
    assert.deepEqual(answers.map((answer) => answer.kind), ['SIGNED_IN', 'SIGNED_IN', 'SIGNED_IN', 'SIGNED_IN'])
    assert.equal(refreshCalls, 1, 'one refresh for the session, whichever Hub asked')
    assert.equal(sealed(await stored()), true)
    assert.equal(await envelope.open(await stored()), 'rotating-2', 'the rotated token was stored before anyone could refresh again')

    assert.equal((await hubB.authority({ sessionToken, projectId, now: at(10 * 60 * 1000 + 2_000) })).kind, 'SIGNED_IN', 'the next check spends the rotated token')
    assert.equal(refreshCalls, 2)
  })

  const openSession = async (subject, email) => {
    await grantAccess(projectId, email)
    const handoff = (await signIn(identity(subject, email, subject))).handoff
    const sessionToken = (await sessions.redeem({ handoff, projectId, binding, now: at(1_000) })).sessionToken
    return { sessionToken, sessionDigest: createHash('sha256').update(sessionToken).digest() }
  }
  const outcomeOf = (answer) => answer.then((settled) => settled.kind, (error) => `THREW ${error.message}`)
  const checkDue = at(5 * 60 * 1000 + 1_000)

  await t.test('a refresh token the installation cannot open ends the session, for this request and every later one', async () => {
    const { sessionToken, sessionDigest } = await openSession('custody-sub', 'custodia@application.test')
    const foreign = createSecretEnvelope('cd'.repeat(32))
    await client.query('UPDATE iam.application_session SET provider_refresh_token = $2 WHERE token_digest = $1', [sessionDigest, await foreign.seal('refresh-custody-sub')])
    providerAnswer = { kind: 'ACTIVE', refreshToken: 'refresh-custody-2' }
    const first = await outcomeOf(sessions.authority({ sessionToken, projectId, now: checkDue }))
    const second = await outcomeOf(sessions.authority({ sessionToken, projectId, now: checkDue }))
    assert.deepEqual([first, second], ['SIGN_IN_REQUIRED', 'SIGN_IN_REQUIRED'])
    assert.deepEqual((await client.query('SELECT ended_reason, provider_refresh_token FROM iam.application_session WHERE token_digest = $1', [sessionDigest])).rows,
      [{ ended_reason: 'CUSTODY_CHANGED', provider_refresh_token: null }])
  })

  await t.test('an error while a request holds the check releases it, so the next request checks instead of skipping', async () => {
    const { sessionToken, sessionDigest } = await openSession('fault-sub', 'falha@application.test')
    let calls = 0
    const faulty = createApplicationSessions({
      pool, envelope,
      refresh: async () => {
        calls += 1
        if (calls === 1) throw new Error('KEYCLOAK_CLIENT_FAULT')
        return { kind: 'ACTIVE', refreshToken: 'refresh-fault-2' }
      },
    })
    assert.equal(await outcomeOf(faulty.authority({ sessionToken, projectId, now: checkDue })), 'THREW KEYCLOAK_CLIENT_FAULT')
    assert.equal(await outcomeOf(faulty.authority({ sessionToken, projectId, now: checkDue })), 'SIGNED_IN')
    assert.equal(calls, 2, 'the second request asked Keycloak itself')
    assert.deepEqual((await client.query('SELECT provider_check_claim, provider_checked_at FROM iam.application_session WHERE token_digest = $1', [sessionDigest])).rows,
      [{ provider_check_claim: null, provider_checked_at: checkDue }])
  })

  await t.test('a request that finds the check held by another request is not served unchecked, and does not wait forever', async () => {
    const { sessionToken, sessionDigest } = await openSession('held-sub', 'retida@application.test')
    const asked = []
    const hub = createApplicationSessions({ pool, envelope, refresh: async (input) => { asked.push(input); return { kind: 'ACTIVE', refreshToken: 'refresh-held-2' } } })
    // Another Hub claimed the check a moment ago and has not answered.
    await client.query('UPDATE iam.application_session SET provider_check_claim = $2, provider_check_claimed_at = clock_timestamp() WHERE token_digest = $1', [sessionDigest, randomUUID()])
    const started = Date.now()
    assert.equal(await outcomeOf(hub.authority({ sessionToken, projectId, now: checkDue })), 'PROVIDER_UNAVAILABLE')
    assert.deepEqual(asked, [])
    assert.ok(Date.now() - started < 10_000, 'the wait is bounded')
  })

  await t.test('a request whose claim was lost while Keycloak answered follows the session instead of serving it', async () => {
    const { sessionToken, sessionDigest } = await openSession('lost-sub', 'perdida@application.test')
    const hub = createApplicationSessions({
      pool, envelope,
      refresh: async () => {
        // The person signs out on another tab while this request waits for Keycloak.
        await client.query("SELECT iam.end_application_session($1, 'SIGNED_OUT')", [sessionDigest])
        return { kind: 'ACTIVE', refreshToken: 'refresh-lost-2' }
      },
    })
    assert.equal(await outcomeOf(hub.authority({ sessionToken, projectId, now: checkDue })), 'SIGN_IN_REQUIRED')
  })

  await t.test('a claim ages by the database clock: a Hub whose clock runs ahead does not take over a claim still in flight', async () => {
    const { sessionToken } = await openSession('skew-sub', 'relogio@application.test')
    let open
    const gate = new Promise((resolve) => { open = resolve })
    let entered
    const inside = new Promise((resolve) => { entered = resolve })
    const spent = new Set()
    let calls = 0
    // Keycloak with rotation: a refresh token works once.
    const refresh = async ({ refreshToken }) => {
      calls += 1
      entered()
      await gate
      if (spent.has(refreshToken)) return { kind: 'REFUSED', reason: 'REFUSED' }
      spent.add(refreshToken)
      return { kind: 'ACTIVE', refreshToken: `${refreshToken}-rotated` }
    }
    const hub = createApplicationSessions({ pool, envelope, refresh })
    const first = outcomeOf(hub.authority({ sessionToken, projectId, now: checkDue }))
    await inside
    const ahead = outcomeOf(hub.authority({ sessionToken, projectId, now: new Date(checkDue.getTime() + 2 * 60 * 1000) }))
    await new Promise((resolve) => setTimeout(resolve, 300))
    open()
    assert.deepEqual([await first, await ahead], ['SIGNED_IN', 'SIGNED_IN'])
    assert.equal(calls, 1, 'the token was spent once')
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

    const regranted = await accessStore.grant({ actor: owner, projectId, email: 'Revoga@Application.test' })
    assert.deepEqual({ kind: regranted.kind, accountId: regranted.accountId, displayName: regranted.displayName },
      { kind: 'grant', accountId: personId, displayName: 'Revogada' }, 're-granting answers the grant the person holds')
    assert.equal(await openInvitations(), 0, 're-granting a person who already holds a grant is a no-op')

    await client.query('INSERT INTO iam.application_invitation(invitation_id, project_id, email, invited_by, expires_at) VALUES ($1,$2,$3,$4,$5)',
      [randomUUID(), projectId, 'revoga@application.test', owner, inTwoWeeks()])
    const grantId = (await client.query('SELECT grant_id FROM iam.application_grant WHERE project_id = $1 AND account_id = $2 AND revoked_at IS NULL', [projectId, personId])).rows[0].grant_id
    assert.equal((await client.query('SELECT iam.revoke_application_grant($1,$2,$3) AS found', [owner, projectId, grantId])).rows[0].found, true)
    assert.equal(await openInvitations(), 0, 'revoking withdrew the invitation a pre-fix re-grant left open')

    assert.deepEqual(await signIn(person, personId), { kind: 'NO_ACCESS', slug: 'caderno-de-compras' })
    assert.equal(await openGrants(personId), 0, 'the next sign-in claimed nothing')
  })

  await t.test('a revoke holds whatever email the Account carries: an invitation issued before it is never claimed, one issued after it is', async () => {
    // An Account created elsewhere, whose stored email is not the address Keycloak verifies today.
    const personId = randomUUID()
    await client.query('INSERT INTO iam.account(account_id, issuer, external_subject, display_name, email) VALUES ($1, $2, $3, $4, $5)',
      [personId, 'https://application.test', 'moved-sub', 'Mudou de Email', 'antigo@application.test'])
    const person = identity('moved-sub', 'Atual@Application.test', 'Mudou de Email')
    const openGrants = async () => (await client.query('SELECT count(*)::int AS n FROM iam.application_grant WHERE project_id = $1 AND account_id = $2 AND revoked_at IS NULL', [projectId, personId])).rows[0].n

    await grantAccess(projectId, 'atual@application.test')
    assert.equal((await signIn(person, personId)).kind, 'HANDOFF')
    await grantAccess(projectId, 'atual@application.test')
    const grantId = (await client.query('SELECT grant_id FROM iam.application_grant WHERE project_id = $1 AND account_id = $2 AND revoked_at IS NULL', [projectId, personId])).rows[0].grant_id
    assert.equal((await client.query('SELECT iam.revoke_application_grant($1,$2,$3) AS found', [owner, projectId, grantId])).rows[0].found, true)

    assert.deepEqual(await signIn(person, personId), { kind: 'NO_ACCESS', slug: 'caderno-de-compras' }, 'the invitation issued before the revoke is dead')
    assert.equal(await openGrants(), 0)
    await grantAccess(projectId, 'atual@application.test')
    assert.equal((await signIn(person, personId)).kind, 'HANDOFF', 'an Owner granting again after the revoke is honoured')
    assert.equal(await openGrants(), 1)

    // Revoked again while an invitation issued before the revoke is still open, then granted again
    // before the person signs in: the repeat grant re-issues that invitation, and it is honoured.
    await grantAccess(projectId, 'atual@application.test')
    const again = (await client.query('SELECT grant_id FROM iam.application_grant WHERE project_id = $1 AND account_id = $2 AND revoked_at IS NULL', [projectId, personId])).rows[0].grant_id
    await client.query('SELECT iam.revoke_application_grant($1,$2,$3)', [owner, projectId, again])
    await grantAccess(projectId, 'atual@application.test')
    assert.equal((await signIn(person, personId)).kind, 'HANDOFF')
  })

  await t.test('the application host resolves a caller with a long name and any verified address, and the runner admits it', async () => {
    const { invokeBody } = await import(hubModuleUrl('app-runner/requests.js'))
    const displayName = `Setor de Compras e Fiscal ${'da Matriz '.repeat(25)}`.trim()
    await grantAccess(projectId, 'compras&fiscal@empresa.com.br')
    const handoff = (await signIn(identity('fiscal-sub', 'compras&fiscal@empresa.com.br', displayName))).handoff
    const sessionToken = (await sessions.redeem({ handoff, projectId, binding, now: at(1_000) })).sessionToken
    const authority = await sessions.authority({ sessionToken, projectId, now: at(2_000) })
    const accountId = (await client.query("SELECT account_id FROM iam.account WHERE external_subject = 'fiscal-sub'")).rows[0].account_id
    assert.deepEqual(authority, { kind: 'SIGNED_IN', caller: { accountId, email: 'compras&fiscal@empresa.com.br', displayName } })
    const parsed = invokeBody.safeParse({ projectId, operation: 'listNotes', input: {}, files: [{ path: 'conexus-server/manifest.json', sha256: '0'.repeat(64), content: '' }], caller: authority.caller })
    assert.deepEqual(parsed.data?.caller, { accountId, email: 'compras&fiscal@empresa.com.br', displayName })
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

  await t.test('resolving a session takes no row lock: a request is not held behind another that locks the session', async () => {
    const handoff = (await signIn(identity('owner-sub', 'owner-s@application.test'), owner)).handoff
    const ownerToken = (await sessions.redeem({ handoff, projectId, binding, now: at(1_000) })).sessionToken
    const holder = new pg.Client(connection)
    await holder.connect()
    try {
      await holder.query('BEGIN')
      await holder.query('SELECT 1 FROM iam.application_session WHERE token_digest = $1 FOR UPDATE', [createHash('sha256').update(ownerToken).digest()])
      const answer = await Promise.race([
        sessions.authority({ sessionToken: ownerToken, projectId, now: at(2_000) }),
        new Promise((resolve) => setTimeout(() => resolve({ kind: 'BLOCKED' }), 2_000)),
      ])
      assert.equal(answer.kind, 'SIGNED_IN')
    } finally {
      await holder.query('ROLLBACK')
      await holder.end()
    }
  })

  await t.test('one read serves a file of the served artifact, and reads only that file', async () => {
    const { createServedApplicationReader } = await import(hubModuleUrl('registry/served-application.js'))
    const reader = createServedApplicationReader(pool)
    const artifactId = randomUUID()
    const revisionId = randomUUID()
    const file = (path, mediaType, text) => ({ path, mediaType, base64: Buffer.from(text).toString('base64'), sha256: createHash('sha256').update(text).digest('hex') })
    const payload = { entryPath: 'index.html', files: [file('index.html', 'text/html; charset=utf-8', '<!doctype html><title>Caderno</title>'), file('assets/app.js', 'text/javascript; charset=utf-8', 'console.log(1)')] }
    await client.query("INSERT INTO reg.artifact(artifact_id, kind, semantic_name, project_id) VALUES ($1, 'application', 'caderno', $2)", [artifactId, projectId])
    await client.query("INSERT INTO reg.artifact_revision(artifact_revision_id, artifact_id, source_revision, digest, payload, availability) VALUES ($1, $2, $3, $4, $5, 'AVAILABLE')",
      [revisionId, artifactId, 'e'.repeat(40), 'f'.repeat(64), payload])
    await client.query(`INSERT INTO builder.project_working_state(project_id, working_source_revision, last_preview_source_revision, last_preview_artifact_revision_id, last_preview_artifact_digest)
      VALUES ($1, $2, $2, $3, $4)`, [projectId, 'e'.repeat(40), revisionId, 'f'.repeat(64)])

    const served = await reader.readServedFile({ accountId: owner, projectId, path: 'assets/app.js' })
    assert.deepEqual({ ...served, file: { ...served.file, bytes: Buffer.from(served.file.bytes).toString() } }, {
      kind: 'FILE', artifactRevisionId: revisionId,
      file: { path: 'assets/app.js', mediaType: 'text/javascript; charset=utf-8', bytes: 'console.log(1)', sha256: createHash('sha256').update('console.log(1)').digest('hex') },
    })
    assert.deepEqual(await reader.readServedFile({ accountId: owner, projectId, path: 'missing.js' }), { kind: 'NOT_FOUND', artifactRevisionId: revisionId })
    assert.deepEqual(await reader.readServedFile({ accountId: control, projectId, path: 'index.html' }), { kind: 'NOT_SERVED' }, 'no access, nothing served')
    assert.deepEqual(await reader.readServedFile({ accountId: owner, projectId: otherProject, path: 'index.html' }), { kind: 'NOT_SERVED' }, 'no Preview built')
    assert.equal(Buffer.from((await reader.readFile({ accountId: owner, projectId, artifactRevisionId: revisionId, path: 'index.html' })).bytes).toString(), '<!doctype html><title>Caderno</title>')
    assert.equal(await reader.readFile({ accountId: owner, projectId, artifactRevisionId: randomUUID(), path: 'index.html' }), null, 'a pinned revision that is no longer served reads nothing')
  })

  await t.test('the served artifact is read only through application access', async () => {
    const reads = async (accountId) => (await client.query('SELECT * FROM reg.get_served_application($1,$2)', [accountId, otherProject])).rows
    assert.deepEqual(await reads(control), [])
    assert.deepEqual(await reads(owner), [], 'no Preview has been built, so nothing is served')
  })
})
