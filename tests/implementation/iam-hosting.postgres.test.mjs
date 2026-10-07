import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import pg from 'pg'
import { APPLICATIONS, HUB_ORIGIN, P, W, digestOf, iamHub, person } from './iam-fixture.mjs'
import { hubModuleUrl } from './hub-build.mjs'
import { waitUntilBlocked } from './race.mjs'
import { F, fileOf, payloadOf, seedRevision } from './registry-fixture.mjs'

const { createHttpApp } = await import(hubModuleUrl('http/app.js'))
const { createHostingModule } = await import(hubModuleUrl('hosting/module.js'))
const { createRegistryModule } = await import(hubModuleUrl('registry/module.js'))
const { createProjectDeletion } = await import(hubModuleUrl('project/deletion.js'))
const { purgeProjectBuilder } = await import(hubModuleUrl('builder/project-ports.js'))
const { purgeProjectBindings } = await import(hubModuleUrl('connectors/store.js'))
const { purgeProject } = await import(hubModuleUrl('identity-access/application-access.js'))
const { admitProject } = await import(hubModuleUrl('identity-access/admission.js'))
const { applicationOrigin } = await import(hubModuleUrl('platform/config.js'))

const OWNER = '10000000-0000-4000-8000-000000000001'
const MEMBER = '10000000-0000-4000-8000-000000000002'
const CAIO = '10000000-0000-4000-8000-000000000009'
const SLUG = 'estoque-parado'
const APP_HOST = new URL(applicationOrigin(APPLICATIONS, SLUG)).host
const PREVIEW_PORT = 3444
const SOURCE = 'a'.repeat(40)
const DIGEST = 'c'.repeat(64)
const SERVER = fileOf('conexus-server/manifest.json', 'application/json; charset=utf-8', '{}')
const NAVIGATE = Object.freeze({ 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' })
const previewHost = (revision) => `preview-${revision}.conexus.localhost:${PREVIEW_PORT}`
const runtime = (client) => client?.connectionParameters?.user === 'hub_runtime'

/**
 * Every statement a hub_runtime connection sends, with the backend that ran it, and an optional step
 * that runs before a matching statement is sent: a test commits a revoke between two statements of one entry.
 */
const statements = (t) => {
  const sent = []
  const before = []
  const original = pg.Client.prototype.query
  t.mock.method(pg.Client.prototype, 'query', async function (config, ...rest) {
    const text = typeof config === 'string' ? config : config?.text
    if (runtime(this) && typeof text === 'string') {
      sent.push({ pid: this.processID, text })
      const step = before.findIndex((entry) => entry.match.test(text))
      if (step >= 0) await before.splice(step, 1)[0].run()
    }
    return original.call(this, config, ...rest)
  })
  return { sent, before: (match, run) => before.push({ match, run }) }
}

const estate = async (t, prefix, { invoke } = {}) => {
  const hub = await iamHub(t, prefix)
  await hub.seedAccount(OWNER, { email: 'dona@x.com' })
  await hub.seedAccount(MEMBER, { email: 'membro@x.com' })
  await hub.seedAccount(CAIO, { subject: 'caio', email: 'caio@x.com', origin: 'APPLICATION_INVITATION' })
  await hub.seedWorkspace(W, 'Operações', [[OWNER, 'owner'], [MEMBER, 'member']])
  await hub.seedProject(P, W, 'Estoque Parado')
  const revision = await seedRevision(hub.connection, P, { sourceRevision: SOURCE, digest: DIGEST, payload: payloadOf([F, SERVER]) })
  await hub.sql('UPDATE builder.project_working_state SET last_preview_source_revision = $2, last_preview_artifact_revision_id = $3, last_preview_artifact_digest = $4 WHERE project_id = $1', [P, SOURCE, revision, DIGEST])
  await hub.sql('INSERT INTO iam.application (project_id, slug, created_by) VALUES ($1, $2, $3)', [P, SLUG, OWNER])
  await hub.sql('INSERT INTO iam.application_grant (project_id, account_id, granted_by) VALUES ($1, $2, $3)', [P, CAIO, OWNER])
  const registry = createRegistryModule({ database: hub.database })
  const invocations = []
  const hosting = createHostingModule({
    sessions: { withPreviewRequest: hub.sessions.withPreviewRequest, redeem: hub.sessions.redeemPreview },
    registry,
    applicationRunner: { invoke: async (input) => { invocations.push(input); return invoke ? invoke(input) : { status: 200, body: { ok: true } } } },
    exactHubOrigin: HUB_ORIGIN,
    previewPort: PREVIEW_PORT,
    applicationHost: {
      sessions: { withApplicationRequest: hub.sessions.withApplicationRequest, redeem: hub.sessions.redeemApplication, signOut: hub.sessions.signOutApplication },
      application: APPLICATIONS,
    },
  })
  const applicationApp = await createHttpApp({ policy: hosting.applicationHost.policy, registerRoutes: hosting.applicationHost.registerRoutes, staticRoot: null })
  const previewApp = await createHttpApp({ policy: hosting.previewPolicy, registerRoutes: hosting.registerPreviewRoutes, staticRoot: null })
  t.after(async () => { await applicationApp.close(); await previewApp.close(); await hosting.close() })
  const sessionOf = async (accountId, { project = P } = {}) => {
    const token = randomUUID().replaceAll('-', '').padEnd(43, 's').slice(0, 43)
    await hub.sql(`INSERT INTO iam.host_session (token_digest, kind, account_id, started_at, absolute_expires_at, project_id, provider_refresh_token, provider_checked_at)
      VALUES ($1, 'APPLICATION', $2, now(), now() + interval '8 hours', $3, $4, now())`, [digestOf(token), accountId, project, await hub.envelope.seal(`refresh-${accountId}`)])
    return token
  }
  const page = (token, url = '/', host = APP_HOST) => applicationApp.inject({ method: 'GET', url, headers: { host, ...NAVIGATE, ...(token ? { cookie: `__Host-conexus_app=${token}` } : {}) } })
  const fetchFile = (token, url = '/index.html') => applicationApp.inject({ method: 'GET', url, headers: { host: APP_HOST, 'sec-fetch-mode': 'cors', 'sec-fetch-dest': 'empty', cookie: `__Host-conexus_app=${token}` } })
  const api = (token) => applicationApp.inject({
    method: 'POST', url: '/__conexus/api/listNotes', payload: {},
    headers: { host: APP_HOST, origin: `https://${APP_HOST}`, 'content-type': 'application/json', cookie: `__Host-conexus_app=${token}` },
  })
  const sessions = async (kind) => (await hub.sql('SELECT count(*)::int AS n FROM iam.host_session WHERE kind = $1', [kind]))[0].n
  const launch = (accountId, hubToken, artifactRevisionId = revision) =>
    hub.database.transaction(accountId, async (gate) => hub.sessions.openPreview(await admitProject(gate, { projectId: P, action: 'project.build' }), digestOf(hubToken), artifactRevisionId))
  const enter = (entryGrant, artifactRevisionId = revision) => previewApp.inject({
    method: 'POST', url: '/__conexus/preview-entry', payload: `entryGrant=${entryGrant}`,
    headers: { host: previewHost(artifactRevisionId), origin: HUB_ORIGIN, 'content-type': 'application/x-www-form-urlencoded' },
  })
  const previewCookie = (response) => [response.headers['set-cookie'] ?? []].flat().find((value) => value.startsWith('__Host-conexus_preview='))?.split(';')[0]
  const previewPage = (cookie, artifactRevisionId = revision) => previewApp.inject({ method: 'GET', url: '/', headers: { host: previewHost(artifactRevisionId), ...NAVIGATE, ...(cookie ? { cookie } : {}) } })
  const purge = createProjectDeletion({
    database: hub.database,
    ports: {
      releaseApplicationData: async () => undefined, killSandboxes: async () => undefined, deleteRepository: async () => undefined,
      purgeIdentityAccess: purgeProject, purgeConnectorBindings: purgeProjectBindings, purgeRegistry: registry.purge, purgeBuilder: purgeProjectBuilder,
    },
  })
  return { hub, revision, registry, invocations, applicationApp, previewApp, sessionOf, page, fetchFile, api, sessions, launch, enter, previewCookie, previewPage, purge }
}

const backendsBusy = async (hub) => (await hub.sql(
  "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = $1 AND usename = 'hub_runtime' AND state <> 'idle'", [hub.connection.database]))[0].n

test('one served request is one entry on one connection: BEGIN, one set_config, the lookup, the check, the read, COMMIT; no cookie sends nothing', async (t) => {
  const { fetchFile, page, sessionOf } = await estate(t, 'conexus_iam_host_entry')
  const token = await sessionOf(CAIO)
  const log = statements(t)
  const served = await fetchFile(token)
  assert.equal(served.statusCode, 200)
  assert.equal(served.body, '<html></html>')
  assert.equal(new Set(log.sent.map((entry) => entry.pid)).size, 1)
  assert.deepEqual(log.sent.map((entry) => entry.text.trim().split(/\s+/).slice(0, 2).join(' ')), ['BEGIN', 'SELECT set_config($1,', 'SELECT person.account_id,', 'SELECT EXISTS', 'SELECT CASE', 'COMMIT'])
  log.sent.length = 0
  const signIn = await page(null)
  assert.equal(signIn.statusCode, 303)
  assert.deepEqual(log.sent, [])
  const deepLink = await page(token, '/estoque/itens/42')
  assert.equal(deepLink.statusCode, 200)
  assert.equal(log.sent.filter((entry) => entry.text === 'BEGIN').length, 1, 'the file read and the fallback to the app index run in one entry')
})

test('a revoke committed before the check, or between the lookup and the check, is refused; one between the check and the read serves that request only', async (t) => {
  const { hub, fetchFile, sessionOf, sessions } = await estate(t, 'conexus_iam_host_revoke')
  const revoke = () => hub.sql('UPDATE iam.application_grant SET revoked_at = clock_timestamp(), revoked_by = $1 WHERE revoked_at IS NULL', [OWNER])
  const regrant = () => hub.sql('INSERT INTO iam.application_grant (project_id, account_id, granted_by) VALUES ($1, $2, $3)', [P, CAIO, OWNER])

  await revoke()
  assert.equal((await fetchFile(await sessionOf(CAIO))).statusCode, 401)
  assert.equal(await sessions('APPLICATION'), 0)

  await regrant()
  const log = statements(t)
  log.before(/access_grant\.revoked_at IS NULL\) AS granted/, revoke)
  assert.equal((await fetchFile(await sessionOf(CAIO))).statusCode, 401)
  assert.equal(await sessions('APPLICATION'), 0)

  await regrant()
  const token = await sessionOf(CAIO)
  await hub.sql('CREATE EXTENSION IF NOT EXISTS pgrowlocks')
  let locks
  log.before(/builder\.project_working_state AS working/, async () => {
    locks = await hub.sql("SELECT * FROM pgrowlocks('iam.application_grant')")
    const client = new pg.Client(hub.connection)
    await client.connect()
    try {
      await client.query("SET lock_timeout = '1s'")
      await client.query('UPDATE iam.application_grant SET revoked_at = clock_timestamp(), revoked_by = $1 WHERE revoked_at IS NULL', [OWNER])
    } finally {
      await client.end()
    }
  })
  assert.equal((await fetchFile(token)).statusCode, 200, 'the read after the check serves')
  assert.deepEqual(locks, [], 'a served request holds no row lock on a grant')
  assert.equal((await fetchFile(token)).statusCode, 401, 'the next request is refused')
})

test('revoke then grant again through the operations: the next document asks to sign in, and the callback brings a new grant and a new cookie', async (t) => {
  const { hub, page, applicationApp } = await estate(t, 'conexus_iam_host_regrant')
  const owner = await hub.openHubSession(OWNER)
  const access = `/api/control/projects/${P}/application-access`
  const binding = 'B'.repeat(43)
  const bindingParam = digestOf(binding).toString('base64url')
  const signIn = async () => {
    const callback = await hub.signInWith(person('caio', { email: 'caio@x.com' }), { application: SLUG, binding: bindingParam })
    const complete = new URL(callback.headers.location)
    return applicationApp.inject({ method: 'GET', url: `${complete.pathname}${complete.search}`, headers: { host: APP_HOST, ...NAVIGATE, cookie: `__Host-conexus_app_signin=${binding}` } })
  }
  const first = await signIn()
  assert.equal(first.statusCode, 303)
  const token = first.headers['set-cookie'].split(';')[0].slice('__Host-conexus_app='.length)
  assert.equal((await page(token)).statusCode, 200)

  const [{ grant_id: grantId }] = await hub.sql('SELECT grant_id FROM iam.application_grant WHERE account_id = $1', [CAIO])
  assert.equal((await hub.call(owner, 'DELETE', `${access}/grants/${grantId}`)).statusCode, 204)
  const refused = await page(token)
  assert.equal(refused.statusCode, 303)
  assert.match(refused.headers.location, /^https:\/\/hub\.conexus\.test\/protocol\/oidc\/login\?application=estoque-parado&binding=/)
  assert.equal((await hub.sql("SELECT count(*)::int AS n FROM iam.host_session WHERE kind = 'APPLICATION'"))[0].n, 0)

  assert.equal((await hub.call(owner, 'POST', access, { email: 'caio@x.com' }, { 'idempotency-key': 'again' })).statusCode, 201)
  const second = await signIn()
  assert.equal(second.statusCode, 303)
  const renewed = second.headers['set-cookie'].split(';')[0].slice('__Host-conexus_app='.length)
  assert.notEqual(renewed, token)
  assert.deepEqual(await hub.sql('SELECT count(*)::int AS open FROM iam.application_grant WHERE account_id = $1 AND revoked_at IS NULL', [CAIO]), [{ open: 1 }])
  assert.deepEqual(await hub.sql('SELECT count(*)::int AS n FROM iam.application_invitation'), [{ n: 0 }])
  assert.equal((await page(renewed)).statusCode, 200)
})

test('sign in is required for an expired session, another slug, an unknown digest and a purged application; a lost right deletes the session', async (t) => {
  const { hub, page, sessionOf, sessions } = await estate(t, 'conexus_iam_host_refusals')
  const expired = await sessionOf(CAIO)
  await hub.sql("UPDATE iam.host_session SET started_at = now() - interval '9 hours', absolute_expires_at = now() - interval '1 hour' WHERE token_digest = $1", [digestOf(expired)])
  assert.equal((await page(expired)).statusCode, 303)
  assert.equal((await page(await sessionOf(CAIO), '/', new URL(applicationOrigin(APPLICATIONS, 'outro-app')).host)).statusCode, 303)
  assert.equal((await page('u'.repeat(43))).statusCode, 303)
  assert.equal(await sessions('APPLICATION'), 1, 'a session on another slug is kept')
  await hub.sql('DELETE FROM iam.host_session')

  for (const [label, take, give] of [
    ['inactive account', 'UPDATE iam.account SET active = false WHERE account_id = $1', 'UPDATE iam.account SET active = true WHERE account_id = $1'],
    ['no grant', 'UPDATE iam.application_grant SET revoked_at = clock_timestamp(), revoked_by = $2 WHERE account_id = $1', 'INSERT INTO iam.application_grant (project_id, account_id, granted_by) VALUES ($3, $1, $2)'],
  ]) {
    const token = await sessionOf(CAIO)
    await hub.sql(take, take.includes('$2') ? [CAIO, OWNER] : [CAIO])
    assert.equal((await page(token)).statusCode, 303, label)
    assert.equal(await sessions('APPLICATION'), 0, label)
    await hub.sql(give, give.includes('$3') ? [CAIO, OWNER, P] : [CAIO])
  }
  const token = await sessionOf(CAIO)
  await hub.sql('INSERT INTO project.project_deletion (project_id, workspace_id, name, requested_by) VALUES ($1, $2, $3, $4)', [P, W, 'Estoque Parado', OWNER])
  assert.equal((await page(token)).statusCode, 303)
  assert.equal(await sessions('APPLICATION'), 0)
  const callback = await hub.signInWith(person('caio', { email: 'caio@x.com' }), { application: SLUG, binding: digestOf('B'.repeat(43)).toString('base64url') })
  assert.equal(callback.headers.location, `https://${APP_HOST}/__conexus/no-access?reason=NOT_GRANTED`)
})

test('the Keycloak recheck and an operation invoke hold no transaction and no pool connection', async (t) => {
  let busyDuringInvoke
  let hubRef
  const { hub, api, sessionOf, invocations } = await estate(t, 'conexus_iam_host_outside', { invoke: async () => { busyDuringInvoke = await backendsBusy(hubRef); return { status: 200, body: { ok: true } } } })
  hubRef = hub
  const token = await sessionOf(CAIO)
  let busyDuringRecheck
  hub.oidc.refreshes.push(async (input) => { busyDuringRecheck = await backendsBusy(hub); return { kind: 'ACTIVE', refreshToken: input.refreshToken } })
  await hub.sql("UPDATE iam.host_session SET started_at = started_at - interval '10 minutes', provider_checked_at = provider_checked_at - interval '6 minutes' WHERE token_digest = $1", [digestOf(token)])
  const answered = await api(token)
  assert.equal(answered.statusCode, 200)
  assert.equal(hub.oidc.refreshCalls, 1)
  assert.equal(busyDuringRecheck, 0)
  assert.equal(invocations.length, 1)
  assert.equal(busyDuringInvoke, 0)
})

test('Preview: the entry grant opens a session only on its own host and once; an expired session and a signed out Hub ask to sign in', async (t) => {
  const { hub, launch, enter, previewCookie, previewPage, sessions } = await estate(t, 'conexus_iam_preview_entry')
  const hubToken = await hub.openHubSession(MEMBER)
  const { entryGrant } = await launch(MEMBER, hubToken)
  assert.equal((await enter(entryGrant, randomUUID())).statusCode, 403)
  const entered = await enter(entryGrant)
  assert.equal(entered.statusCode, 303)
  assert.equal((await enter(entryGrant)).statusCode, 403)
  const cookie = previewCookie(entered)
  const served = await previewPage(cookie)
  assert.equal(served.statusCode, 200)
  assert.equal(served.body, '<html></html>')
  assert.equal((await previewPage(cookie, randomUUID())).statusCode, 403)

  await hub.sql("UPDATE iam.host_session SET started_at = now() - interval '16 minutes', absolute_expires_at = now() - interval '1 second' WHERE kind = 'PREVIEW'")
  assert.equal((await previewPage(cookie)).statusCode, 403)
  assert.equal(await sessions('PREVIEW'), 0)

  const again = previewCookie(await enter((await launch(MEMBER, hubToken)).entryGrant))
  assert.equal((await hub.call(hubToken, 'DELETE', '/api/session')).statusCode, 204)
  assert.equal(await sessions('PREVIEW'), 0)
  assert.equal((await previewPage(again)).statusCode, 403)
})

test('Preview: a parent recheck that Keycloak refuses ends both sessions', async (t) => {
  const { hub, launch, enter, previewCookie, previewPage, sessions } = await estate(t, 'conexus_iam_preview_recheck')
  const hubToken = await hub.openHubSession(MEMBER)
  const cookie = previewCookie(await enter((await launch(MEMBER, hubToken)).entryGrant))
  await hub.sql("UPDATE iam.host_session SET started_at = started_at - interval '10 minutes', provider_checked_at = provider_checked_at - interval '6 minutes' WHERE kind = 'HUB'")
  hub.oidc.refreshes.push({ kind: 'REFUSED', reason: 'USER_DISABLED' })
  assert.equal((await previewPage(cookie)).statusCode, 403)
  assert.equal(await sessions('HUB'), 0)
  assert.equal(await sessions('PREVIEW'), 0)
})

test('Preview: a removed member and a Project in deletion lose the Preview on the next request, and the Hub session stays', async (t) => {
  const { hub, launch, enter, previewCookie, previewPage, sessions } = await estate(t, 'conexus_iam_preview_check')
  const memberHub = await hub.openHubSession(MEMBER)
  const ownerHub = await hub.openHubSession(OWNER)
  const removed = previewCookie(await enter((await launch(MEMBER, memberHub)).entryGrant))
  const kept = previewCookie(await enter((await launch(OWNER, ownerHub)).entryGrant))
  await hub.sql('DELETE FROM iam.workspace_membership WHERE account_id = $1', [MEMBER])
  assert.equal((await previewPage(removed)).statusCode, 403)
  assert.deepEqual(await hub.sql("SELECT account_id FROM iam.host_session WHERE kind = 'PREVIEW'"), [{ account_id: OWNER }])
  assert.equal((await hub.sql("SELECT count(*)::int AS n FROM iam.host_session WHERE kind = 'HUB' AND account_id = $1", [MEMBER]))[0].n, 1)
  assert.equal((await previewPage(kept)).statusCode, 200)

  await hub.sql('INSERT INTO project.project_deletion (project_id, workspace_id, name, requested_by) VALUES ($1, $2, $3, $4)', [P, W, 'Estoque Parado', OWNER])
  assert.equal((await previewPage(kept)).statusCode, 403)
  assert.equal(await sessions('PREVIEW'), 0)
  assert.equal(await sessions('HUB'), 2)
})

/** Holds one entry just before the statement that matches, until the test releases it. */
const holdAt = (log, match) => {
  let reached
  let release
  const arrived = new Promise((resolve) => { reached = resolve })
  const released = new Promise((resolve) => { release = resolve })
  log.before(match, async () => { reached(); await released })
  return { arrived, release }
}

const IDENTITY_TABLES = ['application', 'application_grant', 'application_invitation', 'oidc_transaction', 'host_session', 'handoff']
const leftOf = async (hub) => Object.fromEntries(await Promise.all(IDENTITY_TABLES.map(async (table) => {
  const column = table === 'oidc_transaction' ? 'application_project_id' : 'project_id'
  return [table, (await hub.sql(`SELECT count(*)::int AS n FROM iam.${table} WHERE ${column} = $1`, [P]))[0].n]
})))
const NONE_LEFT = Object.fromEntries(IDENTITY_TABLES.map((table) => [table, 0]))

for (const order of ['racer first', 'purge first']) {
  test(`the purge against an application callback, an application redeem, a Preview redeem and a sign in begin, ${order}`, { timeout: 60_000 }, async (t) => {
    const binding = 'B'.repeat(43)
    const bindingParam = digestOf(binding).toString('base64url')
    // A redeem held inside its entry holds the Project, so it commits before the purge; a redeem that
    // starts after the tombstone commits is refused by it.
    const redeemed = order === 'racer first' ? 303 : 403
    const racers = [
      ['application callback', /INSERT INTO iam\.handoff/, async ({ hub }) => {
        const callback = await hub.signInWith(person('caio', { email: 'caio@x.com' }), { application: SLUG, binding: bindingParam })
        return callback.statusCode === 303 && /sign-in\/complete|no-access\?reason=(NOT_GRANTED|SIGN_IN_FAILED)/.test(callback.headers.location)
      }],
      // An unknown identity whose verified email claims an application invitation of P: the claim deletes a child of P, so the callback must hold P first.
      ['application callback that claims', /DELETE FROM iam\.application_invitation/, async ({ hub }) => {
        const callback = await hub.signInWith(person('nina', { email: 'nina@x.com' }), { application: SLUG, binding: bindingParam })
        return callback.statusCode === 303 && /sign-in\/complete|no-access\?reason=NOT_GRANTED/.test(callback.headers.location)
      }, 'invitation'],
      ['application redeem', /INSERT INTO iam\.host_session/, async ({ hub, applicationApp }) => {
        const callback = await hub.signInWith(person('caio', { email: 'caio@x.com' }), { application: SLUG, binding: bindingParam })
        const complete = new URL(callback.headers.location)
        const answer = await applicationApp.inject({ method: 'GET', url: `${complete.pathname}${complete.search}`, headers: { host: APP_HOST, ...NAVIGATE, cookie: `__Host-conexus_app_signin=${binding}` } })
        return answer.statusCode === redeemed
      }],
      ['Preview redeem', /INSERT INTO iam\.host_session/, async ({ enter }, prepared) => (await enter(prepared)).statusCode === redeemed, 'preview'],
      ['sign in begin', /INSERT INTO iam\.oidc_transaction/, async ({ hub }) => {
        const begin = await hub.app.inject({ method: 'GET', url: `/protocol/oidc/login?application=${SLUG}&binding=${bindingParam}` })
        return begin.statusCode === 302 || (begin.statusCode === 303 && /no-access\?reason=NOT_GRANTED/.test(begin.headers.location))
      }],
    ]
    for (const [label, match, race, setup] of racers) {
      const world = await estate(t, `conexus_iam_purge_${label.replaceAll(' ', '_').toLowerCase()}_${order === 'racer first' ? 'a' : 'b'}`)
      const { hub, launch, purge } = world
      await hub.sql("INSERT INTO iam.installation_administrator (account_id, granted_via) VALUES ($1, 'OPERATOR_BOOTSTRAP')", [OWNER])
      let prepared
      if (setup === 'preview') prepared = (await launch(MEMBER, await hub.openHubSession(MEMBER))).entryGrant
      if (setup === 'invitation') await hub.sql("INSERT INTO iam.application_invitation (invitation_id, project_id, email, invited_by, expires_at) VALUES (gen_random_uuid(), $1, 'nina@x.com', $2, now() + interval '1 day')", [P, OWNER])
      const log = statements(t)
      let outcome
      if (order === 'racer first') {
        const held = holdAt(log, match)
        const racing = race(world, prepared).catch((error) => error)
        assert.equal(await Promise.race([held.arrived.then(() => 'held'), racing.then(() => 'finished')]), 'held', label)
        await hub.sql('INSERT INTO project.project_deletion (project_id, workspace_id, name, requested_by) VALUES ($1, $2, $3, $4)', [P, W, 'Estoque Parado', OWNER])
        const purging = purge.deleteProject({ accountId: OWNER, projectId: P, confirmName: 'Estoque Parado' }).catch((error) => error)
        await waitUntilBlocked(hub.connection)
        held.release()
        outcome = await racing
        assert.equal(await purging, undefined, label)
      } else {
        await hub.sql('INSERT INTO project.project_deletion (project_id, workspace_id, name, requested_by) VALUES ($1, $2, $3, $4)', [P, W, 'Estoque Parado', OWNER])
        // The tombstone commits before the purge, as deleteProject orders them, so a racer that starts
        // while the purge holds the Project is refused by the tombstone without waiting for it.
        const held = holdAt(log, /DELETE FROM iam\.application WHERE/)
        const purging = purge.deleteProject({ accountId: OWNER, projectId: P, confirmName: 'Estoque Parado' }).catch((error) => error)
        await held.arrived
        // The racer finishes while the purge still holds the Project: one that waited would hit the 5 s lock_timeout and answer 503.
        outcome = await race(world, prepared).catch((error) => error)
        held.release()
        assert.equal(await purging, undefined, label)
      }
      assert.equal(outcome, true, `${label}: a refusal or a committed row, never a 500 (${outcome})`)
      await assert.rejects(purge.deleteProject({ accountId: OWNER, projectId: P, confirmName: 'Estoque Parado' }), { id: 'PROJECT_NOT_FOUND' }, `${label}: a completed purge leaves no Project to admit`)
      assert.deepEqual(await leftOf(hub), NONE_LEFT, label)
    }
  })
}

test('a Preview launch whose Hub session was signed out after the request resolved it answers AUTHENTICATION_REQUIRED, not a 500', async (t) => {
  const { hub, launch } = await estate(t, 'conexus_iam_preview_launch_signed_out')
  const token = await hub.openHubSession(MEMBER)
  await hub.sql('DELETE FROM iam.host_session WHERE token_digest = $1', [digestOf(token)])
  await assert.rejects(launch(MEMBER, token), { id: 'AUTHENTICATION_REQUIRED' })
})
