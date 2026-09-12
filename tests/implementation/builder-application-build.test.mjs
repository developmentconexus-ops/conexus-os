import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const root = resolve(import.meta.dirname, '../..')
const cache = resolve(root, 'node_modules/.cache')
mkdirSync(cache, { recursive: true })
const build = mkdtempSync(resolve(cache, 'application-build-'))
test.after(() => rmSync(build, { recursive: true, force: true }))
const compiled = spawnSync(process.execPath, [resolve(root, 'node_modules/typescript/bin/tsc'),
  '--project', resolve(root, 'apps/hub/tsconfig.json'), '--noEmit', 'false', '--outDir', build,
], { cwd: root, encoding: 'utf8' })
if (compiled.status !== 0) throw new Error(compiled.stdout || compiled.stderr)
const { compileVerifiedApplication } = await import(pathToFileURL(resolve(build, 'builder/application-build.js')).href)
const { createBuilderService } = await import(pathToFileURL(resolve(build, 'builder/service.js')).href)

const request = {
  accountId: '11111111-1111-4111-8111-111111111111',
  projectId: '22222222-2222-4222-8222-222222222222',
  changeId: '33333333-3333-4333-8333-333333333333',
}
const revision = 'a'.repeat(40)
const subject = { subjectKind: 'CHANGE_CANDIDATE', subjectDigest: revision, sourceRevision: revision, verified: true }
const html = '<!doctype html><h1>App</h1>'
const artifact = {
  projectId: request.projectId, changeId: request.changeId, sourceRevision: revision,
  templateRef: 'compiler:44444444-4444-4444-8444-444444444444', recipeSha256: 'b'.repeat(64),
  files: [{ path: 'index.html', mediaType: 'text/html', bytes: Buffer.from(html), sha256: 'c'.repeat(64) }],
}

function dependencies() {
  return {
    store: { readPreviewSubject: async input => { assert.deepEqual(input, request); return subject } },
    source: {
      listSourceTree: async input => {
        assert.deepEqual(input, { projectId: request.projectId, sourceRevision: revision })
        return { sourceRevision: revision, entries: [
          { path: 'platform.json', kind: 'FILE' }, { path: 'app', kind: 'DIRECTORY' },
          { path: 'app/index.html', kind: 'FILE' },
        ] }
      },
      readSourceFile: async input => {
        assert.deepEqual(input, { projectId: request.projectId, sourceRevision: revision, path: 'app/index.html' })
        return { sourceRevision: revision, path: 'app/index.html', content: html }
      },
    },
    compiler: { kind: 'REMOTE_E2B', compile: async input => {
      assert.deepEqual(input, {
        projectId: request.projectId, changeId: request.changeId, sourceRevision: revision,
        files: [{ path: 'index.html', content: html }],
      })
      return artifact
    } },
  }
}

test('verified-source orchestration binds the admitted revision and excludes non-app source', async () => {
  const result = await compileVerifiedApplication(dependencies(), request)
  assert.equal(result.projectId, request.projectId)
  assert.equal(result.changeId, request.changeId)
  assert.equal(result.sourceRevision, revision)
  assert.equal(Buffer.from(result.files[0].bytes).toString('utf8'), '<!doctype html><h1>App</h1>')
})

for (const denied of [null, { ...subject, verified: false }, { ...subject, subjectKind: 'CURRENT_PROJECT' }]) {
  test(`refuses ${denied === null ? 'missing' : denied.verified ? 'current-project' : 'unverified'} subject before reading or compiling`, async () => {
    const deps = dependencies()
    deps.store.readPreviewSubject = async () => denied
    deps.source.listSourceTree = async () => assert.fail('Denied source must not be read')
    deps.compiler.compile = async () => assert.fail('Denied source must not start paid compilation')
    await assert.rejects(compileVerifiedApplication(deps, request), /BUILDER_APPLICATION_SUBJECT_REFUSED/)
  })
}

test('permission failure propagates before source disclosure', async () => {
  const deps = dependencies()
  deps.store.readPreviewSubject = async () => { throw new Error('PROJECT_BUILD_NOT_AUTHORIZED') }
  deps.source.listSourceTree = async () => assert.fail('Unauthorized source read')
  await assert.rejects(compileVerifiedApplication(deps, request), /PROJECT_BUILD_NOT_AUTHORIZED/)
})

for (const boundary of [2, 3]) {
  test(`refuses a subject changed at authorization check ${boundary}`, async () => {
    const deps = dependencies()
    let reads = 0
    deps.store.readPreviewSubject = async () => ++reads === boundary ? { ...subject, sourceRevision: 'd'.repeat(40) } : subject
    if (boundary === 2) deps.compiler.compile = async () => assert.fail('Changed source must not compile')
    await assert.rejects(compileVerifiedApplication(deps, request), /BUILDER_APPLICATION_SUBJECT_CHANGED/)
  })
}

test('refuses source-port revision drift', async () => {
  const deps = dependencies()
  deps.source.readSourceFile = async () => ({ sourceRevision: 'd'.repeat(40), path: 'app/index.html', content: html })
  deps.compiler.compile = async () => assert.fail('Wrong revision must not compile')
  await assert.rejects(compileVerifiedApplication(deps, request), /BUILDER_APPLICATION_SOURCE_REFUSED/)
})

test('refuses a compiler result for another Change', async () => {
  const deps = dependencies()
  deps.compiler.compile = async () => ({ ...artifact, changeId: '44444444-4444-4444-8444-444444444444' })
  await assert.rejects(compileVerifiedApplication(deps, request), /BUILDER_APPLICATION_RESULT_SCOPE_REFUSED/)
})

test('refuses a missing app entry before reading files', async () => {
  const deps = dependencies()
  deps.source.listSourceTree = async () => ({ sourceRevision: revision, entries: [{ path: 'README.md', kind: 'FILE' }] })
  deps.source.readSourceFile = async () => assert.fail('No supported app to read')
  await assert.rejects(compileVerifiedApplication(deps, request), /BUILDER_APPLICATION_SOURCE_REFUSED/)
})

test('refuses too many app files before individual source reads', async () => {
  const deps = dependencies()
  deps.source.listSourceTree = async () => ({ sourceRevision: revision, entries: [
    { path: 'app/index.html', kind: 'FILE' },
    ...Array.from({ length: 256 }, (_, index) => ({ path: `app/src/${index}.ts`, kind: 'FILE' })),
  ] })
  deps.source.readSourceFile = async () => assert.fail('Oversized tree must not trigger repeated reads')
  await assert.rejects(compileVerifiedApplication(deps, request), /BUILDER_APPLICATION_SOURCE_REFUSED/)
})

test('cancelled requests do not disclose source or start a compiler', async () => {
  const deps = dependencies()
  deps.store.readPreviewSubject = async () => assert.fail('Cancelled request should stop immediately')
  await assert.rejects(compileVerifiedApplication(deps, { ...request, signal: AbortSignal.abort() }), /BUILDER_APPLICATION_CANCELLED/)
})

test('Builder service exposes verified compilation and closes its compiler work before its store', async () => {
  const deps = dependencies()
  let started
  const running = new Promise(resolve => { started = resolve })
  let closed = false
  let cancelled = false
  deps.compiler.compile = async ({ signal }) => {
    started()
    await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }))
    cancelled = true
    throw new Error('BUILDER_APPLICATION_CANCELLED')
  }
  deps.store.close = async () => { assert.equal(cancelled, true); closed = true }
  const service = createBuilderService({ ...deps, runtime: { kind: 'REMOTE_E2B' }, verifier: { kind: 'REMOTE_E2B' } })
  const compilation = assert.rejects(service.compileApplication(request), /BUILDER_APPLICATION_CANCELLED/)
  await running
  await service.close()
  await compilation
  assert.equal(closed, true)
  await assert.rejects(service.compileApplication(request), /BUILDER_APPLICATION_CLOSED/)
})
