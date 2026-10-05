import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createReadStream, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import { test } from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'

const { candidateSnapshot, createConexusGit, mirrorSnapshot, pullSnapshot, startCheckout } = await import(hubModuleUrl('builder/conexus-git.js'))
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
  readAgentFileStream: async (path) => Readable.toWeb(createReadStream(path)),
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
const fromMain = (main) => ({ conversationId: CONVERSATION, main, start: main, mirror: null, previous: null, conflicted: [] })
const MIRROR = `refs/conexus/conversations/${CONVERSATION}`

test('a mirror snapshot is one commit on the turn start, moved only from the head it replaces, and a turn starting from main never carries it', async (t) => {
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
  const seed = await git.seedBundle(PROJECT, { conversationId: CONVERSATION, main: base, start: base, mirror: sibling, conflicted: [] })
  const header = seed.subarray(0, seed.indexOf('\n\n')).toString('utf8').split('\n').filter((line) => /^[0-9a-f]{40} /.test(line))
  assert.deepEqual(header, [`${base} refs/heads/main`])
  assert.throws(() => mirrorSnapshot('conexus-builder:legacy', base), { message: 'CONEXUS_GIT_REF_REFUSED' })
})

test('a turn starts from main, from the mirror that holds it, or from a Hub merge of both that keeps conflicts for the agent', async (t) => {
  const directory = scratch(t)
  const root = join(directory, 'git')
  const git = createConexusGit({ root, starter: STARTER })
  const base = await git.ensureRepository(PROJECT)
  const work = cloneOf(root, directory)
  const push = (commit, ref) => run(work, ['push', '--quiet', '--force', 'origin', `${commit}:${ref}`])
  const files = (revision) => bare(root, 'ls-tree', '-r', '--name-only', revision).split('\n')
  const checkout = join(directory, 'sandbox', 'repo')
  const seedFile = join(directory, 'sandbox', 'seed.bundle')
  const sandbox = localSandbox()

  assert.deepEqual(await git.startTurn(PROJECT, CONVERSATION, base), fromMain(base))

  const kept = commitIn(work, { 'app/kept.ts': 'kept\n' })
  push(kept, MIRROR)
  const fromMirror = await git.startTurn(PROJECT, CONVERSATION, base)
  assert.deepEqual(fromMirror, { conversationId: CONVERSATION, main: base, start: kept, mirror: kept, previous: kept, conflicted: [] })
  const seed = await git.seedBundle(PROJECT, fromMirror)
  const header = seed.subarray(0, seed.indexOf('\n\n')).toString('utf8').split('\n').filter((line) => /^[0-9a-f]{40} /.test(line))
  assert.deepEqual(header, [`${base} refs/heads/main`, `${kept} ${MIRROR}`])
  assert.equal(await startCheckout({ git, projectId: PROJECT, turn: fromMirror, sandbox, checkout, seedFile }), 'SEEDED')
  assert.equal(run(checkout, ['rev-parse', 'HEAD']), kept)
  assert.equal(readFileSync(join(checkout, 'app/kept.ts'), 'utf8'), 'kept\n')

  run(work, ['checkout', '--quiet', '--detach', base])
  const other = commitIn(work, { 'app/other.ts': 'other\n' })
  push(other, 'refs/heads/main')
  const merged = await git.startTurn(PROJECT, CONVERSATION, other)
  assert.deepEqual({ ...merged, start: 'merge', mirror: 'merge' }, { conversationId: CONVERSATION, main: other, start: 'merge', mirror: 'merge', previous: kept, conflicted: [] })
  assert.equal(merged.start, merged.mirror)
  assert.equal(await git.readMirror(PROJECT, CONVERSATION), merged.start)
  assert.equal(bare(root, 'rev-list', '--parents', '-n', '1', merged.start), `${merged.start} ${kept} ${other}`)
  assert.deepEqual(files(merged.start), ['app/index.html', 'app/kept.ts', 'app/other.ts', 'conexus/check.sh'])
  assert.deepEqual(await git.startTurn(PROJECT, CONVERSATION, other), { ...merged, previous: merged.start }, 'the next turn on the same main starts from the merge')
  assert.equal(await startCheckout({ git, projectId: PROJECT, turn: merged, sandbox, checkout, seedFile }), 'RESUMED')
  assert.equal(run(checkout, ['rev-parse', 'HEAD']), merged.start)

  run(work, ['fetch', '--quiet', 'origin', MIRROR])
  run(work, ['checkout', '--quiet', '--detach', merged.start])
  const mine = commitIn(work, { 'app/index.html': '<h1>mine</h1>\n' })
  push(mine, MIRROR)
  run(work, ['checkout', '--quiet', '--detach', other])
  const theirs = commitIn(work, { 'app/index.html': '<h1>theirs</h1>\n' })
  push(theirs, 'refs/heads/main')
  const conflict = await git.startTurn(PROJECT, CONVERSATION, theirs)
  assert.deepEqual(conflict.conflicted, ['app/index.html'])
  assert.equal(bare(root, 'rev-list', '--parents', '-n', '1', conflict.start), `${conflict.start} ${mine} ${theirs}`)
  assert.equal(await startCheckout({ git, projectId: PROJECT, turn: conflict, sandbox, checkout, seedFile }), 'SEEDED')
  assert.match(readFileSync(join(checkout, 'app/index.html'), 'utf8'), /^<<<<<<< [0-9a-f]{40}\n<h1>mine<\/h1>\n=======\n<h1>theirs<\/h1>\n>>>>>>> [0-9a-f]{40}\n$/)

  const admitted = commitIn(work, { 'app/index.html': '<h1>resolved</h1>\n' })
  push(admitted, MIRROR)
  push(admitted, 'refs/heads/main')
  const later = commitIn(work, { 'app/later.ts': 'later\n' })
  push(later, 'refs/heads/main')
  assert.deepEqual(await git.startTurn(PROJECT, CONVERSATION, later), { conversationId: CONVERSATION, main: later, start: later, mirror: admitted, previous: admitted, conflicted: [] }, 'a mirror main already holds is left in place')
})

test('a pull answers the earlier candidate while the tree is as it left it, and nothing once the tree is back at the start', async (t) => {
  const directory = scratch(t)
  const root = join(directory, 'git')
  const git = createConexusGit({ root, starter: STARTER })
  const base = await git.ensureRepository(PROJECT)
  const checkout = join(directory, 'sandbox', 'workspace', 'repo')
  const seedFile = join(directory, 'sandbox', 'seed', `${RUN}.bundle`)
  const sandbox = localSandbox()
  await startCheckout({ git, projectId: PROJECT, turn: fromMain(base), sandbox, checkout, seedFile })
  const pull = (sameAs) => pullSnapshot({ git, projectId: PROJECT, snapshot: candidateSnapshot(RUN, base), scratch: 'candidate', sandbox, checkout, ...(sameAs ? { sameAs } : {}) })

  writeFileSync(join(checkout, 'app/index.html'), '<main>one</main>\n')
  const first = await pull()
  assert.match(first, /^[0-9a-f]{40}$/)
  assert.equal(await pull(first), first, 'an unchanged tree is the revision already pulled, not a new commit')
  writeFileSync(join(checkout, 'app/index.html'), '<main>two</main>\n')
  const second = await pull(first)
  assert.notEqual(second, first)
  assert.equal(bare(root, 'show', `${second}:app/index.html`), '<main>two</main>')
  writeFileSync(join(checkout, 'app/index.html'), '<div id="root"></div>\n')
  assert.equal(await pull(second), null, 'back at the start is no change, whatever was pulled before')
})

test('a run seeds its sandbox from main and hands back everything it changed as one commit', async (t) => {
  const directory = scratch(t)
  const root = join(directory, 'git')
  const git = createConexusGit({ root, starter: STARTER })
  const base = await git.ensureRepository(PROJECT)
  const checkout = join(directory, 'sandbox', 'workspace', 'repo')
  const seedFile = join(directory, 'sandbox', 'seed', `${RUN}.bundle`)
  const sandbox = localSandbox()

  assert.equal(await startCheckout({ git, projectId: PROJECT, turn: fromMain(base), sandbox, checkout, seedFile }), 'SEEDED')
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
  mkdirSync(join(checkout, 'docs/planos/0001-painel'), { recursive: true })
  writeFileSync(join(checkout, 'docs/planos/0001-painel/plano.md'), '# committed\n')
  run(checkout, ['commit', '--quiet', '--allow-empty', '-m', 'the agent committed on its own'])

  // The paths a run leaves out, as v2's methodology names them: its plan folder.
  const candidate = await pullSnapshot({ git, projectId: PROJECT, snapshot: candidateSnapshot(RUN, base), scratch: 'candidate', sandbox, checkout, excluded: ['.conexus/plans'] })
  assert.match(candidate, /^[0-9a-f]{40}$/)
  assert.equal(bare(root, 'rev-list', '--parents', '-n', '1', candidate), `${candidate} ${base}`)
  assert.equal(bare(root, 'log', '-1', '--format=%an <%ae>', candidate), 'Conexus Builder <builder@conexus.invalid>')
  assert.equal(bare(root, 'ls-tree', '-r', '--name-only', candidate), '.gitignore\napp/index.html\ndocs/planos/0001-painel/plano.md')
  assert.equal(await git.readMain(PROJECT), base)

  await git.fastForwardMain(PROJECT, { base, candidate })
  // The next turn of the conversation, whose mirror the admitted candidate is.
  assert.equal(await startCheckout({ git, projectId: PROJECT, turn: { ...fromMain(candidate), mirror: candidate, previous: candidate }, sandbox, checkout, seedFile }), 'RESUMED')
  assert.equal(run(checkout, ['rev-parse', 'HEAD']), candidate)
  assert.equal(run(checkout, ['status', '--porcelain']), '?? .conexus/')
  assert.equal(readFileSync(join(checkout, 'node_modules/dep.js'), 'utf8'), 'ignored\n')
  assert.equal(readFileSync(join(checkout, '.conexus/plans/plan.md'), 'utf8'), '# never committed\n', 'the kept checkout keeps what no commit holds')
  const fresh = join(directory, 'sandbox', 'workspace', 'fresh')
  await assert.rejects(startCheckout({ git, projectId: PROJECT, turn: fromMain(base), sandbox, checkout: fresh, seedFile }), { message: 'BUILDER_SOURCE_BASE_MOVED' })
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

  await assert.rejects(source.readSourceFile(PROJECT, result, 'app/logo.bin'), { id: 'SOURCE_FILE_NOT_FOUND' })
  await assert.rejects(source.readSourceFile(PROJECT, result, 'app/missing.txt'), { id: 'SOURCE_FILE_NOT_FOUND' })
  await assert.rejects(source.readSourceFile(PROJECT, result, 'app'), { id: 'SOURCE_FILE_NOT_FOUND' })
  await assert.rejects(source.readSourceFile(PROJECT, result, '../etc/passwd'), { id: 'SOURCE_FILE_NOT_FOUND' })
  await assert.rejects(source.listSourceTree(PROJECT, 'f'.repeat(40)), { id: 'SOURCE_REVISION_NOT_FOUND' })
  await assert.rejects(source.compareRevisions(PROJECT, base, 'f'.repeat(40)), { id: 'SOURCE_REVISION_NOT_FOUND' })

  run(work, ['checkout', '--quiet', '--detach', base])
  run(work, ['rm', '--quiet', 'app/index.html'])
  mkdirSync(join(work, 'app'), { recursive: true })
  symlinkSync('/etc/passwd', join(work, 'app/index.html'))
  const linked = commitIn(work, {}, 'symlink')
  run(work, ['push', '--quiet', 'origin', `${linked}:refs/conexus/runs/${OTHER_RUN}`])
  await assert.rejects(source.listSourceTree(PROJECT, linked), { id: 'BUILDER_SOURCE_READ_UNSAFE_ENTRY' })
  await assert.rejects(source.readSourceFile(PROJECT, linked, 'app/index.html'), { id: 'SOURCE_FILE_NOT_FOUND' })
})

const MIB = 1024 * 1024
const refs = (root) => bare(root, 'for-each-ref', '--format=%(refname) %(objectname)')
const zeros = (bytes) => new ReadableStream({
  pull(controller) {
    const chunk = Math.min(MIB, bytes.left)
    if (chunk === 0) return controller.close()
    bytes.left -= chunk
    controller.enqueue(new Uint8Array(chunk))
  },
})

test('a result bundle the sandbox reports above the cap is refused before the Hub reads it', async (t) => {
  const directory = scratch(t)
  const root = join(directory, 'git')
  const git = createConexusGit({ root, starter: STARTER })
  const base = await git.ensureRepository(PROJECT)
  const checkout = join(directory, 'sandbox', 'workspace', 'repo')
  const seedFile = join(directory, 'sandbox', 'seed', `${RUN}.bundle`)
  const local = localSandbox()
  await startCheckout({ git, projectId: PROJECT, turn: fromMain(base), sandbox: local, checkout, seedFile })
  writeFileSync(join(checkout, 'app/index.html'), '<main>ok</main>\n')
  const reads = []
  const sandbox = {
    ...local,
    direct: async (command, args) => {
      const result = await local.direct(command, args)
      return { ...result, stdout: result.stdout.replace(/^size=\d+$/m, `size=${64 * MIB + 1}`) }
    },
    readAgentFile: async (path) => { reads.push(path); return local.readAgentFile(path) },
    readAgentFileStream: async (path) => { reads.push(path); return local.readAgentFileStream(path) },
  }
  const before = refs(root)

  await assert.rejects(pullSnapshot({ git, projectId: PROJECT, snapshot: candidateSnapshot(RUN, base), scratch: 'candidate', sandbox, checkout }), { message: 'BUILDER_RESULT_BUNDLE_TOO_LARGE' })
  assert.deepEqual(reads, [])
  assert.equal(refs(root), before)
})

test('a bundle that grows past the cap while it streams is cut off and leaves nothing behind', async (t) => {
  const directory = scratch(t)
  const root = join(directory, 'git')
  const git = createConexusGit({ root, starter: STARTER })
  const base = await git.ensureRepository(PROJECT)
  const before = refs(root)
  const temporary = () => readdirSync(tmpdir()).filter((name) => name.startsWith('conexus-git-'))
  const leftover = temporary()

  await assert.rejects(
    git.acceptSnapshot(PROJECT, { ...candidateSnapshot(RUN, base), bundle: zeros({ left: 65 * MIB }) }),
    { message: 'BUILDER_RESULT_BUNDLE_TOO_LARGE' },
  )
  assert.equal(refs(root), before)
  assert.deepEqual(temporary().filter((name) => !leftover.includes(name)), [])
})

test('a small bundle holding a file above the per-file cap is refused and its staging ref is gone', async (t) => {
  const directory = scratch(t)
  const root = join(directory, 'git')
  const git = createConexusGit({ root, starter: STARTER })
  const base = await git.ensureRepository(PROJECT)
  const work = cloneOf(root, directory)
  const stage = (bytes) => {
    const candidate = commitIn(work, { 'app/blob.bin': Buffer.alloc(bytes) })
    run(work, ['update-ref', `refs/conexus/runs/${RUN}`, candidate])
    const bundle = bundleOf(work, directory, [`refs/conexus/runs/${RUN}`, `^${base}`])
    run(work, ['reset', '--quiet', '--hard', base])
    return { candidate, bundle }
  }
  const before = refs(root)

  const over = stage(12 * MIB + 1)
  assert.ok(over.bundle.byteLength < MIB, 'zeros compress, so the transport check cannot see this one')
  await assert.rejects(git.acceptSnapshot(PROJECT, { ...candidateSnapshot(RUN, base), bundle: over.bundle }), { message: 'BUILDER_RESULT_CONTENT_TOO_LARGE' })
  assert.equal(refs(root), before)
  assert.equal(bare(root, 'for-each-ref', 'refs/conexus/staging'), '')

  const exact = stage(12 * MIB)
  assert.equal(await git.acceptSnapshot(PROJECT, { ...candidateSnapshot(RUN, base), bundle: exact.bundle }), exact.candidate)
  assert.equal(bare(root, 'for-each-ref', 'refs/conexus/staging'), '')
})

test('a result holding more files than the cap is refused and its staging ref is gone', async (t) => {
  const directory = scratch(t)
  const root = join(directory, 'git')
  const git = createConexusGit({ root, starter: STARTER })
  const base = await git.ensureRepository(PROJECT)
  const work = cloneOf(root, directory)
  const held = bare(root, 'ls-tree', '-r', '--name-only', base).split('\n').filter(Boolean).length
  const stage = (count) => {
    const files = Object.fromEntries(Array.from({ length: count }, (_, index) => [`app/many/f${index}.txt`, `${index}`]))
    const candidate = commitIn(work, files)
    run(work, ['update-ref', `refs/conexus/runs/${RUN}`, candidate])
    const bundle = bundleOf(work, directory, [`refs/conexus/runs/${RUN}`, `^${base}`])
    run(work, ['reset', '--quiet', '--hard', base])
    return { candidate, bundle }
  }
  const before = refs(root)

  const over = stage(256 - held + 1)
  await assert.rejects(git.acceptSnapshot(PROJECT, { ...candidateSnapshot(RUN, base), bundle: over.bundle }), { message: 'BUILDER_RESULT_CONTENT_TOO_LARGE' })
  assert.equal(refs(root), before)
  assert.equal(bare(root, 'for-each-ref', 'refs/conexus/staging'), '')

  const exact = stage(256 - held)
  assert.equal(await git.acceptSnapshot(PROJECT, { ...candidateSnapshot(RUN, base), bundle: exact.bundle }), exact.candidate)
})
