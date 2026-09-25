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

const writeFiles = (target, contents) => {
  for (const [path, text] of Object.entries(contents)) {
    mkdirSync(dirname(resolve(target, path)), { recursive: true })
    writeFileSync(resolve(target, path), text)
  }
}

const fixture = (context, { areas = baseAreas, files = {} } = {}) => {
  const target = mkdtempSync(resolve(tmpdir(), 'conexus-review-areas-'))
  context.after(() => rmSync(target, { recursive: true, force: true }))
  execFileSync('git', ['init', '--quiet', '-b', 'main'], { cwd: target })
  writeFiles(target, { ...baseFiles, [AREAS]: typeof areas === 'string' ? areas : `${JSON.stringify(areas, null, 2)}\n`, ...files })
  return target
}

// Commits everything currently on disk and returns the new commit's SHA, so a test can build a base
// commit, mutate the working tree, and commit again as the pull request's head.
const commit = target => {
  execFileSync('git', ['add', '-A'], { cwd: target })
  execFileSync('git', ['-c', 'user.email=test@example.com', '-c', 'user.name=Test', 'commit', '-q', '-m', 'x'], { cwd: target })
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: target, encoding: 'utf8' }).trim()
}

const runPr = (candidate, base, head) =>
  spawnSync(process.execPath, [script, candidate], { encoding: 'utf8', env: { ...process.env, CONEXUS_PR_BASE_SHA: base, CONEXUS_PR_HEAD_SHA: head } })

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

test('CONEXUS_PR_BASE_SHA without CONEXUS_PR_HEAD_SHA exits 1 with the exact error', context => {
  const target = fixture(context)
  const result = spawnSync(process.execPath, [script, target], { encoding: 'utf8', env: { ...process.env, CONEXUS_PR_BASE_SHA: 'deadbeef' } })
  assert.equal(result.stdout, '')
  assert.equal(result.stderr, 'error CONEXUS_PR_HEAD_SHA is not set (CONEXUS_PR_BASE_SHA is)\n')
  assert.equal(result.status, 1)
})

test('a head path the base map has no area for prints the notice and exits 0', context => {
  const target = fixture(context)
  const base = commit(target)
  const newAreas = [...baseAreas, { area: 'new-app', paths: ['apps/new/**'], page: 'docs/development/review/new-app.md' }]
  writeFiles(target, {
    [AREAS]: `${JSON.stringify(newAreas, null, 2)}\n`,
    'docs/development/review/new-app.md': '# New app\n',
    'apps/new/x.ts': 'export {}\n',
  })
  const head = commit(target)
  const result = runPr(target, base, head)
  assert.equal(result.stderr, '')
  assert.equal(result.stdout, [
    'Review area checks passed (areas=3, production files=5).',
    'new area path: apps/new/x.ts -> docs/development/review/mastra-native.md, docs/development/review/new-app.md',
    '::notice file=apps/new/x.ts::new area path: the base map has no area for it; judged by docs/development/review/mastra-native.md, docs/development/review/new-app.md from the head.',
    '',
  ].join('\n'))
  assert.equal(result.status, 0)
})

test('a head change to a path the base already covers prints nothing extra', context => {
  const target = fixture(context)
  const base = commit(target)
  writeFiles(target, { 'apps/hub/src/server.ts': 'export const changed = true\n' })
  const head = commit(target)
  const result = runPr(target, base, head)
  assert.equal(result.stderr, '')
  assert.equal(result.stdout, 'Review area checks passed (areas=2, production files=4).\n')
  assert.equal(result.status, 0)
})

test('no areas.json at the base treats every changed path as new', context => {
  const target = mkdtempSync(resolve(tmpdir(), 'conexus-review-areas-'))
  context.after(() => rmSync(target, { recursive: true, force: true }))
  execFileSync('git', ['init', '--quiet', '-b', 'main'], { cwd: target })
  writeFiles(target, { 'README.md': '# Fixture\n' })
  const base = commit(target)
  writeFiles(target, {
    'package.json': '{"name":"fixture"}\n',
    [AREAS]: `${JSON.stringify([{ area: 'root', paths: ['package.json'], page: 'docs/development/review/root.md' }], null, 2)}\n`,
    'docs/development/review/root.md': '# Root\n',
  })
  const head = commit(target)
  const result = runPr(target, base, head)
  assert.equal(result.stderr, '')
  assert.equal(result.stdout, [
    'Review area checks passed (areas=1, production files=1).',
    `${AREAS} does not exist at the merge base ${base}; every changed production path is a new area path.`,
    'new area path: package.json -> docs/development/review/root.md',
    '::notice file=package.json::new area path: the base map has no area for it; judged by docs/development/review/root.md from the head.',
    '',
  ].join('\n'))
  assert.equal(result.status, 0)
})
