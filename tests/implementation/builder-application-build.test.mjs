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
const { prepareVerifiedApplication } = await import(pathToFileURL(resolve(build, 'builder/application-build.js')).href)
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
const metadata = {
  artifactRevisionId: '44444444-4444-4444-8444-444444444444', artifactDigest: 'd'.repeat(64),
  projectId: request.projectId, sourceRevision: revision, profile: 'REACT_VITE_V1',
  templateRef: 'xdli9puqp1nepk4ht6lw:8a1e3885-c6d7-4b06-aea6-860632f407e6', recipeSha256: 'e'.repeat(64),
  entryPath: 'index.html', files: [{ path: 'index.html', mediaType: 'text/html; charset=utf-8', byteLength: html.length, sha256: 'f'.repeat(64) }],
}

function dependencies({ cached = null } = {}) {
  const calls = { get: 0, retained: [], compiled: 0 }
  const deps = {
    calls,
    store: {
      readPreviewSubject: async input => { assert.deepEqual(input, request); return subject },
      close: async () => {},
    },
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
      calls.compiled += 1
      const { signal: _signal, ...withoutSignal } = input
      assert.deepEqual(withoutSignal, {
        projectId: request.projectId, changeId: request.changeId, sourceRevision: revision,
        files: [{ path: 'index.html', content: html }],
      })
      return artifact
    } },
    applicationArtifacts: {
      getApplication: async input => {
        calls.get += 1
        assert.deepEqual(input, { ...request, sourceRevision: revision })
        return cached
      },
      retainApplication: async input => {
        calls.retained.push(input)
        return metadata
      },
    },
  }
  return deps
}

function createService(deps) {
  return createBuilderService({ ...deps, runtime: { kind: 'REMOTE_E2B' }, verifier: { kind: 'REMOTE_E2B' } })
}

async function readPreparationUntil(service, state) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const preparation = await service.readPreviewPreparation({ ...request, subjectDigest: revision })
    if (preparation?.state === state) return preparation
    await new Promise(resolve => setImmediate(resolve))
  }
  assert.fail(`Expected Preview preparation to reach ${state}`)
}

test('retained application is reused before source extraction or compilation', async () => {
  const deps = dependencies({ cached: metadata })
  deps.source.listSourceTree = async () => assert.fail('A retained application must not read source')
  deps.compiler.compile = async () => assert.fail('A retained application must not compile')
  const result = await prepareVerifiedApplication(deps, request)
  assert.deepEqual(result, metadata)
  assert.equal(deps.calls.get, 1)
})

test('authorized miss retains the exact verified compiler output', async () => {
  const deps = dependencies()
  const result = await prepareVerifiedApplication(deps, request)
  assert.deepEqual(result, metadata)
  assert.equal(deps.calls.compiled, 1)
  assert.equal(deps.calls.retained.length, 1)
  assert.deepEqual(deps.calls.retained[0], { accountId: request.accountId, compiled: artifact })
  assert.equal(Buffer.from(deps.calls.retained[0].compiled.files[0].bytes).toString('utf8'), html)
})

for (const denied of [null, { ...subject, verified: false }, { ...subject, subjectKind: 'CURRENT_PROJECT' }]) {
  test(`refuses ${denied === null ? 'missing' : denied.verified ? 'current-project' : 'unverified'} subject before reading, compiling, or retaining`, async () => {
    const deps = dependencies()
    deps.store.readPreviewSubject = async () => denied
    deps.applicationArtifacts.getApplication = async () => assert.fail('Denied subject must not query retained artifacts')
    deps.source.listSourceTree = async () => assert.fail('Denied source must not be read')
    deps.compiler.compile = async () => assert.fail('Denied source must not start paid compilation')
    await assert.rejects(prepareVerifiedApplication(deps, request), /BUILDER_APPLICATION_SUBJECT_REFUSED/)
  })
}

test('permission failure propagates before source disclosure', async () => {
  const deps = dependencies()
  deps.store.readPreviewSubject = async () => { throw new Error('PROJECT_BUILD_NOT_AUTHORIZED') }
  deps.applicationArtifacts.getApplication = async () => assert.fail('Unauthorized request must not query artifacts')
  deps.source.listSourceTree = async () => assert.fail('Unauthorized source read')
  await assert.rejects(prepareVerifiedApplication(deps, request), /PROJECT_BUILD_NOT_AUTHORIZED/)
})

for (const boundary of [2, 3, 4, 5]) {
  test(`refuses a subject changed at authorization check ${boundary}`, async () => {
    const deps = dependencies()
    let reads = 0
    deps.store.readPreviewSubject = async () => ++reads === boundary ? { ...subject, sourceRevision: 'd'.repeat(40) } : subject
    if (boundary === 2) deps.source.listSourceTree = async () => assert.fail('Changed source must not be read')
    if (boundary <= 3) deps.compiler.compile = async () => assert.fail('Changed source must not compile')
    if (boundary === 4) deps.applicationArtifacts.retainApplication = async () => assert.fail('Changed source must not be retained')
    await assert.rejects(prepareVerifiedApplication(deps, request), /BUILDER_APPLICATION_SUBJECT_CHANGED/)
  })
}

test('refuses source-port revision drift', async () => {
  const deps = dependencies()
  deps.source.readSourceFile = async () => ({ sourceRevision: 'd'.repeat(40), path: 'app/index.html', content: html })
  deps.compiler.compile = async () => assert.fail('Wrong revision must not compile')
  await assert.rejects(prepareVerifiedApplication(deps, request), /BUILDER_APPLICATION_SOURCE_REFUSED/)
})

test('refuses a compiler result for another Change', async () => {
  const deps = dependencies()
  deps.compiler.compile = async () => ({ ...artifact, changeId: '44444444-4444-4444-8444-444444444444' })
  await assert.rejects(prepareVerifiedApplication(deps, request), /BUILDER_APPLICATION_RESULT_SCOPE_REFUSED/)
})

test('refuses a missing app entry before reading files', async () => {
  const deps = dependencies()
  deps.source.listSourceTree = async () => ({ sourceRevision: revision, entries: [{ path: 'README.md', kind: 'FILE' }] })
  deps.source.readSourceFile = async () => assert.fail('No supported app to read')
  await assert.rejects(prepareVerifiedApplication(deps, request), /BUILDER_APPLICATION_SOURCE_REFUSED/)
})

test('refuses too many app files before individual source reads', async () => {
  const deps = dependencies()
  deps.source.listSourceTree = async () => ({ sourceRevision: revision, entries: [
    { path: 'app/index.html', kind: 'FILE' },
    ...Array.from({ length: 256 }, (_, index) => ({ path: `app/src/${index}.ts`, kind: 'FILE' })),
  ] })
  deps.source.readSourceFile = async () => assert.fail('Oversized tree must not trigger repeated reads')
  await assert.rejects(prepareVerifiedApplication(deps, request), /BUILDER_APPLICATION_SOURCE_REFUSED/)
})

test('cancelled requests do not disclose source, query artifacts, or start a compiler', async () => {
  const deps = dependencies()
  deps.store.readPreviewSubject = async () => assert.fail('Cancelled request should stop immediately')
  await assert.rejects(prepareVerifiedApplication(deps, { ...request, signal: AbortSignal.abort() }), /BUILDER_APPLICATION_CANCELLED/)
})

test('cancellation after retention rejects without returning success', async () => {
  const deps = dependencies()
  let started
  const retentionStarted = new Promise(resolve => { started = resolve })
  let release
  const retentionRelease = new Promise(resolve => { release = resolve })
  deps.applicationArtifacts.retainApplication = async _input => {
    started()
    await retentionRelease
    return metadata
  }
  const controller = new AbortController()
  const preparation = prepareVerifiedApplication(deps, { ...request, signal: controller.signal })
  await retentionStarted
  controller.abort()
  release()
  await assert.rejects(preparation, /BUILDER_APPLICATION_CANCELLED/)
})

test('Builder service drains blocked retention before closing its store', async () => {
  const deps = dependencies()
  let started
  const retentionStarted = new Promise(resolve => { started = resolve })
  let release
  const retentionRelease = new Promise(resolve => { release = resolve })
  deps.applicationArtifacts.retainApplication = async () => {
    started()
    await retentionRelease
    return metadata
  }
  let storeClosed = false
  deps.store.close = async () => { storeClosed = true }
  const service = createBuilderService({ ...deps, runtime: { kind: 'REMOTE_E2B' }, verifier: { kind: 'REMOTE_E2B' } })
  const preparation = assert.rejects(service.prepareApplication(request), /BUILDER_APPLICATION_CANCELLED/)
  await retentionStarted
  const closing = service.close()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(storeClosed, false)
  release()
  await closing
  await preparation
  assert.equal(storeClosed, true)
  await assert.rejects(service.prepareApplication(request), /BUILDER_APPLICATION_CLOSED/)
})

test('Builder service cancels compiler work before closing its store', async () => {
  const deps = dependencies()
  let started
  const compilerStarted = new Promise(resolve => { started = resolve })
  let compilerCancelled = false
  deps.compiler.compile = async ({ signal }) => {
    started()
    await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }))
    compilerCancelled = true
    throw new Error('BUILDER_APPLICATION_CANCELLED')
  }
  let storeClosed = false
  deps.store.close = async () => {
    assert.equal(compilerCancelled, true)
    storeClosed = true
  }
  const service = createBuilderService({ ...deps, runtime: { kind: 'REMOTE_E2B' }, verifier: { kind: 'REMOTE_E2B' } })
  const preparation = assert.rejects(service.prepareApplication(request), /BUILDER_APPLICATION_CANCELLED/)
  await compilerStarted
  await service.close()
  await preparation
  assert.equal(storeClosed, true)
})

test('Builder service coalesces concurrent Preview preparation starts into one retained compilation', async (t) => {
  const deps = dependencies()
  const service = createService(deps)
  t.after(() => service.close())
  const [first, second] = await Promise.all([
    service.startPreviewPreparation({ ...request, subjectDigest: revision }),
    service.startPreviewPreparation({ ...request, subjectDigest: revision }),
  ])
  assert.equal(first.attemptId, second.attemptId)
  const prepared = await readPreparationUntil(service, 'PREPARED')
  assert.deepEqual(prepared.artifact, metadata)
  assert.equal(deps.calls.compiled, 1)
  await service.close()
})

test('Builder service Preview reads return absence without starting application preparation', async (t) => {
  const deps = dependencies()
  const service = createService(deps)
  t.after(() => service.close())
  assert.equal(await service.readPreviewPreparation({ ...request, subjectDigest: revision }), null)
  assert.equal(deps.calls.compiled, 0)
  assert.equal(deps.calls.get, 0)
  await service.close()
})

test('Builder service reuses retained Preview output after service recreation without recompiling', async (t) => {
  const deps = dependencies()
  let retained = null
  const retainApplication = deps.applicationArtifacts.retainApplication
  deps.applicationArtifacts.retainApplication = async input => {
    retained = await retainApplication(input)
    return retained
  }
  deps.applicationArtifacts.getApplication = async input => {
    deps.calls.get += 1
    assert.deepEqual(input, { ...request, sourceRevision: revision })
    return retained
  }
  const firstService = createService(deps)
  t.after(() => firstService.close())
  const first = await firstService.startPreviewPreparation({ ...request, subjectDigest: revision })
  await readPreparationUntil(firstService, 'PREPARED')
  await firstService.close()

  const secondService = createService(deps)
  t.after(() => secondService.close())
  assert.equal(await secondService.readPreviewPreparation({ ...request, subjectDigest: revision }), null)
  const second = await secondService.startPreviewPreparation({ ...request, subjectDigest: revision })
  assert.notEqual(second.attemptId, first.attemptId)
  const prepared = await readPreparationUntil(secondService, 'PREPARED')
  assert.deepEqual(prepared.artifact, metadata)
  assert.equal(deps.calls.compiled, 1)
  await secondService.close()
})

test('Builder service drains blocked Preview retention before closing its store and refuses late success', async (t) => {
  const deps = dependencies()
  let retentionStarted
  const started = new Promise(resolve => { retentionStarted = resolve })
  let releaseRetention
  const retentionRelease = new Promise(resolve => { releaseRetention = resolve })
  let retentionReturned = false
  deps.applicationArtifacts.retainApplication = async () => {
    retentionStarted()
    await retentionRelease
    retentionReturned = true
    return metadata
  }
  let storeClosed = false
  deps.store.close = async () => { storeClosed = true }
  const service = createService(deps)
  t.after(async () => { releaseRetention(); await service.close() })
  await service.startPreviewPreparation({ ...request, subjectDigest: revision })
  await started
  const closing = service.close()
  let secondCloseReturned = false
  const secondClose = service.close().then(() => { secondCloseReturned = true })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(storeClosed, false)
  assert.equal(secondCloseReturned, false)
  assert.equal(retentionReturned, false)
  releaseRetention()
  await closing
  await secondClose
  assert.equal(storeClosed, true)
  assert.equal(retentionReturned, true)
  await assert.rejects(service.readPreviewPreparation({ ...request, subjectDigest: revision }), /PREVIEW_PREPARATION_CLOSED/)
  await assert.rejects(service.startPreviewPreparation({ ...request, subjectDigest: revision }), /PREVIEW_PREPARATION_CLOSED/)
})

test('Builder service close is idempotent and closes its store once', async () => {
  const deps = dependencies()
  let storeCloseCalls = 0
  deps.store.close = async () => { storeCloseCalls += 1 }
  const service = createService(deps)
  await Promise.all([service.close(), service.close()])
  assert.equal(storeCloseCalls, 1)
})
