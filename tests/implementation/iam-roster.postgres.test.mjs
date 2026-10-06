import assert from 'node:assert/strict'
import { test } from 'node:test'
import { HUB_ORIGIN, W, iamHub, person, problemOf, sessionCookie } from './iam-fixture.mjs'
import { hubModuleUrl } from './hub-build.mjs'

const { createHttpApp } = await import(hubModuleUrl('http/app.js'))
const { registerRosterRoutes } = await import(hubModuleUrl('identity-access/roster.js'))

const OWNER = '10000000-0000-4000-8000-000000000001'
const MEMBER = '10000000-0000-4000-8000-000000000002'
const OUTSIDER = '10000000-0000-4000-8000-000000000003'
const SECOND_OWNER = '10000000-0000-4000-8000-000000000004'
const W2 = '66666666-6666-4666-8666-666666666666'
const roster = `/api/control/workspaces/${W}/roster`
const invitations = `/api/control/workspaces/${W}/invitations`
const member = (accountId, workspaceId = W) => `/api/control/workspaces/${workspaceId}/members/${accountId}`

const team = async (t, prefix) => {
  const hub = await iamHub(t, prefix)
  for (const [id, name] of [[OWNER, 'Olga'], [MEMBER, 'Mara'], [OUTSIDER, 'Otto'], [SECOND_OWNER, 'Sara']]) await hub.seedAccount(id, { name, email: `${name.toLowerCase()}@x.com` })
  await hub.seedWorkspace(W, 'Operações', [[OWNER, 'owner'], [MEMBER, 'member']])
  await hub.seedWorkspace(W2, 'Outra', [[OUTSIDER, 'owner']])
  const as = Object.fromEntries(await Promise.all([[OWNER, 'owner'], [MEMBER, 'member'], [OUTSIDER, 'outsider'], [SECOND_OWNER, 'second']].map(async ([id, key]) => [key, await hub.openHubSession(id)])))
  return { hub, as }
}

test('the roster reads under hub_reader: a member sees members and invitations, an outsider and a deactivated member get 404', async (t) => {
  const { hub, as } = await team(t, 'conexus_iam_roster_read')
  await hub.sql("INSERT INTO iam.workspace_invitation (invitation_id, workspace_id, email, role, invited_by, expires_at) VALUES (gen_random_uuid(), $1, 'nina@x.com', 'member', $2, now() + interval '1 day')", [W, OWNER])
  const read = await hub.call(as.member, 'GET', roster)
  assert.equal(read.statusCode, 200)
  assert.equal(read.json().viewerRole, 'member')
  assert.deepEqual(read.json().entries.map((entry) => entry.kind === 'member' ? [entry.displayName, entry.email, entry.role] : [entry.email, entry.role, entry.state]),
    [['Olga', 'olga@x.com', 'owner'], ['Mara', 'mara@x.com', 'member'], ['nina@x.com', 'member', 'PENDING']])
  assert.equal(problemOf(await hub.call(as.outsider, 'GET', roster)), '404 WORKSPACE_NOT_FOUND')
  // A Hub session of an inactive account ends before any operation, so the roster read is reached here through a resolver that keeps it.
  await hub.sql('UPDATE iam.account SET active = false WHERE account_id = $1', [MEMBER])
  const kept = await createHttpApp({
    policy: { listener: 'hub', hubOrigin: HUB_ORIGIN, resolveHubSession: async () => ({ account: { accountId: MEMBER, displayName: 'Mara' } }) },
    registerRoutes: (server) => registerRosterRoutes(server, hub.database),
  })
  t.after(() => kept.close())
  assert.equal(problemOf(await kept.inject({ method: 'GET', url: roster, headers: { cookie: sessionCookie('k'.repeat(43)) } })), '404 WORKSPACE_NOT_FOUND')
})

test('invitations: owner only, keyed, and the pair (Workspace, email) is one invitation', async (t) => {
  const { hub, as } = await team(t, 'conexus_iam_roster_invite')
  const invite = (token, body, key) => hub.call(token, 'POST', invitations, body, key === undefined ? {} : { 'idempotency-key': key })
  assert.equal(problemOf(await invite(as.member, { email: 'ana@x.com', role: 'member' }, 'k0')), '403 MEMBERS_MANAGE_REQUIRED')
  assert.equal(problemOf(await invite(as.owner, { email: 'ana@x.com', role: 'member' })), '400 IDEMPOTENCY_KEY_REQUIRED')
  const first = await invite(as.owner, { email: 'ana@x.com', role: 'member' }, 'k1')
  const replay = await invite(as.owner, { email: 'ana@x.com', role: 'member' }, 'k1')
  assert.equal(first.statusCode, 200)
  assert.deepEqual(replay.json(), first.json())
  assert.equal((await hub.sql('SELECT count(*)::int AS n FROM iam.workspace_invitation'))[0].n, 1)
  assert.equal(problemOf(await invite(as.owner, { email: 'bia@x.com', role: 'member' }, 'k1')), '409 IDEMPOTENCY_CONFLICT')
  const refreshed = await invite(as.owner, { email: ' Ana@X.com ', role: 'owner' }, 'k2')
  assert.equal(refreshed.statusCode, 200)
  assert.equal(refreshed.json().invitationId, first.json().invitationId)
  assert.equal(refreshed.json().email, 'ana@x.com')
  assert.equal(refreshed.json().role, 'owner')
  assert.ok(refreshed.json().expiresAt >= first.json().expiresAt)
  assert.equal(problemOf(await invite(as.owner, { email: 'not an email', role: 'member' }, 'k3')), '400 EMAIL_INVALID')
})

test('a member cannot make themselves owner; the only owner stays; two owners stepping down at once: one wins; two owners demoting each other: the loser no longer holds authority', async (t) => {
  const { hub, as } = await team(t, 'conexus_iam_roster_owner')
  assert.equal(problemOf(await hub.call(as.member, 'PUT', member(MEMBER), { role: 'owner' })), '403 MEMBERS_MANAGE_REQUIRED')
  assert.deepEqual(await hub.sql('SELECT role FROM iam.workspace_membership WHERE account_id = $1 AND workspace_id = $2', [MEMBER, W]), [{ role: 'member' }])
  assert.equal(problemOf(await hub.call(as.owner, 'PUT', member(OWNER), { role: 'member' })), '409 LAST_OWNER')
  assert.equal(problemOf(await hub.call(as.owner, 'DELETE', member(OWNER))), '409 LAST_OWNER')
  const promoted = await hub.call(as.owner, 'PUT', member(MEMBER), { role: 'owner' })
  assert.deepEqual({ ...promoted.json(), since: undefined }, { kind: 'member', accountId: MEMBER, displayName: 'Mara', email: 'mara@x.com', role: 'owner', since: undefined })
  const answers = await Promise.all([hub.call(as.owner, 'PUT', member(OWNER), { role: 'member' }), hub.call(as.member, 'PUT', member(MEMBER), { role: 'member' })])
  assert.deepEqual(answers.map((answer) => answer.statusCode).sort(), [200, 409])
  assert.equal((await hub.sql("SELECT count(*)::int AS n FROM iam.workspace_membership WHERE workspace_id = $1 AND role = 'owner'", [W]))[0].n, 1)

  await hub.sql("UPDATE iam.workspace_membership SET role = 'owner' WHERE workspace_id = $1", [W])
  const removals = await Promise.all([hub.call(as.owner, 'DELETE', member(OWNER)), hub.call(as.member, 'DELETE', member(MEMBER))])
  assert.deepEqual(removals.map((answer) => answer.statusCode).sort(), [204, 409])

  await hub.sql("INSERT INTO iam.workspace_membership (account_id, workspace_id, role) SELECT account_id, $1, 'owner' FROM iam.account WHERE account_id = ANY($2) ON CONFLICT (account_id, workspace_id) DO UPDATE SET role = 'owner'", [W, [OWNER, MEMBER]])
  const demotions = await Promise.all([hub.call(as.owner, 'PUT', member(MEMBER), { role: 'member' }), hub.call(as.member, 'PUT', member(OWNER), { role: 'member' })])
  assert.deepEqual(demotions.map((answer) => answer.statusCode === 200 ? '200' : problemOf(answer)).sort(), ['200', '403 MEMBERS_MANAGE_REQUIRED'])
})

test('a member leaves; an entry of another Workspace is not found; cancel and claim of one invitation: exactly one wins', async (t) => {
  const { hub, as } = await team(t, 'conexus_iam_roster_leave')
  assert.equal((await hub.call(as.member, 'DELETE', member(MEMBER))).statusCode, 204)
  assert.equal(problemOf(await hub.call(as.member, 'GET', roster)), '404 WORKSPACE_NOT_FOUND')
  assert.equal(problemOf(await hub.call(as.owner, 'DELETE', member(OUTSIDER))), '404 ROSTER_ENTRY_NOT_FOUND')

  for (const order of ['cancel-first', 'claim-first']) {
    const email = `${order}@x.com`
    const [{ invitation_id: invitationId }] = await hub.sql("INSERT INTO iam.workspace_invitation (invitation_id, workspace_id, email, role, invited_by, expires_at) VALUES (gen_random_uuid(), $1, $2, 'member', $3, now() + interval '1 day') RETURNING invitation_id", [W, email, OWNER])
    const cancel = () => hub.call(as.owner, 'DELETE', `/api/control/workspaces/${W}/invitations/${invitationId}`)
    const claim = () => hub.signInWith(person(order, { email }))
    const [cancelled, claimed] = order === 'cancel-first' ? await Promise.all([cancel(), claim()]) : (await Promise.all([claim(), cancel()])).reverse()
    const joined = (await hub.sql("SELECT count(*)::int AS n FROM iam.workspace_membership AS m JOIN iam.account AS a USING (account_id) WHERE a.external_subject = $1", [order]))[0].n
    if (cancelled.statusCode === 204) {
      assert.equal(joined, 0)
      assert.equal(claimed.headers.location, '/no-access?reason=IDENTITY_NOT_ELIGIBLE')
    } else {
      assert.equal(problemOf(cancelled), '404 ROSTER_ENTRY_NOT_FOUND')
      assert.equal(joined, 1)
    }
  }
})

test('an expired invitation can still be cancelled', async (t) => {
  const { hub, as } = await team(t, 'conexus_iam_roster_cancel_expired')
  const [{ invitation_id: invitationId }] = await hub.sql("INSERT INTO iam.workspace_invitation (invitation_id, workspace_id, email, role, invited_by, created_at, expires_at) VALUES (gen_random_uuid(), $1, 'late@x.com', 'member', $2, now() - interval '3 days', now() - interval '1 day') RETURNING invitation_id", [W, OWNER])
  assert.equal((await hub.call(as.owner, 'DELETE', `/api/control/workspaces/${W}/invitations/${invitationId}`)).statusCode, 204)
  assert.equal((await hub.sql('SELECT count(*)::int AS n FROM iam.workspace_invitation'))[0].n, 0)
})
