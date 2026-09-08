import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = fileURLToPath(new URL('../../', import.meta.url))
const read = path => readFileSync(resolve(root, path), 'utf8')

test('Pack D proves three-browser URL/cache/CSRF boundaries without Product frontend authority', () => {
  const result = read('docs/evidence/4d/4d-r1-pack-d-browser-foundation-result.md')
  const results = JSON.parse(read('qualification/4d/r1-foundation/evidence/pack-d-results.json'))
  const negatives = JSON.parse(read('qualification/4d/r1-foundation/evidence/pack-d-negative-controls.json'))
  const substrates = JSON.parse(read('qualification/4d/r1-foundation/evidence/pack-d-substrates.json'))
  const cleanup = JSON.parse(read('qualification/4d/r1-foundation/evidence/pack-d-cleanup.json'))
  const browser = read('qualification/4d/r1-foundation/browser-foundation/tests/browser-foundation.spec.mjs')
  const server = read('qualification/4d/r1-foundation/browser-foundation/server.mjs')
  const build = read('qualification/4d/r1-foundation/browser-foundation/verify-build.mjs')

  for (const token of [
    'CLOSED / PACK D PASS / `R1F-P08` GREEN / 3 BROWSERS',
    'Chromium', 'Firefox', 'WebKit',
    'local pixels', 'HTTP 403', 'mutation count unchanged',
    'does not implement the Product frontend',
  ]) assert.ok(result.includes(token), `Pack D result missing ${token}`)

  assert.equal(results.results[0].id, 'R1F-P08')
  assert.equal(results.results[0].verdict, 'PASS')
  assert.deepEqual(results.results[0].browserCounts, { chromium: 4, firefox: 4, webkit: 4 })
  assert.equal(results.viteBuild.secretLeak, false)
  assert.equal(results.viteBuild.authorityLeak, false)
  assert.equal(negatives.controls.length, 10)
  assert.equal(negatives.controls.every(control => control.verdict === 'PASS'), true)
  assert.equal(substrates.verdict, 'PASS')
  assert.match(substrates.qualificationImage.id, /^sha256:[a-f0-9]{64}$/)
  assert.equal(cleanup.verdict, 'PASS')
  assert.equal(cleanup.container, 'ABSENT')

  for (const token of ['__R1F_QUERY_CLIENT', 'crossOrigin', 'localStorage', 'Denied']) {
    assert.ok(browser.includes(token), `browser proof missing ${token}`)
  }
  for (const token of ["httpOnly: true", "secure: true", "sameSite: 'lax'", "sec-fetch-site", "x-csrf-token"]) {
    assert.ok(server.includes(token), `server fixture missing ${token}`)
  }
  for (const token of ['server secret leaked', 'server grant identity leaked', '.vite/manifest.json']) {
    assert.ok(build.includes(token), `build proof missing ${token}`)
  }

  assert.match(result, /Product implementation, push, PR and merge\s+remain unauthorized\./)
})
