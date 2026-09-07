import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { canonicalBytes, sha256 } from '../../packages/canonical-json/src/index.mjs'

const root = resolve(import.meta.dirname, '../..')
const build = mkdtempSync(resolve(root, 'apps/hub/r2-p4-brain-source-build-'))
process.once('exit', () => rmSync(build, { recursive: true, force: true }))
const compiled = spawnSync(process.execPath, [resolve(root, 'node_modules/typescript/bin/tsc'),
  '--project', resolve(root, 'apps/hub/tsconfig.json'), '--noEmit', 'false', '--outDir', build], { encoding: 'utf8' })
assert.equal(compiled.status, 0, `${compiled.stdout}\n${compiled.stderr}`)
const built = (path) => pathToFileURL(resolve(build, path)).href
const {
  readProjectBrainRealization,
  readProjectBrainRealizationManifest,
  BRAIN_REALIZATION_PATH,
} = await import(built('project/brain-realization.js'))
const { createProjectSourceSnapshot } = await import(built('project/source-snapshot.js'))
const { composeProjectSourceOwnership } = await import(built('project/module.js'))
const sourceRevision = 'a'.repeat(40)
const binary = Buffer.from([0, 128, 255, 13])
const brain = () => ({ schemaVersion: 'conexus-brain/v2', reviewText: 'Synthetic.',
  knowledgeBrowse: { domains: [] }, items: [], assertions: [] })
const manifest = () => ({ schemaVersion: 'conexus-project-brain-realization/v1', selectedRoots: [], mappings: [],
  sourceInputs: [{ path: 'assets/data.bin', digest: sha256(binary) }] })
const fixture = () => {
  const bytes = canonicalBytes(manifest())
  const entries = [
    { path: BRAIN_REALIZATION_PATH, digest: sha256(bytes), byteLength: bytes.length,
      ownershipClass: 'APP-OWNED', mediaType: 'text/plain; charset=utf-8' },
    { path: 'assets/data.bin', digest: sha256(binary), byteLength: binary.length,
      ownershipClass: 'APP-OWNED', mediaType: 'application/octet-stream' },
  ]
  let reads = 0
  const source = { sourceRevision, listPaths: async () => entries, readBatch: async (paths) => {
    reads++
    assert.deepEqual(paths, [BRAIN_REALIZATION_PATH])
    return [{ path: BRAIN_REALIZATION_PATH, digest: sha256(bytes), utf8Bytes: bytes.toString('utf8') }]
  } }
  return { bytes, entries, source, get reads() { return reads },
    run: () => readProjectBrainRealization({ source, expectedSourceRevision: sourceRevision, brainSource: brain() }),
    runManifest: () => readProjectBrainRealizationManifest({ source, expectedSourceRevision: sourceRevision }) }
}

test('frozen source verifies manifest bytes and APP input hashes including binary files', async () => {
  const f = fixture()
  const result = await f.run()
  assert.equal(result.sourceRevision, sourceRevision)
  assert.equal(result.manifestDigest, sha256(f.bytes))
  assert.equal(result.inputDigest, sha256(canonicalBytes(manifest())))
  assert.deepEqual(result.sourceFiles, [{ path: 'assets/data.bin', digest: sha256(binary), byteLength: binary.length }])
  assert.equal(f.reads, 2)
  f.entries[1].digest = 'f'.repeat(64)
  assert.equal(result.sourceFiles[0].digest, sha256(binary))
  assert.equal(Object.isFrozen(result.sourceFiles[0]), true)
})

test('trusted source resolves canonical manifest identity and mapping data without a Brain payload', async () => {
  const f = fixture()
  const result = await f.runManifest()
  assert.equal(result.sourceRevision, sourceRevision)
  assert.equal(result.inputDigest, sha256(canonicalBytes(manifest())))
  assert.deepEqual(result.manifest.mappings, [])
  assert.deepEqual(result.sourceFiles, [{ path: 'assets/data.bin', digest: sha256(binary), byteLength: binary.length }])
  assert.equal(f.reads, 2)
  assert.equal(Object.isFrozen(result.manifest), true)
  assert.equal('brainSource' in result, false)
  assert.equal('expectedInputDigest' in result, false)
})

test('frozen source refuses missing or non-APP files, malformed listing and mismatched input digest', async () => {
  for (const change of [
    (f) => { f.entries.shift() },
    (f) => { f.entries.pop() },
    (f) => { f.entries[0].ownershipClass = 'PLATFORM-CONTRACT' },
    (f) => { f.entries[1].ownershipClass = 'GENERATED' },
    (f) => { f.entries[1].ownershipClass = 'PLATFORM-CONTRACT' },
    (f) => { f.entries.push(null) },
    (f) => { f.entries[1].digest = 'b'.repeat(64) },
    (f) => { f.entries.push({ ...f.entries[1] }) },
    (f) => { f.entries[1].byteLength = -1 },
    (f) => { f.entries[0].byteLength = 262_145 },
  ]) {
    const f = fixture()
    change(f)
    await assert.rejects(f.run, /PROJECT_BRAIN_SOURCE_REFUSED/, change.toString())
  }
})

test('frozen source hashes returned manifest bytes and refuses source changes between reads', async () => {
  const forged = fixture()
  const originalRead = forged.source.readBatch
  forged.source.readBatch = async (paths) => (await originalRead(paths)).map((file) => ({ ...file,
    utf8Bytes: file.utf8Bytes.replace('data.bin', 'fake.bin') }))
  await assert.rejects(forged.run, /PROJECT_BRAIN_SOURCE_REFUSED/)
  const malformed = fixture()
  const invalidBytes = Buffer.from('{not JSON}')
  malformed.entries[0].digest = sha256(invalidBytes)
  malformed.entries[0].byteLength = invalidBytes.length
  malformed.source.readBatch = async () => [{ path: BRAIN_REALIZATION_PATH,
    digest: sha256(invalidBytes), utf8Bytes: invalidBytes.toString('utf8') }]
  await assert.rejects(malformed.run, /PROJECT_BRAIN_SOURCE_REFUSED/)
  const stale = fixture()
  const read = stale.source.readBatch
  stale.source.readBatch = async (paths) => {
    if (stale.reads === 1) throw new Error('PRJ07_SOURCE_STALE')
    return read(paths)
  }
  await assert.rejects(stale.run, /PRJ07_SOURCE_STALE/)
  const wrong = fixture()
  wrong.source.sourceRevision = 'b'.repeat(40)
  await assert.rejects(wrong.run, /PROJECT_BRAIN_SOURCE_STALE/)
  assert.equal(wrong.reads, 0)
})

test('frozen source captures Brain input before asynchronous reads', async () => {
  const f = fixture()
  const input = brain()
  f.source.listPaths = async () => { input.schemaVersion = 'invalid'; return f.entries }
  const result = await readProjectBrainRealization({ source: f.source, expectedSourceRevision: sourceRevision, brainSource: input })
  assert.deepEqual(result.applicableItemIds, [])
})

const treeBytes = (directory, prefix = '') => Object.fromEntries(readdirSync(resolve(directory, prefix), { withFileTypes: true })
  .flatMap((entry) => {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name
    return entry.isDirectory() ? Object.entries(treeBytes(directory, path)) : [[path, readFileSync(resolve(directory, path)).toString('base64')]]
  }).sort(([a], [b]) => a.localeCompare(b)))

test('real OCI Git snapshot verifies frozen Brain APP source without mutating repository', {
  skip: process.env.CONEXUS_R2_P4_GIT_LIVE === 'true' ? false : 'requires admitted local OCI Git image', timeout: 360_000,
}, async (t) => {
  const storageRoot = mkdtempSync('/tmp/conexus-brain-source-proof-')
  t.after(() => rmSync(storageRoot, { recursive: true, force: true }))
  const projectId = randomUUID()
  const repository = resolve(storageRoot, 'projects', projectId)
  mkdirSync(repository, { recursive: true })
  // Host Git constructs only synthetic fixture objects. Deciding reads below
  // use the production snapshot and its exact pinned OCI Git executable.
  const git = (args, input) => {
    const result = spawnSync('git', ['--git-dir', repository, ...args], { input, encoding: 'utf8', env: {
      ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
      GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
    } })
    assert.equal(result.status, 0, result.stderr)
    return result.stdout.trim()
  }
  git(['init', '--bare'])
  const manifestBytes = canonicalBytes(manifest())
  const manifestBlob = git(['hash-object', '-w', '--stdin'], manifestBytes)
  const binaryBlob = git(['hash-object', '-w', '--stdin'], binary)
  const brainTree = git(['mktree'], `100644 blob ${manifestBlob}\trealization.json\n`)
  const conexusTree = git(['mktree'], `040000 tree ${brainTree}\tbrain\n`)
  const assetsTree = git(['mktree'], `100644 blob ${binaryBlob}\tdata.bin\n`)
  const rootTree = git(['mktree'], `040000 tree ${conexusTree}\t.conexus\n040000 tree ${assetsTree}\tassets\n`)
  const revision = git(['commit-tree', rootTree, '-m', 'Synthetic source fixture'])
  git(['update-ref', 'refs/heads/main', revision])
  const ownership = composeProjectSourceOwnership({ 'assets/data.bin': 'APP-OWNED' })
  const snapshot = createProjectSourceSnapshot({ storageRoot, projectId, sourceRevision: revision, ownership })
  const before = treeBytes(repository)
  const read = () => readProjectBrainRealization({ source: snapshot, expectedSourceRevision: revision, brainSource: brain() })
  const result = await read()
  assert.equal(result.manifestDigest, sha256(manifestBytes))
  assert.equal(result.sourceFiles[0].digest, sha256(binary))
  assert.deepEqual(treeBytes(repository), before)
  const changedBlob = git(['hash-object', '-w', '--stdin'], Buffer.from([0, 1, 2]))
  const changedAssets = git(['mktree'], `100644 blob ${changedBlob}\tdata.bin\n`)
  const changedTree = git(['mktree'], `040000 tree ${conexusTree}\t.conexus\n040000 tree ${changedAssets}\tassets\n`)
  const next = git(['commit-tree', changedTree, '-p', revision, '-m', 'Changed file without updating manifest'])
  git(['update-ref', 'refs/heads/main', next, revision])
  const changed = treeBytes(repository)
  await assert.rejects(read, /PRJ07_SOURCE_STALE/)
  await assert.rejects(() => readProjectBrainRealization({
    source: createProjectSourceSnapshot({ storageRoot, projectId, sourceRevision: next, ownership }),
    expectedSourceRevision: next, brainSource: brain(),
  }), /PROJECT_BRAIN_SOURCE_REFUSED/)
  assert.deepEqual(treeBytes(repository), changed)
  t.diagnostic(`verified immutable source ${revision}; refused current-head drift to ${next}`)
})
