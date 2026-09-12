import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const cacheRoot = resolve(repositoryRoot, 'node_modules/.cache')
mkdirSync(cacheRoot, { recursive: true })
const outputRoot = mkdtempSync(resolve(cacheRoot, 'builder-preview-access-'))
process.once('exit', () => rmSync(outputRoot, { recursive: true, force: true }))
const compiled = spawnSync(process.execPath, [
  resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'), '--project', resolve(repositoryRoot, 'apps/hub/tsconfig.json'),
  '--noEmit', 'false', '--outDir', outputRoot,
], { cwd: repositoryRoot, encoding: 'utf8' })
if (compiled.status !== 0) throw new Error(`BUILDER_PREVIEW_ACCESS_COMPILE_FAILED\n${compiled.stdout}\n${compiled.stderr}`)
const built = (path) => pathToFileURL(resolve(outputRoot, path)).href
const [{ createPreviewAccess }, { createMarModule }, { createHttpApp }, { registerBuilderRoutes }] = await Promise.all([
  import(built('identity-access/preview-access.js')),
  import(built('mar/module.js')),
  import(built('http/app.js')),
  import(built('builder/routes.js')),
])

const ACCOUNT = '11111111-1111-4111-8111-111111111111'
const PROJECT = '33333333-3333-4333-8333-333333333333'
const CHANGE = '44444444-4444-4444-8444-444444444444'
const ARTIFACT = '55555555-5555-4555-8555-555555555555'
const HOST = `preview-${ARTIFACT}.conexus.localhost`
const HUB_ORIGIN = 'https://hub.conexus.localhost:43100'
const routeInput = (artifactRevisionId = ARTIFACT) => ({
  routeId: `route-${artifactRevisionId}`,
  generation: `generation-${artifactRevisionId}`,
  attemptId: '66666666-6666-4666-8666-666666666666',
  accountId: ACCOUNT,
  projectId: PROJECT,
  changeId: CHANGE,
  subjectDigest: 'a'.repeat(40),
  sourceRevision: 'b'.repeat(40),
  artifactRevisionId,
  artifactDigest: 'c'.repeat(64),
  exactHost: artifactRevisionId === ARTIFACT ? HOST : `preview-${artifactRevisionId}.conexus.localhost`,
  expiresAt: 16_000,
})

test('I&A entry grants bind the session digest, consume once and expire with their route', async () => {
  let now = 1_000
  let reads = 0
  const access = createPreviewAccess({
    now: () => now,
    readSession: async ({ sessionDigest }) => {
      reads += 1
      assert.ok(sessionDigest instanceof Uint8Array)
      assert.deepEqual(Buffer.from(sessionDigest), createHash('sha256').update('hub-session-a').digest())
      return { account: { accountId: ACCOUNT }, issuer: 'issuer-a', subject: 'subject-a' }
    },
  })
  const issued = await access.issueEntryGrant({ sessionToken: 'hub-session-a', route: routeInput(), now: new Date(now) })
  const redeemed = await access.consumeEntryGrant({ entryGrant: issued.entryGrant, exactHost: HOST, now: new Date(now) })
  assert.ok(redeemed)
  assert.equal(reads, 2)
  assert.equal(await access.consumeEntryGrant({ entryGrant: issued.entryGrant, exactHost: HOST, now: new Date(now) }), null)
  assert.deepEqual((await access.resolvePreviewCookie({ cookie: redeemed.cookie, exactHost: HOST, now: new Date(now) })).accountId, ACCOUNT)
  now = 16_000
  assert.equal(await access.resolvePreviewCookie({ cookie: redeemed.cookie, exactHost: HOST, now: new Date(now) }), null)
  await access.close()
  await access.close()
})

test('I&A exact-token discards free entry and cookie capacity without invalidating unrelated access', async () => {
  const now = 1_000
  const access = createPreviewAccess({ now: () => now, readSession: async () => ({ account: { accountId: ACCOUNT }, issuer: 'issuer-a', subject: 'subject-a' }) })
  const target = await access.issueEntryGrant({ sessionToken: 'target-session', route: routeInput('target') })
  const unrelated = await access.issueEntryGrant({ sessionToken: 'unrelated-session', route: routeInput('unrelated') })
  for (let index = 0; index < 4094; index += 1) {
    await access.issueEntryGrant({ sessionToken: `entry-session-${index}`, route: routeInput(`entry-${index}`) })
  }
  await assert.rejects(() => access.issueEntryGrant({ sessionToken: 'full-session', route: routeInput('full') }), /PREVIEW_ACCESS_UNAVAILABLE/)
  access.discardEntryGrant(target.entryGrant)
  access.discardEntryGrant(target.entryGrant)
  assert.equal(await access.consumeEntryGrant({ entryGrant: target.entryGrant, exactHost: routeInput('target').exactHost }), null)
  await access.issueEntryGrant({ sessionToken: 'replacement-session', route: routeInput('replacement') })
  const unrelatedCookie = await access.consumeEntryGrant({ entryGrant: unrelated.entryGrant, exactHost: routeInput('unrelated').exactHost })
  assert.ok(unrelatedCookie)
  assert.equal(await access.resolvePreviewCookie({ cookie: unrelatedCookie.cookie, exactHost: routeInput('unrelated').exactHost }) !== null, true)
  await access.close()

  const cookieAccess = createPreviewAccess({ now: () => now, readSession: async () => ({ account: { accountId: ACCOUNT }, issuer: 'issuer-a', subject: 'subject-a' }) })
  const targetEntry = await cookieAccess.issueEntryGrant({ sessionToken: 'cookie-target-session', route: routeInput('cookie-target') })
  const unrelatedEntry = await cookieAccess.issueEntryGrant({ sessionToken: 'cookie-unrelated-session', route: routeInput('cookie-unrelated') })
  const targetCookie = await cookieAccess.consumeEntryGrant({ entryGrant: targetEntry.entryGrant, exactHost: routeInput('cookie-target').exactHost })
  const unrelatedCookie2 = await cookieAccess.consumeEntryGrant({ entryGrant: unrelatedEntry.entryGrant, exactHost: routeInput('cookie-unrelated').exactHost })
  assert.ok(targetCookie)
  assert.ok(unrelatedCookie2)
  for (let index = 0; index < 4094; index += 1) {
    await cookieAccess.issueEntryGrant({ sessionToken: `cookie-entry-session-${index}`, route: routeInput(`cookie-entry-${index}`) })
  }
  await assert.rejects(() => cookieAccess.issueEntryGrant({ sessionToken: 'cookie-full-session', route: routeInput('cookie-full') }), /PREVIEW_ACCESS_UNAVAILABLE/)
  cookieAccess.discardCookie(targetCookie.cookie)
  cookieAccess.discardCookie(targetCookie.cookie)
  await cookieAccess.issueEntryGrant({ sessionToken: 'cookie-replacement-session', route: routeInput('cookie-replacement') })
  assert.equal(await cookieAccess.resolvePreviewCookie({ cookie: targetCookie.cookie, exactHost: routeInput('cookie-target').exactHost }), null)
  assert.equal(await cookieAccess.resolvePreviewCookie({ cookie: unrelatedCookie2.cookie, exactHost: routeInput('cookie-unrelated').exactHost }) !== null, true)
  await cookieAccess.close()
})

test('MAR activates the exact route, serves manifest files through the Registry reader, and refuses wrong hosts and paths', async (t) => {
  const now = 1_000
  let live = true
  const access = createPreviewAccess({
    now: () => now,
    readSession: async () => live ? { account: { accountId: ACCOUNT }, issuer: 'issuer-a', subject: 'subject-a' } : null,
  })
  const mar = createMarModule({
    access,
    exactHubOrigin: HUB_ORIGIN,
    previewPort: 43101,
    now: () => now,
    registryReader: async ({ path, accountId, projectId, changeId, sourceRevision, artifactRevisionId }) => {
      assert.equal(accountId, ACCOUNT)
      assert.equal(projectId, PROJECT)
      assert.equal(changeId, CHANGE)
      assert.equal(sourceRevision, 'b'.repeat(40))
      assert.equal(artifactRevisionId, ARTIFACT)
      const bytes = new TextEncoder().encode(path === 'index.html' ? '<script src="/assets/main.js"></script>' : 'console.log(1)')
      return { path, mediaType: path === 'index.html' ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8', bytes, sha256: createHash('sha256').update(bytes).digest('hex') }
    },
  })
  const opened = mar.openRoute({
    ...routeInput(),
    manifest: { entryPath: 'index.html', files: [
      { path: 'index.html', mediaType: 'text/html; charset=utf-8' },
      { path: 'assets/main.js', mediaType: 'text/javascript; charset=utf-8' },
      { path: 'main.js', mediaType: 'text/javascript; charset=utf-8' },
    ] },
    now,
  })
  const issued = await access.issueEntryGrant({ sessionToken: 'hub-session-a', route: opened.route, now: new Date(now) })
  const app = await createHttpApp({ registerRoutes: mar.registerPreviewRoutes, staticRoot: null })
  t.after(async () => { await app.close(); await mar.close(); await access.close() })
  const entry = await app.inject({
    method: 'POST', url: '/__conexus/preview-entry',
    headers: { host: `${opened.route.exactHost}:43101`, origin: HUB_ORIGIN, 'content-type': 'application/x-www-form-urlencoded' },
    payload: `entryGrant=${encodeURIComponent(issued.entryGrant)}`,
  })
  assert.equal(entry.statusCode, 303)
  const setCookie = Array.isArray(entry.headers['set-cookie']) ? entry.headers['set-cookie'][0] : entry.headers['set-cookie']
  assert.match(setCookie, /__Host-conexus_preview=/)
  const cookie = setCookie.split(';', 1)[0]
  const root = await app.inject({ method: 'GET', url: '/', headers: { host: `${opened.route.exactHost}:43101`, cookie } })
  assert.equal(root.statusCode, 200)
  assert.equal(root.body, '<script src="/assets/main.js"></script>')
  assert.equal(root.headers['cache-control'], 'no-store')
  assert.match(root.headers['content-security-policy'], /frame-ancestors https:\/\/hub\.conexus\.localhost:43100/)
  assert.equal(root.headers['x-frame-options'], undefined)
  const observed = await app.inject({ method: 'HEAD', url: '/', headers: { host: `${opened.route.exactHost}:43101`, cookie, origin: HUB_ORIGIN } })
  assert.equal(observed.statusCode, 200)
  assert.equal(observed.body, '')
  assert.equal(observed.headers['access-control-allow-origin'], HUB_ORIGIN)
  assert.equal(observed.headers['access-control-allow-credentials'], 'true')
  const foreignObservation = await app.inject({ method: 'HEAD', url: '/', headers: { host: `${opened.route.exactHost}:43101`, cookie, origin: 'https://foreign.conexus.localhost:43100' } })
  assert.equal(foreignObservation.headers['access-control-allow-origin'], undefined)
  assert.equal(foreignObservation.headers['access-control-allow-credentials'], undefined)
  const asset = await app.inject({ method: 'GET', url: '/assets/main.js', headers: { host: `${opened.route.exactHost}:43101`, cookie } })
  assert.equal(asset.statusCode, 200)
  assert.equal(asset.body, 'console.log(1)')
  const rootAsset = await app.inject({ method: 'GET', url: '/main.js', headers: { host: `${opened.route.exactHost}:43101`, cookie } })
  assert.equal(rootAsset.statusCode, 200)
  assert.equal(rootAsset.body, 'console.log(1)')
  const traversal = await app.inject({ method: 'GET', url: '/assets/%2e%2e%2findex.html', headers: { host: `${opened.route.exactHost}:43101`, cookie } })
  assert.equal(traversal.statusCode, 404)
  const wrongHost = await app.inject({ method: 'GET', url: '/', headers: { host: `preview-other.conexus.localhost:43101`, cookie } })
  assert.equal(wrongHost.statusCode, 403)
  const missing = await app.inject({ method: 'GET', url: '/assets/missing.js', headers: { host: `${opened.route.exactHost}:43101`, cookie } })
  assert.equal(missing.statusCode, 404)
  live = false
  const revoked = await app.inject({ method: 'GET', url: '/', headers: { host: `${opened.route.exactHost}:43101`, cookie } })
  assert.equal(revoked.statusCode, 403)
  const revokedObservation = await app.inject({ method: 'HEAD', url: '/', headers: { host: `${opened.route.exactHost}:43101`, cookie, origin: HUB_ORIGIN } })
  assert.equal(revokedObservation.statusCode, 403)
  assert.equal(revokedObservation.headers['access-control-allow-origin'], HUB_ORIGIN)
})

test('MAR discards a cookie when route activation fails after entry consumption', async (t) => {
  const access = createPreviewAccess({ readSession: async () => ({ account: { accountId: ACCOUNT }, issuer: 'issuer-a', subject: 'subject-a' }) })
  let consumedCookie
  const mar = createMarModule({
    access: {
      consumeEntryGrant: async (input) => {
        const consumed = await access.consumeEntryGrant(input)
        consumedCookie = consumed?.cookie
        return consumed
      },
      resolvePreviewCookie: (input) => access.resolvePreviewCookie(input),
      discardCookie: (cookie) => access.discardCookie(cookie),
    },
    exactHubOrigin: HUB_ORIGIN, previewPort: 43101, registryReader: async () => null,
  })
  const opened = mar.openRoute({ ...routeInput(), manifest: { entryPath: 'index.html', files: [{ path: 'index.html', mediaType: 'text/html' }] } })
  const issued = await access.issueEntryGrant({ sessionToken: 'hub-session-a', route: opened.route })
  mar.closeRoute(opened.route.routeId)
  const app = await createHttpApp({ registerRoutes: mar.registerPreviewRoutes, staticRoot: null })
  t.after(async () => { await app.close(); await mar.close(); await access.close() })
  const response = await app.inject({
    method: 'POST', url: '/__conexus/preview-entry',
    headers: { host: `${opened.route.exactHost}:43101`, origin: HUB_ORIGIN, 'content-type': 'application/x-www-form-urlencoded' },
    payload: `entryGrant=${encodeURIComponent(issued.entryGrant)}`,
  })
  assert.equal(response.statusCode, 403)
  assert.equal(response.headers['set-cookie'], undefined)
  assert.ok(consumedCookie)
  assert.equal(await access.resolvePreviewCookie({ cookie: consumedCookie, exactHost: opened.route.exactHost }), null)
})

test('MAR refuses requests after close without consulting I&A', async (t) => {
  let reads = 0
  const mar = createMarModule({
    access: {
      consumeEntryGrant: async () => { reads++; return null },
      resolvePreviewCookie: async () => { reads++; return null },
      discardCookie: () => {},
    },
    exactHubOrigin: HUB_ORIGIN, previewPort: 43102, registryReader: async () => null,
  })
  const app = await createHttpApp({ registerRoutes: mar.registerPreviewRoutes, staticRoot: null })
  t.after(() => app.close())
  await mar.close()
  const asset = await app.inject({ method: 'GET', url: '/', headers: { host: `${HOST}:43102`, cookie: '__Host-conexus_preview=closed' } })
  assert.equal(asset.statusCode, 503)
  const entry = await app.inject({ method: 'POST', url: '/__conexus/preview-entry', headers: {
    host: `${HOST}:43102`, origin: HUB_ORIGIN, 'content-type': 'application/x-www-form-urlencoded',
  }, payload: 'entryGrant=closed' })
  assert.equal(entry.statusCode, 503)
  assert.equal(reads, 0)
})

test('MAR close drains a pending entry and cannot activate its route afterward', async (t) => {
  const entered = Promise.withResolvers()
  const release = Promise.withResolvers()
  let opened
  const mar = createMarModule({
    access: {
      consumeEntryGrant: async () => {
        entered.resolve()
        await release.promise
        return { cookie: 'not-issued', binding: { ...opened.route, issuer: 'issuer-a', subject: 'subject-a' } }
      },
      resolvePreviewCookie: async () => null,
      discardCookie: () => {},
    },
    exactHubOrigin: HUB_ORIGIN, previewPort: 43102, registryReader: async () => null,
  })
  opened = mar.openRoute({ ...routeInput(), manifest: { entryPath: 'index.html', files: [{ path: 'index.html', mediaType: 'text/html' }] } })
  const app = await createHttpApp({ registerRoutes: mar.registerPreviewRoutes, staticRoot: null })
  t.after(async () => { release.resolve(); await app.close(); await mar.close() })
  const request = app.inject({ method: 'POST', url: '/__conexus/preview-entry', headers: {
    host: `${HOST}:43102`, origin: HUB_ORIGIN, 'content-type': 'application/x-www-form-urlencoded',
  }, payload: 'entryGrant=pending' }).then((response) => response)
  await entered.promise
  let drained = false
  const closing = mar.close().then(() => { drained = true })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(drained, false)
  release.resolve()
  const response = await request
  await closing
  assert.equal(response.statusCode, 403)
  assert.equal(response.headers['set-cookie'], undefined)
  assert.equal(drained, true)
  assert.equal(mar.isRouteOpening(opened.route), false)
})

test('MAR entry parser rejects duplicate and extra form fields before consuming a grant', async (t) => {
  const access = createPreviewAccess({ readSession: async () => ({ account: { accountId: ACCOUNT }, issuer: 'issuer-a', subject: 'subject-a' }) })
  const mar = createMarModule({ access, exactHubOrigin: HUB_ORIGIN, previewPort: 43102, registryReader: async () => null })
  const opened = mar.openRoute({ ...routeInput(), manifest: { entryPath: 'index.html', files: [{ path: 'index.html', mediaType: 'text/html; charset=utf-8' }] } })
  const issued = await access.issueEntryGrant({ sessionToken: 'hub-session-a', route: opened.route })
  const app = await createHttpApp({ registerRoutes: mar.registerPreviewRoutes, staticRoot: null })
  t.after(async () => { await app.close(); await mar.close(); await access.close() })
  const jsonEntry = await app.inject({
    method: 'POST', url: '/__conexus/preview-entry',
    headers: { host: `${opened.route.exactHost}:43102`, origin: HUB_ORIGIN, 'content-type': 'application/json' },
    payload: { entryGrant: issued.entryGrant },
  })
  assert.equal(jsonEntry.statusCode, 415)
  const refused = await app.inject({
    method: 'POST', url: '/__conexus/preview-entry',
    headers: { host: `${opened.route.exactHost}:43102`, origin: HUB_ORIGIN, 'content-type': 'application/x-www-form-urlencoded' },
    payload: `entryGrant=${encodeURIComponent(issued.entryGrant)}&extra=nope`,
  })
  assert.equal(refused.statusCode, 400)
  const accepted = await app.inject({
    method: 'POST', url: '/__conexus/preview-entry',
    headers: { host: `${opened.route.exactHost}:43102`, origin: HUB_ORIGIN, 'content-type': 'application/x-www-form-urlencoded' },
    payload: `entryGrant=${encodeURIComponent(issued.entryGrant)}`,
  })
  assert.equal(accepted.statusCode, 303)
})

test('BLD-22 launches only the exact prepared attempt through its injected port and never invokes compilation', async (t) => {
  const calls = []
  const prepared = {
    attemptId: '66666666-6666-4666-8666-666666666666',
    subject: { accountId: ACCOUNT, projectId: PROJECT, changeId: CHANGE, subjectDigest: 'a'.repeat(40), sourceRevision: 'b'.repeat(40) },
    expiresAt: 10_000,
    state: 'PREPARED',
    artifact: {
      artifactRevisionId: ARTIFACT,
      artifactDigest: 'c'.repeat(64),
      projectId: PROJECT,
      sourceRevision: 'b'.repeat(40),
      profile: 'REACT_VITE_V1',
      templateRef: 'template',
      recipeSha256: 'd'.repeat(64),
      entryPath: 'index.html',
      files: [{ path: 'index.html', mediaType: 'text/html; charset=utf-8', byteLength: 1, sha256: 'e'.repeat(64) }],
    },
  }
  const service = {
    async readPreviewPreparation(input) { calls.push(['read', input]); return prepared },
    async prepareApplication() { calls.push(['compile']); throw new Error('must not compile') },
  }
  const store = { async readPreviewSubject() { return null } }
  const app = await createHttpApp({ registerRoutes: (server) => registerBuilderRoutes(server, {
    store,
    service,
    origin: HUB_ORIGIN,
    resolveCurrentSession: async () => ({ account: { accountId: ACCOUNT } }),
    launchPreview: async (_request, input) => {
      calls.push(['launch', input])
      return {
        entryUrl: `https://${HOST}:43101/__conexus/preview-entry`,
        previewUrl: `https://${HOST}:43101/`,
        entryGrant: 'grant',
        artifactRevisionId: input.artifactRevisionId,
        artifactDigest: input.artifactDigest,
        expiresAt: new Date(9_000).toISOString(),
      }
    },
  }) })
  t.after(() => app.close())
  const response = await app.inject({
    method: 'POST', url: `/api/control/projects/${PROJECT}/preview-launches`,
    headers: { origin: HUB_ORIGIN, cookie: '__Host-conexus_csrf=csrf', 'x-conexus-csrf': 'csrf', 'content-type': 'application/json' },
    payload: {
      changeId: CHANGE,
      subjectDigest: 'a'.repeat(40),
      attemptId: prepared.attemptId,
      artifactRevisionId: ARTIFACT,
      artifactDigest: 'c'.repeat(64),
    },
  })
  assert.equal(response.statusCode, 201)
  assert.deepEqual(calls.map(([kind]) => kind), ['read', 'launch'])
  assert.equal(calls[1][1].artifact.sourceRevision, 'b'.repeat(40))
  assert.equal(calls[1][1].accountId, ACCOUNT)
  const payload = { changeId: CHANGE, subjectDigest: 'a'.repeat(40), attemptId: prepared.attemptId, artifactRevisionId: ARTIFACT, artifactDigest: 'c'.repeat(64) }
  const headers = { origin: HUB_ORIGIN, cookie: '__Host-conexus_csrf=csrf', 'x-conexus-csrf': 'csrf', 'content-type': 'application/json' }
  for (const altered of [
    { attemptId: '77777777-7777-4777-8777-777777777777' },
    { artifactRevisionId: '77777777-7777-4777-8777-777777777777' },
    { artifactDigest: 'd'.repeat(64) },
  ]) {
    const refused = await app.inject({ method: 'POST', url: `/api/control/projects/${PROJECT}/preview-launches`, headers, payload: { ...payload, ...altered } })
    assert.equal(refused.statusCode, 404)
    assert.equal(refused.body.includes('entryGrant'), false)
  }
  for (const altered of [{ origin: 'https://unrelated.invalid' }, { 'x-conexus-csrf': 'wrong' }]) {
    const refused = await app.inject({ method: 'POST', url: `/api/control/projects/${PROJECT}/preview-launches`, headers: { ...headers, ...altered }, payload })
    assert.equal(refused.statusCode, 403)
  }
  assert.equal(calls.filter(([kind]) => kind === 'launch').length, 1)
  assert.equal(calls.filter(([kind]) => kind === 'compile').length, 0)
})
