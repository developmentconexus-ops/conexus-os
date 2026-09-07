import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { appendFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const repositoryRoot = resolve(import.meta.dirname, '../..')

const repositoryBytes = (root, prefix = '') => Object.fromEntries(readdirSync(resolve(root, prefix), { withFileTypes: true })
  .flatMap((entry) => {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name
    return entry.isDirectory() ? Object.entries(repositoryBytes(root, path)) : [[path, readFileSync(resolve(root, path)).toString('base64')]]
  }).sort(([left], [right]) => left.localeCompare(right)))

const compileGitCapability = () => {
  const outputRoot = mkdtempSync(resolve(repositoryRoot, 'apps/hub/r2-project-binding-git-build-'))
  const compiled = spawnSync(process.execPath, [
    resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'),
    '--project', resolve(repositoryRoot, 'apps/hub/tsconfig.json'), '--noEmit', 'false', '--outDir', outputRoot,
  ], { encoding: 'utf8' })
  if (compiled.status !== 0) {
    rmSync(outputRoot, { recursive: true, force: true })
    throw new Error(`R2_PROJECT_BINDING_GIT_COMPILE_FAILED\n${compiled.stdout}\n${compiled.stderr}`)
  }
  return {
    outputRoot,
    built: (path) => pathToFileURL(resolve(outputRoot, path)).href,
  }
}

test('R2 project-binding Git recovery exposes a separate frozen-intent capability', async () => {
  const { outputRoot, built } = compileGitCapability()
  try {
    const source = readFileSync(resolve(repositoryRoot, 'apps/hub/src/project/git-execution.ts'), 'utf8')
    for (const method of [
      'stageProjectBindingIntent', 'inspectProjectBindingIntent',
      'applyProjectBindingIntent', 'cancelProjectBindingIntent',
    ]) assert.match(source, new RegExp(`\\b${method}\\b`))
    const { createOciProjectBindingGitCapability } = await import(built('project/git-execution.js'))
    const capability = createOciProjectBindingGitCapability({ projectStorageRoot: '/tmp' }, async () => ({
      exitCode: 0, signal: null, stdout: JSON.stringify({ status: 'REFUSED', code: 'IMAGE_NOT_VERIFIED' }),
      stderr: '', overflow: false, spawnError: false,
    }))
    assert.equal(typeof capability.applyProjectBinding, 'function')
    assert.equal(typeof capability.stageProjectBindingIntent, 'function')
    assert.equal(typeof capability.inspectProjectBindingIntent, 'function')
    assert.equal(typeof capability.applyProjectBindingIntent, 'function')
    assert.equal(typeof capability.cancelProjectBindingIntent, 'function')
  } finally {
    rmSync(outputRoot, { recursive: true, force: true })
  }
})

test('R2 project-binding staging program never mutates refs and recovery does not prune', () => {
  const source = readFileSync(resolve(repositoryRoot, 'apps/hub/src/project/git-execution.ts'), 'utf8')
  const program = source.match(/const PROJECT_BINDING_INTENT_STAGE_PROGRAM = `([\s\S]*?)\n`/)
  assert.ok(program, 'intent staging must be a distinct OCI program')
  assert.doesNotMatch(program[1], /update-ref|symbolic-ref|pack-refs/)
  assert.ok(program[1].indexOf("const currentResult = run(['rev-parse', '--verify', 'refs/heads/main'])") < program[1].indexOf("hash-object', '-w'"),
    'staging must reject a foreign head before writing any object')
  const mutation = source.match(/const PROJECT_BINDING_INTENT_MUTATION_PROGRAM = `([\s\S]*?)\n`/)
  assert.ok(mutation, 'inspection/mutation must share one OCI validation program')
  assert.doesNotMatch(mutation[1], /prune|gc|repack/)
  for (const custodyProgram of [program[1], mutation[1]]) {
    assert.match(custodyProgram, /core\.repositoryformatversion/)
    assert.match(custodyProgram, /objects\/info\/alternates/)
    assert.match(custodyProgram, /endsWith\('\.sample'\)/)
    assert.match(custodyProgram, /fsck', '--strict', '--no-dangling/)
  }
})

const createBareOciFixture = (repositoryRoot, image) => {
  const program = [
    "const { spawnSync } = require('node:child_process')",
    "const env = { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', HOME: '/tmp', GIT_TERMINAL_PROMPT: '0',",
    "  GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid', GIT_AUTHOR_DATE: '2000-01-01T00:00:00Z',",
    "  GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid', GIT_COMMITTER_DATE: '2000-01-01T00:00:00Z' }",
    "const git = (args, input) => spawnSync('/usr/local/bin/git', ['--git-dir=/repository.git', ...args], { env, encoding: 'utf8', input })",
    "const ok = value => !value.error && value.status === 0 && value.signal === null && value.stderr === ''",
    "const init = spawnSync('/usr/local/bin/git', ['init', '--bare', '--initial-branch=main', '/repository.git'], { env, encoding: 'utf8' })",
    "if (!ok(init)) process.exit(2)",
    "const tree = git(['hash-object', '-t', 'tree', '-w', '--stdin'], '')",
    "if (!ok(tree)) process.exit(3)",
    "const commit = git(['commit-tree', tree.stdout.trim(), '-m', 'fixture'])",
    "if (!ok(commit)) process.exit(4)",
    "const revision = commit.stdout.trim()",
    `const updated = git(['update-ref', 'refs/heads/main', revision, '${'0'.repeat(40)}'])`,
    "if (!ok(updated)) process.exit(5)",
    "process.stdout.write(JSON.stringify({ revision }) + '\\n')",
  ].join('\n')
  const outcome = spawnSync('docker', [
    'run', '--rm', '--pull', 'never', '--network', 'none', '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges', '--read-only',
    '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m',
    '--user', `${String(process.getuid())}:${String(process.getgid())}`,
    '--mount', `type=bind,src=${repositoryRoot},dst=/repository.git`,
    '--entrypoint', '/usr/local/bin/node', image, '-e', program,
  ], { encoding: 'utf8' })
  if (outcome.status !== 0 || outcome.signal !== null) throw new Error(`R2_RECOVERY_FIXTURE_FAILED\n${outcome.stdout}\n${outcome.stderr}`)
  return JSON.parse(outcome.stdout).revision
}

let hostFixtureIndex = 0
const commitHostFixtureFiles = (repositoryRoot, parent, files) => {
  const indexPath = resolve(repositoryRoot, '..', `.r2-binding-fixture-index-${process.pid}-${hostFixtureIndex++}`)
  const env = {
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', HOME: '/tmp', GIT_TERMINAL_PROMPT: '0',
    GIT_INDEX_FILE: indexPath,
    GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid', GIT_AUTHOR_DATE: '2000-01-01T00:00:00Z',
    GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid', GIT_COMMITTER_DATE: '2000-01-01T00:00:00Z',
  }
  const git = (args, input) => {
    const outcome = spawnSync('git', ['--git-dir', repositoryRoot, ...args], { env, encoding: 'utf8', input })
    if (outcome.status !== 0 || outcome.signal !== null || outcome.error) {
      throw new Error(`R2_BINDING_FIXTURE_GIT_FAILED\n${args.join(' ')}\n${outcome.stdout}\n${outcome.stderr}`)
    }
    return outcome.stdout.trim()
  }
  try {
    rmSync(indexPath, { force: true })
    git(['read-tree', parent])
    for (const [path, bytes] of files) {
      const blob = git(['hash-object', '-w', '--stdin'], bytes)
      git(['update-index', '--add', '--cacheinfo', `100644,${blob},${path}`])
    }
    const tree = git(['write-tree'])
    const commit = git(['commit-tree', tree, '-p', parent, '-m', 'fixture declaration'])
    git(['update-ref', 'refs/heads/main', commit, parent])
    return commit
  } finally {
    rmSync(indexPath, { force: true })
  }
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

test('R2-P4 real OCI Git binding staging enforces the complete source/DB declaration basis before object creation', {
  skip: process.env.CONEXUS_R2_P4_GIT_LIVE === 'true' ? false : 'requires the exact admitted OCI Git image',
  timeout: 900_000,
}, async (t) => {
  const { outputRoot, built } = compileGitCapability()
  const storageRoot = mkdtempSync('/tmp/conexus-r2-binding-declaration-basis-')
  t.after(() => {
    rmSync(outputRoot, { recursive: true, force: true })
    rmSync(storageRoot, { recursive: true, force: true })
  })
  const { createOciGitExecutionPort, createOciProjectBindingGitCapability } = await import(built('project/git-execution.js'))
  const projectId = '12121212-1212-4121-8121-121212121212'
  const attemptId = '13131313-1313-4131-8131-131313131313'
  const connectionPath = '.conexus/project/connection-bindings.json'
  const brainPath = '.conexus/project/brain-binding.json'
  const connectionBytes = Buffer.from('{"bindings":[]}')
  const populatedConnectionBytes = Buffer.from('{"bindings":[{"foreign":true}]}')
  const brainBytes = Buffer.from('{"brainRevisionId":"brain-1","validationState":"VALID"}')
  const absentChecks = [
    { path: connectionPath, digest: sha256(connectionBytes), allowAbsent: true },
    { path: brainPath, digest: null, allowAbsent: true },
  ]
  const populatedConnectionChecks = [
    { path: connectionPath, digest: sha256(populatedConnectionBytes), allowAbsent: false },
    { path: brainPath, digest: null, allowAbsent: true },
  ]
  const source = createOciGitExecutionPort({ projectStorageRoot: storageRoot })
  const seeded = await source.stageNewProjectSource({ projectId, attemptId })
  assert.equal(seeded.status, 'STAGED', JSON.stringify(seeded))
  assert.deepEqual(await source.promoteStagedProjectSource({
    projectId, attemptId, sourceRevision: seeded.sourceRevision,
  }), { status: 'PROMOTED', sourceRevision: seeded.sourceRevision })
  const sourceRepository = resolve(storageRoot, 'projects', projectId)

  const makeCase = (name, files = []) => {
    const root = resolve(storageRoot, 'cases', name)
    const repository = resolve(root, 'projects', projectId)
    mkdirSync(resolve(root, 'projects'), { recursive: true, mode: 0o700 })
    cpSync(sourceRepository, repository, { recursive: true })
    const sourceRevision = files.length > 0
      ? commitHostFixtureFiles(repository, seeded.sourceRevision, files)
      : seeded.sourceRevision
    return { root, repository, sourceRevision, capability: createOciProjectBindingGitCapability({ projectStorageRoot: root }) }
  }
  const stage = async (subject, intentId, expectedDeclarations) => subject.capability.stageProjectBindingIntent({
    projectId, intentId, expectedSourceRevision: subject.sourceRevision,
    path: connectionPath, declarationBytes: connectionBytes, expectedDeclarations,
  })

  const absent = makeCase('absent')
  const absentResult = await stage(absent, '14141414-1414-4141-8141-141414141414', absentChecks)
  assert.equal(absentResult.status, 'STAGED', JSON.stringify(absentResult))
  assert.equal(readFileSync(resolve(absent.repository, 'refs/heads/main'), 'utf8').trim(), seeded.sourceRevision)

  const matching = makeCase('matching', [[connectionPath, connectionBytes], [brainPath, brainBytes]])
  const matchingResult = await stage(matching, '15151515-1515-4151-8151-151515151515', [
    { path: connectionPath, digest: sha256(connectionBytes), allowAbsent: false },
    { path: brainPath, digest: sha256(brainBytes), allowAbsent: false },
  ])
  assert.equal(matchingResult.status, 'STAGED', JSON.stringify(matchingResult))
  assert.equal(readFileSync(resolve(matching.repository, 'refs/heads/main'), 'utf8').trim(), matching.sourceRevision)

  const deletion = await matching.capability.stageProjectBindingIntent({
    projectId,
    intentId: '18181818-1818-4181-8181-181818181818',
    expectedSourceRevision: matching.sourceRevision,
    path: brainPath,
    mutation: 'DELETE',
    declarationBytes: Buffer.alloc(0),
    expectedDeclarations: [
      { path: connectionPath, digest: sha256(connectionBytes), allowAbsent: false },
      { path: brainPath, digest: sha256(brainBytes), allowAbsent: false },
    ],
  })
  assert.equal(deletion.status, 'STAGED', JSON.stringify(deletion))
  assert.deepEqual(await matching.capability.applyProjectBindingIntent(deletion), {
    status: 'APPLIED', oldSourceRevision: matching.sourceRevision,
    newSourceRevision: deletion.applySourceRevision,
  })
  assert.notEqual(spawnSync('git', [
    '--git-dir', matching.repository, 'cat-file', '-e',
    `${deletion.applySourceRevision}:${brainPath}`,
  ]).status, 0)
  assert.deepEqual(await matching.capability.cancelProjectBindingIntent(deletion), {
    status: 'CANCELLED_APPLIED', oldSourceRevision: deletion.applySourceRevision,
    newSourceRevision: deletion.cancelAppliedSourceRevision,
  })
  assert.equal(spawnSync('git', [
    '--git-dir', matching.repository, 'cat-file', '-e',
    `${deletion.cancelAppliedSourceRevision}:${brainPath}`,
  ]).status, 0)

  const refusalCases = [
    ['mismatched populated connection', [[connectionPath, populatedConnectionBytes]], absentChecks.map((check) => ({ ...check })), 'SOURCE_DB_DIVERGENCE'],
    ['missing populated connection', [], populatedConnectionChecks, 'SOURCE_DB_DIVERGENCE'],
    ['foreign brain', [[brainPath, brainBytes]], absentChecks.map((check) => ({ ...check })), 'SOURCE_DB_DIVERGENCE'],
    ['directory at reserved path', [[`${connectionPath}/foreign.txt`, Buffer.from('foreign')]], absentChecks.map((check) => ({ ...check })), 'SOURCE_DB_DIVERGENCE'],
  ]
  for (const [name, files, expectedDeclarations, code] of refusalCases) {
    const subject = makeCase(name.replaceAll(' ', '-'), files)
    const before = repositoryBytes(subject.repository)
    assert.deepEqual(await stage(subject, '16161616-1616-4161-8161-161616161616', expectedDeclarations), {
      status: 'REFUSED', code,
    }, name)
    assert.deepEqual(repositoryBytes(subject.repository), before, `${name} must refuse before object creation`)
  }

  const malformed = makeCase('malformed')
  const malformedChecks = [
    [{ path: connectionPath, digest: sha256(connectionBytes), allowAbsent: true }],
    [
      { path: connectionPath, digest: 'not-a-sha256', allowAbsent: true },
      { path: brainPath, digest: null, allowAbsent: true },
    ],
    [absentChecks[0], absentChecks[0]],
  ]
  let malformedBytes = repositoryBytes(malformed.repository)
  for (const expectedDeclarations of malformedChecks) {
    assert.deepEqual(await stage(malformed, '17171717-1717-4171-8171-171717171717', expectedDeclarations), {
      status: 'REFUSED', code: 'DECLARATION_REFUSED',
    })
    assert.deepEqual(repositoryBytes(malformed.repository), malformedBytes, 'malformed checks must be byte-preserving')
    malformedBytes = repositoryBytes(malformed.repository)
  }
})

test('R2-P4 real OCI Git recovery refuses missing staged objects in a quiesced filesystem restore', {
  skip: process.env.CONEXUS_R2_P4_GIT_LIVE === 'true' ? false : 'requires the exact admitted OCI Git image',
  timeout: 900_000,
}, async (t) => {
  const { outputRoot, built } = compileGitCapability()
  const fixtureRoot = mkdtempSync('/tmp/conexus-r2-binding-object-restore-')
  t.after(() => {
    rmSync(outputRoot, { recursive: true, force: true })
    rmSync(fixtureRoot, { recursive: true, force: true })
  })
  const { createOciProjectBindingGitCapability } = await import(built('project/git-execution.js'))
  const { R1C14_GIT_IDENTITY } = await import(built('generated/r1c14-git-identity.js'))
  const projectId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  const originalRoot = resolve(fixtureRoot, 'original')
  const repository = resolve(originalRoot, 'projects', projectId)
  mkdirSync(repository, { recursive: true, mode: 0o700 })
  const sourceRevision = createBareOciFixture(repository, R1C14_GIT_IDENTITY.ociIndexDigest)
  const capability = createOciProjectBindingGitCapability({ projectStorageRoot: originalRoot })
  const input = {
    projectId, intentId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    expectedSourceRevision: sourceRevision,
    path: '.conexus/project/connection-bindings.json',
    declarationBytes: new TextEncoder().encode('{"bindings":[]}'),
  }
  const staged = await capability.stageProjectBindingIntent(input)
  assert.equal(staged.status, 'STAGED', JSON.stringify(staged))
  const frozen = { ...input, ...staged }
  const originalBytes = repositoryBytes(repository)

  // Exact filesystem backups while all fixture writers are quiesced. This
  // proves the production Git module's object-closure check, not PostgreSQL
  // backup coordination or the separate ref-only bundle restore API.
  const completeRoot = resolve(fixtureRoot, 'complete')
  const completeRepository = resolve(completeRoot, 'projects', projectId)
  cpSync(repository, completeRepository, { recursive: true })
  const complete = createOciProjectBindingGitCapability({ projectStorageRoot: completeRoot })
  assert.deepEqual(await complete.inspectProjectBindingIntent(frozen), { status: 'BASE', head: sourceRevision })
  assert.deepEqual(repositoryBytes(completeRepository), originalBytes)

  const omitted = new Set([staged.applySourceRevision, staged.cancelBaseSourceRevision, staged.cancelAppliedSourceRevision]
    .map((oid) => resolve(repository, 'objects', oid.slice(0, 2), oid.slice(2))))
  for (const path of omitted) assert.ok(readFileSync(path).length > 0, 'omit actual staged loose objects')
  const incompleteRoot = resolve(fixtureRoot, 'incomplete')
  const incompleteRepository = resolve(incompleteRoot, 'projects', projectId)
  cpSync(repository, incompleteRepository, { recursive: true, filter: (path) => !omitted.has(path) })
  const incomplete = createOciProjectBindingGitCapability({ projectStorageRoot: incompleteRoot })
  const restoredBytes = repositoryBytes(incompleteRepository)
  assert.notDeepEqual(restoredBytes, originalBytes)
  assert.equal(readFileSync(resolve(incompleteRepository, 'refs/heads/main'), 'utf8').trim(), sourceRevision)
  for (const operation of ['inspectProjectBindingIntent', 'applyProjectBindingIntent', 'cancelProjectBindingIntent']) {
    assert.deepEqual(await incomplete[operation](frozen), { status: 'REFUSED', code: 'GIT_RESULT_REFUSED' }, operation)
    assert.deepEqual(repositoryBytes(incompleteRepository), restoredBytes, `${operation} must not repair or mutate an incomplete restore`)
  }
  assert.deepEqual(repositoryBytes(repository), originalBytes)
})

test('R2-P4 real OCI Git recovery rejects unsafe config, alternates, and hooks in stage and inspect', {
  skip: process.env.CONEXUS_R2_P4_GIT_LIVE === 'true' ? false : 'requires the exact admitted OCI Git image',
  timeout: 900_000,
}, async (t) => {
  const { outputRoot, built } = compileGitCapability()
  const storageRoot = mkdtempSync('/tmp/conexus-r2-binding-git-safety-')
  t.after(() => {
    rmSync(outputRoot, { recursive: true, force: true })
    rmSync(storageRoot, { recursive: true, force: true })
  })
  const { createOciProjectBindingGitCapability } = await import(built('project/git-execution.js'))
  const { R1C14_GIT_IDENTITY } = await import(built('generated/r1c14-git-identity.js'))
  const projectId = '44444444-4444-4444-8444-444444444444'
  const intentId = '55555555-5555-4555-8555-555555555555'
  const projectRoot = resolve(storageRoot, 'projects', projectId)
  mkdirSync(projectRoot, { recursive: true, mode: 0o700 })
  const sourceRevision = createBareOciFixture(projectRoot, R1C14_GIT_IDENTITY.ociIndexDigest)
  const input = {
    projectId, intentId, expectedSourceRevision: sourceRevision,
    path: '.conexus/project/connection-bindings.json',
    declarationBytes: new TextEncoder().encode('{"bindings":[]}'),
  }
  const capability = createOciProjectBindingGitCapability({ projectStorageRoot: storageRoot })
  const staged = await capability.stageProjectBindingIntent(input)
  assert.equal(staged.status, 'STAGED', JSON.stringify(staged))
  const frozen = { ...input, ...staged }
  const mainRef = resolve(projectRoot, 'refs/heads/main')
  const originalHead = readFileSync(mainRef, 'utf8')
  const unsafeCases = [
    ['config', () => appendFileSync(resolve(projectRoot, 'config'), '\n[core]\nsshCommand = forbidden\n')],
    ['alternates', () => writeFileSync(resolve(projectRoot, 'objects/info/alternates'), '/forbidden\n', { flag: 'wx', mode: 0o600 })],
    ['hook', () => writeFileSync(resolve(projectRoot, 'hooks/pre-commit'), '#!/bin/sh\n', { flag: 'wx', mode: 0o700 })],
  ]
  for (const [name, mutate] of unsafeCases) {
    const configBytes = name === 'config' ? readFileSync(resolve(projectRoot, 'config')) : null
    mutate()
    try {
      assert.deepEqual(await capability.stageProjectBindingIntent(input), { status: 'REFUSED', code: 'UNSAFE_REPOSITORY' }, name)
      assert.deepEqual(await capability.inspectProjectBindingIntent(frozen), { status: 'REFUSED', code: 'UNSAFE_REPOSITORY' }, name)
      assert.equal(readFileSync(mainRef, 'utf8'), originalHead, `${name} must not mutate main`)
    } finally {
      if (name === 'config') writeFileSync(resolve(projectRoot, 'config'), configBytes)
      else if (name === 'alternates') rmSync(resolve(projectRoot, 'objects/info/alternates'), { force: true })
      else rmSync(resolve(projectRoot, 'hooks/pre-commit'), { force: true })
    }
  }
})

test('R2-P4 real OCI Git binding recovery freezes deterministic apply and cancellation commits', {
  skip: process.env.CONEXUS_R2_P4_GIT_LIVE === 'true' ? false : 'requires the exact admitted OCI Git image',
  timeout: 900_000,
}, async (t) => {
  const { outputRoot, built } = compileGitCapability()
  const storageRoot = mkdtempSync('/tmp/conexus-r2-binding-git-live-')
  t.after(() => {
    rmSync(outputRoot, { recursive: true, force: true })
    rmSync(storageRoot, { recursive: true, force: true })
  })
  const { createOciGitExecutionPort, createOciProjectBindingGitCapability } = await import(built('project/git-execution.js'))
  const projectId = '11111111-1111-4111-8111-111111111111'
  const intentId = '22222222-2222-4222-8222-222222222222'
  const attemptId = '33333333-3333-4333-8333-333333333333'
  const source = createOciGitExecutionPort({ projectStorageRoot: storageRoot })
  const seeded = await source.stageNewProjectSource({ projectId, attemptId })
  assert.equal(seeded.status, 'STAGED', JSON.stringify(seeded))
  assert.equal((await source.promoteStagedProjectSource({ projectId, attemptId, sourceRevision: seeded.sourceRevision })).status, 'PROMOTED')
  const repository = resolve(storageRoot, 'projects', projectId)
  const capability = createOciProjectBindingGitCapability({ projectStorageRoot: storageRoot })
  const input = {
    projectId,
    intentId,
    expectedSourceRevision: seeded.sourceRevision,
    path: '.conexus/project/connection-bindings.json',
    declarationBytes: new TextEncoder().encode('{"bindings":[]}'),
  }
  const staged = await capability.stageProjectBindingIntent(input)
  assert.equal(staged.status, 'STAGED', JSON.stringify(staged))
  assert.notEqual(staged.applySourceRevision, staged.oldSourceRevision)
  assert.notEqual(staged.cancelBaseSourceRevision, staged.oldSourceRevision)
  assert.notEqual(staged.cancelAppliedSourceRevision, staged.applySourceRevision)
  const frozen = { ...input, ...staged }
  const head = () => readFileSync(resolve(repository, 'refs/heads/main'), 'utf8').trim()
  assert.equal(head(), seeded.sourceRevision)
  assert.deepEqual(await capability.inspectProjectBindingIntent(frozen), {
    status: 'BASE', head: seeded.sourceRevision,
  })
  assert.deepEqual(await capability.applyProjectBindingIntent(frozen), {
    status: 'APPLIED', oldSourceRevision: seeded.sourceRevision, newSourceRevision: staged.applySourceRevision,
  })
  const appliedBytes = repositoryBytes(repository)
  assert.deepEqual(await capability.stageProjectBindingIntent(input), {
    status: 'CONFLICT', expectedSourceRevision: seeded.sourceRevision, actualSourceRevision: staged.applySourceRevision,
  })
  assert.deepEqual(repositoryBytes(repository), appliedBytes)
  assert.deepEqual(await capability.inspectProjectBindingIntent(frozen), {
    status: 'APPLIED', head: staged.applySourceRevision,
  })
  assert.deepEqual(await capability.applyProjectBindingIntent(frozen), {
    status: 'APPLIED', oldSourceRevision: seeded.sourceRevision, newSourceRevision: staged.applySourceRevision,
  })
  assert.deepEqual(await capability.cancelProjectBindingIntent(frozen), {
    status: 'CANCELLED_APPLIED', oldSourceRevision: staged.applySourceRevision, newSourceRevision: staged.cancelAppliedSourceRevision,
  })
  const cancelledBytes = repositoryBytes(repository)
  assert.deepEqual(await capability.stageProjectBindingIntent(input), {
    status: 'CONFLICT', expectedSourceRevision: seeded.sourceRevision, actualSourceRevision: staged.cancelAppliedSourceRevision,
  })
  assert.deepEqual(repositoryBytes(repository), cancelledBytes)
  assert.equal((await capability.applyProjectBindingIntent(frozen)).status, 'CONFLICT')
  assert.deepEqual(repositoryBytes(repository), cancelledBytes, 'a delayed apply cannot change the cancelled repository')
  assert.deepEqual(await capability.inspectProjectBindingIntent(frozen), {
    status: 'CANCELLED_APPLIED', head: staged.cancelAppliedSourceRevision,
  })
  assert.deepEqual(await capability.cancelProjectBindingIntent(frozen), {
    status: 'CANCELLED_APPLIED', oldSourceRevision: staged.applySourceRevision, newSourceRevision: staged.cancelAppliedSourceRevision,
  })

})

test('R2-P4 real OCI Git recovery proves C0/C1 cancellation, source absence, and later-intent fencing', {
  skip: process.env.CONEXUS_R2_P4_GIT_LIVE === 'true' ? false : 'requires the exact admitted OCI Git image',
  timeout: 900_000,
}, async (t) => {
  const { outputRoot, built } = compileGitCapability()
  const storageRoot = mkdtempSync('/tmp/conexus-r2-binding-git-cancel-')
  t.after(() => {
    rmSync(outputRoot, { recursive: true, force: true })
    rmSync(storageRoot, { recursive: true, force: true })
  })
  const { createOciGitExecutionPort, createOciProjectBindingGitCapability } = await import(built('project/git-execution.js'))
  const { composeProjectSourceOwnership } = await import(built('project/module.js'))
  const { createProjectSourceSnapshot } = await import(built('project/source-snapshot.js'))
  const { R1_NEW_PROJECT_SEED } = await import(built('generated/r1-new-project-seed.js'))
  const projectId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const attemptId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  const source = createOciGitExecutionPort({ projectStorageRoot: storageRoot })
  const seeded = await source.stageNewProjectSource({ projectId, attemptId })
  assert.equal(seeded.status, 'STAGED', JSON.stringify(seeded))
  assert.equal((await source.promoteStagedProjectSource({ projectId, attemptId, sourceRevision: seeded.sourceRevision })).status, 'PROMOTED')
  const repository = resolve(storageRoot, 'projects', projectId)
  const capability = createOciProjectBindingGitCapability({ projectStorageRoot: storageRoot })
  const ownership = composeProjectSourceOwnership(Object.fromEntries(R1_NEW_PROJECT_SEED.entries
    .map((entry) => [entry.path, entry.class])))
  const input = {
    projectId,
    intentId: '66666666-6666-4666-8666-666666666666',
    expectedSourceRevision: seeded.sourceRevision,
    path: '.conexus/project/brain-binding.json',
    declarationBytes: new TextEncoder().encode('{"bindings":[]}'),
  }

  const stagedC0 = await capability.stageProjectBindingIntent(input)
  assert.equal(stagedC0.status, 'STAGED', JSON.stringify(stagedC0))
  const frozenC0 = { ...input, ...stagedC0 }
  assert.deepEqual(await capability.cancelProjectBindingIntent(frozenC0), {
    status: 'CANCELLED_BASE', oldSourceRevision: seeded.sourceRevision, newSourceRevision: stagedC0.cancelBaseSourceRevision,
  })
  const c0Bytes = repositoryBytes(repository)
  assert.deepEqual(await capability.cancelProjectBindingIntent(frozenC0), {
    status: 'CANCELLED_BASE', oldSourceRevision: seeded.sourceRevision, newSourceRevision: stagedC0.cancelBaseSourceRevision,
  })
  assert.deepEqual(repositoryBytes(repository), c0Bytes)
  const c0Snapshot = createProjectSourceSnapshot({
    storageRoot, projectId, sourceRevision: stagedC0.cancelBaseSourceRevision, ownership,
  })
  assert.equal((await c0Snapshot.listPaths()).some((entry) => entry.path === input.path), false,
    'C0 must preserve an absent declaration as absent')
  assert.deepEqual(await capability.applyProjectBindingIntent(frozenC0), {
    status: 'CONFLICT', expectedSourceRevision: seeded.sourceRevision, actualSourceRevision: stagedC0.cancelBaseSourceRevision,
  })
  assert.deepEqual(repositoryBytes(repository), c0Bytes, 'a delayed apply cannot mutate after C0')
  assert.deepEqual(await capability.stageProjectBindingIntent(input), {
    status: 'CONFLICT', expectedSourceRevision: seeded.sourceRevision, actualSourceRevision: stagedC0.cancelBaseSourceRevision,
  })
  assert.deepEqual(repositoryBytes(repository), c0Bytes, 'staging an old command cannot mutate after C0')

  const inputC1 = {
    ...input,
    intentId: '77777777-7777-4777-8777-777777777777',
    expectedSourceRevision: stagedC0.cancelBaseSourceRevision,
  }
  const stagedC1 = await capability.stageProjectBindingIntent(inputC1)
  assert.equal(stagedC1.status, 'STAGED', JSON.stringify(stagedC1))
  const frozenC1 = { ...inputC1, ...stagedC1 }
  assert.deepEqual(await capability.applyProjectBindingIntent(frozenC1), {
    status: 'APPLIED', oldSourceRevision: stagedC0.cancelBaseSourceRevision, newSourceRevision: stagedC1.applySourceRevision,
  })
  const c1AppliedBytes = repositoryBytes(repository)
  assert.deepEqual(await capability.cancelProjectBindingIntent(frozenC1), {
    status: 'CANCELLED_APPLIED', oldSourceRevision: stagedC1.applySourceRevision, newSourceRevision: stagedC1.cancelAppliedSourceRevision,
  })
  const c1Bytes = repositoryBytes(repository)
  assert.notDeepEqual(c1AppliedBytes, c1Bytes, 'C1 must advance to an append-only cancellation commit')
  assert.deepEqual(await capability.cancelProjectBindingIntent(frozenC1), {
    status: 'CANCELLED_APPLIED', oldSourceRevision: stagedC1.applySourceRevision, newSourceRevision: stagedC1.cancelAppliedSourceRevision,
  })
  assert.deepEqual(repositoryBytes(repository), c1Bytes)
  const c1Snapshot = createProjectSourceSnapshot({
    storageRoot, projectId, sourceRevision: stagedC1.cancelAppliedSourceRevision, ownership,
  })
  assert.equal((await c1Snapshot.listPaths()).some((entry) => entry.path === inputC1.path), false,
    'C1 must preserve an absent declaration as absent')
  assert.deepEqual(await capability.applyProjectBindingIntent(frozenC1), {
    status: 'CONFLICT', expectedSourceRevision: stagedC0.cancelBaseSourceRevision, actualSourceRevision: stagedC1.cancelAppliedSourceRevision,
  })
  assert.deepEqual(repositoryBytes(repository), c1Bytes, 'a delayed apply cannot mutate after C1')

  const laterInput = {
    ...inputC1,
    intentId: '88888888-8888-4888-8888-888888888888',
    expectedSourceRevision: stagedC1.cancelAppliedSourceRevision,
    declarationBytes: new TextEncoder().encode('{"bindings":[{"connectionId":"later"}]}'),
  }
  const stagedLater = await capability.stageProjectBindingIntent(laterInput)
  assert.equal(stagedLater.status, 'STAGED', JSON.stringify(stagedLater))
  const frozenLater = { ...laterInput, ...stagedLater }
  assert.deepEqual(await capability.applyProjectBindingIntent(frozenLater), {
    status: 'APPLIED', oldSourceRevision: stagedC1.cancelAppliedSourceRevision, newSourceRevision: stagedLater.applySourceRevision,
  })
  const laterBytes = repositoryBytes(repository)
  assert.deepEqual(await capability.stageProjectBindingIntent(inputC1), {
    status: 'CONFLICT', expectedSourceRevision: stagedC0.cancelBaseSourceRevision, actualSourceRevision: stagedLater.applySourceRevision,
  })
  assert.deepEqual(repositoryBytes(repository), laterBytes)
  for (const [operation, invoke] of [
    ['inspect', () => capability.inspectProjectBindingIntent(frozenC1)],
    ['apply', () => capability.applyProjectBindingIntent(frozenC1)],
    ['cancel', () => capability.cancelProjectBindingIntent(frozenC1)],
  ]) {
    const before = repositoryBytes(repository)
    const result = await invoke()
    assert.equal(result.status, 'CONFLICT', `${operation} must reject a tuple against a later known head`)
    assert.deepEqual(repositoryBytes(repository), before, `${operation} against a later head must be byte-preserving`)
  }
  t.diagnostic(`C0=${stagedC0.cancelBaseSourceRevision} C1=${stagedC1.cancelAppliedSourceRevision} later=${stagedLater.applySourceRevision}`)
})

test('R2-P4 real OCI Git recovery refuses foreign frozen tuples without repository mutation', {
  skip: process.env.CONEXUS_R2_P4_GIT_LIVE === 'true' ? false : 'requires the exact admitted OCI Git image',
  timeout: 900_000,
}, async (t) => {
  const { outputRoot, built } = compileGitCapability()
  const storageRoot = mkdtempSync('/tmp/conexus-r2-binding-git-foreign-')
  t.after(() => {
    rmSync(outputRoot, { recursive: true, force: true })
    rmSync(storageRoot, { recursive: true, force: true })
  })
  const { createOciGitExecutionPort, createOciProjectBindingGitCapability } = await import(built('project/git-execution.js'))
  const projectId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const foreignProjectId = '99999999-9999-4999-8999-999999999999'
  const attemptId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  const foreignAttemptId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  const source = createOciGitExecutionPort({ projectStorageRoot: storageRoot })
  const seeded = await source.stageNewProjectSource({ projectId, attemptId })
  assert.equal(seeded.status, 'STAGED', JSON.stringify(seeded))
  assert.equal((await source.promoteStagedProjectSource({ projectId, attemptId, sourceRevision: seeded.sourceRevision })).status, 'PROMOTED')
  const foreignSeeded = await source.stageNewProjectSource({ projectId: foreignProjectId, attemptId: foreignAttemptId })
  assert.equal(foreignSeeded.status, 'STAGED', JSON.stringify(foreignSeeded))
  assert.equal((await source.promoteStagedProjectSource({ projectId: foreignProjectId, attemptId: foreignAttemptId, sourceRevision: foreignSeeded.sourceRevision })).status, 'PROMOTED')
  const foreignRepository = resolve(storageRoot, 'projects', foreignProjectId)
  const capability = createOciProjectBindingGitCapability({ projectStorageRoot: storageRoot })
  const oldInput = {
    projectId,
    intentId: '66666666-6666-4666-8666-666666666666',
    expectedSourceRevision: seeded.sourceRevision,
    path: '.conexus/project/brain-binding.json',
    declarationBytes: new TextEncoder().encode('{"bindings":[]}'),
  }
  const oldStaged = await capability.stageProjectBindingIntent(oldInput)
  assert.equal(oldStaged.status, 'STAGED', JSON.stringify(oldStaged))
  const oldFrozen = { ...oldInput, ...oldStaged }
  const foreignInput = {
    projectId: foreignProjectId,
    intentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    expectedSourceRevision: foreignSeeded.sourceRevision,
    path: '.conexus/project/connection-bindings.json',
    declarationBytes: new TextEncoder().encode('{"bindings":[]}'),
  }
  const foreignStaged = await capability.stageProjectBindingIntent(foreignInput)
  assert.equal(foreignStaged.status, 'STAGED', JSON.stringify(foreignStaged))
  const foreignFrozen = { ...foreignInput, ...foreignStaged }
  assert.deepEqual(await capability.applyProjectBindingIntent(foreignFrozen), {
    status: 'APPLIED', oldSourceRevision: foreignSeeded.sourceRevision, newSourceRevision: foreignStaged.applySourceRevision,
  })
  const foreignBytes = repositoryBytes(foreignRepository)
  const oldTupleInForeign = { ...oldFrozen, projectId: foreignProjectId }
  assert.deepEqual(await capability.stageProjectBindingIntent({ ...oldInput, projectId: foreignProjectId }), {
    status: 'CONFLICT', expectedSourceRevision: seeded.sourceRevision, actualSourceRevision: foreignStaged.applySourceRevision,
  })
  assert.deepEqual(repositoryBytes(foreignRepository), foreignBytes)
  for (const [operation, invoke] of [
    ['inspect', () => capability.inspectProjectBindingIntent(oldTupleInForeign)],
    ['apply', () => capability.applyProjectBindingIntent(oldTupleInForeign)],
    ['cancel', () => capability.cancelProjectBindingIntent(oldTupleInForeign)],
  ]) {
    const before = repositoryBytes(foreignRepository)
    const result = await invoke()
    assert.equal(result.status, 'REFUSED', `${operation} must refuse a foreign frozen tuple`)
    assert.deepEqual(repositoryBytes(foreignRepository), before, `${operation} against a foreign head must be byte-preserving`)
  }
  t.diagnostic(`foreignHead=${foreignStaged.applySourceRevision}`)
})
