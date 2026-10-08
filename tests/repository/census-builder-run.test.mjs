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
  mastraInternalsOutsideLeftovers: 0, sessionScopes: 0, collectionsAcrossModules: 0, plainPortIds: 0, failureToDefault: 0, runContextReadsOutsideOwner: 0, handTypedRunStates: 0, runEndWriters: 0, positionalSourceReads: 0, runFunctionLengthSuppressions: 0,
  failureCodesWithoutRow: 0, repeatedTimerSuppressions: 0, unsafeAssertionDebt: 3,
}
const FILES = {
  'apps/hub/src/app-runner/a.ts': `${DEBT}\nconst one = 1 as number\n${DEBT}\nconst two = 2 as number\n`,
  'apps/hub/src/identity-access/b.ts': `const first = 1\n${EXEMPT}\nconst cast = first as number\n`,
  'apps/web/src/features/c.ts': `${DEBT}\nconst three = 3 as number\n`,
}

const fixture = (t, { files = FILES, exemptions = [`apps/hub/src/identity-access/b.ts:2 ${REASON}`], biome } = {}) => {
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
  put('contracts/technical/builder-run-vocabulary.json', JSON.stringify({ states: ['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'INTERRUPTED'], openStates: ['QUEUED', 'RUNNING'], phases: ['PREPARING', 'AGENT'], resultKinds: ['RESPONSE_ONLY', 'SOURCE_CHANGED'] }))
  put('contracts/technical/census-builder-run.json', `${JSON.stringify({ ...ZERO, unsafeAssertionExemptions: exemptions }, null, 2)}\n`)
  for (const [path, text] of Object.entries(files)) put(path, text)
  if (biome) put('biome.json', JSON.stringify(biome))
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
  const gone = fixture(t, { exemptions: [`apps/hub/src/identity-access/b.ts:2 ${REASON}`, `apps/hub/src/identity-access/z.ts:1 ${REASON}`] }).run()
  assert.equal(gone.status, 1)
  assert.match(gone.out, /z\.ts:1/)
  const moved = fixture(t, { exemptions: [`apps/hub/src/identity-access/b.ts:5 ${REASON}`] }).run()
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

  const stale = fixture(t, { exemptions: [`apps/hub/src/identity-access/b.ts:2 ${REASON}`, `apps/hub/src/identity-access/z.ts:1 ${REASON}`] })
  assert.equal(stale.run('--write').status, 0)
  assert.deepEqual(JSON.parse(stale.record()).unsafeAssertionExemptions, [`apps/hub/src/identity-access/b.ts:2 ${REASON}`])
})

test('two exemptions in one file with one reason are two entries', (t) => {
  const twice = { ...FILES, 'apps/hub/src/identity-access/b.ts': `const first = 1\n${EXEMPT}\nconst cast = first as number\n${EXEMPT}\nconst again = first as number\n` }
  const one = fixture(t, { files: twice, exemptions: [`apps/hub/src/identity-access/b.ts:2 ${REASON}`] }).run()
  assert.equal(one.status, 1)
  assert.match(one.out, /b\.ts:4 /)
  assert.equal(fixture(t, { files: twice, exemptions: [`apps/hub/src/identity-access/b.ts:2 ${REASON}`, `apps/hub/src/identity-access/b.ts:4 ${REASON}`] }).run().status, 0)
})

test('a biome override that turns the rule off, or the linter off, fails naming the override', (t) => {
  const off = { overrides: [{ includes: ['apps/*/src/**'], linter: { rules: { nursery: { noUnsafeTypeAssertion: 'error' } } } }, { includes: ['apps/hub/src/**'], linter: { rules: { nursery: { noUnsafeTypeAssertion: 'off' } } } }] }
  const ran = fixture(t, { biome: off }).run()
  assert.equal(ran.status, 1)
  assert.match(ran.out, /biome\.json overrides\[1\] turns noUnsafeTypeAssertion off/)
  const disabled = fixture(t, { biome: { overrides: [{ includes: ['apps/**'], linter: { enabled: false } }] } }).run()
  assert.equal(disabled.status, 1)
  assert.match(disabled.out, /overrides\[0\]/)
  assert.equal(fixture(t, { biome: { overrides: [off.overrides[0]] } }).run().status, 0)
})

test('suppressions in .mts and .cts files are read like those in .ts files', (t) => {
  for (const name of ['d.mts', 'd.cts']) {
    const ran = fixture(t, { files: { ...FILES, [`apps/hub/src/identity-access/${name}`]: `const x = 1\n// biome-ignore lint/nursery/noUnsafeTypeAssertion: it works\n` } }).run()
    assert.equal(ran.status, 1, name)
    assert.match(ran.out, new RegExp(`identity-access/${name.replace('.', '\\.')}:2`), name)
  }
})

test('a Builder port that declares an id or a revision as a plain string fails naming its line, and the registry and vendor files are not ours', (t) => {
  const port = (text) => ({ ...FILES, 'apps/hub/src/builder/run/ports.ts': text })
  const plain = fixture(t, { files: port('export type Ref = Readonly<{\n  projectId: string\n}>\n') }).run()
  assert.equal(plain.status, 1)
  assert.match(plain.out, /plainPortIds 1 \(record 0\) UP\s+apps\/hub\/src\/builder\/run\/ports\.ts:2/)
  assert.equal(fixture(t, { files: port('moveRef(next: string): void\n') }).run().status, 1)
  assert.equal(fixture(t, { files: port('export type Ref = Readonly<{ projectId: ProjectId; next: SourceRevision }>\n') }).run().status, 0)
  const elsewhere = { ...FILES, 'apps/hub/src/builder/application-build.ts': 'accountId: string\n', 'apps/hub/src/builder/openai-codex/credential.ts': 'accountId: string\n' }
  assert.equal(fixture(t, { files: elsewhere }).run().status, 0)
})

test('a source read that takes positional arguments fails', (t) => {
  const read = (head) => ({ ...FILES, 'apps/hub/src/builder/source.ts': `export const reads = {\n  listSourceTree: async ${head} => {},\n}\n` })
  assert.equal(fixture(t, { files: read('(projectId, sourceRevision)') }).run().status, 1)
  assert.equal(fixture(t, { files: read('({ projectId, sourceRevision })') }).run().status, 0)
})

test('a run state list retyped by hand in the Builder, Project or access code fails naming its line, and one value is no list', (t) => {
  const code = (text) => ({ ...FILES, 'apps/hub/src/identity-access/f.ts': text })
  const typed = fixture(t, { files: code("const open = (state: string) => state === 'QUEUED' || state === 'RUNNING'\n") }).run()
  assert.equal(typed.status, 1)
  assert.match(typed.out, /handTypedRunStates 1 \(record 0\) UP\s+apps\/hub\/src\/identity-access\/f\.ts:1/)
  assert.equal(fixture(t, { files: code("const sql = \"state = 'QUEUED' AND phase = 'AGENT'\"\n") }).run().status, 0)
  assert.equal(fixture(t, { files: code("const phases = ['PREPARING', 'AGENT']\n") }).run().status, 1)
  assert.equal(fixture(t, { files: { ...FILES, 'apps/hub/src/generated/v.ts': "export const S = ['QUEUED', 'RUNNING']\n" } }).run().status, 0)
})

test('a second writer of the finish time beside the one ending command fails', (t) => {
  const lifecycle = 'const end = sql`UPDATE builder.builder_run SET finished_at = clock_timestamp()`\n'
  assert.equal(fixture(t, { files: { ...FILES, 'apps/hub/src/builder/run-lifecycle.ts': lifecycle } }).run().status, 0)
  const second = fixture(t, { files: { ...FILES, 'apps/hub/src/builder/run-lifecycle.ts': lifecycle, 'apps/hub/src/builder/other.ts': 'const x = sql`UPDATE builder.builder_run SET finished_at = now()`\n' } }).run()
  assert.equal(second.status, 1)
  assert.match(second.out, /runEndWriters 1 \(record 0\) UP\s+apps\/hub\/src\/builder\/other\.ts:1/)
})

test('a failure turned into false, null or an empty answer fails, a sandbox probe is not counted, and a runId typed as a string fails', (t) => {
  const code = (text, path = 'apps/hub/src/builder/conexus-git.ts') => ({ ...FILES, [path]: text })
  const old = fixture(t, { files: code("const has = git(['cat-file']).then(() => true, () => false)\n") }).run()
  assert.equal(old.status, 1)
  assert.match(old.out, /failureToDefault 1 \(record 0\) UP\s+apps\/hub\/src\/builder\/conexus-git\.ts:1/)
  assert.equal(fixture(t, { files: code('const tree = await git().catch(() => null)\n') }).run().status, 1)
  assert.equal(fixture(t, { files: code('const tree = await git().catch(() => [])\n') }).run().status, 1)
  assert.equal(fixture(t, { files: code('const ok = await probe().catch(() => false)\n', 'apps/hub/src/builder/check/steps/boot.ts') }).run().status, 0)
  assert.equal(fixture(t, { files: code('const void1 = await close().catch(() => undefined)\n', 'apps/hub/src/builder/run/admit.ts') }).run().status, 0)
  assert.equal(fixture(t, { files: code('export const candidateSnapshot = (runId: string) => runId\n') }).run().status, 1)
})

test('in the Git adapter a swallowing catch and a catch that renames every failure to a domain code are counted', (t) => {
  const adapter = (text) => ({ ...FILES, 'apps/hub/src/builder/conexus-git.ts': text })
  assert.equal(fixture(t, { files: adapter('await git().catch(() => undefined)\n') }).run().status, 1)
  const renamed = fixture(t, { files: adapter('await git().catch((error: unknown) => {\n  throw new Failure(\'X\', { cause: error })\n})\n') }).run()
  assert.equal(renamed.status, 1)
  assert.match(renamed.out, /failureToDefault 1 \(record 0\) UP\s+apps\/hub\/src\/builder\/conexus-git\.ts:1/)
  assert.equal(fixture(t, { files: adapter('await git().catch(async (error: unknown) => {\n  if (await read() === null) throw error\n})\n') }).run().status, 0)
})

test('a module other than run-context.ts that reads the run keys raw, or parses a request-context value itself, is counted', (t) => {
  const reader = (text) => ({ ...FILES, 'apps/hub/src/builder/model-routing.ts': text })
  const raw = fixture(t, { files: reader("const runId = BuilderRunId.safeParse(requestContext.getRaw(RUN_ID_KEY))\n") }).run()
  assert.equal(raw.status, 1)
  assert.match(raw.out, /runContextReadsOutsideOwner 1 \(record 0\) UP\s+apps\/hub\/src\/builder\/model-routing\.ts:1/)
  assert.equal(fixture(t, { files: reader("const id = requestContext.getRaw('conexusBuilderRunId')\n") }).run().status, 1)
  assert.equal(fixture(t, { files: { ...FILES, 'apps/hub/src/builder/run-context.ts': "const id = requestContext.getRaw('conexusBuilderRunId')\n" } }).run().status, 0)
  assert.equal(fixture(t, { files: reader('const context = readRunContext(requestContext)\n') }).run().status, 0)
})
