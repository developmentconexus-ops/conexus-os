import assert from 'node:assert/strict'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
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

test('upgrading a database at 0025 with open sessions ends every Hub and application session and keeps the Accounts and grants', { skip: configured ? false : 'real PostgreSQL configuration not supplied' }, async (t) => {
  const { client, url, account, workspace, project } = await applicationDatabase(t, 'single_session_upgrade', {
    migrate: (connectionString) => runMigrations({ connectionString, migrations: loadHubMigrationFiles().filter((migration) => migration.version <= '0025'), catalogSnapshot: null }),
  })
  const owner = await account('owner-u')
  const projectId = await project(await workspace('u', [[owner, 'owner']]), 'Atualizada')
  await client.query('SELECT iam.grant_application_access($1,$2,$3,$4,$5)', [owner, projectId, randomUUID(), 'convidada-u@application.test', inTwoWeeks()])
  await client.query(`INSERT INTO iam.session(token_digest, csrf_digest, account_id, created_at, last_seen_at, idle_expires_at, absolute_expires_at)
    VALUES ($1, $2, $3, now(), now(), now() + interval '30 minutes', now() + interval '8 hours')`, [randomBytes(32), randomBytes(32), owner])
  await client.query(`INSERT INTO iam.application_session(token_digest, account_id, project_id, provider_refresh_token, authenticated_at, absolute_expires_at, provider_checked_at)
    VALUES ($1, $2, $3, 'mastra:factory-secret:v1:sealed', now(), now() + interval '8 hours', now())`, [randomBytes(32), owner, projectId])
  await client.query(`INSERT INTO iam.application_handoff(handoff_digest, account_id, project_id, sign_in_binding_digest, provider_refresh_token, authenticated_at, expires_at)
    VALUES ($1, $2, $3, $4, 'mastra:factory-secret:v1:sealed', now(), now() + interval '60 seconds')`, [randomBytes(32), owner, projectId, randomBytes(32)])
  const before = (await client.query("SELECT (SELECT count(*) FROM iam.account)::int AS accounts, (SELECT count(*) FROM iam.application_invitation)::int AS invitations, (SELECT count(*) FROM iam.workspace_membership)::int AS members")).rows[0]

  await runHubMigrations({ connectionString: url })
  assert.deepEqual((await client.query("SELECT to_regclass('iam.session') AS hub, to_regclass('iam.application_session') AS app, to_regclass('iam.application_handoff') AS handoff")).rows,
    [{ hub: null, app: null, handoff: null }], 'the old session and handoff tables are gone')
  assert.deepEqual((await client.query('SELECT count(*)::int AS open FROM iam.host_session WHERE ended_at IS NULL')).rows, [{ open: 0 }], 'every person signs in once again')
  assert.deepEqual((await client.query('SELECT count(*)::int AS handoffs FROM iam.handoff')).rows, [{ handoffs: 0 }])
  assert.deepEqual((await client.query("SELECT (SELECT count(*) FROM iam.account)::int AS accounts, (SELECT count(*) FROM iam.application_invitation)::int AS invitations, (SELECT count(*) FROM iam.workspace_membership)::int AS members")).rows[0],
    before, 'Accounts, invitations and memberships are untouched')
})

test('application sessions: sign-in, handoff, per-request authority, the Keycloak re-check and the Hub session refusal', { skip: configured ? false : 'real PostgreSQL configuration not supplied' }, async (t) => {
  const { createHostSessions } = await import(hubModuleUrl('identity-access/host-sessions.js'))
  const { createApplicationAccessStore } = await import(hubModuleUrl('identity-access/application-access.js'))
  const { client, connection, closeFirst, account, workspace, project } = await applicationDatabase(t, 'application_session')
  const pool = new pg.Pool({ ...connection, max: 4 })
  closeFirst(() => pool.end())
  const accessStore = createApplicationAccessStore({ pool })
  const refreshes = []
  let providerAnswer = { kind: 'ACTIVE', refreshToken: 'refresh-2' }
  const { createSecretEnvelope } = await import(hubModuleUrl('platform/secrets.js'))
  const envelope = createSecretEnvelope('ab'.repeat(32))
  const sessions = createHostSessions({ pool, refresh: async (input) => { refreshes.push(input); return providerAnswer }, envelope })

  const owner = await account('owner-s')
  const control = await account('control-s')
  const workspaceId = await workspace('purchasing-s', [[owner, 'owner']])
  await workspace('elsewhere-s', [[control, 'owner']])
  const projectId = await project(workspaceId, 'Caderno de Compras')
  const otherProject = await project(workspaceId, 'Outro')
  const grantAccess = (projectRef, email) => client.query('SELECT iam.grant_application_access($1,$2,$3,$4,$5)', [owner, projectRef, randomUUID(), email, inTwoWeeks()])
  await grantAccess(projectId, 'funcionaria@application.test')
  await grantAccess(otherProject, 'ninguem@application.test')

  const identity = (subject, email, displayName = null, emailVerified = email !== null) =>
    ({ issuer: 'https://application.test', subject, verifiedEmail: email, emailVerified, displayName, refreshToken: `refresh-${subject}` })
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
    await assert.rejects(sessions.openHub({ accountId: employeeId, refreshToken: 'refresh-hub' }), /IDENTITY_NOT_ELIGIBLE/)
    assert.equal((await client.query("SELECT count(*)::int AS n FROM iam.host_session WHERE kind = 'HUB' AND account_id = $1", [employeeId])).rows[0].n, 0)

    const redeemed = await sessions.redeem({ handoff: outcome.handoff, target: { kind: 'APPLICATION', projectId, binding }, now: at(1_000) })
    assert.equal(redeemed.maxAgeSeconds, 8 * 60 * 60 - 1)
    token = redeemed.sessionToken
  })

  await t.test('without a provider name the display name is the verified email, and a stranger gets no Account', async () => {
    await grantAccess(projectId, 'sem-nome@application.test')
    assert.equal((await signIn(identity('no-name-sub', 'sem-nome@application.test'))).kind, 'HANDOFF')
    assert.equal((await client.query("SELECT display_name FROM iam.account WHERE external_subject = 'no-name-sub'")).rows[0].display_name, 'sem-nome@application.test')
    assert.deepEqual(await signIn(identity('stranger-sub', 'stranger@application.test')), { kind: 'NO_ACCESS', slug: 'caderno-de-compras', reason: 'NOT_GRANTED' })
    assert.deepEqual(await signIn(identity('unverified-sub', null)), { kind: 'NO_ACCESS', slug: 'caderno-de-compras', reason: 'EMAIL_NOT_VERIFIED' })
    assert.equal((await client.query("SELECT count(*)::int AS n FROM iam.account WHERE external_subject IN ('stranger-sub', 'unverified-sub')")).rows[0].n, 0)
  })

  await t.test('a verified claim whose address is missing or unparseable shows the generic no-access message, not "verify your email"', async () => {
    assert.deepEqual(await signIn(identity('no-address-sub', null, null, true)), { kind: 'NO_ACCESS', slug: 'caderno-de-compras', reason: 'NOT_GRANTED' },
      'verifying again would not help: the claim already says verified')
    assert.equal((await client.query("SELECT count(*)::int AS n FROM iam.account WHERE external_subject = 'no-address-sub'")).rows[0].n, 0)
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

  await t.test('a handoff presented on another host or by another browser is refused and not consumed; it redeems once on its own host inside sixty seconds', async () => {
    const redeem = async (handoff, { projectId: target = projectId, binding: held = binding, now = at(1_000) } = {}) =>
      sessions.redeem({ handoff, target: { kind: 'APPLICATION', projectId: target, binding: held }, now })
    const fresh = async () => (await signIn(employee, employeeId)).handoff
    const stored = async (handoff) => (await client.query('SELECT count(*)::int AS n FROM iam.handoff WHERE handoff_digest = $1', [createHash('sha256').update(handoff).digest()])).rows[0].n

    const presented = await fresh()
    assert.equal(await redeem(presented, { projectId: otherProject }), null, 'another application host')
    assert.equal(await redeem(presented, { binding: 'another-browser' }), null, 'another browser, without the binding')
    assert.equal(await redeem(presented, { projectId: otherProject, binding: 'another-browser' }), null)
    assert.equal(await stored(presented), 1, 'no refused presentation consumed it')
    assert.equal((await redeem(presented, { now: at(59_000) }))?.maxAgeSeconds, 8 * 60 * 60 - 59, 'it redeems on its own host inside its lifetime, for eight hours from sign-in')
    assert.equal(await stored(presented), 0, 'redemption consumed it')
    assert.equal(await redeem(presented), null, 'second redemption')

    const late = await fresh()
    assert.equal(await redeem(late, { now: at(60_000) }), null, 'sixty seconds after the sign-in')

    const raced = await fresh()
    const answers = await Promise.all([redeem(raced), redeem(raced), redeem(raced), redeem(raced)])
    assert.equal(answers.filter(Boolean).length, 1, 'four concurrent redemptions open one session')
  })

  await t.test('a session resolves to its caller only on its own application and before eight hours', async () => {
    assert.deepEqual(await sessions.applicationAuthority({ sessionToken: token, projectId, now: at(60_000) }),
      { kind: 'SIGNED_IN', caller: { accountId: employeeId, email: 'funcionaria@application.test', displayName: 'Funcionária Teste' } })
    assert.deepEqual(await sessions.applicationAuthority({ sessionToken: token, projectId: otherProject, now: at(60_000) }), { kind: 'SIGN_IN_REQUIRED' })
    assert.deepEqual(await sessions.applicationAuthority({ sessionToken: 'x'.repeat(43), projectId, now: at(60_000) }), { kind: 'SIGN_IN_REQUIRED' })
    assert.deepEqual(refreshes, [], 'no Keycloak check inside five minutes')
    const eight = (await signIn(employee, employeeId)).handoff
    const long = (await sessions.redeem({ handoff: eight, target: { kind: 'APPLICATION', projectId, binding }, now: at(1_000) })).sessionToken
    providerAnswer = { kind: 'ACTIVE', refreshToken: 'refresh-long' }
    assert.equal((await sessions.applicationAuthority({ sessionToken: long, projectId, now: at(8 * 60 * 60 * 1000 - 1) })).kind, 'SIGNED_IN')
    assert.deepEqual(await sessions.applicationAuthority({ sessionToken: long, projectId, now: at(8 * 60 * 60 * 1000) }), { kind: 'SIGN_IN_REQUIRED' })
    assert.deepEqual((await client.query("SELECT ended_reason, provider_refresh_token FROM iam.host_session WHERE ended_reason = 'EXPIRED'")).rows,
      [{ ended_reason: 'EXPIRED', provider_refresh_token: null }])
    assert.deepEqual(await refusal(() => client.query("UPDATE iam.host_session SET absolute_expires_at = absolute_expires_at + interval '1 minute'")),
      { code: '23514', message: 'new row for relation "host_session" violates check constraint "host_session_application_check"' })
  })

  await t.test('after five minutes Keycloak is asked again: unreachable refuses, active stores the answered token, refused ends the session', async () => {
    providerAnswer = { kind: 'UNAVAILABLE' }
    refreshes.length = 0
    assert.deepEqual(await sessions.applicationAuthority({ sessionToken: token, projectId, now: at(5 * 60 * 1000 + 1_000) }), { kind: 'PROVIDER_UNAVAILABLE' })
    assert.deepEqual(refreshes, [{ refreshToken: 'refresh-employee-sub', expectedSubject: 'employee-sub' }])
    assert.equal((await client.query('SELECT count(*)::int AS n FROM iam.host_session WHERE account_id = $1 AND ended_at IS NULL', [employeeId])).rows[0].n > 0, true)

    providerAnswer = { kind: 'ACTIVE', refreshToken: 'refresh-rotated' }
    const [first, second] = await Promise.all([
      sessions.applicationAuthority({ sessionToken: token, projectId, now: at(5 * 60 * 1000 + 2_000) }),
      sessions.applicationAuthority({ sessionToken: token, projectId, now: at(5 * 60 * 1000 + 2_000) }),
    ])
    assert.equal(first.kind, 'SIGNED_IN')
    assert.equal(second.kind, 'SIGNED_IN')
    const checked = (await client.query('SELECT provider_refresh_token FROM iam.host_session WHERE token_digest = $1', [createHash('sha256').update(token).digest()])).rows[0]
    assert.equal(await envelope.open(checked.provider_refresh_token), 'refresh-rotated')

    providerAnswer = { kind: 'REFUSED', reason: 'USER_DISABLED' }
    assert.deepEqual(await sessions.applicationAuthority({ sessionToken: token, projectId, now: at(10 * 60 * 1000 + 3_000) }), { kind: 'SIGN_IN_REQUIRED' })
    assert.deepEqual(await sessions.applicationAuthority({ sessionToken: token, projectId, now: at(10 * 60 * 1000 + 4_000) }), { kind: 'SIGN_IN_REQUIRED' })
    assert.deepEqual((await client.query('SELECT ended_reason, provider_refresh_token FROM iam.host_session WHERE token_digest = $1', [createHash('sha256').update(token).digest()])).rows,
      [{ ended_reason: 'PROVIDER_USER_DISABLED', provider_refresh_token: null }], 'the ending names a disable')
  })

  await t.test('four concurrent requests on two Hubs with the check due are all served, Keycloak is asked at most four times, and only sealed tokens are stored', async () => {
    let issued = 0
    let refreshCalls = 0
    // Keycloak without rotation: a refresh token works any number of times and each answer names a new one.
    const refresh = async () => {
      refreshCalls += 1
      await new Promise((resolve) => setTimeout(resolve, 25))
      return { kind: 'ACTIVE', refreshToken: `refresh-answer-${++issued}` }
    }
    const hubA = createHostSessions({ pool, refresh, envelope })
    const hubB = createHostSessions({ pool, refresh, envelope })
    const sealed = (value) => typeof value === 'string' && value.startsWith('mastra:factory-secret:v1:') && !value.includes('refresh-')

    await grantAccess(projectId, 'concorrencia@application.test')
    const outcome = await hubA.signIn({ identity: identity('concurrent-sub', 'concorrencia@application.test', 'Concorrência'), existingAccountId: null, projectId, bindingDigest, now: T0 })
    assert.equal(sealed((await client.query('SELECT provider_refresh_token FROM iam.handoff')).rows.at(-1).provider_refresh_token), true, 'the handoff holds the refresh token sealed')
    const sessionToken = (await hubB.redeem({ handoff: outcome.handoff, target: { kind: 'APPLICATION', projectId, binding }, now: at(1_000) })).sessionToken
    const stored = async () => (await client.query('SELECT provider_checked_at, provider_refresh_token FROM iam.host_session s JOIN iam.account a ON a.account_id = s.account_id WHERE a.external_subject = $1', ['concurrent-sub'])).rows[0]
    assert.equal(sealed((await stored()).provider_refresh_token), true, 'the session holds the refresh token sealed')

    const due = at(5 * 60 * 1000 + 1_000)
    const answers = await Promise.all([hubA, hubB, hubA, hubB].map((hub) => hub.applicationAuthority({ sessionToken, projectId, now: due })))
    assert.deepEqual(answers.map((answer) => answer.kind), ['SIGNED_IN', 'SIGNED_IN', 'SIGNED_IN', 'SIGNED_IN'])
    assert.ok(refreshCalls >= 1 && refreshCalls <= 4, `Keycloak was asked ${refreshCalls} times`)
    const after = await stored()
    assert.equal(sealed(after.provider_refresh_token), true)
    assert.equal(after.provider_checked_at.getTime(), due.getTime(), 'the check was recorded once, at the time the requests saw')
    assert.match(await envelope.open(after.provider_refresh_token), /^refresh-answer-\d+$/, 'the stored token is one Keycloak answered with')

    const asked = refreshCalls
    assert.equal((await hubB.applicationAuthority({ sessionToken, projectId, now: at(5 * 60 * 1000 + 2_000) })).kind, 'SIGNED_IN')
    assert.equal(refreshCalls, asked, 'a request after the check was recorded does not ask again')
    assert.equal((await hubB.applicationAuthority({ sessionToken, projectId, now: at(10 * 60 * 1000 + 2_000) })).kind, 'SIGNED_IN')
    assert.equal(refreshCalls, asked + 1, 'the next check falls due five minutes later')
  })

  const openSession = async (subject, email) => {
    await grantAccess(projectId, email)
    const handoff = (await signIn(identity(subject, email, subject))).handoff
    const sessionToken = (await sessions.redeem({ handoff, target: { kind: 'APPLICATION', projectId, binding }, now: at(1_000) })).sessionToken
    return { sessionToken, sessionDigest: createHash('sha256').update(sessionToken).digest() }
  }
  const outcomeOf = (answer) => answer.then((settled) => settled.kind, (error) => `THREW ${error.message}`)
  const checkDue = at(5 * 60 * 1000 + 1_000)

  await t.test('a refresh token the installation cannot open ends the session, for this request and every later one', async () => {
    const { sessionToken, sessionDigest } = await openSession('custody-sub', 'custodia@application.test')
    const foreign = createSecretEnvelope('cd'.repeat(32))
    await client.query('UPDATE iam.host_session SET provider_refresh_token = $2 WHERE token_digest = $1', [sessionDigest, await foreign.seal('refresh-custody-sub')])
    providerAnswer = { kind: 'ACTIVE', refreshToken: 'refresh-custody-2' }
    const first = await outcomeOf(sessions.applicationAuthority({ sessionToken, projectId, now: checkDue }))
    const second = await outcomeOf(sessions.applicationAuthority({ sessionToken, projectId, now: checkDue }))
    assert.deepEqual([first, second], ['SIGN_IN_REQUIRED', 'SIGN_IN_REQUIRED'])
    assert.deepEqual((await client.query('SELECT ended_reason, provider_refresh_token FROM iam.host_session WHERE token_digest = $1', [sessionDigest])).rows,
      [{ ended_reason: 'CUSTODY_CHANGED', provider_refresh_token: null }])
  })

  await t.test('an error while Keycloak is asked leaves the check due, so the next request checks instead of skipping', async () => {
    const { sessionToken, sessionDigest } = await openSession('fault-sub', 'falha@application.test')
    let calls = 0
    const faulty = createHostSessions({
      pool, envelope,
      refresh: async () => {
        calls += 1
        if (calls === 1) throw new Error('KEYCLOAK_CLIENT_FAULT')
        return { kind: 'ACTIVE', refreshToken: 'refresh-fault-2' }
      },
    })
    assert.equal(await outcomeOf(faulty.applicationAuthority({ sessionToken, projectId, now: checkDue })), 'THREW KEYCLOAK_CLIENT_FAULT')
    assert.equal(await outcomeOf(faulty.applicationAuthority({ sessionToken, projectId, now: checkDue })), 'SIGNED_IN')
    assert.equal(calls, 2, 'the second request asked Keycloak itself')
    assert.deepEqual((await client.query('SELECT provider_checked_at FROM iam.host_session WHERE token_digest = $1', [sessionDigest])).rows,
      [{ provider_checked_at: checkDue }])
  })

  await t.test('a request whose Keycloak answer arrives after the session ended follows the session instead of serving it', async () => {
    const { sessionToken, sessionDigest } = await openSession('lost-sub', 'perdida@application.test')
    const hub = createHostSessions({
      pool, envelope,
      refresh: async () => {
        // The person signs out on another tab while this request waits for Keycloak.
        await client.query("SELECT iam.end_host_session($1, 'SIGNED_OUT')", [sessionDigest])
        return { kind: 'ACTIVE', refreshToken: 'refresh-lost-2' }
      },
    })
    assert.equal(await outcomeOf(hub.applicationAuthority({ sessionToken, projectId, now: checkDue })), 'SIGN_IN_REQUIRED')
  })

  await t.test('a Hub session keeps the sealed refresh token, slides its thirty-minute idle limit inside eight hours, and checks CSRF', async () => {
    const hub = await sessions.openHub({ accountId: owner, refreshToken: 'refresh-hub-owner', now: T0 })
    const row = async () => (await client.query('SELECT provider_refresh_token, idle_expires_at, absolute_expires_at, ended_reason FROM iam.host_session WHERE token_digest = $1',
      [createHash('sha256').update(hub.sessionToken).digest()])).rows[0]
    const opened = await row()
    assert.match(opened.provider_refresh_token, /^mastra:factory-secret:v1:/)
    assert.equal(await envelope.open(opened.provider_refresh_token), 'refresh-hub-owner')
    assert.equal(opened.idle_expires_at.getTime(), at(30 * 60 * 1000).getTime())
    assert.equal(opened.absolute_expires_at.getTime(), at(8 * 60 * 60 * 1000).getTime())

    assert.equal(await sessions.resolveHub({ sessionToken: hub.sessionToken, csrfToken: 'w'.repeat(43), now: at(60_000) }), null, 'a wrong CSRF token')
    assert.equal((await row()).idle_expires_at.getTime(), at(30 * 60 * 1000).getTime(), 'a refused request does not slide the idle limit')
    const current = await sessions.resolveHub({ sessionToken: hub.sessionToken, csrfToken: hub.csrfToken, now: at(20 * 60 * 1000) })
    assert.deepEqual(current.account.accountId, owner)
    assert.equal((await row()).idle_expires_at.getTime(), at(50 * 60 * 1000).getTime(), 'a request slides the idle limit')
    for (let minute = 45; minute < 8 * 60; minute += 25) assert.equal((await sessions.resolveHub({ sessionToken: hub.sessionToken, now: at(minute * 60 * 1000) }))?.account.accountId, owner, `minute ${minute}`)
    assert.equal(await sessions.resolveHub({ sessionToken: hub.sessionToken, now: at(8 * 60 * 60 * 1000) }), null, 'eight hours, however active')
    assert.deepEqual({ ...(await row()), idle_expires_at: undefined, absolute_expires_at: undefined },
      { provider_refresh_token: null, ended_reason: 'EXPIRED', idle_expires_at: undefined, absolute_expires_at: undefined })

    const idle = await sessions.openHub({ accountId: owner, refreshToken: 'refresh-hub-idle', now: T0 })
    assert.equal(await sessions.resolveHub({ sessionToken: idle.sessionToken, now: at(30 * 60 * 1000) }), null, 'thirty minutes without a request')
    assert.deepEqual(await refusal(() => client.query("UPDATE iam.host_session SET idle_expires_at = absolute_expires_at + interval '1 second' WHERE kind = 'HUB'")),
      { code: '23514', message: 'new row for relation "host_session" violates check constraint "host_session_hub_check"' })
  })

  await t.test('the Hub and its Previews follow Keycloak within five minutes: a disable or a Keycloak logout ends them, an unreachable Keycloak answers 503 and keeps them', async () => {
    const launchFor = () => {
      const artifactRevisionId = randomUUID()
      return { accountId: owner, projectId, sourceRevision: 'c'.repeat(40), artifactRevisionId, artifactDigest: 'd'.repeat(64),
        exactHost: `preview-${artifactRevisionId}.conexus.localhost`, manifest: { entryPath: 'index.html', files: [] } }
    }
    const openWithPreview = async (refreshToken) => {
      const hub = await sessions.openHub({ accountId: owner, refreshToken, now: T0 })
      const launch = launchFor()
      const { entryGrant } = await sessions.openPreview({ hubSessionToken: hub.sessionToken, launch, now: T0 })
      const preview = await sessions.redeem({ handoff: entryGrant, target: { kind: 'PREVIEW', exactHost: launch.exactHost }, now: at(1_000) })
      return { hub, preview, exactHost: launch.exactHost }
    }
    const ended = async (token) => (await client.query('SELECT ended_reason, provider_refresh_token FROM iam.host_session WHERE token_digest = $1',
      [createHash('sha256').update(token).digest()])).rows[0]
    const due = at(5 * 60 * 1000)

    refreshes.length = 0
    providerAnswer = { kind: 'ACTIVE', refreshToken: 'refresh-hub-2' }
    const active = await openWithPreview('refresh-hub-1')
    assert.equal((await sessions.resolveHub({ sessionToken: active.hub.sessionToken, now: at(4 * 60 * 1000) }))?.account.accountId, owner)
    assert.deepEqual(refreshes, [], 'not due before five minutes')
    assert.equal((await sessions.resolveHub({ sessionToken: active.hub.sessionToken, now: due }))?.account.accountId, owner)
    assert.deepEqual(refreshes, [{ refreshToken: 'refresh-hub-1', expectedSubject: owner }], 'due at five minutes, with the Hub session token')
    assert.equal(await envelope.open((await client.query('SELECT provider_refresh_token FROM iam.host_session WHERE token_digest = $1',
      [createHash('sha256').update(active.hub.sessionToken).digest()])).rows[0].provider_refresh_token), 'refresh-hub-2')

    refreshes.length = 0
    const concurrent = await openWithPreview('refresh-hub-3')
    const answers = await Promise.all([1, 2, 3, 4].map(() => sessions.resolveHub({ sessionToken: concurrent.hub.sessionToken, now: due })))
    assert.deepEqual(answers.map((answer) => answer?.account.accountId), [owner, owner, owner, owner], 'four concurrent Hub requests with the check due are all served')
    assert.ok(refreshes.length >= 1 && refreshes.length <= 4, `Keycloak was asked ${refreshes.length} times`)

    for (const [reason, endedReason] of [['USER_DISABLED', 'PROVIDER_USER_DISABLED'], ['SESSION_ENDED', 'PROVIDER_SESSION_ENDED']]) {
      const refused = await openWithPreview(`refresh-${reason}`)
      providerAnswer = { kind: 'REFUSED', reason }
      assert.equal(await sessions.resolveHub({ sessionToken: refused.hub.sessionToken, now: due }), null, `${reason}: the Hub session ends`)
      assert.deepEqual(await ended(refused.hub.sessionToken), { ended_reason: endedReason, provider_refresh_token: null })
      assert.deepEqual(await ended(refused.preview.sessionToken), { ended_reason: 'PARENT_ENDED', provider_refresh_token: null }, `${reason}: its Preview ends with it`)
      assert.deepEqual(await sessions.previewAuthority({ sessionToken: refused.preview.sessionToken, exactHost: refused.exactHost, now: due }), { kind: 'SIGN_IN_REQUIRED' })
    }

    const fromPreview = await openWithPreview('refresh-preview-only')
    providerAnswer = { kind: 'REFUSED', reason: 'USER_DISABLED' }
    refreshes.length = 0
    assert.deepEqual(await sessions.previewAuthority({ sessionToken: fromPreview.preview.sessionToken, exactHost: fromPreview.exactHost, now: due }),
      { kind: 'SIGN_IN_REQUIRED' }, 'a Preview request makes the check of the Hub session behind it')
    assert.deepEqual(refreshes, [{ refreshToken: 'refresh-preview-only', expectedSubject: owner }])
    assert.deepEqual(await ended(fromPreview.hub.sessionToken), { ended_reason: 'PROVIDER_USER_DISABLED', provider_refresh_token: null }, 'and the Hub session ends too')

    const unreachable = await openWithPreview('refresh-unreachable')
    providerAnswer = { kind: 'UNAVAILABLE' }
    await assert.rejects(sessions.resolveHub({ sessionToken: unreachable.hub.sessionToken, now: due }), (error) => error.statusCode === 503)
    assert.deepEqual(await sessions.previewAuthority({ sessionToken: unreachable.preview.sessionToken, exactHost: unreachable.exactHost, now: due }), { kind: 'PROVIDER_UNAVAILABLE' })
    providerAnswer = { kind: 'ACTIVE', refreshToken: 'refresh-reachable' }
    assert.equal((await sessions.resolveHub({ sessionToken: unreachable.hub.sessionToken, now: due }))?.account.accountId, owner, 'the session was kept and Keycloak is asked again')

    const signingOut = await openWithPreview('refresh-signing-out')
    providerAnswer = { kind: 'UNAVAILABLE' }
    refreshes.length = 0
    assert.equal(await sessions.endHub({ sessionToken: signingOut.hub.sessionToken, csrfToken: signingOut.hub.csrfToken }), true, 'a sign-out while Keycloak is down still ends the session')
    assert.deepEqual(refreshes, [], 'and never asks Keycloak')
    assert.deepEqual(await ended(signingOut.hub.sessionToken), { ended_reason: 'SIGNED_OUT', provider_refresh_token: null })
    assert.deepEqual(await ended(signingOut.preview.sessionToken), { ended_reason: 'PARENT_ENDED', provider_refresh_token: null })
  })

  await t.test('a Preview lives in the database: another Hub serves it, it dies with the Hub session that opened it, and its handoff survives the wrong host', async () => {
    const artifactRevisionId = randomUUID()
    const exactHost = `preview-${artifactRevisionId}.conexus.localhost`
    const launch = {
      accountId: owner, projectId, sourceRevision: 'a'.repeat(40), artifactRevisionId, artifactDigest: 'b'.repeat(64), exactHost,
      manifest: { entryPath: 'index.html', files: [{ path: 'index.html', mediaType: 'text/html; charset=utf-8' }] },
    }
    const hub = await sessions.openHub({ accountId: owner, refreshToken: 'refresh-owner', now: T0 })
    const other = await sessions.openHub({ accountId: control, refreshToken: 'refresh-control', now: T0 })
    assert.equal(await sessions.openPreview({ hubSessionToken: other.sessionToken, launch, now: T0 }), null, 'a Hub session opens Previews only for its own Account')

    const opened = await sessions.openPreview({ hubSessionToken: hub.sessionToken, launch, now: T0 })
    assert.equal(opened.expiresAt, T0.getTime() + 15 * 60 * 1000, 'the answer is when the Preview ends')
    assert.deepEqual((await client.query('SELECT expires_at - minted_at AS lifetime FROM iam.handoff WHERE handoff_digest = $1', [createHash('sha256').update(opened.entryGrant).digest()])).rows.map((row) => row.lifetime.seconds), [30],
      'the entry handoff lives thirty seconds')
    const enter = (host, now = at(1_000)) => sessions.redeem({ handoff: opened.entryGrant, target: { kind: 'PREVIEW', exactHost: host }, now })
    assert.equal(await enter(`preview-${randomUUID()}.conexus.localhost`), null, 'another Preview host')
    const entered = await enter(exactHost)
    assert.equal(entered.maxAgeSeconds, 15 * 60 - 1, 'the Preview session ends with its launch, fifteen minutes after the Hub opened it')
    assert.equal(await enter(exactHost), null, 'redeemed once')

    const restarted = createHostSessions({ pool, refresh: async () => ({ kind: 'UNAVAILABLE' }), envelope })
    const served = await restarted.previewAuthority({ sessionToken: entered.sessionToken, exactHost, now: at(2_000) })
    assert.equal(served.kind, 'SIGNED_IN', 'a Hub that never saw the launch serves it')
    assert.deepEqual({ ...served.binding, caller: { ...served.binding.caller } }, {
      ...launch, expiresAt: T0.getTime() + 15 * 60 * 1000,
      caller: { accountId: owner, email: 'owner-s@application.test', displayName: 'owner-s' },
    })
    assert.deepEqual(await restarted.previewAuthority({ sessionToken: entered.sessionToken, exactHost: `preview-${randomUUID()}.conexus.localhost`, now: at(2_000) }),
      { kind: 'SIGN_IN_REQUIRED' }, 'the cookie is no session on another Preview host')
    assert.deepEqual(await restarted.previewAuthority({ sessionToken: entered.sessionToken, exactHost, now: at(15 * 60 * 1000 + 1_000) }),
      { kind: 'SIGN_IN_REQUIRED' }, 'fifteen minutes after launch')

    const second = await sessions.openPreview({ hubSessionToken: hub.sessionToken, launch, now: at(3_000) })
    const secondEntry = await sessions.redeem({ handoff: second.entryGrant, target: { kind: 'PREVIEW', exactHost }, now: at(4_000) })
    assert.equal((await sessions.previewAuthority({ sessionToken: secondEntry.sessionToken, exactHost, now: at(5_000) })).kind, 'SIGNED_IN')
    assert.equal(await sessions.endHub({ sessionToken: hub.sessionToken, csrfToken: hub.csrfToken }), true)
    assert.deepEqual(await sessions.previewAuthority({ sessionToken: secondEntry.sessionToken, exactHost, now: at(7_000) }), { kind: 'SIGN_IN_REQUIRED' }, 'the Hub sign-out ended the Preview')
    assert.deepEqual((await client.query('SELECT ended_reason FROM iam.host_session WHERE token_digest = $1', [createHash('sha256').update(secondEntry.sessionToken).digest()])).rows,
      [{ ended_reason: 'PARENT_ENDED' }])
    assert.equal(await sessions.openPreview({ hubSessionToken: hub.sessionToken, launch, now: at(8_000) }), null, 'an ended Hub session opens nothing')
  })

  await t.test('nothing of a Preview is kept after it ends: the next launch removes it and its sessions', async () => {
    const launch = () => {
      const artifactRevisionId = randomUUID()
      return { accountId: owner, projectId, sourceRevision: 'e'.repeat(40), artifactRevisionId, artifactDigest: 'f'.repeat(64),
        exactHost: `preview-${artifactRevisionId}.conexus.localhost`, manifest: { entryPath: 'index.html', files: [] } }
    }
    const hub = await sessions.openHub({ accountId: owner, refreshToken: 'refresh-retention', now: new Date() })
    const first = launch()
    const old = await sessions.openPreview({ hubSessionToken: hub.sessionToken, launch: first, now: new Date() })
    const entered = await sessions.redeem({ handoff: old.entryGrant, target: { kind: 'PREVIEW', exactHost: first.exactHost }, now: new Date() })
    assert.match(entered.sessionToken, /^[A-Za-z0-9_-]{43}$/)
    await client.query("UPDATE iam.preview SET opened_at = opened_at - interval '16 minutes', expires_at = expires_at - interval '16 minutes' WHERE artifact_revision_id = $1", [first.artifactRevisionId])
    await client.query("UPDATE iam.host_session SET started_at = started_at - interval '16 minutes', absolute_expires_at = absolute_expires_at - interval '16 minutes' WHERE token_digest = $1",
      [createHash('sha256').update(entered.sessionToken).digest()])
    assert.deepEqual(Object.keys(await sessions.openPreview({ hubSessionToken: hub.sessionToken, launch: launch(), now: new Date() })).sort(), ['entryGrant', 'expiresAt'])
    assert.deepEqual((await client.query('SELECT (SELECT count(*) FROM iam.preview WHERE artifact_revision_id = $1)::int AS previews, (SELECT count(*) FROM iam.host_session WHERE token_digest = $2)::int AS sessions',
      [first.artifactRevisionId, createHash('sha256').update(entered.sessionToken).digest()])).rows, [{ previews: 0, sessions: 0 }])
  })

  await t.test('revoking the grant stops the next request and drops the refresh token', async () => {
    providerAnswer = { kind: 'ACTIVE', refreshToken: 'refresh-3' }
    const handoff = (await signIn(employee, employeeId)).handoff
    const live = (await sessions.redeem({ handoff, target: { kind: 'APPLICATION', projectId, binding }, now: at(1_000) })).sessionToken
    assert.equal((await sessions.applicationAuthority({ sessionToken: live, projectId, now: at(2_000) })).kind, 'SIGNED_IN')
    const grantId = (await client.query('SELECT grant_id FROM iam.application_grant WHERE account_id = $1 AND revoked_at IS NULL', [employeeId])).rows[0].grant_id
    assert.equal((await client.query('SELECT iam.revoke_application_grant($1,$2,$3) AS found', [owner, projectId, grantId])).rows[0].found, true)
    assert.equal((await client.query('SELECT count(*)::int AS n FROM iam.host_session WHERE account_id = $1 AND ended_at IS NULL', [employeeId])).rows[0].n, 0,
      'revocation ended every open session of the person for this application')
    assert.deepEqual(await sessions.applicationAuthority({ sessionToken: live, projectId, now: at(3_000) }), { kind: 'SIGN_IN_REQUIRED' })
    assert.deepEqual(await signIn(employee, employeeId), { kind: 'NO_ACCESS', slug: 'caderno-de-compras', reason: 'NOT_GRANTED' })
    assert.deepEqual(await signIn(identity('employee-sub', null), employeeId), { kind: 'NO_ACCESS', slug: 'caderno-de-compras', reason: 'NOT_GRANTED' },
      'an existing Account with a revoked grant needs a new grant, not a re-verified email, even if the claim itself comes back unverified')
  })

  await t.test('a Keycloak user deleted and re-created with the same email is a new (issuer, subject): the old Account keeps its grant, and the new subject inherits nothing', async () => {
    await grantAccess(projectId, 'recriada@application.test')
    const original = identity('original-sub', 'recriada@application.test', 'Original')
    assert.equal((await signIn(original)).kind, 'HANDOFF')
    const originalId = (await client.query("SELECT account_id FROM iam.account WHERE external_subject = 'original-sub'")).rows[0].account_id
    const openGrants = async (accountId) => (await client.query('SELECT count(*)::int AS n FROM iam.application_grant WHERE project_id = $1 AND account_id = $2 AND revoked_at IS NULL', [projectId, accountId])).rows[0].n
    assert.equal(await openGrants(originalId), 1)

    // The Keycloak user is deleted and a new one created with the same verified email; Keycloak issues a
    // new subject. Conexus is never told, so iam.account for 'original-sub' is untouched, and no live
    // invitation names this email (the one grant already claimed it), so the new subject gets nothing.
    const recreated = identity('recreated-sub', 'recriada@application.test', 'Recriada')
    assert.deepEqual(await signIn(recreated), { kind: 'NO_ACCESS', slug: 'caderno-de-compras', reason: 'NOT_GRANTED' },
      'the new subject shares an email with the old Account but resolves to no Account and no grant')
    assert.equal((await client.query("SELECT count(*)::int AS n FROM iam.account WHERE external_subject = 'recreated-sub'")).rows[0].n, 0,
      'no Account is provisioned for the new subject either')
    assert.equal(await openGrants(originalId), 1, "the old Account's grant is untouched by the new subject's sign-in")

    // Admitting the new person is an ordinary invite: it never reaches the old Account, because
    // grant_application_access answers the grant that email already holds instead of opening a second one.
    await grantAccess(projectId, 'recriada@application.test')
    assert.equal((await client.query("SELECT count(*)::int AS n FROM iam.application_invitation WHERE project_id = $1 AND email = 'recriada@application.test'", [projectId])).rows[0].n, 0,
      'the address is already held, so no invitation was opened for it')
    assert.deepEqual(await signIn(recreated), { kind: 'NO_ACCESS', slug: 'caderno-de-compras', reason: 'NOT_GRANTED' },
      'granting the shared email again still answers the Account that already holds it, not the new subject')

    // An Owner revokes the old Account's grant (the deleted person) and grants the email again; only
    // then does a fresh invitation open, and it admits the new subject as its own distinct Account.
    const grantId = (await client.query('SELECT grant_id FROM iam.application_grant WHERE project_id = $1 AND account_id = $2 AND revoked_at IS NULL', [projectId, originalId])).rows[0].grant_id
    assert.equal((await client.query('SELECT iam.revoke_application_grant($1,$2,$3) AS found', [owner, projectId, grantId])).rows[0].found, true)
    await grantAccess(projectId, 'recriada@application.test')
    assert.equal((await signIn(recreated)).kind, 'HANDOFF')
    const recreatedId = (await client.query("SELECT account_id FROM iam.account WHERE external_subject = 'recreated-sub'")).rows[0].account_id
    assert.notEqual(recreatedId, originalId, 'the new subject provisions its own Account, never the deleted one')
    assert.equal(await openGrants(recreatedId), 1)
    assert.equal(await openGrants(originalId), 0, "the old Account's grant stays revoked, kept as a record")
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

    assert.deepEqual(await signIn(person, personId), { kind: 'NO_ACCESS', slug: 'caderno-de-compras', reason: 'NOT_GRANTED' })
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

    assert.deepEqual(await signIn(person, personId), { kind: 'NO_ACCESS', slug: 'caderno-de-compras', reason: 'NOT_GRANTED' }, 'the invitation issued before the revoke is dead')
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

  await t.test('a revoke racing an invitation claim with a diverging email holds: the invitation issued before it never survives, however the two interleave', async () => {
    const person = identity('interleaved-sub', 'divergiu@application.test', 'Corrida de Revogacao')
    await grantAccess(projectId, 'divergiu@application.test')
    assert.equal((await signIn(person)).kind, 'HANDOFF')
    const personId = (await client.query("SELECT account_id FROM iam.account WHERE external_subject = 'interleaved-sub'")).rows[0].account_id
    const grantId = (await client.query('SELECT grant_id FROM iam.application_grant WHERE project_id = $1 AND account_id = $2 AND revoked_at IS NULL', [projectId, personId])).rows[0].grant_id

    // An invitation to a different, still-verified address, issued before the revoke: exactly the
    // diverging-email boundary a revoke must hold against, whatever the claim's statement overlaps it.
    await client.query('INSERT INTO iam.application_invitation(invitation_id, project_id, email, invited_by, expires_at) VALUES ($1,$2,$3,$4,$5)',
      [randomUUID(), projectId, 'outra-divergiu@application.test', owner, inTwoWeeks()])

    const revoker = new pg.Client(connection)
    const claimer = new pg.Client(connection)
    await revoker.connect()
    await claimer.connect()
    try {
      // The revoke holds the grant row open (uncommitted) so the claim's statement takes its snapshot
      // before the revoke is visible, then meets it at the PERFORM ... FOR UPDATE on the grant row.
      await revoker.query('BEGIN')
      await revoker.query('SELECT iam.revoke_application_grant($1,$2,$3)', [owner, projectId, grantId])
      const claimerPid = (await claimer.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
      const claim = claimer.query('SELECT iam.claim_application_invitations($1, $2)', [personId, 'outra-divergiu@application.test'])
      for (let polls = 0; ; polls += 1) {
        const waiting = (await client.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid = $1', [claimerPid])).rows[0]?.wait_event_type
        if (waiting === 'Lock') break
        if (polls === 200) throw new Error('the claim never reached the grant lock')
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
      await revoker.query('COMMIT')
      await claim
    } finally {
      await revoker.end()
      await claimer.end()
    }

    const openGrants = (await client.query('SELECT count(*)::int AS n FROM iam.application_grant WHERE project_id = $1 AND account_id = $2 AND revoked_at IS NULL', [projectId, personId])).rows[0].n
    assert.equal(openGrants, 0, 'an invitation issued before the revoke must not survive it, however the two interleave')
  })

  await t.test('a claim racing a revoke in the other order neither deadlocks nor loses the revoke', async () => {
    const person = identity('interleaved-reverse-sub', 'reverso@application.test', 'Corrida Invertida')
    await grantAccess(projectId, 'reverso@application.test')
    assert.equal((await signIn(person)).kind, 'HANDOFF')
    const personId = (await client.query("SELECT account_id FROM iam.account WHERE external_subject = 'interleaved-reverse-sub'")).rows[0].account_id
    const grantId = (await client.query('SELECT grant_id FROM iam.application_grant WHERE project_id = $1 AND account_id = $2 AND revoked_at IS NULL', [projectId, personId])).rows[0].grant_id

    await client.query('INSERT INTO iam.application_invitation(invitation_id, project_id, email, invited_by, expires_at) VALUES ($1,$2,$3,$4,$5)',
      [randomUUID(), projectId, 'outra-reverso@application.test', owner, inTwoWeeks()])

    const claimer = new pg.Client(connection)
    const revoker = new pg.Client(connection)
    await claimer.connect()
    await revoker.connect()
    try {
      // This time the claim reaches the grant lock first and holds it open (uncommitted), so the
      // revoke queues behind it: the same lock order as above, the opposite arrival order, proving it
      // is the row lock and not the arrival order that keeps the two from interleaving unsafely.
      await claimer.query('BEGIN')
      await claimer.query('SELECT iam.claim_application_invitations($1, $2)', [personId, 'outra-reverso@application.test'])
      const revokerPid = (await revoker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
      const revoke = revoker.query('SELECT iam.revoke_application_grant($1,$2,$3)', [owner, projectId, grantId])
      for (let polls = 0; ; polls += 1) {
        const waiting = (await client.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid = $1', [revokerPid])).rows[0]?.wait_event_type
        if (waiting === 'Lock') break
        if (polls === 200) throw new Error('the revoke never reached the grant lock')
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
      await claimer.query('COMMIT')
      assert.equal((await revoke).rows[0].revoke_application_grant, true)
    } finally {
      await claimer.end()
      await revoker.end()
    }

    const openGrants = (await client.query('SELECT count(*)::int AS n FROM iam.application_grant WHERE project_id = $1 AND account_id = $2 AND revoked_at IS NULL', [projectId, personId])).rows[0].n
    assert.equal(openGrants, 0, 'the revoke that queued behind the claim still lands')
    const openInvitations = (await client.query('SELECT count(*)::int AS n FROM iam.application_invitation WHERE project_id = $1 AND email = $2', [projectId, 'outra-reverso@application.test'])).rows[0].n
    assert.equal(openInvitations, 0, 'the claim that went first still consumed the invitation')
  })

  await t.test('a revoke racing a claim of the same email neither deadlocks nor lets the claim reopen the grant', async () => {
    const person = identity('interleaved-same-sub', 'mesmo@application.test', 'Corrida Mesmo Email')
    await grantAccess(projectId, 'mesmo@application.test')
    assert.equal((await signIn(person)).kind, 'HANDOFF')
    const personId = (await client.query("SELECT account_id FROM iam.account WHERE external_subject = 'interleaved-same-sub'")).rows[0].account_id
    const grantId = (await client.query('SELECT grant_id FROM iam.application_grant WHERE project_id = $1 AND account_id = $2 AND revoked_at IS NULL', [projectId, personId])).rows[0].grant_id

    // An invitation to the Account's own address, which the revoke itself withdraws.
    await client.query('INSERT INTO iam.application_invitation(invitation_id, project_id, email, invited_by, expires_at) VALUES ($1,$2,$3,$4,$5)',
      [randomUUID(), projectId, 'mesmo@application.test', owner, inTwoWeeks()])

    const revoker = new pg.Client(connection)
    const claimer = new pg.Client(connection)
    await revoker.connect()
    await claimer.connect()
    try {
      // The revoke holds the grant row and the invitation it withdraws (uncommitted); the claim meets
      // it at the PERFORM ... FOR UPDATE on the grant row and waits there.
      await revoker.query('BEGIN')
      await revoker.query('SELECT iam.revoke_application_grant($1,$2,$3)', [owner, projectId, grantId])
      const claimerPid = (await claimer.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
      const claim = claimer.query('SELECT iam.claim_application_invitations($1, $2)', [personId, 'mesmo@application.test'])
      for (let polls = 0; ; polls += 1) {
        const waiting = (await client.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid = $1', [claimerPid])).rows[0]?.wait_event_type
        if (waiting === 'Lock') break
        if (polls === 200) throw new Error('the claim never reached the grant lock')
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
      await revoker.query('COMMIT')
      assert.equal((await claim).rows[0].claim_application_invitations, 0, 'the invitation the revoke withdrew is not claimed')
    } finally {
      await revoker.end()
      await claimer.end()
    }

    const openGrants = (await client.query('SELECT count(*)::int AS n FROM iam.application_grant WHERE project_id = $1 AND account_id = $2 AND revoked_at IS NULL', [projectId, personId])).rows[0].n
    assert.equal(openGrants, 0, 'the revoke holds')
    const openInvitations = (await client.query('SELECT count(*)::int AS n FROM iam.application_invitation WHERE project_id = $1 AND email = $2', [projectId, 'mesmo@application.test'])).rows[0].n
    assert.equal(openInvitations, 0)
  })

  await t.test('the application host resolves a caller with a long name and any verified address, and the runner admits it', async () => {
    const { invokeBody } = await import(hubModuleUrl('app-runner/requests.js'))
    const displayName = `Setor de Compras e Fiscal ${'da Matriz '.repeat(25)}`.trim()
    await grantAccess(projectId, 'compras&fiscal@empresa.com.br')
    const handoff = (await signIn(identity('fiscal-sub', 'compras&fiscal@empresa.com.br', displayName))).handoff
    const sessionToken = (await sessions.redeem({ handoff, target: { kind: 'APPLICATION', projectId, binding }, now: at(1_000) })).sessionToken
    const authority = await sessions.applicationAuthority({ sessionToken, projectId, now: at(2_000) })
    const accountId = (await client.query("SELECT account_id FROM iam.account WHERE external_subject = 'fiscal-sub'")).rows[0].account_id
    assert.deepEqual(authority, { kind: 'SIGNED_IN', caller: { accountId, email: 'compras&fiscal@empresa.com.br', displayName } })
    const parsed = invokeBody.safeParse({ projectId, operation: 'listNotes', input: {}, files: [{ path: 'conexus-server/manifest.json', sha256: '0'.repeat(64), content: '' }], caller: authority.caller })
    assert.deepEqual(parsed.data?.caller, { accountId, email: 'compras&fiscal@empresa.com.br', displayName })
  })

  await t.test('a member of the Workspace uses the application without a grant; a member of another Workspace does not', async () => {
    assert.deepEqual(await signIn(identity('control-sub', 'control-s@application.test'), control), { kind: 'NO_ACCESS', slug: 'caderno-de-compras', reason: 'NOT_GRANTED' })
    const handoff = (await signIn(identity('owner-sub', 'owner-s@application.test'), owner)).handoff
    const ownerToken = (await sessions.redeem({ handoff, target: { kind: 'APPLICATION', projectId, binding }, now: at(1_000) })).sessionToken
    assert.equal((await sessions.applicationAuthority({ sessionToken: ownerToken, projectId, now: at(2_000) })).caller.accountId, owner)

    await client.query('UPDATE project.project SET archived = true WHERE project_id = $1', [projectId])
    assert.deepEqual(await sessions.applicationAuthority({ sessionToken: ownerToken, projectId, now: at(3_000) }), { kind: 'SIGN_IN_REQUIRED' }, 'an archived Project serves no application')
    await client.query('UPDATE project.project SET archived = false WHERE project_id = $1', [projectId])
  })

  await t.test('an app-only Account that joins a Workspace becomes a Control Plane Account, and drops back when removed', async () => {
    await client.query('INSERT INTO iam.workspace_membership(account_id, workspace_id, role) VALUES ($1,$2,$3)', [employeeId, workspaceId, 'member'])
    assert.equal((await client.query('SELECT iam.account_access_scope($1) AS scope', [employeeId])).rows[0].scope, 'CONTROL_PLANE')
    const hubSession = await sessions.openHub({ accountId: employeeId, refreshToken: 'refresh-member' })
    assert.equal((await sessions.resolveHub({ sessionToken: hubSession.sessionToken }))?.account.accountId, employeeId)
    await client.query('DELETE FROM iam.workspace_membership WHERE account_id = $1', [employeeId])
    assert.equal(await sessions.resolveHub({ sessionToken: hubSession.sessionToken }), null, 'removed again, the Hub session no longer resolves')
  })

  await t.test('resolving a session takes no row lock: a request is not held behind another that locks the session', async () => {
    const handoff = (await signIn(identity('owner-sub', 'owner-s@application.test'), owner)).handoff
    const ownerToken = (await sessions.redeem({ handoff, target: { kind: 'APPLICATION', projectId, binding }, now: at(1_000) })).sessionToken
    const holder = new pg.Client(connection)
    await holder.connect()
    try {
      await holder.query('BEGIN')
      await holder.query('SELECT 1 FROM iam.host_session WHERE token_digest = $1 FOR UPDATE', [createHash('sha256').update(ownerToken).digest()])
      const answer = await Promise.race([
        sessions.applicationAuthority({ sessionToken: ownerToken, projectId, now: at(2_000) }),
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

test('the installed Factory seals in the envelope the database CHECK constraints require', { skip: configured ? false : 'real PostgreSQL configuration not supplied' }, async (t) => {
  const { createFactorySecretEncryption } = await import('@mastra/factory/secret-encryption')
  const { client } = await applicationDatabase(t, 'envelope')
  const sealed = await createFactorySecretEncryption({ primary: { id: 'installation', key: Buffer.alloc(32, 7) } }).encrypt('a refresh token')
  const checks = (await client.query(`
    SELECT conrelid::regclass::text AS relation, pg_get_constraintdef(oid) AS definition FROM pg_constraint
    WHERE contype = 'c' AND pg_get_constraintdef(oid) LIKE '%mastra:factory-secret:%' ORDER BY 1`)).rows
  assert.deepEqual(checks.map((check) => check.relation), ['iam.handoff', 'iam.host_session'])
  for (const { relation, definition } of checks) {
    const prefix = /'(mastra:factory-secret:[^%']*)%'/.exec(definition)?.[1]
    assert.ok(prefix && sealed.startsWith(prefix), `${relation} requires ${prefix}; the Factory seals ${sealed.slice(0, 32)}…: reopen when the Factory changes its envelope`)
  }
})
