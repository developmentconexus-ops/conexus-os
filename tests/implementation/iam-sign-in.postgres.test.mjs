import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CONFIGURED_SUBJECT, ISSUER, W, captureLines, hubJsonWrite, iamHub, person, sessionCookie } from './iam-fixture.mjs'

const count = async (sql, table) => Number((await sql(`SELECT count(*) AS n FROM ${table}`))[0].n)
const founder = person(CONFIGURED_SUBJECT, { name: 'Leandro', email: 'leandro@x.com' })

test('first access: the configured person lands in the Hub as installation administrator, once, with no form', async (t) => {
  const hub = await iamHub(t, 'conexus_iam_first_access')
  const first = await hub.signInWith(founder)
  assert.equal(first.statusCode, 303)
  assert.equal(first.headers.location, '/')
  const cookie = [first.headers['set-cookie']].flat().find((value) => value.startsWith('__Host-conexus_session='))
  assert.match(cookie, /^__Host-conexus_session=[A-Za-z0-9_-]{43}; /)
  for (const attribute of ['Path=/', 'HttpOnly', 'Secure', 'SameSite=Lax']) assert.ok(cookie.includes(attribute), attribute)
  assert.ok(!/Domain=/i.test(cookie))
  const token = hub.sessionOf(first)
  const session = await hub.app.inject({ method: 'GET', url: '/api/session', headers: { cookie: sessionCookie(token) } })
  assert.equal(session.statusCode, 200)
  assert.equal(session.json().administrator, true)
  assert.deepEqual(session.json().account.displayName, 'Leandro')
  assert.deepEqual(session.json().account.email, 'leandro@x.com')
  assert.deepEqual(await hub.sql("SELECT granted_via, granted_by FROM iam.installation_administrator"), [{ granted_via: 'OPERATOR_BOOTSTRAP', granted_by: null }])

  assert.equal((await hub.signInWith(founder)).headers.location, '/')
  assert.equal(await count(hub.sql, 'iam.account'), 1)
  assert.equal(await count(hub.sql, 'iam.installation_administrator'), 1)

  const stranger = await hub.signInWith(person('another-subject', { email: 'other@x.com' }))
  assert.equal(stranger.headers.location, '/no-access?reason=IDENTITY_NOT_ELIGIBLE')
  assert.equal(await count(hub.sql, 'iam.account'), 1)

  const created = await hub.app.inject({
    method: 'POST', url: '/api/control/workspaces', headers: { ...hubJsonWrite, cookie: sessionCookie(token), 'idempotency-key': 'first-workspace' },
    payload: { name: 'Operações' },
  })
  assert.equal(created.statusCode, 201)
  assert.equal(created.json().creatorAccountId, session.json().account.accountId)
})

test('two parallel first callbacks of the configured subject found one account and one tenure', async (t) => {
  const hub = await iamHub(t, 'conexus_iam_first_access_race')
  const answers = await Promise.all([hub.signInWith(founder), hub.signInWith(founder)])
  assert.deepEqual(answers.map((answer) => answer.headers.location), ['/', '/'])
  assert.equal(await count(hub.sql, 'iam.account'), 1)
  assert.equal(await count(hub.sql, 'iam.installation_administrator'), 1)
})

test('a token without a name claim takes the username Keycloak sends with the profile scope', async (t) => {
  const hub = await iamHub(t, 'conexus_iam_username')
  await hub.signInWith(person(CONFIGURED_SUBJECT, { name: null, preferred_username: 'leandro-admin' }))
  assert.deepEqual(await hub.sql('SELECT display_name FROM iam.account'), [{ display_name: 'leandro-admin' }])
})

test('the state: a replay, an expired state and a state the cookie does not match each answer SIGN_IN_EXPIRED', async (t) => {
  const hub = await iamHub(t, 'conexus_iam_state')
  await hub.signInWith(founder)
  hub.oidc.queue(founder)
  const begin = await hub.app.inject({ method: 'GET', url: '/protocol/oidc/login' })
  const state = new URL(begin.headers.location).searchParams.get('state')
  const callback = (query, cookieState) => hub.app.inject({ method: 'GET', url: `/protocol/oidc/callback?${query}`, headers: { cookie: `__Host-conexus_oidc_state=${cookieState}` } })
  assert.equal((await callback(`state=${state}&code=c`, 'b'.repeat(43))).headers.location, '/no-access?reason=SIGN_IN_EXPIRED')
  assert.equal((await hub.sql('SELECT count(*)::int AS n FROM iam.oidc_transaction'))[0].n, 1)
  assert.equal((await callback(`state=${state}&code=c`, state)).headers.location, '/')
  assert.equal((await callback(`state=${state}&code=c`, state)).headers.location, '/no-access?reason=SIGN_IN_EXPIRED')
  assert.equal((await hub.sql('SELECT count(*)::int AS n FROM iam.oidc_transaction'))[0].n, 0)

  hub.oidc.queue(founder)
  const late = new URL((await hub.app.inject({ method: 'GET', url: '/protocol/oidc/login' })).headers.location).searchParams.get('state')
  await hub.sql("UPDATE iam.oidc_transaction SET expires_at = now() - interval '1 second'")
  assert.equal((await callback(`state=${late}&code=c`, late)).headers.location, '/no-access?reason=SIGN_IN_EXPIRED')
})

test('Keycloak refusing or unreachable answers SIGN_IN_FAILED and consumes the state', async (t) => {
  const hub = await iamHub(t, 'conexus_iam_failed')
  const lines = captureLines(t)
  assert.equal((await hub.signInWith(founder, { error: 'access_denied' })).headers.location, '/no-access?reason=SIGN_IN_FAILED')
  assert.deepEqual(lines.of('SIGN_IN_REFUSED').at(-1), { venue: 'HUB', reason: 'SIGN_IN_FAILED', cause: 'access_denied' })
  assert.equal((await hub.signInWith(new Error('ECONNREFUSED'))).headers.location, '/no-access?reason=SIGN_IN_FAILED')
  assert.equal((await hub.sql('SELECT count(*)::int AS n FROM iam.oidc_transaction'))[0].n, 0)
  assert.equal((await hub.signInWith({ iss: ISSUER, name: 'No Subject' })).headers.location, '/no-access?reason=SIGN_IN_FAILED')
  assert.deepEqual(lines.of('IDENTITY_CLAIM_MALFORMED'), [{ claim: 'sub' }])
  assert.equal((await hub.sql('SELECT count(*)::int AS n FROM iam.account'))[0].n, 0)
})

test('an email that is not verified claims nothing; a verified one with no invitation is not eligible', async (t) => {
  const hub = await iamHub(t, 'conexus_iam_unverified')
  const lines = captureLines(t)
  const owner = await hub.seedAccount('10000000-0000-4000-8000-000000000001')
  await hub.seedWorkspace(W, 'Operações', [[owner, 'owner']])
  await hub.sql("INSERT INTO iam.workspace_invitation (invitation_id, workspace_id, email, role, invited_by, expires_at) VALUES (gen_random_uuid(), $1, 'ana@x.com', 'member', $2, now() + interval '1 day')", [W, owner])
  assert.equal((await hub.signInWith(person('ana', { email: 'ana@x.com', verified: 'true' }))).headers.location, '/no-access?reason=IDENTITY_EMAIL_NOT_VERIFIED')
  assert.deepEqual(lines.of('OIDC_EMAIL_VERIFIED_UNEXPECTED_TYPE'), [{ claimType: 'string' }])
  assert.ok(!JSON.stringify(lines.lines).includes('ana@x.com'))
  assert.equal((await hub.signInWith(person('ana', { email: 'ana@x.com', verified: false }))).headers.location, '/no-access?reason=IDENTITY_EMAIL_NOT_VERIFIED')
  assert.equal((await hub.signInWith(person('bia', { email: 'bia@x.com' }))).headers.location, '/no-access?reason=IDENTITY_NOT_ELIGIBLE')
  assert.equal((await hub.sql('SELECT count(*)::int AS n FROM iam.account'))[0].n, 1)
  assert.equal((await hub.sql('SELECT count(*)::int AS n FROM iam.workspace_invitation'))[0].n, 1)
})

test('an invited email signs in: the account, its name and email, the membership, and the invitation gone; an expired one is not eligible', async (t) => {
  const hub = await iamHub(t, 'conexus_iam_claim')
  const owner = await hub.seedAccount('10000000-0000-4000-8000-000000000001')
  await hub.seedWorkspace(W, 'Operações', [[owner, 'owner']])
  await hub.sql("INSERT INTO iam.workspace_invitation (invitation_id, workspace_id, email, role, invited_by, expires_at) VALUES (gen_random_uuid(), $1, 'ana@x.com', 'member', $2, now() + interval '1 day')", [W, owner])
  const answer = await hub.signInWith(person('ana-sub', { email: 'ana@x.com', name: 'Ana Souza' }))
  assert.equal(answer.headers.location, '/')
  const [ana] = await hub.sql("SELECT account_id, email, display_name, origin FROM iam.account WHERE external_subject = 'ana-sub'")
  assert.deepEqual({ ...ana, account_id: undefined }, { account_id: undefined, email: 'ana@x.com', display_name: 'Ana Souza', origin: 'CONTROL_PLANE' })
  assert.deepEqual(await hub.sql('SELECT workspace_id, role FROM iam.workspace_membership WHERE account_id = $1', [ana.account_id]), [{ workspace_id: W, role: 'member' }])
  assert.equal((await hub.sql('SELECT count(*)::int AS n FROM iam.workspace_invitation'))[0].n, 0)

  await hub.sql("INSERT INTO iam.workspace_invitation (invitation_id, workspace_id, email, role, invited_by, created_at, expires_at) VALUES (gen_random_uuid(), $1, 'bia@x.com', 'member', $2, now() - interval '2 days', now() - interval '1 day')", [W, owner])
  assert.equal((await hub.signInWith(person('bia-sub', { email: 'bia@x.com' }))).headers.location, '/no-access?reason=IDENTITY_NOT_ELIGIBLE')
  const roster = await hub.call(await hub.openHubSession(owner), 'GET', `/api/control/workspaces/${W}/roster`)
  assert.deepEqual(roster.json().entries.filter((entry) => entry.kind === 'invitation').map((entry) => [entry.email, entry.state]), [['bia@x.com', 'EXPIRED']])

  await hub.sql("UPDATE iam.account SET active = false WHERE external_subject = 'ana-sub'")
  assert.equal((await hub.signInWith(person('ana-sub', { email: 'ana@x.com' }))).headers.location, '/no-access?reason=ACCOUNT_INACTIVE')
})

test('a second subject with a known email gets no account; a known account follows its latest verified email', async (t) => {
  const hub = await iamHub(t, 'conexus_iam_email')
  const ana = await hub.seedAccount('10000000-0000-4000-8000-000000000002', { subject: 'sub1', email: 'ana@x.com' })
  await hub.seedWorkspace(W, 'Operações', [[ana, 'owner']])
  assert.equal((await hub.signInWith(person('sub2', { email: 'ana@x.com' }))).headers.location, '/no-access?reason=IDENTITY_NOT_ELIGIBLE')
  assert.equal((await hub.sql('SELECT count(*)::int AS n FROM iam.account'))[0].n, 1)
  assert.equal((await hub.signInWith(person('sub1', { email: 'ana@y.com' }))).headers.location, '/')
  assert.deepEqual(await hub.sql('SELECT email FROM iam.account WHERE account_id = $1', [ana]), [{ email: 'ana@y.com' }])
})

test('an account of an application only enters no Hub; an unknown person with only an application invitation keeps the account and the grant', async (t) => {
  const hub = await iamHub(t, 'conexus_iam_application_only')
  const owner = await hub.seedAccount('10000000-0000-4000-8000-000000000001')
  await hub.seedAccount('10000000-0000-4000-8000-000000000003', { subject: 'app-only', origin: 'APPLICATION_INVITATION' })
  await hub.seedWorkspace(W, 'Operações', [[owner, 'owner']])
  assert.equal((await hub.signInWith(person('app-only'))).headers.location, '/no-access?reason=IDENTITY_NOT_ELIGIBLE')
  assert.equal((await hub.sql("SELECT count(*)::int AS n FROM iam.host_session"))[0].n, 0)

  await hub.seedProject('33333333-3333-4333-8333-333333333333', W, 'Estoque Parado')
  await hub.sql("INSERT INTO iam.application (project_id, slug, created_by) VALUES ($1, 'estoque-parado', $2)", ['33333333-3333-4333-8333-333333333333', owner])
  await hub.sql("INSERT INTO iam.application_invitation (invitation_id, project_id, email, invited_by, expires_at) VALUES (gen_random_uuid(), $1, 'caio@x.com', $2, now() + interval '1 day')", ['33333333-3333-4333-8333-333333333333', owner])
  assert.equal((await hub.signInWith(person('caio', { email: 'caio@x.com' }))).headers.location, '/no-access?reason=IDENTITY_NOT_ELIGIBLE')
  const [caio] = await hub.sql("SELECT account_id, origin FROM iam.account WHERE external_subject = 'caio'")
  assert.equal(caio.origin, 'APPLICATION_INVITATION')
  assert.equal((await hub.sql('SELECT count(*)::int AS n FROM iam.application_grant WHERE account_id = $1 AND revoked_at IS NULL', [caio.account_id]))[0].n, 1)
  assert.equal((await hub.sql('SELECT count(*)::int AS n FROM iam.application_invitation'))[0].n, 0)
})

test('two parallel callbacks of one invited identity create one account and one membership', async (t) => {
  const hub = await iamHub(t, 'conexus_iam_claim_race')
  const owner = await hub.seedAccount('10000000-0000-4000-8000-000000000001')
  await hub.seedWorkspace(W, 'Operações', [[owner, 'owner']])
  await hub.sql("INSERT INTO iam.workspace_invitation (invitation_id, workspace_id, email, role, invited_by, expires_at) VALUES (gen_random_uuid(), $1, 'ana@x.com', 'member', $2, now() + interval '1 day')", [W, owner])
  const ana = person('ana-sub', { email: 'ana@x.com' })
  const answers = await Promise.all([hub.signInWith(ana), hub.signInWith(ana)])
  assert.deepEqual(answers.map((answer) => answer.headers.location), ['/', '/'])
  assert.equal((await hub.sql("SELECT count(*)::int AS n FROM iam.account WHERE external_subject = 'ana-sub'"))[0].n, 1)
  assert.equal((await hub.sql('SELECT count(*)::int AS n FROM iam.workspace_membership WHERE workspace_id = $1', [W]))[0].n, 2)
})
