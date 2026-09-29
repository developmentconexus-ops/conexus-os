import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'

const { candidateSnapshot, createConexusGit, mirrorSnapshot, pullSnapshot, seedSandbox } = await import(hubModuleUrl('builder/conexus-git.js'))
const { createProjectSourceReads } = await import(hubModuleUrl('builder/source.js'))

const PROJECT = '22222222-2222-4222-8222-222222222222'
const RUN = '11111111-1111-4111-8111-111111111111'
const OTHER_RUN = '55555555-5555-4555-8555-555555555555'
const STARTER = [
  { path: 'app/index.html', content: '<div id="root"></div>\n' },
  { path: 'conexus/check.sh', content: '#!/bin/sh\nexit 0\n' },
]

const scratch = (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'conexus-git-test-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  return directory
}

const run = (cwd, args, input) => execFileSync('git', args, {
  cwd, input, encoding: 'utf8',
  env: { PATH: process.env.PATH, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@t' },
}).trim()
const bare = (root, ...args) => run(root, ['--git-dir', join(root, `${PROJECT}.git`), ...args])

// A working clone of the Project's repository, the way a sandbox holds it, for making commits and bundles.
const cloneOf = (root, directory) => {
  run(directory, ['clone', '--quiet', join(root, `${PROJECT}.git`), 'work'])
  return join(directory, 'work')
}
const commitIn = (work, files, message = 'change') => {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(work, path)), { recursive: true })
    writeFileSync(join(work, path), content)
  }
  run(work, ['add', '--all'])
  run(work, ['commit', '--quiet', '-m', message])
  return run(work, ['rev-parse', 'HEAD'])
}
const bundleOf = (work, directory, refs) => {
  const file = join(directory, `bundle-${Math.random().toString(16).slice(2)}`)
  run(work, ['bundle', 'create', '--quiet', file, ...refs])
  return readFileSync(file)
}

// A sandbox that is this machine: commands run with sh, root files are plain files.
const localSandbox = () => ({
  direct: async (command, args) => {
    try {
      const stdout = execFileSync(command, args, { encoding: 'utf8', env: { PATH: process.env.PATH }, stdio: ['ignore', 'pipe', 'pipe'] })
      return { success: true, exitCode: 0, stdout, stderr: '', executionTimeMs: 0 }
    } catch (error) {
      return { success: false, exitCode: error.status ?? 1, stdout: String(error.stdout ?? ''), stderr: String(error.stderr ?? ''), executionTimeMs: 0 }
    }
  },
  writeRootFile: async (path, bytes) => {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, bytes)
  },
  readAgentFile: async (path) => readFileSync(path),
})

test('ensuring a repository creates main with the starter once and leaves it alone after', async (t) => {
  const root = join(scratch(t), 'git')
  const git = createConexusGit({ root, starter: STARTER })

  const first = await git.ensureRepository(PROJECT)
  assert.match(first, /^[0-9a-f]{40}$/)
  assert.equal(bare(root, 'symbolic-ref', 'HEAD'), 'refs/heads/main')
  assert.equal(bare(root, 'ls-tree', '-r', '--name-only', 'main'), 'app/index.html\nconexus/check.sh')
  assert.equal(bare(root, 'show', 'main:app/index.html'), '<div id="root"></div>')
  assert.equal(bare(root, 'ls-tree', 'main', 'conexus/check.sh').split(' ')[0], '100755')
  assert.equal(bare(root, 'log', '--format=%an <%ae>|%s', 'main'), 'Conexus Builder <builder@conexus.invalid>|Start the Conexus application')

  assert.equal(await git.ensureRepository(PROJECT), first)
  assert.equal(bare(root, 'rev-list', '--count', 'main'), '1')
  assert.equal(await git.readMain(PROJECT), first)
})

test('an empty repository gets the starter and one that moved on keeps its main', async (t) => {
  const directory = scratch(t)
  const root = join(directory, 'git')
  mkdirSync(root)
  run(root, ['init', '--quiet', '--bare', `${PROJECT}.git`])
  const git = createConexusGit({ root, starter: STARTER })

  const starter = await git.ensureRepository(PROJECT)
  assert.equal(bare(root, 'ls-tree', '-r', '--name-only', starter), 'app/index.html\nconexus/check.sh')

  const work = cloneOf(root, directory)
  const moved = commitIn(work, { 'app/index.html': '<p>moved</p>\n' })
  run(work, ['push', '--quiet', 'origin', 'HEAD:main'])
  assert.equal(await git.ensureRepository(PROJECT), moved)
  assert.equal(await git.readMain(PROJECT), moved)
})

test('a missing repository has no main and deleting converges', async (t) => {
  const root = join(scratch(t), 'git')
  const git = createConexusGit({ root, starter: STARTER })
  await assert.rejects(git.readMain(PROJECT), { message: 'CONEXUS_GIT_MAIN_MISSING' })
  await git.ensureRepository(PROJECT)
  await git.deleteRepository(PROJECT)
  await git.deleteRepository(PROJECT)
  await assert.rejects(git.readMain(PROJECT), { message: 'CONEXUS_GIT_MAIN_MISSING' })
  await assert.rejects(git.ensureRepository('../escape'), { message: 'CONEXUS_GIT_PROJECT_REFUSED' })
})

test('main fast forwards only from the run base to a descendant, and a retry converges', async (t) => {
  const directory = scratch(t)
  const root = join(directory, 'git')
  const git = createConexusGit({ root, starter: STARTER })
  const base = await git.ensureRepository(PROJECT)
  const work = cloneOf(root, directory)
  const candidate = commitIn(work, { 'app/a.txt': 'a\n' })
  run(work, ['checkout', '--quiet', '--orphan', 'unrelated'])
  const unrelated = commitIn(work, { 'x.txt': 'x\n' }, 'unrelated')
  run(work, ['push', '--quiet', 'origin', `${candidate}:refs/conexus/runs/${RUN}`, `${unrelated}:refs/conexus/runs/${OTHER_RUN}`])

  await assert.rejects(git.fastForwardMain(PROJECT, { base, candidate: unrelated }), { message: 'BUILDER_RESULT_MATERIALIZATION_REFUSED' })
  assert.equal(await git.readMain(PROJECT), base)

  await git.fastForwardMain(PROJECT, { base, candidate })
  assert.equal(await git.readMain(PROJECT), candidate)
  await git.fastForwardMain(PROJECT, { base, candidate })
  assert.equal(await git.readMain(PROJECT), candidate)
  assert.equal(await git.mainContains(PROJECT, candidate), true)
  assert.equal(await git.mainContains(PROJECT, unrelated), false)

  const later = commitIn(work, { 'y.txt': 'y\n' })
  run(work, ['push', '--quiet', 'origin', `${later}:refs/conexus/runs/late`])
  await assert.rejects(git.fastForwardMain(PROJECT, { base, candidate: later }), { message: 'BUILDER_RESULT_MATERIALIZATION_REFUSED' })
  const stale = commitIn(work, { 'z.txt': 'z\n' })
  run(work, ['checkout', '--quiet', '--detach', candidate])
  const child = commitIn(work, { 'w.txt': 'w\n' })
  run(work, ['push', '--quiet', 'origin', `${child}:refs/conexus/runs/child`, `${stale}:refs/conexus/runs/stale`])
  await assert.rejects(git.fastForwardMain(PROJECT, { base, candidate: child }), { message: 'BUILDER_SOURCE_BASE_MOVED' })
  assert.equal(await git.readMain(PROJECT), candidate)
})

test('a snapshot is taken only from its own ref, as one commit on its parent', async (t) => {
  const directory = scratch(t)
  const root = join(directory, 'git')
  const git = createConexusGit({ root, starter: STARTER })
  const base = await git.ensureRepository(PROJECT)
  const work = cloneOf(root, directory)
  const candidate = commitIn(work, { 'app/a.txt': 'a\n' })
  run(work, ['update-ref', `refs/conexus/runs/${RUN}`, candidate])
  run(work, ['update-ref', `refs/conexus/runs/${OTHER_RUN}`, candidate])
  run(work, ['update-ref', 'refs/heads/main', candidate])

  const otherOnly = bundleOf(work, directory, [`refs/conexus/runs/${OTHER_RUN}`, `^${base}`])
  await assert.rejects(git.acceptSnapshot(PROJECT, { ...candidateSnapshot(RUN, base), bundle: otherOnly }), { message: 'BUILDER_RESULT_MATERIALIZATION_REFUSED' })
  const mainOnly = bundleOf(work, directory, ['refs/heads/main', `^${base}`])
  await assert.rejects(git.acceptSnapshot(PROJECT, { ...candidateSnapshot(RUN, base), bundle: mainOnly }), { message: 'BUILDER_RESULT_MATERIALIZATION_REFUSED' })
  await assert.rejects(git.acceptSnapshot(PROJECT, { ...candidateSnapshot(RUN, base), bundle: Buffer.from('not a bundle') }), { message: 'BUILDER_RESULT_MATERIALIZATION_REFUSED' })

  const both = bundleOf(work, directory, [`refs/conexus/runs/${RUN}`, 'refs/heads/main', `refs/conexus/runs/${OTHER_RUN}`, `^${base}`])
  assert.equal(await git.acceptSnapshot(PROJECT, { ...candidateSnapshot(RUN, base), bundle: both }), candidate)
  assert.equal(bare(root, 'for-each-ref', '--format=%(refname) %(objectname)'), `refs/conexus/runs/${RUN} ${candidate}\nrefs/heads/main ${base}`)

  const twoCommits = commitIn(work, { 'app/b.txt': 'b\n' })
  run(work, ['update-ref', `refs/conexus/runs/${OTHER_RUN}`, twoCommits])
  const deep = bundleOf(work, directory, [`refs/conexus/runs/${OTHER_RUN}`, `^${base}`])
  await assert.rejects(git.acceptSnapshot(PROJECT, { ...candidateSnapshot(OTHER_RUN, base), bundle: deep }), { message: 'BUILDER_RESULT_MATERIALIZATION_REFUSED' })
  assert.equal(bare(root, 'for-each-ref', '--format=%(refname)', 'refs/conexus/runs'), `refs/conexus/runs/${RUN}`)
})

const CONVERSATION = '44444444-4444-4444-8444-444444444444'
const MIRROR = `refs/conexus/conversations/${CONVERSATION}`

test('a mirror snapshot is one commit on the turn start, moved only from the head it replaces, and the seed never carries it', async (t) => {
  const directory = scratch(t)
  const root = join(directory, 'git')
  const git = createConexusGit({ root, starter: STARTER })
  const base = await git.ensureRepository(PROJECT)
  const work = cloneOf(root, directory)
  const first = commitIn(work, { 'app/a.txt': 'a\n' })
  run(work, ['update-ref', MIRROR, first])
  const firstBundle = bundleOf(work, directory, [MIRROR, `^${base}`])

  await assert.rejects(git.acceptSnapshot(PROJECT, { ...mirrorSnapshot(CONVERSATION, first), bundle: firstBundle, expected: null }), { message: 'BUILDER_RESULT_MATERIALIZATION_REFUSED' }, 'the wrong parent')
  assert.equal(await git.acceptSnapshot(PROJECT, { ...mirrorSnapshot(CONVERSATION, base), bundle: firstBundle, expected: null }), first)
  assert.equal(await git.readMirror(PROJECT, CONVERSATION), first)

  run(work, ['checkout', '--quiet', '--detach', base])
  const sibling = commitIn(work, { 'app/b.txt': 'b\n' })
  run(work, ['update-ref', MIRROR, sibling])
  const siblingBundle = bundleOf(work, directory, [MIRROR, `^${base}`])
  await assert.rejects(git.acceptSnapshot(PROJECT, { ...mirrorSnapshot(CONVERSATION, base), bundle: siblingBundle, expected: null }), { message: 'CONEXUS_GIT_REF_MOVED' }, 'a stale head')
  assert.equal(await git.readMirror(PROJECT, CONVERSATION), first)
  assert.equal(await git.acceptSnapshot(PROJECT, { ...mirrorSnapshot(CONVERSATION, base), bundle: siblingBundle, expected: first }), sibling, 'a sibling on the same start replaces it')

  const merge = run(work, ['commit-tree', `${sibling}^{tree}`, '-p', sibling, '-p', first, '-m', 'two parents'])
  run(work, ['update-ref', MIRROR, merge])
  await assert.rejects(git.acceptSnapshot(PROJECT, { ...mirrorSnapshot(CONVERSATION, sibling), bundle: bundleOf(work, directory, [MIRROR, `^${sibling}`, `^${first}`]), expected: sibling }), { message: 'BUILDER_RESULT_MATERIALIZATION_REFUSED' }, 'two parents')
  assert.equal(bare(root, 'for-each-ref', '--format=%(refname) %(objectname)'), `${MIRROR} ${sibling}\nrefs/heads/main ${base}`)

  await assert.rejects(git.moveMirror(PROJECT, CONVERSATION, { expected: first, next: base }), { message: 'CONEXUS_GIT_REF_MOVED' })
  const seed = await git.seedBundle(PROJECT, base)
  const header = seed.subarray(0, seed.indexOf('\n\n')).toString('utf8').split('\n').filter((line) => /^[0-9a-f]{40} /.test(line))
  assert.deepEqual(header, [`${base} refs/heads/main`])
  assert.throws(() => mirrorSnapshot('conexus-builder:legacy', base), { message: 'CONEXUS_GIT_REF_REFUSED' })
})

test('a run seeds its sandbox from main and hands back everything it changed as one commit', async (t) => {
  const directory = scratch(t)
  const root = join(directory, 'git')
  const git = createConexusGit({ root, starter: STARTER })
  const base = await git.ensureRepository(PROJECT)
  const checkout = join(directory, 'sandbox', 'workspace', 'repo')
  const seedFile = join(directory, 'sandbox', 'seed', `${RUN}.bundle`)
  const sandbox = localSandbox()

  await seedSandbox({ git, projectId: PROJECT, base, sandbox, checkout, seedFile })
  assert.equal(run(checkout, ['rev-parse', 'HEAD']), base)
  assert.equal(readFileSync(join(checkout, 'app/index.html'), 'utf8'), '<div id="root"></div>\n')
  assert.equal(await pullSnapshot({ git, projectId: PROJECT, snapshot: candidateSnapshot(RUN, base), scratch: 'candidate', sandbox, checkout }), null)

  writeFileSync(join(checkout, 'app/index.html'), '<main>ok</main>\n')
  rmSync(join(checkout, 'conexus/check.sh'))
  writeFileSync(join(checkout, '.gitignore'), 'node_modules/\n')
  mkdirSync(join(checkout, 'node_modules'))
  writeFileSync(join(checkout, 'node_modules/dep.js'), 'ignored\n')
  mkdirSync(join(checkout, '.conexus/plans'), { recursive: true })
  writeFileSync(join(checkout, '.conexus/plans/plan.md'), '# never committed\n')
  run(checkout, ['commit', '--quiet', '--allow-empty', '-m', 'the agent committed on its own'])

  const candidate = await pullSnapshot({ git, projectId: PROJECT, snapshot: candidateSnapshot(RUN, base), scratch: 'candidate', sandbox, checkout })
  assert.match(candidate, /^[0-9a-f]{40}$/)
  assert.equal(bare(root, 'rev-list', '--parents', '-n', '1', candidate), `${candidate} ${base}`)
  assert.equal(bare(root, 'log', '-1', '--format=%an <%ae>', candidate), 'Conexus Builder <builder@conexus.invalid>')
  assert.equal(bare(root, 'ls-tree', '-r', '--name-only', candidate), '.gitignore\napp/index.html')
  assert.equal(await git.readMain(PROJECT), base)

  await git.fastForwardMain(PROJECT, { base, candidate })
  await seedSandbox({ git, projectId: PROJECT, base: candidate, sandbox, checkout, seedFile })
  assert.equal(run(checkout, ['rev-parse', 'HEAD']), candidate)
  assert.equal(run(checkout, ['status', '--porcelain']), '')
  assert.equal(readFileSync(join(checkout, 'node_modules/dep.js'), 'utf8'), 'ignored\n')
  await assert.rejects(seedSandbox({ git, projectId: PROJECT, base, sandbox, checkout, seedFile }), { message: 'BUILDER_SOURCE_BASE_MOVED' })
})

test('the source view reads tree, file and diff from the Conexus Git in its own shapes', async (t) => {
  const directory = scratch(t)
  const root = join(directory, 'git')
  const git = createConexusGit({ root, starter: STARTER })
  const base = await git.ensureRepository(PROJECT)
  const work = cloneOf(root, directory)
  run(work, ['mv', 'conexus/check.sh', 'conexus/verify.sh'])
  writeFileSync(join(work, 'app/index.html'), '<main>novo</main>\n')
  const result = commitIn(work, { 'app/src/main.tsx': 'export {}\n', 'app/logo.bin': Buffer.from([0, 1, 2]) })
  run(work, ['push', '--quiet', 'origin', `${result}:refs/conexus/runs/${RUN}`])
  const source = createProjectSourceReads({ git })

  assert.deepEqual(await source.listSourceTree(PROJECT, base), {
    sourceRevision: base,
    entries: [
      { path: 'app', kind: 'DIRECTORY' },
      { path: 'app/index.html', kind: 'FILE' },
      { path: 'conexus', kind: 'DIRECTORY' },
      { path: 'conexus/check.sh', kind: 'FILE' },
    ],
  })
  assert.deepEqual(await source.readSourceFile(PROJECT, result, 'app/index.html'), { sourceRevision: result, path: 'app/index.html', content: '<main>novo</main>\n' })
  assert.deepEqual(await source.compareRevisions(PROJECT, base, result), {
    baseSourceRevision: base,
    resultSourceRevision: result,
    files: [
      { path: 'app/index.html', status: 'MODIFIED', previousPath: null },
      { path: 'app/logo.bin', status: 'ADDED', previousPath: null },
      { path: 'app/src/main.tsx', status: 'ADDED', previousPath: null },
      { path: 'conexus/verify.sh', status: 'RENAMED', previousPath: 'conexus/check.sh' },
    ],
  })
  assert.deepEqual(await source.compareRevisions(PROJECT, result, base).then((comparison) => comparison.files.map((file) => file.status)), ['MODIFIED', 'REMOVED', 'REMOVED', 'RENAMED'])

  await assert.rejects(source.readSourceFile(PROJECT, result, 'app/logo.bin'), { message: 'BUILDER_SOURCE_READ_FILE_NOT_DISCLOSABLE' })
  await assert.rejects(source.readSourceFile(PROJECT, result, 'app/missing.txt'), { message: 'BUILDER_SOURCE_READ_FILE_NOT_FOUND' })
  await assert.rejects(source.readSourceFile(PROJECT, result, 'app'), { message: 'BUILDER_SOURCE_READ_FILE_NOT_FOUND' })
  await assert.rejects(source.readSourceFile(PROJECT, result, '../etc/passwd'), { message: 'BUILDER_SOURCE_READ_PATH_REFUSED' })
  await assert.rejects(source.listSourceTree(PROJECT, 'f'.repeat(40)), { message: 'BUILDER_SOURCE_READ_REVISION_NOT_FOUND' })
  await assert.rejects(source.compareRevisions(PROJECT, base, 'f'.repeat(40)), { message: 'BUILDER_SOURCE_READ_REVISION_NOT_FOUND' })
  await assert.rejects(source.listSourceTree(PROJECT, 'main'), { message: 'BUILDER_SOURCE_READ_REFUSED' })

  run(work, ['checkout', '--quiet', '--detach', base])
  run(work, ['rm', '--quiet', 'app/index.html'])
  mkdirSync(join(work, 'app'), { recursive: true })
  symlinkSync('/etc/passwd', join(work, 'app/index.html'))
  const linked = commitIn(work, {}, 'symlink')
  run(work, ['push', '--quiet', 'origin', `${linked}:refs/conexus/runs/${OTHER_RUN}`])
  await assert.rejects(source.listSourceTree(PROJECT, linked), { message: 'BUILDER_SOURCE_READ_UNSAFE_ENTRY' })
  await assert.rejects(source.readSourceFile(PROJECT, linked, 'app/index.html'), { message: 'BUILDER_SOURCE_READ_FILE_NOT_DISCLOSABLE' })
})
