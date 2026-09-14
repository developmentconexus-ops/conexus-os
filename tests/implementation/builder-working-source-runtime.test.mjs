import assert from 'node:assert/strict'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const buildRoot = mkdtempSync(resolve(repositoryRoot, 'apps/hub/working-source-build-'))
const compiled = spawnSync(resolve(repositoryRoot, 'node_modules/.bin/esbuild'), [
  resolve(repositoryRoot, 'apps/hub/src/builder/source.ts'), resolve(repositoryRoot, 'apps/hub/src/builder/runtime.ts'),
  `--outdir=${buildRoot}`, '--bundle', '--platform=node', '--format=esm', '--packages=external', '--log-level=error',
], { cwd: repositoryRoot, encoding: 'utf8' })
if (compiled.status !== 0) throw new Error(compiled.stdout || compiled.stderr)
const built = (path) => pathToFileURL(resolve(buildRoot, path)).href
const { createBuilderSourcePort } = await import(built('source.js'))
const { classifyCodingResult, createMastraE2BCodingWorkerRuntime } = await import(built('runtime.js'))

test.after(() => rmSync(buildRoot, { recursive: true, force: true }))

const projectId = '11111111-1111-4111-8111-111111111111'
const currentChangeId = '22222222-2222-4222-8222-222222222222'
const parentChangeId = '99999999-9999-4999-8999-999999999999'
const actorRunId = '44444444-4444-4444-8444-444444444444'

const git = (cwd, args, env = {}) => {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_AUTHOR_NAME: 'Conexus working-source fixture',
      GIT_AUTHOR_EMAIL: 'working-source@conexus.invalid',
      GIT_COMMITTER_NAME: 'Conexus working-source fixture',
      GIT_COMMITTER_EMAIL: 'working-source@conexus.invalid',
      ...env,
    },
  })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

const fakeDocker = (root) => {
  const bin = resolve(root, 'bin')
  mkdirSync(bin)
  const executable = resolve(bin, 'docker')
  writeFileSync(executable, `#!/usr/bin/env node
const { spawnSync } = require('node:child_process')
const args = process.argv.slice(2)
const mounts = new Map()
for (let index = 0; index < args.length; index += 1) {
  if (args[index] !== '--mount') continue
  const value = args[index + 1] || ''
  const parts = Object.fromEntries(value.split(',').map(part => part.split('=')))
  if (parts.src && parts.dst) mounts.set(parts.dst, parts.src)
}
const source = args[args.indexOf('-e') + 1]
if (typeof source !== 'string') process.exit(91)
let rewritten = source
for (const [destination, local] of [...mounts.entries()].sort((left, right) => right[0].length - left[0].length)) {
  rewritten = rewritten.split(destination).join(local)
}
rewritten = rewritten.split('/usr/local/bin/git').join('git')
rewritten = rewritten.split('/tmp/inspect.git').join(require('node:fs').mkdtempSync('/tmp/conexus-fake-inspect-'))
const result = spawnSync(process.execPath, ['-e', rewritten], { encoding: 'utf8' })
process.stdout.write(result.stdout || '')
process.stderr.write(result.stderr || '')
process.exit(result.status === null ? 92 : result.status)
`)
  chmodSync(executable, 0o755)
  return bin
}

test('Builder admits a new Change from an exact prior Change source without moving main', async () => {
  const root = mkdtempSync('/tmp/conexus-working-source-')
  const storageRoot = resolve(root, 'storage')
  const work = resolve(root, 'work')
  const repository = resolve(storageRoot, 'projects', projectId)
  const resultBundle = resolve(root, 'result.bundle')
  mkdirSync(resolve(storageRoot, 'projects'), { recursive: true })
  mkdirSync(work)
  try {
    git(work, ['init', '--initial-branch=main'])
    writeFileSync(resolve(work, 'README.md'), 'base\n')
    git(work, ['add', '--all'])
    git(work, ['commit', '-m', 'baseline'])
    const baseline = git(work, ['rev-parse', 'HEAD'])
    git(root, ['clone', '--bare', work, repository])

    git(work, ['checkout', '-B', 'parent', baseline])
    writeFileSync(resolve(work, 'app.txt'), 'parent\n')
    git(work, ['add', 'app.txt'])
    git(work, ['commit', '-m', 'parent'])
    const parent = git(work, ['rev-parse', 'HEAD'])
    git(root, ['--git-dir', repository, 'fetch', work, parent])
    git(root, ['--git-dir', repository, 'update-ref', `refs/conexus/changes/${parentChangeId}`, parent])

    git(work, ['checkout', '-B', 'result', parent])
    writeFileSync(resolve(work, 'app.txt'), 'parent\nchild\n')
    git(work, ['add', 'app.txt'])
    git(work, ['commit', '-m', 'child'])
    const candidate = git(work, ['rev-parse', 'HEAD'])
    git(work, ['branch', '-f', 'conexus-result', 'HEAD'])
    git(work, ['bundle', 'create', resultBundle, 'refs/heads/conexus-result'])

    const dockerBin = fakeDocker(root)
    const oldPath = process.env.PATH
    process.env.PATH = `${dockerBin}:${oldPath}`
    try {
      const port = createBuilderSourcePort({
        git: { verifyAdmittedImage: async () => ({ status: 'VERIFIED' }), createProjectSourceBundle: async () => ({ status: 'BUNDLED' }) },
        storageRoot,
        sourceOwnership: { 'app.txt': 'APP-OWNED' },
      })
      git(work, ['checkout', '-B', 'source-result', baseline])
      writeFileSync(resolve(work, 'app.txt'), 'source-oriented\n')
      git(work, ['add', 'app.txt'])
      git(work, ['commit', '-m', 'source-oriented result'])
      const sourceResult = git(work, ['rev-parse', 'HEAD'])
      const sourceResultBundle = resolve(root, 'source-result.bundle')
      git(work, ['branch', '-f', 'conexus-result', 'HEAD'])
      git(work, ['bundle', 'create', sourceResultBundle, 'refs/heads/conexus-result'])
      const executionId = '66666666-6666-4666-8666-666666666666'
      const sourceAdmission = await port.admitSourceResult({
        projectId, executionId, baseSourceRevision: baseline,
        claimedResultSourceRevision: sourceResult, resultBundle: readFileSync(sourceResultBundle),
      })
      assert.equal(sourceAdmission.candidateSourceRevision, sourceResult)
      assert.equal(git(root, ['--git-dir', repository, 'rev-parse', `refs/conexus/sources/${sourceResult}`]), sourceResult)
      assert.notEqual(spawnSync('git', ['--git-dir', repository, 'show-ref', `refs/conexus/changes/${executionId}`], { encoding: 'utf8' }).status, 0)
      await assert.rejects(port.admitSourceResult({
        projectId, executionId, baseSourceRevision: baseline,
        claimedResultSourceRevision: sourceResult, resultBundle: readFileSync(sourceResultBundle),
      }), /CURRENT_CANDIDATE_STALE/)
      assert.equal(git(root, ['--git-dir', repository, 'rev-parse', 'refs/heads/main']), baseline)
      assert.equal(git(root, ['--git-dir', repository, 'rev-parse', `refs/conexus/changes/${parentChangeId}`]), parent)
      const parentBundle = await port.prepareSource({
        projectId, actorRunId, sourceRevision: parent, sourceChangeId: parentChangeId, initialSourceRevision: baseline,
      })
      assert.ok(parentBundle.byteLength > 0)
      const admitted = await port.admitCandidate({
        projectId, changeId: currentChangeId, actorRunId,
        sourceChangeId: parentChangeId,
        baselineSourceRevision: baseline,
        baseSourceRevision: parent,
        claimedCandidateSourceRevision: candidate,
        resultBundle: readFileSync(resultBundle),
      })
      assert.equal(admitted.baseSourceRevision, parent)
      assert.equal(admitted.candidateSourceRevision, candidate)
      assert.match(admitted.patch, /child/)
      assert.equal(git(root, ['--git-dir', repository, 'rev-parse', 'refs/heads/main']), baseline)
      assert.equal(git(root, ['--git-dir', repository, 'rev-parse', `refs/conexus/changes/${currentChangeId}`]), candidate)
    } finally {
      process.env.PATH = oldPath
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('Coding result classification preserves a response-only turn without a candidate', () => {
  assert.deepEqual(classifyCodingResult({ changed: false, summary: 'No source change was needed.' }), {
    kind: 'RESPONSE_ONLY',
    summary: 'No source change was needed.',
  })
  assert.deepEqual(classifyCodingResult({ changed: true, summary: 'Updated the app.' }), {
    kind: 'CANDIDATE',
    summary: 'Updated the app.',
  })
})

test('Coding worker bounds continuity context before provider access', async () => {
  let credentialValidations = 0
  const runtime = createMastraE2BCodingWorkerRuntime({
    apiKey: 'fixture-key',
    templateId: 'fixture:11111111-1111-4111-8111-111111111111',
    model: { modelId: 'fixture-model' },
    modelIdentity: { admissionId: 'fixture-admission', providerId: 'fixture-provider', modelId: 'fixture-model' },
    validateModelCredential: () => { credentialValidations += 1 },
  })
  await assert.rejects(runtime.execute({
    projectId,
    changeId: currentChangeId,
    workUnitId: '33333333-3333-4333-8333-333333333333',
    actorRunId,
    admissionToken: '55555555-5555-4555-8555-555555555555',
    intent: 'Continue the app work.',
    baseSourceRevision: 'a'.repeat(40),
    sourceBundle: new Uint8Array([1]),
    recentTurns: Array.from({ length: 9 }, (_, index) => ({ intent: `intent-${index}`, summary: `summary-${index}` })),
    bindPhysicalSandbox: async () => {},
  }), /BUILDER_RUNTIME_CONTEXT_REFUSED/)
  assert.equal(credentialValidations, 0)
})
