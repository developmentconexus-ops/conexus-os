import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'

const script = resolve(import.meta.dirname, '../../scripts/check-ratchets.mjs')
const empty = { casts: {}, longFunctions: {}, longFiles: {}, weakTests: {}, sourceReads: {} }

const fixture = (files, ratchets) => {
  const root = mkdtempSync(join(tmpdir(), 'ratchets-'))
  const put = (path, text) => {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  put('scripts/ratchets.json', `${JSON.stringify({ ...empty, ...ratchets })}\n`)
  for (const [path, text] of Object.entries(files)) put(path, text)
  return { root, put, ratchets: () => JSON.parse(readFileSync(join(root, 'scripts/ratchets.json'), 'utf8')) }
}

const run = (root, ...flags) => spawnSync(process.execPath, [script, '--root', root, ...flags], { encoding: 'utf8' })

const longFunction = (lines) => `export const f = () => {\n${'  console.log(1)\n'.repeat(lines)}}\n`

test('a cast added to a file with a recorded count fails and names the file, but as const does not count', (t) => {
  const { root, put } = fixture({ 'apps/hub/src/a.ts': 'export const a = (x: unknown) => x as string\nexport const b = [1] as const\n' }, { casts: { 'apps/hub/src/a.ts': 1 } })
  t.after(() => rmSync(root, { recursive: true }))
  const held = run(root)
  assert.equal(held.status, 0)
  assert.equal(held.stdout, 'ratchets hold: casts 1, longFunctions 0, longFiles 0, weakTests 0, sourceReads 0\n')
  put('apps/hub/src/a.ts', 'export const a = (x: unknown) => x as string\nexport const c = (x: unknown) => x as number\n')
  const raised = run(root)
  assert.equal(raised.status, 1)
  assert.equal(raised.stderr, 'ratchets rose; fix the code, never raise the file:\n  casts apps/hub/src/a.ts: 1 -> 2\n')
})

test('a cast in a new temporary file fails because a new file starts at zero', (t) => {
  const { root, put } = fixture({})
  t.after(() => rmSync(root, { recursive: true }))
  put('packages/shared/src/temp.ts', 'export const t = (x: unknown) => x as string\n')
  const result = run(root)
  assert.equal(result.status, 1)
  assert.equal(result.stderr, 'ratchets rose; fix the code, never raise the file:\n  casts packages/shared/src/temp.ts: 0 -> 1\n')
})

test('a count that falls fails until the file is lowered, and --write lowers it without slack', (t) => {
  const { root, ratchets } = fixture({ 'apps/hub/src/a.ts': 'export const a = 1\n' }, { casts: { 'apps/hub/src/a.ts': 2 } })
  t.after(() => rmSync(root, { recursive: true }))
  const fell = run(root)
  assert.equal(fell.status, 1)
  assert.equal(fell.stderr, 'ratchets fell; run `node scripts/check-ratchets.mjs --write` and commit scripts/ratchets.json:\n  casts apps/hub/src/a.ts: 2 -> 0\n')
  assert.equal(run(root, '--write').status, 0)
  assert.deepEqual(ratchets().casts, {})
  assert.equal(run(root).status, 0)
})

test('--write refuses to raise a count and leaves the file as it was', (t) => {
  const { root, ratchets } = fixture({ 'apps/hub/src/a.ts': 'export const a = (x: unknown) => x as string\n' })
  t.after(() => rmSync(root, { recursive: true }))
  const result = run(root, '--write')
  assert.equal(result.status, 1)
  assert.deepEqual(ratchets().casts, {})
})

test('a function over 80 lines and a file over 500 lines are counted', (t) => {
  const { root } = fixture({ 'apps/web/src/long.ts': longFunction(80), 'apps/web/src/short.ts': longFunction(70), 'apps/web/src/huge.ts': `${'export {}\n'.repeat(501)}` })
  t.after(() => rmSync(root, { recursive: true }))
  const result = run(root)
  assert.equal(result.stderr, 'ratchets rose; fix the code, never raise the file:\n  longFunctions apps/web/src/long.ts: 0 -> 1\n  longFiles apps/web/src/huge.ts: 0 -> 501\n')
})

test('a test with only weak assertions is counted and a test with a literal comparison is not', (t) => {
  const { root } = fixture({
    'tests/a.test.mjs': "test('weak', () => { assert.ok(x) })\ntest('strong', () => { assert.equal(x, 'y') })\n",
  })
  t.after(() => rmSync(root, { recursive: true }))
  assert.equal(run(root).stderr, 'ratchets rose; fix the code, never raise the file:\n  weakTests tests/a.test.mjs: 0 -> 1\n')
})

test('a test that reads production source text is counted, but one that reads generated text or imports source is not', (t) => {
  const { root } = fixture({
    'tests/a.test.mjs': "import { x } from '../apps/hub/src/a.ts'\nconst text = readFileSync(resolve(root, 'apps/hub/src/a.ts'), 'utf8')\ntest('t', () => { assert.equal(text, 'x') })\n",
    'tests/b.test.mjs': "const text = readFileSync(resolve(root, 'apps/hub/src/log-codes.generated.ts'), 'utf8')\ntest('t', () => { assert.equal(text, 'x') })\n",
  })
  t.after(() => rmSync(root, { recursive: true }))
  assert.equal(run(root).stderr, 'ratchets rose; fix the code, never raise the file:\n  sourceReads tests/a.test.mjs: 0 -> 1\n')
})

test('a test that reads production source through a variable or a function of its own is counted, a test that writes a fixture there is not', (t) => {
  const { root } = fixture({
    'tests/walk.test.mjs': [
      "const source = join(root, 'apps/hub/src')",
      'const walk = (directory) => readdirSync(directory).flatMap((name) => walk(join(directory, name)))',
      "test('t', () => { assert.deepEqual(walk(source), []) })",
    ].join('\n'),
    'tests/fixture.test.mjs': [
      "const sourceDir = resolve(root, 'apps/hub/src')",
      "test('t', () => { mkdirSync(sourceDir); writeFileSync(join(sourceDir, 'a.ts'), 'x'); assert.equal(readFileSync(join(root, 'out.log'), 'utf8'), 'x') })",
    ].join('\n'),
  })
  t.after(() => rmSync(root, { recursive: true }))
  assert.equal(run(root).stderr, 'ratchets rose; fix the code, never raise the file:\n  sourceReads tests/walk.test.mjs: 0 -> 1\n')
})

test('a .spec.mjs file is measured like a .test.mjs file', (t) => {
  const { root } = fixture({ 'tests/a.spec.mjs': "test('weak', () => { assert.ok(x) })\n" })
  t.after(() => rmSync(root, { recursive: true }))
  assert.equal(run(root).stderr, 'ratchets rose; fix the code, never raise the file:\n  weakTests tests/a.spec.mjs: 0 -> 1\n')
})
