import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const root = resolve(import.meta.dirname, '../..')
const cache = resolve(root, 'node_modules/.cache')
mkdirSync(cache, { recursive: true })
const build = mkdtempSync(resolve(cache, 'preview-preparation-'))
test.after(() => rmSync(build, { recursive: true, force: true }))
const compiled = spawnSync(process.execPath, [resolve(root, 'node_modules/typescript/bin/tsc'),
  '--project', resolve(root, 'apps/hub/tsconfig.json'), '--noEmit', 'false', '--outDir', build,
], { cwd: root, encoding: 'utf8' })
if (compiled.status !== 0) throw new Error(compiled.stdout || compiled.stderr)
const { createPreviewPreparationCoordinator } = await import(pathToFileURL(resolve(build, 'builder/preview-preparation.js')).href)

  const request = {
    accountId: '11111111-1111-4111-8111-111111111111',
    projectId: '22222222-2222-4222-8222-222222222222',
    changeId: '33333333-3333-4333-8333-333333333333',
    subjectDigest: 'd'.repeat(64),
  }
  const revision = 'a'.repeat(40)
  const subject = { subjectKind: 'CHANGE_CANDIDATE', subjectDigest: request.subjectDigest, sourceRevision: revision, verified: true }
  const metadata = {
    artifactRevisionId: '44444444-4444-4444-8444-444444444444', artifactDigest: 'e'.repeat(64),
    projectId: request.projectId, sourceRevision: revision, profile: 'REACT_VITE_V1',
    templateRef: 'template', recipeSha256: 'f'.repeat(64), entryPath: 'index.html',
    files: [{ path: 'index.html', mediaType: 'text/html; charset=utf-8', byteLength: 20, sha256: '0'.repeat(64) }],
  }
  const deferred = () => {
    let resolve
    let reject
    const promise = new Promise((complete, fail) => { resolve = complete; reject = fail })
    return { promise, resolve, reject }
  }
  const tick = () => new Promise(resolve => setImmediate(resolve))
  const makeDependencies = ({ current = subject, prepare = () => Promise.resolve(metadata), now, timeoutMs, maxActive } = {}) => {
    const calls = { reads: [], preparations: [] }
    let currentSubject = current
    const deps = {
      calls,
      setSubject(value) { currentSubject = value },
      readPreviewSubject: async input => {
        calls.reads.push(input)
        return currentSubject
      },
      prepareApplication: async input => {
        calls.preparations.push(input)
        return prepare(input)
      },
    }
    if (now) deps.now = now
    if (timeoutMs !== undefined) deps.timeoutMs = timeoutMs
    if (maxActive !== undefined) deps.maxActive = maxActive
    return deps
  }

  test('read is side-effect free when no attempt exists', async () => {
    const deps = makeDependencies()
    const coordinator = createPreviewPreparationCoordinator(deps)
    assert.equal(await coordinator.read(request), null)
    assert.equal(deps.calls.preparations.length, 0)
    await coordinator.close()
  })

  test('coalesces concurrent starts for one account and exact subject', async () => {
    const work = deferred()
    const deps = makeDependencies({ prepare: () => work.promise })
    const coordinator = createPreviewPreparationCoordinator(deps)
    const [first, second] = await Promise.all([coordinator.start(request), coordinator.start(request)])
    assert.equal(first.attemptId, second.attemptId)
    assert.equal(first.state, 'PREPARING')
    assert.equal(deps.calls.preparations.length, 1)
    assert.deepEqual(Object.keys(deps.calls.preparations[0]).sort(), ['accountId', 'changeId', 'projectId', 'signal'])
    work.resolve(metadata)
    await tick()
    assert.deepEqual(await coordinator.read(request), {
      attemptId: first.attemptId,
      subject: { ...request, sourceRevision: revision },
      expiresAt: first.expiresAt,
      state: 'PREPARED',
      artifact: metadata,
    })
    await coordinator.close()
  })

  test('does not share preparation authority across accounts', async () => {
    const work = deferred()
    const otherRequest = { ...request, accountId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }
    const deps = makeDependencies({ prepare: () => work.promise })
    const coordinator = createPreviewPreparationCoordinator(deps)
    const first = await coordinator.start(request)
    const second = await coordinator.start(otherRequest)
    assert.notEqual(first.attemptId, second.attemptId)
    assert.equal(deps.calls.preparations.length, 2)
    work.resolve(metadata)
    await tick()
    await coordinator.close()
  })

  test('start snapshots its request before awaiting authorization', async () => {
    const authorization = deferred()
    const work = deferred()
    const deps = makeDependencies({ prepare: () => work.promise })
    deps.readPreviewSubject = async () => { await authorization.promise; return subject }
    const coordinator = createPreviewPreparationCoordinator(deps)
    const mutable = { ...request }
    const starting = coordinator.start(mutable)
    mutable.accountId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    authorization.resolve()
    try {
      const started = await starting
      assert.equal(started.subject.accountId, '11111111-1111-4111-8111-111111111111')
      assert.equal(deps.calls.preparations[0].accountId, '11111111-1111-4111-8111-111111111111')
    } finally {
      work.resolve(metadata)
      await coordinator.close()
    }
  })

  test('read cannot switch accounts while authorization is pending', async () => {
    const deps = makeDependencies()
    const coordinator = createPreviewPreparationCoordinator(deps)
    await coordinator.start(request)
    await tick()
    await coordinator.start({ ...request, accountId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' })
    await tick()
    const authorization = deferred()
    deps.readPreviewSubject = async () => { await authorization.promise; return subject }
    const mutable = { ...request }
    const reading = coordinator.read(mutable)
    mutable.accountId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    authorization.resolve()
    try {
      assert.equal((await reading).subject.accountId, '11111111-1111-4111-8111-111111111111')
    } finally { await coordinator.close() }
  })

  test('refuses revoked subjects and a wrong expected digest before preparation', async () => {
    const deps = makeDependencies()
    const coordinator = createPreviewPreparationCoordinator(deps)
    deps.setSubject({ ...subject, verified: false })
    await assert.rejects(coordinator.start(request), /PREVIEW_PREPARATION_SUBJECT_REFUSED/)
    deps.setSubject(subject)
    await assert.rejects(coordinator.start({ ...request, subjectDigest: 'c'.repeat(64) }), /PREVIEW_PREPARATION_SUBJECT_REFUSED/)
    assert.equal(deps.calls.preparations.length, 0)
    await coordinator.close()
  })

  test('refuses read after the authorized subject changes', async () => {
    const work = deferred()
    const deps = makeDependencies({ prepare: () => work.promise })
    const coordinator = createPreviewPreparationCoordinator(deps)
    await coordinator.start(request)
    deps.setSubject(null)
    await assert.rejects(coordinator.read(request), /PREVIEW_PREPARATION_SUBJECT_REFUSED/)
    work.resolve(metadata)
    await tick()
    await coordinator.close()
  })

  for (const [label, artifact] of [
    ['project', { ...metadata, projectId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }],
    ['source', { ...metadata, sourceRevision: 'b'.repeat(40) }],
  ]) {
    test(`fails closed when preparation returns an artifact for another ${label}`, async () => {
      const work = deferred()
      const deps = makeDependencies({ prepare: () => work.promise })
      const coordinator = createPreviewPreparationCoordinator(deps)
      const started = await coordinator.start(request)
      work.resolve(artifact)
      await tick()
      assert.deepEqual(await coordinator.read(request), {
        attemptId: started.attemptId,
        subject: { ...request, sourceRevision: revision },
        expiresAt: started.expiresAt,
        state: 'FAILED',
        code: 'PREPARATION_FAILED',
      })
      await coordinator.close()
    })
  }

  test('expires and aborts old work, then lets a fresh start replace it', async () => {
    const firstWork = deferred()
    const secondWork = deferred()
    let preparationNumber = 0
    let nowValue = 1_000
    const deps = makeDependencies({
      now: () => nowValue,
      timeoutMs: 10_000,
      prepare: _input => {
        preparationNumber += 1
        return (preparationNumber === 1 ? firstWork : secondWork).promise
      },
    })
    const coordinator = createPreviewPreparationCoordinator(deps)
    const first = await coordinator.start(request)
    nowValue += 10_001
    const expired = await coordinator.read(request)
    assert.equal(expired?.attemptId, first.attemptId)
    assert.equal(expired?.state, 'EXPIRED')
    assert.equal(deps.calls.preparations[0].signal.aborted, true)
    const replacement = await coordinator.start(request)
    assert.notEqual(replacement.attemptId, first.attemptId)
    firstWork.resolve(metadata)
    await tick()
    assert.equal((await coordinator.read(request))?.attemptId, replacement.attemptId)
    secondWork.resolve(metadata)
    await tick()
    assert.equal((await coordinator.read(request))?.state, 'PREPARED')
    nowValue += 10_001
    assert.equal((await coordinator.read(request))?.state, 'EXPIRED')
    await coordinator.close()
  })

  test('explicitly retries failed preparation with a fresh attempt', async () => {
    let preparationNumber = 0
    const deps = makeDependencies({
      prepare: async () => {
        preparationNumber += 1
        if (preparationNumber === 1) throw new Error('provider failed')
        return metadata
      },
    })
    const coordinator = createPreviewPreparationCoordinator(deps)
    const first = await coordinator.start(request)
    await tick()
    assert.equal((await coordinator.read(request))?.state, 'FAILED')
    const second = await coordinator.start(request)
    assert.notEqual(second.attemptId, first.attemptId)
    await tick()
    assert.equal((await coordinator.read(request))?.state, 'PREPARED')
    assert.equal(preparationNumber, 2)
    await coordinator.close()
  })

  test('refuses a distinct start at the active preparation cap before provider work', async () => {
    const work = deferred()
    const otherRequest = { ...request, accountId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }
    const deps = makeDependencies({ prepare: () => work.promise })
    const coordinator = createPreviewPreparationCoordinator({ ...deps, maxActive: 1 })
    await coordinator.start(request)
    await assert.rejects(coordinator.start(otherRequest), /PREVIEW_PREPARATION_BUSY/)
    assert.equal(deps.calls.preparations.length, 1)
    work.resolve(metadata)
    await coordinator.close()
  })

  test('close refuses new starts and drains aborted work before returning', async () => {
    const work = deferred()
    const deps = makeDependencies({ prepare: () => work.promise })
    const coordinator = createPreviewPreparationCoordinator(deps)
    await coordinator.start(request)
    let closed = false
    const closing = coordinator.close().then(() => { closed = true })
    let secondClosed = false
    const secondClosing = coordinator.close().then(() => { secondClosed = true })
    await tick()
    assert.equal(deps.calls.preparations[0].signal.aborted, true)
    assert.equal(closed, false)
    assert.equal(secondClosed, false)
    await assert.rejects(coordinator.start(request), /PREVIEW_PREPARATION_CLOSED/)
    work.resolve(metadata)
    await closing
    await secondClosing
    assert.equal(closed, true)
    const readsBeforeClosedRead = deps.calls.reads.length
    await assert.rejects(coordinator.read(request), /PREVIEW_PREPARATION_CLOSED/)
    assert.equal(deps.calls.reads.length, readsBeforeClosedRead)
  })
