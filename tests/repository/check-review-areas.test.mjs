import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const script = resolve(root, 'scripts/check-review-areas.mjs')
const run = candidateRoot => spawnSync(process.execPath, [script, candidateRoot], { encoding: 'utf8' })

const AREAS = 'docs/development/review/areas.json'
const baseAreas = [
  { area: 'mastra-native', paths: ['**'], page: 'docs/development/review/mastra-native.md' },
  { area: 'hub', paths: ['apps/hub/**', 'scripts/check-*.mjs', 'package.json'], page: 'docs/development/review/hub.md' },
]
const baseFiles = {
  'package.json': '{"name":"fixture"}\n',
  'apps/hub/src/server.ts': 'export {}\n',
  'apps/hub/.gitignore': 'dist\n',
  'scripts/check-links.mjs': 'export {}\n',
  'README.md': '# Fixture\n',
  'docs/development/review/mastra-native.md': '# Mastra native\n',
  'docs/development/review/hub.md': '# Hub\n',
}

const fixture = (context, { areas = baseAreas, files = {} } = {}) => {
  const target = mkdtempSync(resolve(tmpdir(), 'conexus-review-areas-'))
  context.after(() => rmSync(target, { recursive: true, force: true }))
  execFileSync('git', ['init', '--quiet', '-b', 'main'], { cwd: target })
  const contents = { ...baseFiles, [AREAS]: typeof areas === 'string' ? areas : `${JSON.stringify(areas, null, 2)}\n`, ...files }
  for (const [path, text] of Object.entries(contents)) {
    mkdirSync(dirname(resolve(target, path)), { recursive: true })
    writeFileSync(resolve(target, path), text)
  }
  return target
}

const failsWith = (candidate, stderr) => {
  const result = run(candidate)
  assert.equal(result.stdout, '')
  assert.equal(result.stderr, stderr)
  assert.equal(result.status, 1)
}

test('the real tree passes', () => {
  const result = run(root)
  assert.equal(result.stderr, '')
  assert.match(result.stdout, /^Review area checks passed \(areas=\d+, production files=\d+\)\.$/m)
  assert.equal(result.status, 0)
})

test('a clean fixture passes, and dir/** covers a dotfile', context => {
  const result = run(fixture(context))
  assert.equal(result.stderr, '')
  assert.equal(result.stdout, 'Review area checks passed (areas=2, production files=4).\n')
  assert.equal(result.status, 0)
})

test('a production file with no area fails naming it', context => {
  failsWith(fixture(context, { files: { 'infra/keycloak/realm.json': '{}\n' } }),
    'error infra/keycloak/realm.json maps to no review area (a universal area does not count)\n')
})

test('a production file only the universal area matches fails', context => {
  const areas = [baseAreas[0], { ...baseAreas[1], paths: ['apps/hub/**', 'package.json'] }]
  failsWith(fixture(context, { areas }),
    'error scripts/check-links.mjs maps to no review area (a universal area does not count)\n')
})

test('a glob that matches no tracked file fails', context => {
  const areas = [baseAreas[0], { ...baseAreas[1], paths: [...baseAreas[1].paths, 'apps/old/**'] }]
  failsWith(fixture(context, { areas }), 'error area hub: glob "apps/old/**" matches no tracked file\n')
})

test('a review page that no area lists fails', context => {
  failsWith(fixture(context, { files: { 'docs/development/review/orphan.md': '# Orphan\n' } }),
    'error docs/development/review/orphan.md is not the page of any area\n')
})

test('a page at the wrong path or missing from disk fails', context => {
  const areas = [
    { ...baseAreas[0], page: 'docs/development/review/native.md' },
    baseAreas[1],
    { area: 'web', paths: ['apps/hub/src/**'], page: 'docs/development/review/web.md' },
  ]
  failsWith(fixture(context, { areas }), [
    'error area mastra-native: page must be docs/development/review/mastra-native.md, not docs/development/review/native.md',
    'error area web: page docs/development/review/web.md does not exist',
    'error docs/development/review/mastra-native.md is not the page of any area',
    '',
  ].join('\n'))
})

test('a malformed entry fails with every problem named', context => {
  const areas = [
    baseAreas[0],
    baseAreas[1],
    { area: 'Hub_Two', paths: ['apps/**/src'], page: 'docs/development/review/Hub_Two.md' },
    { area: 'hub', paths: [], page: 7 },
    { paths: ['**', 'apps/**'], page: 'docs/development/review/x.md' },
    'hub',
  ]
  failsWith(fixture(context, { areas }), [
    'error docs/development/review/areas.json entry 2: area "Hub_Two" is not kebab-case',
    'error docs/development/review/areas.json entry 2: glob "apps/**/src" is outside the portable grammar (exact path, dir/**, * inside one segment)',
    'error docs/development/review/areas.json entry 3: area "hub" is listed twice',
    'error docs/development/review/areas.json entry 3: "paths" must be a non-empty array of strings',
    'error docs/development/review/areas.json entry 3: "page" must be a string',
    'error docs/development/review/areas.json entry 4: "area" must be a string',
    'error docs/development/review/areas.json entry 4: "**" must be the only glob of a universal area',
    'error docs/development/review/areas.json entry 5 is not an object',
    '',
  ].join('\n'))
})

test('a file that is not JSON fails', context => {
  const result = run(fixture(context, { areas: '[{' }))
  assert.equal(result.status, 1)
  assert.match(result.stderr, /^error docs\/development\/review\/areas\.json is not valid JSON: /)
})
