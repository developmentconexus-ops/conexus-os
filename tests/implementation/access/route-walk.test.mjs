import assert from 'node:assert/strict'
import test from 'node:test'
import { OPERATIONS } from '../../../packages/contract/dist/index.js'
import { LEDGER } from './route-ledger.mjs'
import { HUB_ORIGIN, bootstrapCookie, hubSessionCookie } from './test-listener.mjs'
import {
  APPLICATION_HOST, APPLICATION_ORIGIN, BOOTSTRAP_TOKEN, ENTRY_GRANT, PREVIEW_HOST, PREVIEW_ORIGIN, PREVIEW_PORT, SESSION_TOKEN, walkListeners,
} from './walk-listeners.mjs'

const HOST = Object.freeze({ hub: undefined, preview: PREVIEW_HOST, application: APPLICATION_HOST })
const OWN = Object.freeze({ hub: HUB_ORIGIN, preview: PREVIEW_ORIGIN, application: APPLICATION_ORIGIN })
const SIBLING = Object.freeze({ hub: APPLICATION_ORIGIN, preview: `https://preview-11111111-1111-4111-8111-111111111111.conexus.localhost:${PREVIEW_PORT}`, application: 'https://outro.conexus.localhost:8445' })
const WRITES = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const DOCUMENT = Object.freeze({ 'sec-fetch-site': 'none', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' })
const REFUSED = new Set(['REQUEST_AUTHENTICITY_DENIED', 'AUTHENTICATION_REQUIRED', 'BOOTSTRAP_REQUIRED', 'REQUEST_VALIDATION_FAILED', 'REQUEST_JSON_INVALID', 'REQUEST_MEDIA_TYPE_UNSUPPORTED', 'NOT_FOUND'])

const walk = await walkListeners()
test.after(() => walk.close())

const key = ({ listener, method, url }) => `${listener} ${method} ${url}`

const rightHeaders = (row) => {
  if (row.kind === 'navigation' || row.kind === 'sign-in') return DOCUMENT
  if (row.kind === 'hub-entry') return { origin: HUB_ORIGIN, 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'iframe' }
  return { origin: OWN[row.listener], 'sec-fetch-site': 'same-origin', 'sec-fetch-mode': 'cors', 'sec-fetch-dest': 'empty' }
}

const CONTENT_TYPE = Object.freeze({ JSON: 'application/json', FORM: 'application/x-www-form-urlencoded', NONE: undefined })

const send = (row, headers, { payload = row.sample.body, contentType = CONTENT_TYPE[row.body], cookie } = {}) => {
  const all = { 'idempotency-key': 'walk-key', ...headers }
  if (HOST[row.listener]) all.host = HOST[row.listener]
  if (contentType) all['content-type'] = contentType
  if (cookie) all.cookie = cookie
  return walk.listeners[row.listener].inject({
    method: row.method, url: row.sample.path, headers: all,
    ...(payload === undefined ? {} : { payload: typeof payload === 'string' ? payload : JSON.stringify(payload) }),
  })
}

const without = (headers, name) => Object.fromEntries(Object.entries(headers).filter(([header]) => header !== name))

const refusals = (row) => {
  const right = rightHeaders(row)
  const write = WRITES.has(row.method)
  const allWrong = { origin: 'https://evil.test', 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' }
  switch (row.kind) {
    case 'navigation': return []
    case 'sign-in': return [['a fetch, not a navigation', { ...right, 'sec-fetch-mode': 'cors' }]]
    case 'hub-entry': return [
      ['no Origin', without(right, 'origin')],
      ['its own host as the Origin', { ...right, origin: OWN[row.listener] }],
      ['every condition wrong at once', allWrong, { contentType: 'text/plain', payload: 'entryGrant' }],
    ]
    case 'host-write': return [
      ['no Origin', without(right, 'origin')],
      ['the Hub as the Origin', { ...right, origin: HUB_ORIGIN }],
      ['a sibling host as the Origin', { ...right, origin: SIBLING[row.listener] }],
      ['same-site', { ...right, 'sec-fetch-site': 'same-site' }],
      ['cross-site', { ...right, 'sec-fetch-site': 'cross-site' }],
      ['every condition wrong at once', allWrong, { contentType: 'application/json', payload: '{' }],
    ]
    case 'session':
    case 'sign-out':
    case 'bootstrap': {
      const site = [
        ['same-site', { ...right, 'sec-fetch-site': 'same-site' }],
        ['cross-site', { ...right, 'sec-fetch-site': 'cross-site' }],
        ['a sibling application as the Origin', { ...right, origin: SIBLING[row.listener] }],
        ['a navigation', { ...right, 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' }],
      ]
      if (!write) return [...site, ['a GET form or a link on a Hub page', { 'sec-fetch-site': 'same-origin', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' }]]
      return [
        ...site,
        ['no Origin', without(right, 'origin')],
        ['a form media type', right, { contentType: 'text/plain;charset=UTF-8', payload: 'name=x' }],
        ['every condition wrong at once', allWrong, { contentType: 'multipart/form-data; boundary=x', payload: '{' }],
      ]
    }
    default: throw new Error(`no refusals for ${row.kind}`)
  }
}

const credentialOf = (row) => ({ session: hubSessionCookie(SESSION_TOKEN), 'sign-out': hubSessionCookie(SESSION_TOKEN), bootstrap: bootstrapCookie(BOOTSTRAP_TOKEN) })[row.kind]

test('the ledger names every route of the three listeners, with its kind, and nothing else', () => {
  const recorded = walk.routes().map((route) => `${key(route)} ${route.kind}`).sort()
  const ledger = LEDGER.map((row) => `${key(row)} ${row.kind}`).sort()
  assert.deepEqual(recorded, ledger)
})

test('each declared operation has one route with its access kind', () => {
  for (const operation of Object.values(OPERATIONS)) {
    assert.deepEqual(
      LEDGER.filter((row) => row.operation === operation.id).map(({ method, url, kind }) => ({ method, url, kind })),
      [{ method: operation.method, url: operation.path, kind: operation.access }],
    )
  }
})

for (const row of LEDGER) {
  test(key(row), { timeout: 15_000 }, async (t) => {
    for (const [label, headers, options] of refusals(row)) {
      const before = walk.calls.length
      const refused = await send(row, headers, { ...options, cookie: credentialOf(row) })
      assert.equal(refused.statusCode, 403, label)
      if (row.method !== 'HEAD') assert.equal(refused.json().code, 'REQUEST_AUTHENTICITY_DENIED', label)
      assert.deepEqual(walk.calls.slice(before), [], `${label}: no session, provider or store work`)
    }
    const marker = `handler ${row.listener} ${row.method} ${row.url}`
    const beforeAnswer = walk.calls.length
    const answered = await send(row, rightHeaders(row))
    const expected = row.withoutCredential
    assert.equal(walk.calls.slice(beforeAnswer).includes(marker), credentialOf(row) === undefined, 'the handler runs exactly when the kind needs no credential')
    assert.equal(answered.statusCode, expected.status, 'without a credential')
    if (expected.code) assert.equal(answered.json().code, expected.code, 'without a credential')
    if (expected.location) assert.ok(answered.headers.location?.startsWith(expected.location), `location ${answered.headers.location}`)
    if (expected.html) assert.match(answered.headers['content-type'], /^text\/html/)
    const credential = credentialOf(row)
    if (!credential || row.url.endsWith('/stream')) return
    const beforeAdmitted = walk.calls.length
    const admitted = await send(row, rightHeaders(row), { cookie: credential })
    const passed = walk.calls.slice(beforeAdmitted)
    if (row.guardAnswers?.code) assert.equal(admitted.json().code, row.guardAnswers.code, 'the mount guard answers it after admission')
    else assert.ok(passed.includes(row.guardAnswers?.call ?? marker), `the handler ran: ${passed.join(', ')}`)
    const code = admitted.headers['content-type']?.includes('json') ? admitted.json().code : undefined
    t.diagnostic(`with its credential: ${admitted.statusCode} ${code ?? ''}`)
    assert.ok(admitted.statusCode !== 400 && !REFUSED.has(code), `the sample passes the access rule and the body schema: ${admitted.statusCode} ${code}`)
  })
}

const HELMET = Object.freeze({
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
  'origin-agent-cluster': '?1',
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'x-content-type-options': 'nosniff',
  'x-dns-prefetch-control': 'off',
  'x-download-options': 'noopen',
  'x-permitted-cross-domain-policies': 'none',
  'x-xss-protection': '0',
})
const APPLICATION_SOURCES = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; worker-src 'none'; form-action 'none'; base-uri 'none'"

const directives = (policy) => Object.fromEntries(policy.split(';').map((directive) => directive.trim().split(/\s+/)).map(([name, ...values]) => [name, values]))

const assertHubHeaders = (response, label) => {
  const csp = directives(response.headers['content-security-policy'])
  assert.deepEqual(csp['default-src'], ["'self'"], label)
  assert.deepEqual(csp['frame-src'], [`https://*.conexus.localhost:${PREVIEW_PORT}`], label)
  assert.deepEqual(csp['connect-src'], ["'self'", `https://*.conexus.localhost:${PREVIEW_PORT}`], label)
  assert.deepEqual(csp['form-action'], ["'self'", `https://*.conexus.localhost:${PREVIEW_PORT}`], label)
  assert.match(csp['style-src'].join(' '), /^'self' 'sha256-[^']+' 'sha256-[^']+' 'sha256-[^']+' 'nonce-[A-Za-z0-9+/=_-]+'$/, label)
  assert.equal(response.headers['referrer-policy'], 'strict-origin', label)
  assert.equal(response.headers['x-frame-options'], 'SAMEORIGIN', label)
  assert.equal(response.headers['access-control-allow-origin'], undefined, label)
}
const assertApplicationHeaders = (response, label) => {
  assert.equal(response.headers['content-security-policy'], `${APPLICATION_SOURCES}; frame-ancestors 'none'`, label)
  assert.equal(response.headers['referrer-policy'], 'no-referrer', label)
  assert.equal(response.headers['x-frame-options'], 'DENY', label)
  assert.equal(response.headers['cache-control'], 'no-store', label)
  assert.equal(response.headers['access-control-allow-origin'], undefined, label)
}
const assertPreviewHeaders = (response, label, method) => {
  assert.equal(response.headers['content-security-policy'], `${APPLICATION_SOURCES}; frame-ancestors ${HUB_ORIGIN}; sandbox allow-scripts allow-same-origin allow-forms`, label)
  assert.equal(response.headers['referrer-policy'], 'no-referrer', label)
  assert.equal(response.headers['x-frame-options'], undefined, label)
  assert.equal(response.headers['cache-control'], 'no-store', label)
  const read = method === 'GET' || method === 'HEAD'
  assert.equal(response.headers['access-control-allow-origin'], read ? HUB_ORIGIN : undefined, label)
  assert.equal(response.headers['access-control-allow-credentials'], read ? 'true' : undefined, label)
  assert.equal(response.headers.vary, undefined, label)
}

const rowOf = (listener, method, url) => LEDGER.find((row) => row.listener === listener && row.method === method && row.url === url)

test('every listener sends its own headers on every answer class', async () => {
  const hubWrite = rowOf('hub', 'POST', '/api/control/workspaces')
  const hubPage = rowOf('hub', 'GET', '/settings')
  const appApi = rowOf('application', 'POST', '/__conexus/api/:operation')
  const appSignOut = rowOf('application', 'POST', '/__conexus/sign-out')
  const previewApi = rowOf('preview', 'POST', '/__conexus/api/:operation')
  const previewEntry = rowOf('preview', 'POST', '/__conexus/preview-entry')
  const previewPage = rowOf('preview', 'GET', '/')
  const missing = (listener) => walk.listeners[listener].inject({ method: 'POST', url: '/nowhere', headers: { ...(HOST[listener] ? { host: HOST[listener] } : {}) } })
  const answers = {
    hub: [
      ['403', await send(hubWrite, { ...rightHeaders(hubWrite), origin: 'https://evil.test' })],
      ['401', await send(hubWrite, rightHeaders(hubWrite))],
      ['400 from the parser', await send(hubWrite, rightHeaders(hubWrite), { payload: '{' })],
      ['404', await missing('hub')],
      ['200', await send(hubPage, rightHeaders(hubPage))],
    ],
    application: [
      ['403', await send(appApi, { ...rightHeaders(appApi), origin: HUB_ORIGIN })],
      ['401', await send(appApi, rightHeaders(appApi))],
      ['400 from the parser', await send(appApi, rightHeaders(appApi), { payload: '{' })],
      ['404', await missing('application')],
      ['204', await send(appSignOut, rightHeaders(appSignOut))],
    ],
    preview: [
      ['403', await send(previewApi, { ...rightHeaders(previewApi), origin: HUB_ORIGIN })],
      ['400 from the parser', await send(previewApi, rightHeaders(previewApi), { payload: '{' })],
      ['404', await missing('preview')],
      ['403 page', await send(previewPage, rightHeaders(previewPage))],
      ['303', await send(previewEntry, rightHeaders(previewEntry), { payload: `entryGrant=${ENTRY_GRANT}` })],
    ],
  }
  assert.deepEqual(Object.fromEntries(Object.entries(answers).map(([listener, list]) => [listener, list.map(([, response]) => response.statusCode)])), {
    hub: [403, 401, 400, 404, 200],
    application: [403, 401, 400, 404, 204],
    preview: [403, 400, 404, 403, 303],
  })
  for (const [listener, list] of Object.entries(answers)) {
    for (const [label, response] of list) {
      const named = `${listener} ${label}`
      for (const [header, value] of Object.entries(HELMET)) assert.equal(response.headers[header], value, `${named} ${header}`)
      assert.equal(response.headers['x-powered-by'], undefined, named)
      if (listener === 'hub') assertHubHeaders(response, named)
      if (listener === 'application') assertApplicationHeaders(response, named)
      if (listener === 'preview') assertPreviewHeaders(response, named, label === '403 page' ? 'GET' : 'POST')
    }
  }
})

const HOST_COOKIE = Object.freeze({ preview: '__Host-conexus_preview', application: '__Host-conexus_app' })
const hostAnswer = (listener, method, path, headers = {}) => walk.listeners[listener].inject({ method, url: path, headers: { host: HOST[listener], ...headers } })

test('a host endpoint that is not a page answers 404 to HEAD and to an unregistered GET, before any lookup', async () => {
  const endpoints = LEDGER.filter((row) => row.listener !== 'hub' && row.kind !== 'navigation')
  const extra = ['/__conexus/elsewhere', '/conexus-server/handler.js']
  const requests = ['preview', 'application'].flatMap((listener) => [
    ...endpoints.filter((row) => row.listener === listener).flatMap((row) => [
      ['HEAD', row.sample.path],
      ...(LEDGER.some((other) => other.listener === listener && other.method === 'GET' && other.url === row.url) ? [] : [['GET', row.sample.path]]),
    ]).map(([method, path]) => [listener, method, path]),
    ...extra.flatMap((path) => [['HEAD', path], ['GET', path]]).map(([method, path]) => [listener, method, path]),
  ])
  assert.ok(requests.length >= 14, `${requests.length} requests`)
  for (const [listener, method, path] of requests) {
    for (const cookie of [undefined, `${HOST_COOKIE[listener]}=${SESSION_TOKEN}`]) {
      const label = `${listener} ${method} ${path} ${cookie ? 'with' : 'without'} a session`
      const before = walk.calls.length
      const answered = await hostAnswer(listener, method, path, { ...DOCUMENT, ...(cookie ? { cookie } : {}) })
      assert.equal(answered.statusCode, 404, label)
      if (method === 'GET') assert.equal(answered.json().code, 'NOT_FOUND', label)
      assert.deepEqual(walk.calls.slice(before).filter((call) => !call.startsWith('handler ')), [], `${label}: no lookup`)
    }
  }
})

test('hub-entry refuses a host that is not one of its Previews before the body', async () => {
  const hosts = {
    absent: '',
    malformed: PREVIEW_HOST.toUpperCase(),
    'the wrong port': PREVIEW_HOST.replace(`:${PREVIEW_PORT}`, ':8443'),
    foreign: 'evil.test',
  }
  for (const [label, host] of Object.entries(hosts)) {
    const before = walk.calls.length
    const refused = await walk.listeners.preview.inject({
      method: 'POST', url: '/__conexus/preview-entry', payload: '{',
      headers: { host, origin: HUB_ORIGIN, 'content-type': 'application/json', 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate' },
    })
    assert.equal(refused.statusCode, 403, label)
    assert.equal(refused.json().code, 'REQUEST_AUTHENTICITY_DENIED', label)
    assert.deepEqual(walk.calls.slice(before), [], `${label}: no work`)
  }
})

test('a request no route matches answers 404 before its body is read, on every listener', async () => {
  for (const listener of ['hub', 'preview', 'application']) {
    for (const [contentType, payload] of [['application/json', '{'], ['application/xml', '<x/>'], ['text/plain', 'x']]) {
      const answered = await walk.listeners[listener].inject({
        method: 'POST', url: '/nowhere', payload, headers: { 'content-type': contentType, ...(HOST[listener] ? { host: HOST[listener] } : {}) },
      })
      assert.equal(answered.statusCode, 404, `${listener} ${contentType}`)
      assert.equal(answered.json().code, 'NOT_FOUND', `${listener} ${contentType}`)
    }
  }
})
