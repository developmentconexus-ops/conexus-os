import assert from 'node:assert/strict'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
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

const createSourceFixture = () => {
  const root = mkdtempSync('/tmp/conexus-source-native-')
  const storageRoot = resolve(root, 'storage')
  const work = resolve(root, 'work')
  const repository = resolve(storageRoot, 'projects', projectId)
  mkdirSync(resolve(storageRoot, 'projects'), { recursive: true })
  mkdirSync(work)
  git(work, ['init', '--initial-branch=main'])
  writeFileSync(resolve(work, 'README.md'), 'base\n')
  git(work, ['add', '--all'])
  git(work, ['commit', '-m', 'baseline'])
  const baseline = git(work, ['rev-parse', 'HEAD'])
  git(root, ['clone', '--bare', work, repository])
  return { root, storageRoot, work, repository, baseline }
}

const createResultBundle = (fixture, { branch, base, files, message, extraRefs = [] }) => {
  git(fixture.work, ['checkout', '-B', branch, base])
  for (const [path, content] of Object.entries(files)) {
    const absolute = resolve(fixture.work, path)
    if (content === null) {
      rmSync(absolute, { force: true })
      continue
    }
    mkdirSync(resolve(absolute, '..'), { recursive: true })
    writeFileSync(absolute, content)
  }
  git(fixture.work, ['add', '--all'])
  git(fixture.work, ['commit', '-m', message])
  const revision = git(fixture.work, ['rev-parse', 'HEAD'])
  git(fixture.work, ['branch', '-f', 'conexus-result', 'HEAD'])
  const bundlePath = resolve(fixture.root, `${branch}.bundle`)
  git(fixture.work, ['bundle', 'create', bundlePath, 'refs/heads/conexus-result', ...extraRefs])
  return { revision, bundlePath }
}

const withSourcePort = async (fixture, sourceOwnership, callback) => {
  const dockerBin = fakeDocker(fixture.root)
  const oldPath = process.env.PATH
  process.env.PATH = `${dockerBin}:${oldPath}`
  try {
    return await callback(createBuilderSourcePort({
      git: { verifyAdmittedImage: async () => ({ status: 'VERIFIED' }), createProjectSourceBundle: async () => ({ status: 'BUNDLED' }) },
      storageRoot: fixture.storageRoot,
      sourceOwnership,
    }))
  } finally {
    process.env.PATH = oldPath
  }
}

test('C-020 source custody continues exact A to B to C without moving main', async () => {
  const fixture = createSourceFixture()
  const execution1 = '66666666-6666-4666-8666-666666666666'
  const execution2 = '77777777-7777-4777-8777-777777777777'
  const execution3 = '88888888-8888-4888-8888-888888888888'
  try {
    await withSourcePort(fixture, {}, async (port) => {
      const resultB = createResultBundle(fixture, {
        branch: 'result-b',
        base: fixture.baseline,
        files: { 'app/index.html': '<div id="root"></div>\n', 'app/src/main.tsx': 'export const count = 0\n' },
        message: 'create app',
      })
      const admittedB = await port.admitSourceResult({
        projectId, executionId: execution1, baseSourceRevision: fixture.baseline,
        claimedResultSourceRevision: resultB.revision, resultBundle: readFileSync(resultB.bundlePath),
      })
      assert.equal(admittedB.baseSourceRevision, fixture.baseline)
      assert.equal(admittedB.resultSourceRevision, resultB.revision)
      assert.equal(git(fixture.root, ['--git-dir', fixture.repository, 'rev-parse', 'refs/heads/main']), fixture.baseline)
      assert.equal(git(fixture.root, ['--git-dir', fixture.repository, 'rev-parse', `refs/conexus/sources/${resultB.revision}`]), resultB.revision)

      const preparedB = await port.prepareProjectSource({ projectId, executionId: execution2, sourceRevision: resultB.revision })
      const preparedBundle = resolve(fixture.root, 'prepared-b.bundle')
      writeFileSync(preparedBundle, preparedB)
      assert.match(git(fixture.root, ['bundle', 'list-heads', preparedBundle]), new RegExp(`${resultB.revision}\\s+refs/conexus/sources/${resultB.revision}`))

      const readmittedB = await port.admitSourceResult({
        projectId, executionId: execution2, baseSourceRevision: fixture.baseline,
        claimedResultSourceRevision: resultB.revision, resultBundle: readFileSync(resultB.bundlePath),
      })
      assert.equal(readmittedB.resultSourceRevision, resultB.revision)
      assert.equal(git(fixture.root, ['--git-dir', fixture.repository, 'rev-parse', `refs/conexus/sources/${resultB.revision}`]), resultB.revision)

      const resultC = createResultBundle(fixture, {
        branch: 'result-c',
        base: resultB.revision,
        files: { 'app/src/main.tsx': 'export const count = 1\n' },
        message: 'edit app created by Builder',
      })
      const admittedC = await port.admitSourceResult({
        projectId, executionId: execution3, baseSourceRevision: resultB.revision,
        claimedResultSourceRevision: resultC.revision, resultBundle: readFileSync(resultC.bundlePath),
      })
      assert.equal(admittedC.baseSourceRevision, resultB.revision)
      assert.equal(admittedC.resultSourceRevision, resultC.revision)
      assert.equal(git(fixture.root, ['--git-dir', fixture.repository, 'rev-parse', 'refs/heads/main']), fixture.baseline)
      assert.equal(git(fixture.root, ['--git-dir', fixture.repository, 'rev-parse', `refs/conexus/sources/${resultB.revision}`]), resultB.revision)
      assert.equal(git(fixture.root, ['--git-dir', fixture.repository, 'rev-parse', `refs/conexus/sources/${resultC.revision}`]), resultC.revision)
    })
  } finally {
    rmSync(fixture.root, { recursive: true, force: true })
  }
})

test('C-020 source preparation refuses stale or unreachable source subjects', async () => {
  const fixture = createSourceFixture()
  try {
    await withSourcePort(fixture, {}, async (port) => {
      const stale = 'b'.repeat(40)
      git(fixture.root, ['--git-dir', fixture.repository, 'update-ref', `refs/conexus/sources/${stale}`, fixture.baseline])
      await assert.rejects(port.prepareProjectSource({ projectId, executionId: actorRunId, sourceRevision: stale }), /SOURCE_REF_MISMATCH/)
      const missing = 'c'.repeat(40)
      await assert.rejects(port.prepareProjectSource({ projectId, executionId: actorRunId, sourceRevision: missing }), /SOURCE_NOT_FOUND/)
    })
  } finally {
    rmSync(fixture.root, { recursive: true, force: true })
  }
})

test('C-020 result admission refuses invalid ancestry and mutation shapes', async () => {
  const cases = [
    {
      name: 'multi-commit result',
      create: (fixture) => {
        const intermediate = createResultBundle(fixture, { branch: 'result-x', base: fixture.baseline, files: { 'app/one.ts': 'one\n' }, message: 'intermediate' })
        return createResultBundle(fixture, { branch: 'result-multi', base: intermediate.revision, files: { 'app/one.ts': 'two\n' }, message: 'second commit' })
      },
      error: /MULTI_COMMIT_RESULT/,
      base: (fixture) => fixture.baseline,
    },
    {
      name: 'wrong parent',
      create: (fixture) => {
        git(fixture.work, ['checkout', '--orphan', 'wrong-parent'])
        git(fixture.work, ['rm', '-rf', '.'])
        mkdirSync(resolve(fixture.work, 'app'), { recursive: true })
        writeFileSync(resolve(fixture.work, 'app', 'wrong.ts'), 'wrong\n')
        git(fixture.work, ['add', '--all'])
        git(fixture.work, ['commit', '-m', 'wrong parent'])
        const wrong = git(fixture.work, ['rev-parse', 'HEAD'])
        git(fixture.work, ['branch', '-f', 'conexus-result', 'HEAD'])
        const bundlePath = resolve(fixture.root, 'wrong-parent.bundle')
        git(fixture.work, ['bundle', 'create', bundlePath, 'refs/heads/conexus-result', fixture.baseline])
        return { revision: wrong, bundlePath }
      },
      error: /NON_DESCENDANT/,
      base: (fixture) => fixture.baseline,
    },
    {
      name: 'non-app mutation',
      create: (fixture) => createResultBundle(fixture, { branch: 'result-readme', base: fixture.baseline, files: { 'README.md': 'changed\n' }, message: 'change README' }),
      error: /MUTATION_BOUNDARY_REFUSED/,
      base: (fixture) => fixture.baseline,
    },
  ]
  for (const scenario of cases) {
    const fixture = createSourceFixture()
    try {
      await withSourcePort(fixture, {}, async (port) => {
        const result = scenario.create(fixture)
        await assert.rejects(port.admitSourceResult({
          projectId, executionId: actorRunId, baseSourceRevision: scenario.base(fixture),
          claimedResultSourceRevision: result.revision, resultBundle: readFileSync(result.bundlePath),
        }), scenario.error, scenario.name)
      })
    } finally {
      rmSync(fixture.root, { recursive: true, force: true })
    }
  }
})

test('C-020 result admission refuses unsafe entries and source-ref collisions', async () => {
  const fixture = createSourceFixture()
  try {
    await withSourcePort(fixture, {}, async (port) => {
      git(fixture.work, ['checkout', '-B', 'result-link', fixture.baseline])
      mkdirSync(resolve(fixture.work, 'app'), { recursive: true })
      symlinkSync('../README.md', resolve(fixture.work, 'app/link'))
      git(fixture.work, ['add', '--all'])
      git(fixture.work, ['commit', '-m', 'unsafe link'])
      const unsafe = git(fixture.work, ['rev-parse', 'HEAD'])
      git(fixture.work, ['branch', '-f', 'conexus-result', 'HEAD'])
      const unsafeBundle = resolve(fixture.root, 'unsafe.bundle')
      git(fixture.work, ['bundle', 'create', unsafeBundle, 'refs/heads/conexus-result'])
      await assert.rejects(port.admitSourceResult({
        projectId, executionId: actorRunId, baseSourceRevision: fixture.baseline,
        claimedResultSourceRevision: unsafe, resultBundle: readFileSync(unsafeBundle),
      }), /UNSAFE_ENTRY/)

      const collision = createResultBundle(fixture, { branch: 'result-collision', base: fixture.baseline, files: { 'app/collision.ts': 'collision\n' }, message: 'collision result' })
      git(fixture.root, ['--git-dir', fixture.repository, 'update-ref', `refs/conexus/sources/${collision.revision}`, fixture.baseline])
      await assert.rejects(port.admitSourceResult({
        projectId, executionId: actorRunId, baseSourceRevision: fixture.baseline,
        claimedResultSourceRevision: collision.revision, resultBundle: readFileSync(collision.bundlePath),
      }), /SOURCE_REF_COLLISION/)
      assert.equal(git(fixture.root, ['--git-dir', fixture.repository, 'rev-parse', `refs/conexus/sources/${collision.revision}`]), fixture.baseline)
    })
  } finally {
    rmSync(fixture.root, { recursive: true, force: true })
  }
})

test('Builder admits a source-oriented BuilderRun result without moving main', async () => {
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
      mkdirSync(resolve(work, 'app'), { recursive: true })
      writeFileSync(resolve(work, 'app', 'source.ts'), 'source-oriented\n')
      git(work, ['add', 'app/source.ts'])
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
      assert.equal(sourceAdmission.resultSourceRevision, sourceResult)
      assert.equal(git(root, ['--git-dir', repository, 'rev-parse', `refs/conexus/sources/${sourceResult}`]), sourceResult)
      assert.notEqual(spawnSync('git', ['--git-dir', repository, 'show-ref', `refs/conexus/changes/${executionId}`], { encoding: 'utf8' }).status, 0)
      const readmitted = await port.admitSourceResult({
        projectId, executionId, baseSourceRevision: baseline,
        claimedResultSourceRevision: sourceResult, resultBundle: readFileSync(sourceResultBundle),
      })
      assert.equal(readmitted.resultSourceRevision, sourceResult)
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
