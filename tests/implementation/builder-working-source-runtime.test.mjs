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
  resolve(repositoryRoot, 'apps/hub/src/platform/oci-git.ts'),
  resolve(repositoryRoot, 'apps/hub/src/generated/r1c14-git-identity.ts'),
  `--outdir=${buildRoot}`, `--outbase=${resolve(repositoryRoot, 'apps/hub/src')}`,
  '--bundle', '--platform=node', '--format=esm', '--packages=external', '--log-level=error',
], { cwd: repositoryRoot, encoding: 'utf8' })
if (compiled.status !== 0) throw new Error(compiled.stdout || compiled.stderr)
const built = (path) => pathToFileURL(resolve(buildRoot, path)).href
const { createBuilderSourcePort } = await import(built('builder/source.js'))
const { admitApplicationTree, classifyCodingResult } = await import(built('builder/runtime.js'))
const { createOciGitExecution } = await import(built('platform/oci-git.js'))
const { R1C14_GIT_IDENTITY } = await import(built('generated/r1c14-git-identity.js'))

test.after(() => rmSync(buildRoot, { recursive: true, force: true }))

const projectId = '11111111-1111-4111-8111-111111111111'
const executionId = '44444444-4444-4444-8444-444444444444'

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
const userIndex = args.indexOf('--user')
const user = userIndex >= 0 ? args[userIndex + 1] || '' : ''
if (!/^[0-9]+:[0-9]+$/.test(user)) {
  process.stderr.write('FAKE_DOCKER_INVALID_USER\\n')
  process.exit(93)
}
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
rewritten = rewritten.split('/tmp/source-export.git').join(require('node:fs').mkdtempSync('/tmp/conexus-fake-source-export-'))
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

const completed = (stdout) => ({ exitCode: 0, signal: null, stdout, stderr: '', overflow: false, spawnError: false })

// The three image-identity probes are answered from the pinned identity so the
// suite exercises the shared container preamble without a real admitted image.
const fakeOciRunner = (dockerPath) => (_executable, args, limits) => {
  if (args[0] === 'image') return Promise.resolve(completed(`${R1C14_GIT_IDENTITY.ociIndexDigest}\n`))
  if (args.at(-1) === '--version') return Promise.resolve(completed(`git version ${R1C14_GIT_IDENTITY.gitVersion}\n`))
  if (!args.includes('--mount')) return Promise.resolve(completed(`${R1C14_GIT_IDENTITY.gitExecutableSha256}\n`))
  const result = spawnSync(dockerPath, args, {
    encoding: 'utf8',
    maxBuffer: limits?.maxOutputBytes ?? 64 * 1024,
    timeout: limits?.timeoutMs ?? 60_000,
  })
  return Promise.resolve({
    exitCode: result.status,
    signal: result.signal ?? null,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    overflow: false,
    spawnError: Boolean(result.error),
  })
}

const withSourcePort = async (fixture, sourceOwnership, callback) => {
  const dockerBin = fakeDocker(fixture.root)
  return callback(createBuilderSourcePort({
    git: createOciGitExecution(R1C14_GIT_IDENTITY, fakeOciRunner(resolve(dockerBin, 'docker'))),
    storageRoot: fixture.storageRoot,
    sourceOwnership,
  }))
}

const countingGit = (execution, runs) => Object.freeze({
  verifyAdmittedImage: () => execution.verifyAdmittedImage(),
  runGitProgram: (input) => { runs.count += 1; return execution.runGitProgram(input) },
})

test('C-020 disclosing many files costs one container run, not one per file', async () => {
  const fixture = createSourceFixture()
  const contents = {
    'app/index.html': '<div id="root"></div>\n',
    'app/package.json': '{ "name": "app" }\n',
    'app/src/main.tsx': 'export const count = 0\n',
    'app/src/app.tsx': 'export const App = () => null\n',
    'app/src/style.css': 'body { margin: 0 }\n',
    'app/src/label.ts': 'export const label = "acentuacao"\n',
  }
  try {
    const revision = commitAppRevision(fixture, contents)
    const dockerBin = fakeDocker(fixture.root)
    const runs = { count: 0 }
    const port = createBuilderSourcePort({
      git: countingGit(createOciGitExecution(R1C14_GIT_IDENTITY, fakeOciRunner(resolve(dockerBin, 'docker'))), runs),
      storageRoot: fixture.storageRoot,
    })
    const paths = Object.keys(contents)
    const disclosed = await port.readSourceFiles({ projectId, sourceRevision: revision, paths })
    assert.equal(runs.count, 1, 'six files, one container run')
    for (const file of disclosed.files) assert.equal(file.content, contents[file.path])

    // The Code lens still asks for one file at a time, and each of those is its own
    // container run. That is the cost the batch removes from every build.
    const batched = runs.count
    for (const path of paths) {
      assert.equal((await port.readSourceFile({ projectId, sourceRevision: revision, path })).content, contents[path])
    }
    assert.equal(runs.count - batched, paths.length)
  } finally {
    rmSync(fixture.root, { recursive: true, force: true })
  }
})

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
      assert.match(git(fixture.root, ['bundle', 'list-heads', preparedBundle]), new RegExp(`${resultB.revision}\\s+refs/heads/main`))
      const materialized = resolve(fixture.root, 'materialized-b')
      git(fixture.root, ['init', '--initial-branch=main', materialized])
      git(fixture.root, ['-C', materialized, 'fetch', '--no-tags', preparedBundle, 'refs/heads/main:refs/heads/conexus-source'])
      git(fixture.root, ['-C', materialized, 'checkout', '--detach', resultB.revision])
      assert.equal(git(fixture.root, ['-C', materialized, 'rev-parse', 'HEAD']), resultB.revision)
      assert.equal(readFileSync(resolve(materialized, 'app/src/main.tsx'), 'utf8'), 'export const count = 0\n')

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
      await assert.rejects(port.prepareProjectSource({ projectId, executionId: executionId, sourceRevision: stale }), /SOURCE_REF_MISMATCH/)
      const missing = 'c'.repeat(40)
      await assert.rejects(port.prepareProjectSource({ projectId, executionId: executionId, sourceRevision: missing }), /SOURCE_NOT_FOUND/)
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
          projectId, executionId: executionId, baseSourceRevision: scenario.base(fixture),
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
        projectId, executionId: executionId, baseSourceRevision: fixture.baseline,
        claimedResultSourceRevision: unsafe, resultBundle: readFileSync(unsafeBundle),
      }), /UNSAFE_ENTRY/)

      const collision = createResultBundle(fixture, { branch: 'result-collision', base: fixture.baseline, files: { 'app/collision.ts': 'collision\n' }, message: 'collision result' })
      git(fixture.root, ['--git-dir', fixture.repository, 'update-ref', `refs/conexus/sources/${collision.revision}`, fixture.baseline])
      await assert.rejects(port.admitSourceResult({
        projectId, executionId: executionId, baseSourceRevision: fixture.baseline,
        claimedResultSourceRevision: collision.revision, resultBundle: readFileSync(collision.bundlePath),
      }), /SOURCE_REF_COLLISION/)
      assert.equal(git(fixture.root, ['--git-dir', fixture.repository, 'rev-parse', `refs/conexus/sources/${collision.revision}`]), fixture.baseline)
    })
  } finally {
    rmSync(fixture.root, { recursive: true, force: true })
  }
})

test('C-020 the Hub re-read is the only authority for the result source revision', async () => {
  const fixture = createSourceFixture()
  try {
    await withSourcePort(fixture, {}, async (port) => {
      const honest = createResultBundle(fixture, {
        branch: 'result-honest', base: fixture.baseline,
        files: { 'app/index.ts': 'export const value = 1\n' }, message: 'honest result',
      })
      const wrong = createResultBundle(fixture, {
        branch: 'result-other', base: fixture.baseline,
        files: { 'app/index.ts': 'export const value = 2\n' }, message: 'other result',
      })
      assert.notEqual(honest.revision, wrong.revision)

      // A sandbox that reports a revision other than the one the bundle carries
      // must fail the run by name, never have its claim recorded.
      await assert.rejects(port.admitSourceResult({
        projectId, executionId, baseSourceRevision: fixture.baseline,
        claimedResultSourceRevision: wrong.revision, resultBundle: readFileSync(honest.bundlePath),
      }), /SANDBOX_REVISION_MISMATCH/)
      assert.equal(git(fixture.root, ['--git-dir', fixture.repository, 'rev-parse', 'refs/heads/main']), fixture.baseline)
      for (const revision of [honest.revision, wrong.revision]) {
        const stored = spawnSync('git', ['--git-dir', fixture.repository, 'rev-parse', '--verify', `refs/conexus/sources/${revision}`], { encoding: 'utf8' })
        assert.notEqual(stored.status, 0, `no source ref may exist for ${revision}`)
      }

      const admitted = await port.admitSourceResult({
        projectId, executionId, baseSourceRevision: fixture.baseline,
        claimedResultSourceRevision: honest.revision, resultBundle: readFileSync(honest.bundlePath),
      })
      assert.equal(admitted.resultSourceRevision, honest.revision)
    })
  } finally {
    rmSync(fixture.root, { recursive: true, force: true })
  }
})

const commitAppRevision = (fixture, files) => {
  git(fixture.work, ['checkout', '-B', 'app-base', fixture.baseline])
  for (const [path, content] of Object.entries(files)) {
    const absolute = resolve(fixture.work, path)
    mkdirSync(resolve(absolute, '..'), { recursive: true })
    writeFileSync(absolute, content)
  }
  git(fixture.work, ['add', '--all'])
  git(fixture.work, ['commit', '-m', 'app revision'])
  const revision = git(fixture.work, ['rev-parse', 'HEAD'])
  git(fixture.root, ['--git-dir', fixture.repository, 'fetch', '--no-tags', fixture.work, `+refs/heads/app-base:refs/conexus/sources/${revision}`])
  return revision
}

test('C-020 one undisclosable path refuses the whole batch by that path own code', async () => {
  const fixture = createSourceFixture()
  try {
    const revision = commitAppRevision(fixture, {
      'app/index.html': '<div id="root"></div>\n',
      'app/logo.bin': Buffer.from([0, 1, 2, 3]),
    })
    await withSourcePort(fixture, {}, async (port) => {
      await assert.rejects(port.readSourceFiles({ projectId, sourceRevision: revision, paths: ['app/index.html', 'app/logo.bin'] }), /FILE_NOT_DISCLOSABLE/)
      await assert.rejects(port.readSourceFile({ projectId, sourceRevision: revision, path: 'app/logo.bin' }), /FILE_NOT_DISCLOSABLE/)
      await assert.rejects(port.readSourceFiles({ projectId, sourceRevision: revision, paths: ['app/index.html', 'app/absent.ts'] }), /FILE_NOT_FOUND/)
      await assert.rejects(port.readSourceFiles({ projectId, sourceRevision: revision, paths: ['../escape'] }), /PATH_REFUSED/)
      const disclosed = await port.readSourceFiles({ projectId, sourceRevision: revision, paths: ['app/index.html'] })
      assert.deepEqual(disclosed.files, [{ path: 'app/index.html', content: '<div id="root"></div>\n' }])
    })
  } finally {
    rmSync(fixture.root, { recursive: true, force: true })
  }
})

test('the application tree the sandbox compiles is held to the compile input limits', () => {
  const entry = (size, path, mode = '100644') => `${mode} blob ${'a'.repeat(40)} ${String(size).padStart(7)}\t${path}`
  const ok = [entry(120, 'app/index.html'), entry(80, 'app/src/main.tsx')].join('\n')
  assert.deepEqual(admitApplicationTree(ok), ['app/index.html', 'app/src/main.tsx'])
  assert.deepEqual(admitApplicationTree(`${ok}\n`), ['app/index.html', 'app/src/main.tsx'])

  const refuses = (listing, because) =>
    assert.throws(() => admitApplicationTree(listing), /BUILDER_APPLICATION_SOURCE_REFUSED/, because)

  refuses(entry(10, 'app/main.tsx'), 'no entry point')
  refuses([entry(10, 'app/index.html'), entry(10, 'app/index.html')].join('\n'), 'a duplicate path')
  refuses([entry(10, 'app/index.html'), entry(1024 * 1024 + 1, 'app/big.js')].join('\n'), 'one file over 1 MiB')
  refuses([entry(10, 'app/index.html'), ...Array.from({ length: 12 }, (_, index) => entry(1024 * 1024, `app/f${index}.js`))].join('\n'), 'over 12 MiB in total')
  refuses([entry(10, 'app/index.html'), ...Array.from({ length: 256 }, (_, index) => entry(1, `app/f${index}.js`))].join('\n'), 'over 256 paths')
  refuses([entry(10, 'app/index.html'), entry(10, 'app/link', '120000')].join('\n'), 'a symlink, which is not a blob mode this accepts')
  refuses('not a tree listing at all', 'output that is not a listing')
})

test('Coding result classification preserves a response-only turn without a candidate', () => {
  assert.deepEqual(classifyCodingResult({ changed: false, summary: 'No source change was needed.' }), {
    kind: 'RESPONSE_ONLY',
    summary: 'No source change was needed.',
  })
  assert.deepEqual(classifyCodingResult({ changed: true, summary: 'Updated the app.' }), {
    kind: 'SOURCE_CHANGED',
    summary: 'Updated the app.',
  })
})
