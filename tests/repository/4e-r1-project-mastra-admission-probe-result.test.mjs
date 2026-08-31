import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = fileURLToPath(new URL('../../', import.meta.url))
const read = path => readFileSync(resolve(root, path), 'utf8')

test('P13 preserves Mastra structure and defers production repin without blocking Product planning', () => {
  const result = read('docs/evidence/4e/4e-r1-f01-project-mastra-admission-probe-result.md')
  const harness = read('qualification/4e/project-mastra-admission/README.md')
  const probe = read('qualification/4e/project-mastra-admission/probe.test.mjs')
  const manifest = JSON.parse(read('qualification/4e/project-mastra-admission/package.json'))
  const lock = JSON.parse(read('qualification/4e/project-mastra-admission/package-lock.json'))
  const roadmap = read('docs/roadmap.md')
  const index = read('docs/index.md')

  for (const token of [
    'P13 OPERATOR ACCEPTED / MECHANICS PASS / PRODUCTION REPIN GATE DEFER SAFELY',
    'probe = 8/8 PASS with container network disabled',
    'ambient Mastra telemetry',
    'MASTRA_TELEMETRY_DISABLED=1',
    'DEFAULT_MAX_DOWNLOAD_SIZE = 2 * 1024 * 1024 * 1024',
    '@mastra/core@1.63.2 exact Product admission = HOLD',
    'The response ceiling is `DEFER SAFELY`, not a Product-planning stop',
    'CONTINUE 4E PRODUCT COMPOSITION',
    'select next exact stable Mastra pin with acceptable bounded response path',
    'Provider/model/credential calls:** `0`',
  ]) assert.ok(result.includes(token), `P13 result missing ${token}`)

  assert.deepEqual(manifest.dependencies, { '@mastra/core': '1.63.2', zod: '4.5.2' })
  assert.equal(lock.packages['node_modules/@mastra/core'].integrity, 'sha512-BHVDF4GtQnIqRND/lPVVoTnmoNzZ7+voz+EpI4YSY0W7In6c/EOrmMnshuNQSDJ9NpxQNrwip0WGYpRYwzFirQ==')
  assert.match(harness, /HOLD FOR PRODUCT\s+USE/)
  assert.match(probe, /process\.env\.MASTRA_TELEMETRY_DISABLED = '1'/)
  assert.match(probe, /TRANSITIVE_RESPONSE_LIMIT_TOO_LARGE_FOR_IN_PROCESS_HUB/)
  assert.match(index, /Operator-accepted P13 ProjectMastra probe/)
  assert.match(roadmap, /MASTRA DEFER ACCEPTED/)
})
