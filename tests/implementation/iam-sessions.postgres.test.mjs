import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { HUB_ORIGIN, W, captureLines, digestOf, hubWrite, iamHub, problemOf, sessionCookie } from './iam-fixture.mjs'

const ANA = '10000000-0000-4000-8000-000000000002'
const P = '33333333-3333-4333-8333-333333333333'

const signedIn = async (t, prefix) => {
  const hub = await iamHub(t, prefix)
  await hub.seedAccount(ANA, { subject: 'ana' })
  await hub.seedWorkspace(W, 'Operações', [[ANA, 'owner']])
  const token = await hub.openHubSession(ANA)
  const read = () => hub.app.inject({ method: 'GET', url: '/api/session', headers: { cookie: sessionCookie(token) } })
  const rows = async () => (await hub.sql('SELECT count(*)::int AS n FROM iam.host_session WHERE token_digest = $1', [digestOf(token)]))[0].n
  const age = (statement) => hub.sql(statement, [digestOf(token)])
  return { hub, token, read, rows, age }
}

const recheckDue = "UPDATE iam.host_session SET started_at = started_at - interval '10 minutes', provider_checked_at = provider_checked_at - interval '6 minutes' WHERE token_digest = $1"

test('a Hub session ends idle or past its absolute limit: 401, its row gone, one SESSION_ENDED line with the reason', async (t) => {
  const { hub, read, rows, age } = await signedIn(t, 'conexus_iam_hub_expiry')
  const lines = captureLines(t)
  assert.equal((await read()).statusCode, 200)
  await age("UPDATE iam.host_session SET idle_expires_at = now() - interval '1 second' WHERE token_digest = $1")
  assert.equal(problemOf(await read()), '401 AUTHENTICATION_REQUIRED')
  assert.equal(await rows(), 0)
  assert.deepEqual(lines.of('SESSION_ENDED'), [{ kind: 'HUB', reason: 'IDLE_EXPIRED' }])

  const second = await hub.openHubSession(ANA)
  await hub.sql(`UPDATE iam.host_session SET started_at = started_at - interval '9 hours', absolute_expires_at = absolute_expires_at - interval '9 hours',
    idle_expires_at = absolute_expires_at - interval '9 hours', provider_checked_at = provider_checked_at - interval '9 hours' WHERE token_digest = $1`, [digestOf(second)])
  assert.equal((await hub.app.inject({ method: 'GET', url: '/api/session', headers: { cookie: sessionCookie(second) } })).statusCode, 401)
  assert.deepEqual(lines.of('SESSION_ENDED').at(-1), { kind: 'HUB', reason: 'ABSOLUTE_EXPIRED' })
})

test('a live request slides the idle limit, never past the absolute one', async (t) => {
  const { read, age, hub, token } = await signedIn(t, 'conexus_iam_hub_slide')
  await age("UPDATE iam.host_session SET idle_expires_at = now() + interval '1 minute' WHERE token_digest = $1")
  assert.equal((await read()).statusCode, 200)
  const [slid] = await hub.sql("SELECT idle_expires_at > now() + interval '29 minutes' AS slid FROM iam.host_session WHERE token_digest = $1", [digestOf(token)])
  assert.equal(slid.slid, true)
  await age("UPDATE iam.host_session SET absolute_expires_at = now() + interval '2 minutes', idle_expires_at = now() + interval '1 minute' WHERE token_digest = $1")
  assert.equal((await read()).statusCode, 200)
  const [capped] = await hub.sql('SELECT idle_expires_at = absolute_expires_at AS capped FROM iam.host_session WHERE token_digest = $1', [digestOf(token)])
  assert.equal(capped.capped, true)
})

test('the recheck: a disabled user ends the session; Keycloak unreachable keeps it and answers 503; two requests record once', async (t) => {
  const { hub, read, rows, age, token } = await signedIn(t, 'conexus_iam_hub_recheck')
  const lines = captureLines(t)
  await age(recheckDue)
  hub.oidc.refreshes.push({ kind: 'UNAVAILABLE' })
  assert.equal(problemOf(await read()), '503 IDENTITY_PROVIDER_UNAVAILABLE')
  assert.equal(await rows(), 1)
  assert.equal((await read()).statusCode, 200)
  const [after] = await hub.sql("SELECT provider_checked_at > now() - interval '1 minute' AS fresh FROM iam.host_session WHERE token_digest = $1", [digestOf(token)])
  assert.equal(after.fresh, true)

  await age(recheckDue)
  const before = hub.oidc.refreshCalls
  const [seen] = await hub.sql('SELECT provider_checked_at::text AS at FROM iam.host_session WHERE token_digest = $1', [digestOf(token)])
  const answers = await Promise.all([read(), read()])
  assert.deepEqual(answers.map((answer) => answer.statusCode), [200, 200])
  assert.ok(hub.oidc.refreshCalls - before >= 1)
  const [moved] = await hub.sql('SELECT provider_checked_at::text <> $2 AS moved FROM iam.host_session WHERE token_digest = $1', [digestOf(token), seen.at])
  assert.equal(moved.moved, true)

  await age(recheckDue)
  hub.oidc.refreshes.push({ kind: 'REFUSED', reason: 'USER_DISABLED' })
  assert.equal(problemOf(await read()), '401 AUTHENTICATION_REQUIRED')
  assert.equal(await rows(), 0)
  assert.deepEqual(lines.of('SESSION_ENDED'), [{ kind: 'HUB', reason: 'PROVIDER_USER_DISABLED' }])
})

test('a token the envelope cannot open ends the session with CUSTODY_CHANGED', async (t) => {
  const { read, rows, age } = await signedIn(t, 'conexus_iam_hub_custody')
  const lines = captureLines(t)
  await age(recheckDue)
  await age("UPDATE iam.host_session SET provider_refresh_token = 'mastra:factory-secret:v1:retired-key' WHERE token_digest = $1")
  assert.equal((await read()).statusCode, 401)
  assert.equal(await rows(), 0)
  assert.deepEqual(lines.of('SESSION_ENDED'), [{ kind: 'HUB', reason: 'CUSTODY_CHANGED' }])
})

test('sign out deletes the session and its Previews, then asks Keycloak once; a foreign origin is refused', async (t) => {
  const { hub, token, rows } = await signedIn(t, 'conexus_iam_sign_out')
  await hub.seedProject(P, W, 'Estoque Parado')
  const preview = 'p'.repeat(43)
  await hub.sql(`INSERT INTO iam.host_session (token_digest, kind, account_id, started_at, absolute_expires_at, project_id, artifact_revision_id, parent_digest)
    VALUES ($1, 'PREVIEW', $2, now(), now() + interval '15 minutes', $3, $4, $5)`, [digestOf(preview), ANA, P, randomUUID(), digestOf(token)])
  const signOut = (headers) => hub.app.inject({ method: 'DELETE', url: '/api/session', headers: { ...hubWrite, cookie: sessionCookie(token), ...headers } })
  assert.equal(problemOf(await signOut({ origin: 'https://evil.example' })), '403 REQUEST_AUTHENTICITY_DENIED')
  const ended = await signOut()
  assert.equal(ended.statusCode, 204)
  assert.ok([ended.headers['set-cookie']].flat().some((value) => /^__Host-conexus_session=;/.test(value)))
  assert.equal(await rows(), 0)
  assert.equal((await hub.sql("SELECT count(*)::int AS n FROM iam.host_session WHERE kind = 'PREVIEW'"))[0].n, 0)
  assert.deepEqual(hub.oidc.logouts, [`refresh-${ANA}`])
  assert.equal(problemOf(await signOut()), '401 AUTHENTICATION_REQUIRED')
  assert.equal(new URL(HUB_ORIGIN).protocol, 'https:')
})

test('an account of an application only whose last membership goes loses the Hub on its next request', async (t) => {
  const hub = await iamHub(t, 'conexus_iam_hub_entry')
  const lines = captureLines(t)
  const owner = await hub.seedAccount('10000000-0000-4000-8000-000000000001')
  const caio = await hub.seedAccount('10000000-0000-4000-8000-000000000009', { origin: 'APPLICATION_INVITATION' })
  await hub.seedWorkspace(W, 'Operações', [[owner, 'owner'], [caio, 'member']])
  const token = await hub.openHubSession(caio)
  assert.equal((await hub.call(token, 'GET', '/api/session')).statusCode, 200)
  await hub.sql('DELETE FROM iam.workspace_membership WHERE account_id = $1', [caio])
  assert.equal((await hub.call(token, 'GET', '/api/session')).statusCode, 401)
  assert.deepEqual(lines.of('SESSION_ENDED'), [{ kind: 'HUB', reason: 'HUB_ENTRY_WITHDRAWN' }])
})

test('the application request: served with a Checked proof on one entry; a refusal deletes the session; an ended one asks to sign in', async (t) => {
  const hub = await iamHub(t, 'conexus_iam_application_request')
  const owner = await hub.seedAccount('10000000-0000-4000-8000-000000000001')
  const caio = await hub.seedAccount('10000000-0000-4000-8000-000000000009', { origin: 'APPLICATION_INVITATION', email: 'caio@x.com' })
  await hub.seedWorkspace(W, 'Operações', [[owner, 'owner']])
  await hub.seedProject(P, W, 'Estoque Parado')
  await hub.sql("INSERT INTO iam.application (project_id, slug, created_by) VALUES ($1, 'estoque-parado', $2)", [P, owner])
  await hub.sql('INSERT INTO iam.application_grant (project_id, account_id, granted_by) VALUES ($1, $2, $3)', [P, caio, owner])
  const token = 'a'.repeat(43)
  await hub.sql(`INSERT INTO iam.host_session (token_digest, kind, account_id, started_at, absolute_expires_at, project_id, provider_refresh_token, provider_checked_at)
    VALUES ($1, 'APPLICATION', $2, now(), now() + interval '8 hours', $3, $4, now())`, [digestOf(token), caio, P, await hub.envelope.seal('refresh-caio')])
  const request = (slug) => hub.sessions.withApplicationRequest({ slug, token }, async ({ caller, checked }) => ({ caller, scope: checked.scope }))
  assert.deepEqual(await request('estoque-parado'), {
    kind: 'SERVED',
    value: { caller: { accountId: caio, email: 'caio@x.com', displayName: 'Account 1000' }, scope: { kind: 'application', accountId: caio, projectId: P, via: 'grant' } },
  })
  assert.deepEqual(await request('outro-app'), { kind: 'SIGN_IN_REQUIRED' })
  await hub.sql('UPDATE iam.application_grant SET revoked_at = clock_timestamp(), revoked_by = $1', [owner])
  assert.deepEqual(await request('estoque-parado'), { kind: 'SIGN_IN_REQUIRED' })
  assert.equal((await hub.sql("SELECT count(*)::int AS n FROM iam.host_session WHERE kind = 'APPLICATION'"))[0].n, 0)
})
