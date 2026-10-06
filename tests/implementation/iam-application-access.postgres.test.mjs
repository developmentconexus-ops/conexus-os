import assert from 'node:assert/strict'
import { test } from 'node:test'
import { P, Q, W, digestOf, iamHub, person, problemOf } from './iam-fixture.mjs'

const OWNER = '10000000-0000-4000-8000-000000000001'
const MEMBER = '10000000-0000-4000-8000-000000000002'
const OUTSIDER = '10000000-0000-4000-8000-000000000003'
const W2 = '66666666-6666-4666-8666-666666666666'
const access = (projectId = P) => `/api/control/projects/${projectId}/application-access`
const BINDING = 'B'.repeat(43)
const bindingParam = digestOf(BINDING).toString('base64url')

const estate = async (t, prefix) => {
  const hub = await iamHub(t, prefix)
  for (const id of [OWNER, MEMBER, OUTSIDER]) await hub.seedAccount(id)
  await hub.seedWorkspace(W, 'Operações', [[OWNER, 'owner'], [MEMBER, 'member']])
  await hub.seedWorkspace(W2, 'Outra', [[OUTSIDER, 'owner']])
  await hub.seedProject(P, W, 'Estoque Parado')
  await hub.seedProject(Q, W, 'Estoque Parado')
  const as = { owner: await hub.openHubSession(OWNER), member: await hub.openHubSession(MEMBER), outsider: await hub.openHubSession(OUTSIDER) }
  const grant = (email, key, projectId = P) => hub.call(as.owner, 'POST', access(projectId), { email }, { 'idempotency-key': key })
  return { hub, as, grant }
}

test('application access is owner only; the first grant fixes the address, and a second Project of the same name gets the next suffix', async (t) => {
  const { hub, as, grant } = await estate(t, 'conexus_iam_application_access')
  assert.equal(problemOf(await hub.call(as.member, 'GET', access())), '403 APPLICATION_ACCESS_MANAGE_REQUIRED')
  assert.equal(problemOf(await hub.call(as.outsider, 'GET', access())), '404 PROJECT_NOT_FOUND')
  assert.deepEqual((await hub.call(as.owner, 'GET', access())).json(), { entries: [] })
  const first = await grant('ana@x.com', 'g1')
  assert.equal(first.statusCode, 200)
  assert.equal((await grant('ana@x.com', 'g1')).body, first.body)
  assert.equal(problemOf(await grant('bia@x.com', 'g1')), '409 IDEMPOTENCY_CONFLICT')
  assert.equal(problemOf(await hub.call(as.owner, 'POST', access(), { email: 'ana@x.com' })), '400 IDEMPOTENCY_KEY_REQUIRED')
  const listed = (await hub.call(as.owner, 'GET', access())).json()
  assert.equal(listed.address, 'https://estoque-parado.apps.conexus.test')
  assert.deepEqual(listed.entries.map((entry) => [entry.kind, entry.email, entry.state]), [['invitation', 'ana@x.com', 'PENDING']])
  await grant('ana@x.com', 'g2', Q)
  assert.equal((await hub.call(as.owner, 'GET', access(Q))).json().address, 'https://estoque-parado-2.apps.conexus.test')
})

test('an invited unknown person signs in at the application, redeems once from the browser that began it, and is served', async (t) => {
  const { hub, grant } = await estate(t, 'conexus_iam_application_sign_in')
  await grant('caio@x.com', 'g1')
  const signedIn = await hub.signInWith(person('caio', { email: 'caio@x.com' }), { application: 'estoque-parado', binding: bindingParam })
  assert.equal(signedIn.statusCode, 303)
  assert.equal(signedIn.headers['referrer-policy'], 'no-referrer')
  const location = new URL(signedIn.headers.location)
  assert.equal(`${location.origin}${location.pathname}`, 'https://estoque-parado.apps.conexus.test/__conexus/sign-in/complete')
  const handoff = location.searchParams.get('handoff')
  assert.match(handoff, /^[A-Za-z0-9_-]{43}$/)
  const [caio] = await hub.sql("SELECT account_id, origin FROM iam.account WHERE external_subject = 'caio'")
  assert.equal(caio.origin, 'APPLICATION_INVITATION')
  assert.equal((await hub.sql('SELECT count(*)::int AS n FROM iam.application_grant WHERE account_id = $1 AND revoked_at IS NULL', [caio.account_id]))[0].n, 1)

  assert.equal(await hub.sessions.redeemApplication({ handoff, slug: 'estoque-parado', binding: 'C'.repeat(43) }), null)
  const redeemed = await hub.sessions.redeemApplication({ handoff, slug: 'estoque-parado', binding: BINDING })
  assert.match(redeemed.sessionToken, /^[A-Za-z0-9_-]{43}$/)
  assert.ok(redeemed.maxAgeSeconds > 28700 && redeemed.maxAgeSeconds <= 28800)
  assert.equal(await hub.sessions.redeemApplication({ handoff, slug: 'estoque-parado', binding: BINDING }), null)
  const served = await hub.sessions.withApplicationRequest({ slug: 'estoque-parado', token: redeemed.sessionToken }, async ({ checked }) => checked.scope.via)
  assert.deepEqual(served, { kind: 'SERVED', value: 'grant' })
  assert.deepEqual(await hub.sessions.withApplicationRequest({ slug: 'estoque-parado-2', token: redeemed.sessionToken }, async () => 'served'), { kind: 'SIGN_IN_REQUIRED' })

  const late = await hub.signInWith(person('caio', { email: 'caio@x.com' }), { application: 'estoque-parado', binding: bindingParam })
  await hub.sql("UPDATE iam.handoff SET minted_at = minted_at - interval '2 minutes', expires_at = expires_at - interval '2 minutes'")
  assert.equal(await hub.sessions.redeemApplication({ handoff: new URL(late.headers.location).searchParams.get('handoff'), slug: 'estoque-parado', binding: BINDING }), null)
})

test('at the application: an unverified email, a person without access, a member without a grant', async (t) => {
  const { hub, grant } = await estate(t, 'conexus_iam_application_refusals')
  await grant('ana@x.com', 'g1')
  const at = (claims) => hub.signInWith(claims, { application: 'estoque-parado', binding: bindingParam })
  assert.equal((await at(person('ana', { email: 'ana@x.com', verified: false }))).headers.location, 'https://estoque-parado.apps.conexus.test/__conexus/no-access?reason=EMAIL_NOT_VERIFIED')
  assert.equal((await hub.sql("SELECT count(*)::int AS n FROM iam.account WHERE external_subject = 'ana'"))[0].n, 0)
  assert.equal((await at(person(OUTSIDER))).headers.location, 'https://estoque-parado.apps.conexus.test/__conexus/no-access?reason=NOT_GRANTED')
  assert.match((await at(person(MEMBER))).headers.location, /\/__conexus\/sign-in\/complete\?handoff=/)
  const unknownSlug = await hub.app.inject({ method: 'GET', url: `/protocol/oidc/login?application=nao-existe&binding=${bindingParam}` })
  assert.equal(unknownSlug.headers.location, 'https://nao-existe.apps.conexus.test/__conexus/no-access?reason=NOT_GRANTED')
  const badBinding = await hub.app.inject({ method: 'GET', url: '/protocol/oidc/login?application=estoque-parado&binding=short' })
  assert.equal(badBinding.headers.location, 'https://estoque-parado.apps.conexus.test/__conexus/no-access?reason=SIGN_IN_FAILED')
  const badSlug = await hub.app.inject({ method: 'GET', url: `/protocol/oidc/login?application=www&binding=${bindingParam}` })
  assert.equal(badSlug.headers.location, '/no-access?reason=SIGN_IN_FAILED')
})

test('revoke, cancel and claim: a revoke ends access on the next request; cancel against claim of one invitation, exactly one wins', async (t) => {
  const { hub, as, grant } = await estate(t, 'conexus_iam_application_revoke')
  await grant('caio@x.com', 'g1')
  await hub.signInWith(person('caio', { email: 'caio@x.com' }))
  const [{ grant_id: grantId, account_id: caio }] = await hub.sql('SELECT grant_id, account_id FROM iam.application_grant')
  assert.equal(problemOf(await hub.call(as.member, 'DELETE', `${access()}/grants/${grantId}`)), '403 APPLICATION_ACCESS_MANAGE_REQUIRED')
  assert.equal((await hub.call(as.owner, 'DELETE', `${access()}/grants/${grantId}`)).statusCode, 204)
  assert.equal(problemOf(await hub.call(as.owner, 'DELETE', `${access()}/grants/${grantId}`)), '404 APPLICATION_ACCESS_ENTRY_NOT_FOUND')
  assert.deepEqual(await hub.sql('SELECT revoked_by FROM iam.application_grant'), [{ revoked_by: OWNER }])

  for (const order of ['cancel-first', 'claim-first']) {
    const email = `${order}@x.com`
    const invited = (await grant(email, `k-${order}`)).json()
    const cancel = () => hub.call(as.owner, 'DELETE', `${access()}/invitations/${invited.invitationId}`)
    const claim = () => hub.signInWith(person(order, { email }))
    const [cancelled] = order === 'cancel-first' ? await Promise.all([cancel(), claim()]) : (await Promise.all([claim(), cancel()])).reverse()
    const granted = (await hub.sql('SELECT count(*)::int AS n FROM iam.application_grant AS g JOIN iam.account AS a USING (account_id) WHERE a.external_subject = $1', [order]))[0].n
    if (cancelled.statusCode === 204) assert.equal(granted, 0)
    else {
      assert.equal(problemOf(cancelled), '404 APPLICATION_ACCESS_ENTRY_NOT_FOUND')
      assert.equal(granted, 1)
    }
  }
  assert.ok(caio)
})

test('presence: while the first prepare of an application holds the shared lock, a grant waits 5 s and answers DATABASE_BUSY, then succeeds', async (t) => {
  const { hub, grant } = await estate(t, 'conexus_iam_application_presence')
  let release
  const released = new Promise((resolve) => { release = resolve })
  let entered
  const holding = new Promise((resolve) => { entered = resolve })
  const prepare = hub.applicationAccess.withApplicationPresence(P, async (hasApplication) => {
    entered(hasApplication)
    await released
    return hasApplication
  })
  assert.equal(await holding, false)
  const [backend] = await hub.sql("SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name = 'conexus-hub:application-presence' AND state <> 'idle in transaction'")
  assert.equal(backend.n, 1)
  const started = Date.now()
  assert.equal(problemOf(await grant('ana@x.com', 'busy')), '503 DATABASE_BUSY')
  assert.ok(Date.now() - started >= 4000)
  assert.equal((await hub.sql('SELECT count(*)::int AS n FROM iam.application'))[0].n, 0)
  release()
  assert.equal(await prepare, false)
  assert.equal((await grant('ana@x.com', 'after')).statusCode, 200)
  assert.equal(await hub.applicationAccess.withApplicationPresence(P, async (hasApplication) => hasApplication), true)
})
