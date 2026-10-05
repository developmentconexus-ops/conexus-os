import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'

const script = resolve(import.meta.dirname, '../../scripts/census-builder-run.mjs')
const REASON = 'undici and openid-client disagree on RequestInit'
const DEBT = '// biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave'
const EXEMPT = `// biome-ignore lint/nursery/noUnsafeTypeAssertion: exempt ${REASON}`
const ZERO = {
  sqlRunWriters: 0, sqlRunWriterTriggers: 0, runSummaryLiterals: 0, parkedReferences: 0, abortUndoCalls: 0, hubSendMessageCalls: 0,
  mastraInternalsOutsideLeftovers: 0, sessionScopes: 0, collectionsAcrossModules: 0, runFunctionLengthSuppressions: 0,
  failureCodesWithoutRow: 0, repeatedTimerSuppressions: 0, unsafeAssertionDebt: 3,
}
const FILES = {
  'apps/hub/src/app-runner/a.ts': `${DEBT}\nconst one = 1 as number\n${DEBT}\nconst two = 2 as number\n`,
  'apps/hub/src/identity-access/b.ts': `const first = 1\n${EXEMPT}\nconst cast = first as number\n`,
  'apps/web/src/features/c.ts': `${DEBT}\nconst three = 3 as number\n`,
}

const fixture = (t, { files = FILES, exemptions = ['apps/hub/src/identity-access/b.ts:2 ' + REASON] } = {}) => {
  const root = mkdtempSync(join(tmpdir(), 'cx-census-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const put = (path, text) => {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  mkdirSync(join(root, 'scripts'), { recursive: true })
  copyFileSync(script, join(root, 'scripts/census-builder-run.mjs'))
  mkdirSync(join(root, 'apps/hub/migrations'), { recursive: true })
  put('contracts/technical/failures.json', '{"failures":[]}')
  put('contracts/technical/census-builder-run.json', `${JSON.stringify({ ...ZERO, unsafeAssertionExemptions: exemptions }, null, 2)}\n`)
  for (const [path, text] of Object.entries(files)) put(path, text)
  spawnSync('git', ['init', '-q'], { cwd: root })
  const run = (...args) => {
    const ran = spawnSync(process.execPath, ['scripts/census-builder-run.mjs', ...args], { cwd: root, encoding: 'utf8' })
    return { status: ran.status, out: `${ran.stdout}${ran.stderr}` }
  }
  return { root, run, record: () => readFileSync(join(root, 'contracts/technical/census-builder-run.json'), 'utf8') }
}

test('--list prints the debt by source, most first', (t) => {
  const { run } = fixture(t)
  assert.match(run('--list').out, /by source: app-runner 2, features 1/)
})

test('a recorded exemption passes, and one the record lacks fails naming its file', (t) => {
  assert.equal(fixture(t).run().status, 0)
  const lacking = fixture(t, { exemptions: [] }).run()
  assert.equal(lacking.status, 1)
  assert.match(lacking.out, /apps\/hub\/src\/identity-access\/b\.ts:2 /)
})

test('a recorded exemption that is gone or at another line fails', (t) => {
  const gone = fixture(t, { exemptions: ['apps/hub/src/identity-access/b.ts:2 ' + REASON, 'apps/hub/src/identity-access/z.ts:1 ' + REASON] }).run()
  assert.equal(gone.status, 1)
  assert.match(gone.out, /z\.ts:1/)
  const moved = fixture(t, { exemptions: ['apps/hub/src/identity-access/b.ts:5 ' + REASON] }).run()
  assert.equal(moved.status, 1)
  assert.match(moved.out, /b\.ts:5/)
})

test('a suppression that is neither debt nor a recorded exemption fails naming its file and line', (t) => {
  const forms = {
    'another suffix': '// biome-ignore lint/nursery/noUnsafeTypeAssertion: it works\n',
    'biome-ignore-all': '// biome-ignore-all lint/nursery/noUnsafeTypeAssertion: debt: owning wave\n',
    'biome-ignore-start': '// biome-ignore-start lint/nursery/noUnsafeTypeAssertion: debt: owning wave\n',
    'a group without a rule': '// biome-ignore lint/nursery: it works\n',
    'a category without a rule': '// biome-ignore lint: it works\n',
  }
  for (const [label, line] of Object.entries(forms)) {
    const ran = fixture(t, { files: { ...FILES, 'apps/hub/src/identity-access/d.ts': `const x = 1\n${line}` } }).run()
    assert.equal(ran.status, 1, label)
    assert.match(ran.out, /apps\/hub\/src\/identity-access\/d\.ts:2/, label)
  }
})

test('a suppression under packages fails, whatever it says', (t) => {
  const ran = fixture(t, { files: { ...FILES, 'packages/contract/src/e.ts': `const x = 1\n${DEBT}\n` } }).run()
  assert.equal(ran.status, 1)
  assert.match(ran.out, /packages\/contract\/src\/e\.ts:2/)
})

test('--write never adds an exemption and leaves the record as it was, and it drops one that is gone', (t) => {
  const missing = fixture(t, { exemptions: [] })
  const before = missing.record()
  const refused = missing.run('--write')
  assert.equal(refused.status, 1)
  assert.match(refused.out, /identity-access\/b\.ts:2/)
  assert.equal(missing.record(), before)

  const stale = fixture(t, { exemptions: ['apps/hub/src/identity-access/b.ts:2 ' + REASON, 'apps/hub/src/identity-access/z.ts:1 ' + REASON] })
  assert.equal(stale.run('--write').status, 0)
  assert.deepEqual(JSON.parse(stale.record()).unsafeAssertionExemptions, ['apps/hub/src/identity-access/b.ts:2 ' + REASON])
})

test('two exemptions in one file with one reason are two entries', (t) => {
  const twice = { ...FILES, 'apps/hub/src/identity-access/b.ts': `const first = 1\n${EXEMPT}\nconst cast = first as number\n${EXEMPT}\nconst again = first as number\n` }
  const one = fixture(t, { files: twice, exemptions: ['apps/hub/src/identity-access/b.ts:2 ' + REASON] }).run()
  assert.equal(one.status, 1)
  assert.match(one.out, /b\.ts:4 /)
  assert.equal(fixture(t, { files: twice, exemptions: ['apps/hub/src/identity-access/b.ts:2 ' + REASON, 'apps/hub/src/identity-access/b.ts:4 ' + REASON] }).run().status, 0)
})
