import assert from 'node:assert/strict'
import test from 'node:test'
import { hubModuleUrl } from '../hub-build.mjs'

const { ACCESS, authentic, requestFacts } = await import(hubModuleUrl('http/access.js'))
const { previewHostOf } = await import(hubModuleUrl('mar/module.js'))

const HUB = 'https://hub.conexus.test'
const OWN = 'https://sales.apps.conexus.test'
const hubListener = { hub: HUB, own: null }
const hostListener = { hub: HUB, own: OWN }
const decide = (kind, method, headers, expected = hubListener) => authentic(ACCESS[kind], requestFacts(method, headers), expected)
const json = { 'content-type': 'application/json' }

test('session: Fetch Metadata same-origin or none on every method, absent passes, anything else is refused', () => {
  assert.equal(decide('session', 'GET', { 'sec-fetch-site': 'same-origin' }), 'ALLOW')
  assert.equal(decide('session', 'GET', { 'sec-fetch-site': 'none' }), 'ALLOW')
  assert.equal(decide('session', 'GET', {}), 'ALLOW')
  assert.equal(decide('session', 'GET', { 'sec-fetch-site': 'same-site' }), 'DENY')
  assert.equal(decide('session', 'GET', { 'sec-fetch-site': 'cross-site' }), 'DENY')
  assert.equal(decide('session', 'GET', { 'sec-fetch-site': ['same-origin', 'same-origin'] }), 'DENY')
  assert.equal(decide('session', 'POST', { ...json, origin: HUB, 'sec-fetch-site': 'cross-site' }), 'DENY')
})

test('session: a present Origin must be the Hub on every method, and a write needs one', () => {
  assert.equal(decide('session', 'GET', { origin: HUB }), 'ALLOW')
  assert.equal(decide('session', 'GET', { origin: OWN }), 'DENY')
  assert.equal(decide('session', 'POST', json), 'DENY')
  assert.equal(decide('session', 'DELETE', { origin: HUB }), 'ALLOW')
  assert.equal(decide('session', 'PUT', { ...json, origin: `${HUB}/` }), 'DENY')
  assert.equal(decide('session', 'PATCH', { ...json, origin: [HUB, HUB] }), 'DENY')
})

test('session refuses a navigation on every method and a form media type on a write, each alone; a JSON or body-less write passes', () => {
  assert.equal(decide('session', 'POST', { ...json, origin: HUB, 'sec-fetch-mode': 'cors' }), 'ALLOW')
  assert.equal(decide('session', 'POST', { ...json, origin: HUB, 'sec-fetch-mode': 'navigate' }), 'DENY')
  assert.equal(decide('session', 'POST', { origin: HUB, 'content-type': 'Text/Plain; charset=utf-8' }), 'DENY')
  assert.equal(decide('session', 'POST', { origin: HUB, 'content-type': 'multipart/form-data; boundary=x' }), 'DENY')
  assert.equal(decide('session', 'POST', { origin: HUB, 'content-type': ' application/x-www-form-urlencoded ' }), 'DENY')
  assert.equal(decide('session', 'POST', { origin: HUB, 'content-type': 'application/json; charset=utf-8' }), 'ALLOW')
  assert.equal(decide('session', 'DELETE', { origin: HUB }), 'ALLOW')
  assert.equal(decide('session', 'GET', { 'sec-fetch-site': 'same-origin', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' }), 'DENY')
  assert.equal(decide('session', 'GET', { 'sec-fetch-mode': ['cors', 'cors'] }), 'DENY')
  assert.equal(decide('session', 'GET', { 'sec-fetch-mode': 'cors', 'content-type': 'text/plain' }), 'ALLOW')
})

test('sign-out and bootstrap always need the exact Hub origin', () => {
  for (const kind of ['sign-out', 'bootstrap']) {
    assert.equal(decide(kind, 'POST', { ...json, origin: HUB, 'sec-fetch-site': 'same-origin' }), 'ALLOW', kind)
    assert.equal(decide(kind, 'DELETE', {}), 'DENY', kind)
    assert.equal(decide(kind, 'POST', { origin: HUB, 'content-type': 'text/plain' }), 'DENY', kind)
    assert.equal(decide(kind, 'POST', { ...json, origin: HUB, 'sec-fetch-site': 'same-site' }), 'DENY', kind)
  }
})

test('sign-in takes any site and no Origin, but a present Sec-Fetch-Mode must be navigate', () => {
  assert.equal(decide('sign-in', 'GET', { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate', origin: 'https://evil.test' }), 'ALLOW')
  assert.equal(decide('sign-in', 'GET', {}), 'ALLOW')
  assert.equal(decide('sign-in', 'GET', { 'sec-fetch-mode': 'cors' }), 'DENY')
  assert.equal(decide('sign-in', 'GET', { 'sec-fetch-mode': ['navigate', 'navigate'] }), 'DENY')
})

test('navigation takes anything', () => {
  assert.equal(decide('navigation', 'HEAD', { 'sec-fetch-site': 'cross-site', origin: ['a', 'b'], 'sec-fetch-mode': 'no-cors' }), 'ALLOW')
})

test('host-write needs its own host origin and same-origin Fetch Metadata, and takes any media type', () => {
  assert.equal(decide('host-write', 'POST', { origin: OWN, 'content-type': 'text/plain' }, hostListener), 'ALLOW')
  assert.equal(decide('host-write', 'POST', { origin: HUB, ...json }, hostListener), 'DENY')
  assert.equal(decide('host-write', 'POST', { ...json }, hostListener), 'DENY')
  assert.equal(decide('host-write', 'POST', { origin: OWN, ...json, 'sec-fetch-site': 'same-site' }, hostListener), 'DENY')
  assert.equal(decide('host-write', 'POST', { origin: OWN, ...json }, { hub: HUB, own: null }), 'DENY')
})

test('hub-entry is a cross-site form from the Hub page: only the Hub origin counts, on a host of the listener', () => {
  const form = { 'content-type': 'application/x-www-form-urlencoded', 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate' }
  assert.equal(decide('hub-entry', 'POST', { ...form, origin: HUB }, hostListener), 'ALLOW')
  assert.equal(decide('hub-entry', 'POST', { ...form, origin: OWN }, hostListener), 'DENY')
  assert.equal(decide('hub-entry', 'POST', form, hostListener), 'DENY')
  assert.equal(decide('hub-entry', 'POST', { ...form, origin: HUB }, { hub: HUB, own: null }), 'DENY')
})

test('every condition wrong at once is refused', () => {
  const wrong = { origin: 'https://evil.test', 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate', 'content-type': 'text/plain' }
  for (const kind of ['session', 'sign-out', 'bootstrap']) assert.equal(decide(kind, 'POST', wrong), 'DENY', kind)
  assert.equal(decide('host-write', 'POST', wrong, hostListener), 'DENY')
})

test('a document navigation is a GET with navigate and document; a HEAD never is', () => {
  const page = { 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' }
  assert.equal(requestFacts('GET', page).document, true)
  assert.equal(requestFacts('HEAD', page).document, false)
  assert.equal(requestFacts('GET', { ...page, 'sec-fetch-dest': 'script' }).document, false)
  assert.equal(requestFacts('GET', { 'sec-fetch-mode': 'navigate' }).document, false)
})

const ID = '0f8fad5b-d9cb-469f-a165-70867728950e'
test('previewHostOf: one parse of a Preview host per the port rule', () => {
  assert.deepEqual(previewHostOf(`preview-${ID}.conexus.localhost:8444`, 8444), {
    artifactRevisionId: ID, exactHost: `preview-${ID}.conexus.localhost`, origin: `https://preview-${ID}.conexus.localhost:8444`,
  })
  assert.deepEqual(previewHostOf(`preview-${ID}.conexus.localhost`, 443), {
    artifactRevisionId: ID, exactHost: `preview-${ID}.conexus.localhost`, origin: `https://preview-${ID}.conexus.localhost`,
  })
  for (const [host, port] of [
    [`preview-${ID}.conexus.localhost:443`, 443],
    [`preview-${ID}.conexus.localhost`, 8444],
    [`preview-${ID}.conexus.localhost:8445`, 8444],
    [`preview-${ID.toUpperCase()}.conexus.localhost:8444`, 8444],
    [`Preview-${ID}.conexus.localhost:8444`, 8444],
    [`preview-${ID}.conexus.localhost.:8444`, 8444],
    ['preview-not-a-uuid.conexus.localhost:8444', 8444],
    [`preview-${ID}.conexus.example:8444`, 8444],
    [`preview-${ID}.conexus.localhost:8444:8444`, 8444],
    [undefined, 8444],
    [Symbol('MALFORMED'), 8444],
  ]) assert.equal(previewHostOf(host, port), null, String(host))
})
