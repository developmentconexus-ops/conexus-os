import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { buildR1S3GitIdentity, checkR1S3GitIdentity } from '../../scripts/generate-r1-s3-git-identity.mjs'
import { buildR1S3NewProjectSeed, checkR1S3NewProjectSeed } from '../../scripts/generate-r1-s3-new-project-seed.mjs'
import { checkR1S3GitExecution } from '../../scripts/check-r1-s3-git-execution.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const hubBuild = mkdtempSync(resolve(repositoryRoot, 'apps/hub/r1-s3-git-build-'))
process.once('exit', () => rmSync(hubBuild, { recursive: true, force: true }))
const compiled = spawnSync(process.execPath, [
  resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'),
  '--project', resolve(repositoryRoot, 'apps/hub/tsconfig.json'),
  '--noEmit', 'false', '--outDir', hubBuild,
], { encoding: 'utf8' })
if (compiled.status !== 0) throw new Error(`S3_HUB_COMPILE_FAILED\n${compiled.stdout}\n${compiled.stderr}`)
const built = (path) => pathToFileURL(resolve(hubBuild, path)).href
const { createOciGitExecutionPort } = await import(built('project/git-execution.js'))
const { admitGitImportLocator, createGitImportAdmissionCatalog } = await import(built('project/git-import-admission.js'))
const { R1C14_GIT_IDENTITY } = await import(built('generated/r1c14-git-identity.js'))
const { R1_NEW_PROJECT_SEED } = await import(built('generated/r1-new-project-seed.js'))

const result = (stdout = '', overrides = {}) => ({
  exitCode: 0, signal: null, stdout, stderr: '', overflow: false, spawnError: false, ...overrides,
})
const run = (command, args, options = {}) => {
  const outcome = spawnSync(command, args, { encoding: 'utf8', ...options })
  if (outcome.status !== 0 || outcome.signal !== null) {
    throw new Error(`S3_P3_COMMAND_FAILED:${command}:${outcome.status}:${outcome.signal}\n${outcome.stdout}\n${outcome.stderr}`)
  }
  return outcome.stdout.trim()
}
const waitFor = async (path) => {
  for (let index = 0; index < 200; index += 1) {
    if (existsSync(path)) return
    await new Promise((complete) => setTimeout(complete, 25))
  }
  throw new Error(`S3_P3_FIXTURE_NOT_READY:${path}`)
}
const filesBelow = (root) => readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
  const path = resolve(root, entry.name)
  return entry.isDirectory() ? filesBelow(path) : entry.isFile() ? [path] : []
})

test('generated Git identity preserves operational pins and forbidden bindings', () => {
  assert.deepEqual(checkR1S3GitIdentity(repositoryRoot), buildR1S3GitIdentity(repositoryRoot))
  assert.equal(R1C14_GIT_IDENTITY.ociIndexDigest, 'sha256:5e5c3526292bb87a97a3fa41c8e715800a02da5238fbe07bf99c1c4b614f7851')
  assert.equal(R1C14_GIT_IDENTITY.gitExecutableSha256, 'b5d1f9f76f9805ce8721accc9d8bbff9af9b7407e182ab07a5677dafa6c22201')
  assert.deepEqual(R1C14_GIT_IDENTITY.forbiddenBindingIdentities, [
    'image.linuxAmd64ManifestDigest',
    'host Git',
    'sha256:a75b3631df2a6e6bcdf94e4ee511bb81ddbab3f21b391badae9598f3bae1b9d7',
    'sha256:4b52df3b20e6c4654bb8cf4270fbe911cc3b0e8bc738a54fa325496b24e2854a',
    'sha256:44ad647a10c0a9659e3cfebb28e6b384ac8af15ac53fc2d0cd662cd30d7817b0',
  ])
})

test('Git identity checks ignore report prose but reject operational drift', context => {
  const candidate = mkdtempSync('/tmp/conexus-git-identity-')
  context.after(() => rmSync(candidate, { recursive: true, force: true }))
  const manifestPath = 'docs/evidence/4d/4d-r1-foundation-pin-manifest-r1c14-native-successor.json'
  const generatedPath = 'apps/hub/src/generated/r1c14-git-identity.ts'
  mkdirSync(resolve(candidate, 'docs/evidence/4d'), { recursive: true })
  mkdirSync(resolve(candidate, 'apps/hub/src/generated'), { recursive: true })
  const manifest = JSON.parse(readFileSync(resolve(repositoryRoot, manifestPath), 'utf8'))
  manifest.note = 'Changed historical report prose without renewed admission'
  writeFileSync(resolve(candidate, manifestPath), JSON.stringify(manifest))
  writeFileSync(resolve(candidate, generatedPath), readFileSync(resolve(repositoryRoot, generatedPath)))
  assert.equal(checkR1S3GitIdentity(candidate).gitExecutablePath, '/usr/local/bin/git')
  manifest.git.executableSha256 = '0'.repeat(64)
  writeFileSync(resolve(candidate, manifestPath), JSON.stringify(manifest))
  assert.throws(() => checkR1S3GitIdentity(candidate), /S3_GIT_GENERATED_IDENTITY_DRIFT/)
  manifest.git.executableSha256 = 'invalid'
  writeFileSync(resolve(candidate, manifestPath), JSON.stringify(manifest))
  assert.throws(() => checkR1S3GitIdentity(candidate), /S3_GIT_IDENTITY_FORMAT/)
})

test('S3-P2 generated NEW seed is exact and has an empty APP-owned set', () => {
  assert.deepEqual(checkR1S3NewProjectSeed(repositoryRoot), buildR1S3NewProjectSeed(repositoryRoot))
  const seed = buildR1S3NewProjectSeed(repositoryRoot)
  assert.equal(seed.appOwnedPathCount, 0)
  assert.match(seed.expectedTree, /^[0-9a-f]{40}$/)
  assert.match(seed.expectedSourceRevision, /^[0-9a-f]{40}$/)
  assert.deepEqual(seed.entries.map(({ class: ownerClass, path }) => ({ class: ownerClass, path })), [
    { class: 'GENERATED', path: 'generated/r1/operations.json' },
    { class: 'GENERATED', path: 'generated/r1/operations.mjs' },
    { class: 'PLATFORM-CONTRACT', path: 'platform/r1/contract.json' },
  ])
})

test('S3-P5 Project-private port exposes only the seven bounded named operations', () => {
  const methods = ['verifyAdmittedImage', 'stageNewProjectSource', 'stageExistingGitProjectSource', 'promoteStagedProjectSource', 'verifyCanonicalProjectSource', 'createProjectSourceBundle', 'restoreProjectSourceBundle']
  assert.deepEqual(checkR1S3GitExecution(repositoryRoot).portMethods, methods)
  assert.deepEqual(Object.keys(createOciGitExecutionPort({}, async () => result())), methods)
  assert.equal(createOciGitExecutionPort({}, async () => result()).verifyAdmittedImage.length, 0)
  assert.equal(createOciGitExecutionPort({}, async () => result()).stageNewProjectSource.length, 1)
  assert.equal(createOciGitExecutionPort({}, async () => result()).stageExistingGitProjectSource.length, 1)
  assert.equal(createOciGitExecutionPort({}, async () => result()).promoteStagedProjectSource.length, 1)
  assert.equal(createOciGitExecutionPort({}, async () => result()).verifyCanonicalProjectSource.length, 1)
  assert.equal(createOciGitExecutionPort({}, async () => result()).createProjectSourceBundle.length, 1)
  assert.equal(createOciGitExecutionPort({}, async () => result()).restoreProjectSourceBundle.length, 1)
})

test('S3-P4 custody RED matrix fails closed without moving canonical state', async (suite) => {
  const projectId = '99999999-9999-4999-8999-999999999999'
  const attemptId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const sourceRevision = R1_NEW_PROJECT_SEED.expectedSourceRevision
  const verified = () => [
    result(`${R1C14_GIT_IDENTITY.ociIndexDigest}\n`),
    result(`git version ${R1C14_GIT_IDENTITY.gitVersion}\n`),
    result(`${R1C14_GIT_IDENTITY.gitExecutableSha256}\n`),
  ]
  const repositoryVerified = () => result(`${JSON.stringify({ status: 'VERIFIED', sourceRevision, tree: '1'.repeat(40) })}\n`)

  await suite.test('identity and storage refusal precede custody mutation', async () => {
    let responses = verified()
    assert.deepEqual(await createOciGitExecutionPort({}, async () => responses.shift()).promoteStagedProjectSource({
      projectId, attemptId, sourceRevision: 'not-an-oid',
    }), { status: 'REFUSED', code: 'IDENTITY_REFUSED' })
    responses = verified()
    assert.deepEqual(await createOciGitExecutionPort({ projectStorageRoot: '/tmp/conexus-s3-p4-absent' }, async () => responses.shift()).promoteStagedProjectSource({
      projectId, attemptId, sourceRevision,
    }), { status: 'REFUSED', code: 'STORAGE_ROOT_REFUSED' })
  })

  await suite.test('canonical verification failure quarantines only the candidate', async () => {
    const storageRoot = mkdtempSync('/tmp/conexus-s3-p4-promote-red-')
    const stagedRoot = resolve(storageRoot, 'staging', projectId, attemptId, 'repository.git')
    const canonicalRoot = resolve(storageRoot, 'projects', projectId)
    mkdirSync(stagedRoot, { recursive: true, mode: 0o700 })
    mkdirSync(canonicalRoot, { recursive: true, mode: 0o700 })
    writeFileSync(resolve(canonicalRoot, 'canonical-marker'), 'preserve canonical\n', { mode: 0o600 })
    const responses = [...verified(), repositoryVerified(), result('', { exitCode: 1 })]
    try {
      const outcome = await createOciGitExecutionPort({ projectStorageRoot: storageRoot }, async () => responses.shift()).promoteStagedProjectSource({
        projectId, attemptId, sourceRevision,
      })
      assert.deepEqual(outcome, { status: 'REFUSED', code: 'CANDIDATE_QUARANTINED' })
      assert.equal(existsSync(canonicalRoot), true)
      assert.equal(existsSync(stagedRoot), false)
      assert.equal(existsSync(resolve(storageRoot, 'quarantine', projectId, attemptId)), true)
    } finally {
      rmSync(storageRoot, { recursive: true, force: true })
    }
  })

  await suite.test('bundle process refusal never publishes a final bundle', async () => {
    const storageRoot = mkdtempSync('/tmp/conexus-s3-p4-bundle-red-')
    const canonicalRoot = resolve(storageRoot, 'projects', projectId)
    mkdirSync(canonicalRoot, { recursive: true, mode: 0o700 })
    mkdirSync(resolve(storageRoot, 'staging', projectId), { recursive: true, mode: 0o700 })
    const calls = []
    const responses = [...verified(), repositoryVerified(), result('', { exitCode: 1 })]
    try {
      const outcome = await createOciGitExecutionPort({ projectStorageRoot: storageRoot }, async (executable, args) => {
        calls.push({ executable, args: [...args] })
        return responses.shift()
      }).createProjectSourceBundle({ projectId, attemptId, sourceRevision })
      assert.deepEqual(outcome, { status: 'REFUSED', code: 'BUNDLE_REFUSED' })
      assert.equal(existsSync(resolve(storageRoot, 'bundles', projectId, `${sourceRevision}.bundle`)), false)
      const bundleCall = calls.at(-1)
      assert.equal(bundleCall.args.includes('none'), true)
      assert.equal(bundleCall.args.some((value) => value === `type=bind,src=${canonicalRoot},dst=/repository.git,readonly`), true)
    } finally {
      rmSync(storageRoot, { recursive: true, force: true })
    }
  })

  await suite.test('restore refusal removes scratch and permits same-attempt re-entry', async () => {
    const storageRoot = mkdtempSync('/tmp/conexus-s3-p4-restore-red-')
    const attemptRoot = resolve(storageRoot, 'staging', projectId, attemptId)
    const bundleRoot = resolve(storageRoot, 'bundles', projectId)
    mkdirSync(bundleRoot, { recursive: true, mode: 0o700 })
    writeFileSync(resolve(bundleRoot, `${sourceRevision}.bundle`), 'synthetic bundle bytes', { mode: 0o600 })
    const imageResponses = verified()
    let restoreCalls = 0
    try {
      const port = createOciGitExecutionPort({ projectStorageRoot: storageRoot }, async (_executable, args) => {
        if (imageResponses.length) return imageResponses.shift()
        const program = args.at(-1)
        if (typeof program === 'string' && program.includes("'clone', '--bare', '--no-hardlinks'")) {
          restoreCalls += 1
          mkdirSync(resolve(attemptRoot, 'verify.git'), { recursive: true, mode: 0o700 })
          mkdirSync(resolve(attemptRoot, 'repository.git'), { recursive: true, mode: 0o700 })
          return result(`${JSON.stringify(restoreCalls === 1
            ? { status: 'REFUSED' }
            : { status: 'RESTORED', sourceRevision })}\n`)
        }
        return repositoryVerified()
      })
      assert.deepEqual(await port.restoreProjectSourceBundle({ projectId, attemptId, sourceRevision }), {
        status: 'REFUSED', code: 'RESTORE_REFUSED',
      })
      assert.equal(existsSync(resolve(attemptRoot, 'verify.git')), false)
      assert.equal(existsSync(resolve(attemptRoot, 'repository.git')), false)
      assert.deepEqual(await port.restoreProjectSourceBundle({ projectId, attemptId, sourceRevision }), {
        status: 'RESTORED', sourceRevision,
      })
      assert.equal(existsSync(resolve(storageRoot, 'projects', projectId)), true)
      assert.equal(existsSync(resolve(attemptRoot, 'verify.git')), false)
    } finally {
      rmSync(storageRoot, { recursive: true, force: true })
    }
  })
})

const admittedEntry = (overrides = {}) => ({
  id: 'local-canary', host: 'git.allowed.test', port: 443, pathPrefix: '/admitted/',
  defaultRef: 'refs/heads/main', tls: { mode: 'EXTERNAL_CA_FILE', caFileSlot: 'canary-ca' },
  credentialSlot: 'canary-credential', networkName: 'conexus-s3-p3-canary',
  timeoutMs: 10_000, maxFetchedBytes: 1_048_576, maxObjectCount: 64, enabled: true,
  ...overrides,
})

test('S3-P3 catalog is closed and canonical admission refuses the exact destination matrix', () => {
  const catalog = createGitImportAdmissionCatalog([admittedEntry()])
  assert.ok(catalog)
  assert.equal(Object.isFrozen(catalog), true)
  assert.equal(Object.isFrozen(catalog.entries[0]), true)
  assert.equal(createGitImportAdmissionCatalog([admittedEntry(), admittedEntry({ id: 'overlap', pathPrefix: '/admitted/repo/' })]), null)
  assert.equal(createGitImportAdmissionCatalog([admittedEntry({ host: '127.0.0.1' })]), null)
  assert.equal(createGitImportAdmissionCatalog([admittedEntry({ networkName: 'host' })]), null)
  assert.deepEqual(admitGitImportLocator(catalog, 'https://git.allowed.test/admitted/repo.git'), {
    status: 'ADMITTED', canonicalLocator: 'https://git.allowed.test/admitted/repo.git', entry: catalog.entries[0],
  })
  for (const locator of [
    'http://git.allowed.test/admitted/repo.git',
    'https://user@git.allowed.test/admitted/repo.git',
    'https://git.allowed.test/admitted/repo.git?token=secret',
    'https://git.allowed.test/admitted/repo.git#fragment',
    'https://127.0.0.1/admitted/repo.git',
    'https://git.allowed.test/outside/repo.git',
    'https://git.allowed.test/admitted/%2e%2e/outside.git',
    'https://GIT.allowed.test/admitted/repo.git',
  ]) assert.equal(admitGitImportLocator(catalog, locator).status, 'REFUSED', locator)
  assert.deepEqual(admitGitImportLocator({ entries: catalog.entries }, 'https://git.allowed.test/admitted/repo.git'), {
    status: 'REFUSED', code: 'CATALOG_REFUSED',
  })
})

test('S3-P0 uses only the exact inspect and hardened no-network Docker vectors', async () => {
  const calls = []
  const responses = [
    result(`${R1C14_GIT_IDENTITY.ociIndexDigest}\n`),
    result(`git version ${R1C14_GIT_IDENTITY.gitVersion}\n`),
    result(`${R1C14_GIT_IDENTITY.gitExecutableSha256}\n`),
  ]
  const port = createOciGitExecutionPort({}, async (executable, args) => {
    calls.push({ executable, args: [...args] })
    return responses.shift()
  })
  assert.deepEqual(await port.verifyAdmittedImage(), {
    status: 'VERIFIED',
    ociIndexDigest: R1C14_GIT_IDENTITY.ociIndexDigest,
    gitVersion: R1C14_GIT_IDENTITY.gitVersion,
    gitExecutableSha256: R1C14_GIT_IDENTITY.gitExecutableSha256,
  })
  assert.equal(calls.length, 3)
  assert.deepEqual(calls[0], {
    executable: 'docker',
    args: ['image', 'inspect', '--format', '{{.Id}}', R1C14_GIT_IDENTITY.ociIndexDigest],
  })
  for (const call of calls.slice(1)) {
    assert.equal(call.executable, 'docker')
    assert.deepEqual(call.args.slice(0, 13), [
      'run', '--rm', '--pull', 'never', '--network', 'none', '--cap-drop', 'ALL',
      '--security-opt', 'no-new-privileges', '--read-only', '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m',
    ])
    assert.equal(call.args.includes(R1C14_GIT_IDENTITY.ociIndexDigest), true)
    assert.equal(call.args.includes(R1C14_GIT_IDENTITY.linuxAmd64ManifestDigest), false)
    for (const forbidden of R1C14_GIT_IDENTITY.forbiddenBindingIdentities.filter((value) => value.startsWith('sha256:'))) {
      assert.equal(call.args.includes(forbidden), false)
    }
  }
})

test('S3-P0 fails closed for inspect, process, version and executable-hash falsifiers', async (suite) => {
  const cases = [
    ['inspect failure', [result('', { exitCode: 1 })], 'IMAGE_INSPECT_FAILED'],
    ['inspect signal', [result('', { exitCode: null, signal: 'SIGKILL' })], 'IMAGE_INSPECT_FAILED'],
    ['inspect overflow', [result(R1C14_GIT_IDENTITY.ociIndexDigest, { overflow: true })], 'IMAGE_INSPECT_FAILED'],
    ['wrong image', [result(`sha256:${'0'.repeat(64)}`)], 'IMAGE_IDENTITY_MISMATCH'],
    ['version process failure', [result(R1C14_GIT_IDENTITY.ociIndexDigest), result('', { spawnError: true })], 'VERSION_PROBE_FAILED'],
    ['wrong version', [result(R1C14_GIT_IDENTITY.ociIndexDigest), result('git version 9.9.9')], 'VERSION_MISMATCH'],
    ['hash process failure', [result(R1C14_GIT_IDENTITY.ociIndexDigest), result(`git version ${R1C14_GIT_IDENTITY.gitVersion}`), result('', { stderr: 'redacted' })], 'EXECUTABLE_HASH_PROBE_FAILED'],
    ['wrong hash', [result(R1C14_GIT_IDENTITY.ociIndexDigest), result(`git version ${R1C14_GIT_IDENTITY.gitVersion}`), result('0'.repeat(64))], 'EXECUTABLE_HASH_MISMATCH'],
  ]
  for (const [label, responses, code] of cases) {
    await suite.test(label, async () => {
      const port = createOciGitExecutionPort({}, async () => responses.shift())
      assert.deepEqual(await port.verifyAdmittedImage(), { status: 'REFUSED', code })
    })
  }
})

test('S3-P0 real WSL proof runs only the admitted image with networking disabled', {
  skip: process.env.CONEXUS_S3_LIVE !== 'true' ? 'set CONEXUS_S3_LIVE=true for deciding local proof' : false,
  timeout: 120_000,
}, async () => {
  assert.deepEqual(await createOciGitExecutionPort().verifyAdmittedImage(), {
    status: 'VERIFIED',
    ociIndexDigest: R1C14_GIT_IDENTITY.ociIndexDigest,
    gitVersion: R1C14_GIT_IDENTITY.gitVersion,
    gitExecutableSha256: R1C14_GIT_IDENTITY.gitExecutableSha256,
  })
})

test('S3-P2 refuses unsafe identities, absent roots and symlink owner roots before Git mutation', async () => {
  const root = mkdtempSync('/tmp/conexus-s3-p2-path-red-')
  const target = resolve(root, 'target')
  const link = resolve(root, 'link')
  mkdirSync(target)
  symlinkSync(target, link)
  const verified = [
    result(`${R1C14_GIT_IDENTITY.ociIndexDigest}\n`),
    result(`git version ${R1C14_GIT_IDENTITY.gitVersion}\n`),
    result(`${R1C14_GIT_IDENTITY.gitExecutableSha256}\n`),
  ]
  const port = createOciGitExecutionPort({ projectStorageRoot: link }, async () => verified.shift())
  assert.deepEqual(await port.stageNewProjectSource({ projectId: 'not-a-uuid', attemptId: 'also-not-a-uuid' }), { status: 'REFUSED', code: 'IDENTITY_REFUSED' })
  const verifiedAgain = [
    result(`${R1C14_GIT_IDENTITY.ociIndexDigest}\n`),
    result(`git version ${R1C14_GIT_IDENTITY.gitVersion}\n`),
    result(`${R1C14_GIT_IDENTITY.gitExecutableSha256}\n`),
  ]
  const symlinkPort = createOciGitExecutionPort({ projectStorageRoot: link }, async () => verifiedAgain.shift())
  assert.deepEqual(await symlinkPort.stageNewProjectSource({
    projectId: '11111111-1111-4111-8111-111111111111',
    attemptId: '22222222-2222-4222-8222-222222222222',
  }), { status: 'REFUSED', code: 'STORAGE_ROOT_REFUSED' })
  rmSync(root, { recursive: true, force: true })
})

test('S3-P2 stage vector is owner-bound and refuses process or typed-result falsifiers', async (suite) => {
  const projectId = '11111111-1111-4111-8111-111111111111'
  const attemptId = '22222222-2222-4222-8222-222222222222'
  const sourceRevision = R1_NEW_PROJECT_SEED.expectedSourceRevision
  const tree = R1_NEW_PROJECT_SEED.expectedTree
  const cases = [
    ['stage process failure', result('', { exitCode: 1 }), { status: 'REFUSED', code: 'GIT_PROCESS_FAILED' }],
    ['stage signal', result('', { exitCode: null, signal: 'SIGKILL' }), { status: 'REFUSED', code: 'GIT_PROCESS_FAILED' }],
    ['stage overflow', result('', { overflow: true }), { status: 'REFUSED', code: 'GIT_PROCESS_FAILED' }],
    ['malformed result', result('not-json'), { status: 'REFUSED', code: 'GIT_RESULT_REFUSED' }],
    ['wrong revision', result(JSON.stringify({ status: 'STAGED', sourceRevision: 'wrong', tree, appOwnedPathCount: 0 })), { status: 'REFUSED', code: 'GIT_RESULT_REFUSED' }],
    ['nonempty APP census', result(JSON.stringify({ status: 'STAGED', sourceRevision, tree, appOwnedPathCount: 1 })), { status: 'REFUSED', code: 'GIT_RESULT_REFUSED' }],
  ]
  for (const [label, stageResult, expected] of cases) {
    await suite.test(label, async () => {
      const storageRoot = mkdtempSync('/tmp/conexus-s3-p2-process-red-')
      const responses = [
        result(`${R1C14_GIT_IDENTITY.ociIndexDigest}\n`),
        result(`git version ${R1C14_GIT_IDENTITY.gitVersion}\n`),
        result(`${R1C14_GIT_IDENTITY.gitExecutableSha256}\n`),
        stageResult,
      ]
      try {
        const port = createOciGitExecutionPort({ projectStorageRoot: storageRoot }, async () => responses.shift())
        assert.deepEqual(await port.stageNewProjectSource({ projectId, attemptId }), expected)
      } finally {
        rmSync(storageRoot, { recursive: true, force: true })
      }
    })
  }

  const storageRoot = mkdtempSync('/tmp/conexus-s3-p2-vector-')
  const calls = []
  const responses = [
    result(`${R1C14_GIT_IDENTITY.ociIndexDigest}\n`),
    result(`git version ${R1C14_GIT_IDENTITY.gitVersion}\n`),
    result(`${R1C14_GIT_IDENTITY.gitExecutableSha256}\n`),
    result(JSON.stringify({ status: 'STAGED', sourceRevision, tree, appOwnedPathCount: 0 })),
  ]
  try {
    const port = createOciGitExecutionPort({ projectStorageRoot: storageRoot }, async (executable, args) => {
      calls.push({ executable, args: [...args] })
      return responses.shift()
    })
    assert.deepEqual(await port.stageNewProjectSource({ projectId, attemptId }), { status: 'STAGED', sourceRevision, tree, appOwnedPathCount: 0 })
    const stageCall = calls.at(-1)
    assert.equal(stageCall.executable, 'docker')
    assert.equal(stageCall.args.includes('--user'), true)
    assert.equal(stageCall.args.includes('--mount'), true)
    assert.equal(stageCall.args.some((value) => value.includes(repositoryRoot)), false)
    assert.equal(stageCall.args.includes(R1C14_GIT_IDENTITY.ociIndexDigest), true)
    assert.equal(stageCall.args.includes('/usr/local/bin/node'), true)
    const program = stageCall.args.at(-1)
    assert.match(program, /spawnSync\('\/usr\/local\/bin\/git'/)
    assert.doesNotMatch(program, /shell\s*:/)
  } finally {
    rmSync(storageRoot, { recursive: true, force: true })
  }
})

test('S3-P3 admitted import uses only catalog network and temporary secret-file transport', async () => {
  const storageRoot = mkdtempSync('/tmp/conexus-s3-p3-vector-')
  const secretFile = resolve(storageRoot, 'external-credential')
  const caFile = resolve(storageRoot, 'external-ca.pem')
  const secret = 'fixture-user\nS3-P3-synthetic-secret-0f53e784\n'
  writeFileSync(secretFile, secret, { mode: 0o600 })
  chmodSync(secretFile, 0o600)
  writeFileSync(caFile, 'synthetic-ca')
  const catalog = createGitImportAdmissionCatalog([admittedEntry()])
  assert.ok(catalog)
  const calls = []
  const sourceRevision = '1'.repeat(40)
  const responses = [
    result(`${R1C14_GIT_IDENTITY.ociIndexDigest}\n`),
    result(`git version ${R1C14_GIT_IDENTITY.gitVersion}\n`),
    result(`${R1C14_GIT_IDENTITY.gitExecutableSha256}\n`),
    result(JSON.stringify({ status: 'STAGED', sourceRevision, defaultRef: 'refs/heads/main', objectCount: 3, fetchedBytes: 123 })),
  ]
  try {
    const port = createOciGitExecutionPort({
      projectStorageRoot: storageRoot,
      gitImportCatalog: catalog,
      externalFileSlots: { 'canary-credential': secretFile, 'canary-ca': caFile },
    }, async (executable, args, timeoutMs) => {
      calls.push({ executable, args: [...args], timeoutMs })
      return responses.shift()
    })
    const output = await port.stageExistingGitProjectSource({
      projectId: '33333333-3333-4333-8333-333333333333',
      attemptId: '44444444-4444-4444-8444-444444444444',
      locator: 'https://git.allowed.test/admitted/repo.git',
    })
    assert.deepEqual(output, {
      status: 'STAGED', sourceRevision, defaultRef: 'refs/heads/main', objectCount: 3, fetchedBytes: 123,
    })
    const stageCall = calls.at(-1)
    assert.equal(stageCall.executable, 'docker')
    assert.equal(stageCall.timeoutMs, 10_000)
    assert.deepEqual(stageCall.args.slice(0, 4), ['run', '--rm', '--pull', 'never'])
    assert.equal(stageCall.args.includes('conexus-s3-p3-canary'), true)
    assert.equal(stageCall.args.includes(R1C14_GIT_IDENTITY.ociIndexDigest), true)
    assert.equal(stageCall.args.some((value) => value.includes('/run/conexus/credential,readonly')), true)
    assert.equal(stageCall.args.some((value) => value.includes('/run/conexus/ca.pem,readonly')), true)
    assert.equal(JSON.stringify(stageCall).includes('S3-P3-synthetic-secret-0f53e784'), false)
    const attemptRoot = resolve(storageRoot, 'staging/33333333-3333-4333-8333-333333333333/44444444-4444-4444-8444-444444444444')
    assert.deepEqual(readdirSync(attemptRoot), ['repository.git'])
    const program = stageCall.args.at(-1)
    assert.match(program, /http\.followRedirects=false/)
    assert.match(program, /credential\.helper=/)
    assert.match(program, /--no-write-fetch-head/)
    assert.doesNotMatch(program, /shell\s*:/)
  } finally {
    rmSync(storageRoot, { recursive: true, force: true })
  }
})

test('S3-P3 refuses missing catalog, forbidden locator and unsafe secret before network execution', async () => {
  const storageRoot = mkdtempSync('/tmp/conexus-s3-p3-red-')
  const catalog = createGitImportAdmissionCatalog([admittedEntry()])
  assert.ok(catalog)
  const verified = () => [
    result(`${R1C14_GIT_IDENTITY.ociIndexDigest}\n`),
    result(`git version ${R1C14_GIT_IDENTITY.gitVersion}\n`),
    result(`${R1C14_GIT_IDENTITY.gitExecutableSha256}\n`),
  ]
  const input = {
    projectId: '33333333-3333-4333-8333-333333333333',
    attemptId: '44444444-4444-4444-8444-444444444444',
    locator: 'https://git.allowed.test/admitted/repo.git',
  }
  try {
    let responses = verified()
    assert.deepEqual(await createOciGitExecutionPort({ projectStorageRoot: storageRoot }, async () => responses.shift()).stageExistingGitProjectSource(input), {
      status: 'REFUSED', code: 'CATALOG_REFUSED',
    })
    responses = verified()
    assert.deepEqual(await createOciGitExecutionPort({ projectStorageRoot: storageRoot, gitImportCatalog: catalog }, async () => responses.shift()).stageExistingGitProjectSource({
      ...input, locator: 'https://git.allowed.test/outside/repo.git',
    }), { status: 'REFUSED', code: 'DESTINATION_NOT_ADMITTED' })
    const secretFile = resolve(storageRoot, 'world-readable-secret')
    writeFileSync(secretFile, 'user\npassword\n', { mode: 0o644 })
    responses = verified()
    assert.deepEqual(await createOciGitExecutionPort({
      projectStorageRoot: storageRoot,
      gitImportCatalog: catalog,
      externalFileSlots: { 'canary-credential': secretFile, 'canary-ca': resolve(storageRoot, 'missing-ca') },
    }, async () => responses.shift()).stageExistingGitProjectSource(input), { status: 'REFUSED', code: 'SECRET_FILE_REFUSED' })
  } finally {
    rmSync(storageRoot, { recursive: true, force: true })
  }
})

test('S3-P3 real exact-image HTTPS import admits one OID, refuses redirect and removes secret transport', {
  skip: process.env.CONEXUS_S3_P3_LIVE !== 'true' ? 'set CONEXUS_S3_P3_LIVE=true for isolated deciding canary' : false,
  timeout: 360_000,
}, async (context) => {
  const workRoot = mkdtempSync('/tmp/conexus-s3-p3-live-')
  const suffix = workRoot.split('-').at(-1).replace(/[^a-zA-Z0-9]/g, '').slice(0, 10)
  const networkName = `conexus-s3-p3-${suffix}`
  const fixtureName = `conexus-s3-p3-fixture-${suffix}`
  const secret = `S3-P3-live-${suffix}-credential-canary`
  const credentialPath = resolve(workRoot, 'credential')
  const certPath = resolve(workRoot, 'ca.pem')
  const keyPath = resolve(workRoot, 'ca-key.pem')
  const readyPath = resolve(workRoot, 'ready.json')
  const logPath = resolve(workRoot, 'requests.json')
  const sourceRoot = resolve(workRoot, 'source')
  mkdirSync(sourceRoot, { mode: 0o700 })
  writeFileSync(resolve(sourceRoot, 'README.md'), 'S3-P3 admitted source\n')
  writeFileSync(credentialPath, `fixture-user\n${secret}\n`, { mode: 0o600 })
  chmodSync(credentialPath, 0o600)
  const opensslConfig = resolve(workRoot, 'openssl.cnf')
  writeFileSync(opensslConfig, '[req]\ndistinguished_name=dn\nx509_extensions=ext\nprompt=no\n[dn]\nCN=git.allowed.test\n[ext]\nsubjectAltName=DNS:git.allowed.test\n')
  run('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-config', opensslConfig, '-keyout', keyPath, '-out', certPath])
  const sourceProgram = `
const { spawnSync } = require('node:child_process')
const env = { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', HOME: '/tmp', GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@conexus.invalid', GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@conexus.invalid', GIT_AUTHOR_DATE: '2000-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2000-01-01T00:00:00Z' }
const git = (args) => { const r = spawnSync('/usr/local/bin/git', args, { env, encoding: 'utf8' }); if (r.status !== 0 || r.signal) process.exit(91); return r.stdout.trim() }
git(['init', '--initial-branch=main', '/fixture/source'])
git(['-C', '/fixture/source', 'add', '--all'])
git(['-C', '/fixture/source', 'commit', '-m', 'fixture'])
git(['clone', '--bare', '/fixture/source', '/fixture/repo.git'])
git(['--git-dir=/fixture/repo.git', 'update-server-info'])
process.stdout.write(git(['--git-dir=/fixture/repo.git', 'rev-parse', 'refs/heads/main']) + '\\n')
`
  let networkCreated = false
  let fixtureCreated = false
  try {
    const sourceRevision = run('docker', [
      'run', '--rm', '--pull', 'never', '--network', 'none', '--cap-drop', 'ALL',
      '--security-opt', 'no-new-privileges', '--read-only', '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m',
      '--user', `${process.getuid()}:${process.getgid()}`, '--mount', `type=bind,src=${workRoot},dst=/fixture`,
      '--entrypoint', '/usr/local/bin/node', R1C14_GIT_IDENTITY.ociIndexDigest, '-e', sourceProgram,
    ])
    assert.match(sourceRevision, /^[0-9a-f]{40}$/)
    run('docker', ['network', 'create', networkName])
    networkCreated = true
    const fixtureScript = resolve(repositoryRoot, 'tests/fixtures/r1-s3-git-import-https-fixture.mjs')
    run('docker', [
      'run', '-d', '--pull', 'never', '--network', networkName, '--network-alias', 'git.allowed.test',
      '--name', fixtureName, '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--read-only',
      '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m', '--user', `${process.getuid()}:${process.getgid()}`,
      '--mount', `type=bind,src=${workRoot},dst=/fixture`,
      '--mount', `type=bind,src=${fixtureScript},dst=/fixture-server.mjs,readonly`, '--entrypoint', '/usr/local/bin/node',
      R1C14_GIT_IDENTITY.ociIndexDigest, '/fixture-server.mjs', '/fixture/repo.git', '/fixture/ca.pem',
      '/fixture/ca-key.pem', '/fixture/credential', '/fixture/ready.json', '/fixture/requests.json',
    ])
    fixtureCreated = true
    try {
      await waitFor(readyPath)
    } catch (error) {
      const logs = spawnSync('docker', ['logs', fixtureName], { encoding: 'utf8' })
      throw new Error(`${error.message}\n${logs.stdout}\n${logs.stderr}`)
    }
    const catalog = createGitImportAdmissionCatalog([
      admittedEntry({ port: 8443, networkName, timeoutMs: 60_000 }),
      admittedEntry({ id: 'redirect-canary', port: 8443, pathPrefix: '/redirect/', networkName, timeoutMs: 60_000 }),
    ])
    assert.ok(catalog)
    const port = createOciGitExecutionPort({
      projectStorageRoot: workRoot,
      gitImportCatalog: catalog,
      externalFileSlots: { 'canary-credential': credentialPath, 'canary-ca': certPath },
    })
    const winner = await port.stageExistingGitProjectSource({
      projectId: '55555555-5555-4555-8555-555555555555',
      attemptId: '66666666-6666-4666-8666-666666666666',
      locator: 'https://git.allowed.test:8443/admitted/repo.git',
    })
    assert.equal(winner.status, 'STAGED', JSON.stringify(winner))
    assert.equal(winner.sourceRevision, sourceRevision)
    context.diagnostic(`sourceRevision=${winner.sourceRevision} objectCount=${winner.objectCount} fetchedBytes=${winner.fetchedBytes}`)
    const loser = await port.stageExistingGitProjectSource({
      projectId: '55555555-5555-4555-8555-555555555555',
      attemptId: '66666666-6666-4666-8666-666666666666',
      locator: 'https://git.allowed.test:8443/admitted/repo.git',
    })
    assert.equal(loser.status, 'CAS_CONFLICT', JSON.stringify(loser))
    assert.equal(loser.sourceRevision, sourceRevision)
    const redirect = await port.stageExistingGitProjectSource({
      projectId: '77777777-7777-4777-8777-777777777777',
      attemptId: '88888888-8888-4888-8888-888888888888',
      locator: 'https://git.allowed.test:8443/redirect/repo.git',
    })
    assert.deepEqual(redirect, { status: 'REFUSED', code: 'REMOTE_DISCOVERY_REFUSED' })
    if (process.env.CONEXUS_S3_P4_EXISTING_LIVE === 'true') {
      const projectId = '55555555-5555-4555-8555-555555555555'
      const stageAttemptId = '66666666-6666-4666-8666-666666666666'
      const restoreAttemptId = '99999999-9999-4999-8999-999999999991'
      const adoptAttemptId = '99999999-9999-4999-8999-999999999992'
      assert.deepEqual(await port.promoteStagedProjectSource({ projectId, attemptId: stageAttemptId, sourceRevision }), {
        status: 'PROMOTED', sourceRevision,
      })
      assert.deepEqual(await port.createProjectSourceBundle({ projectId, attemptId: stageAttemptId, sourceRevision }), {
        status: 'BUNDLED', sourceRevision,
      })
      const canonicalRoot = resolve(workRoot, 'projects', projectId)
      const bundlePath = resolve(workRoot, 'bundles', projectId, `${sourceRevision}.bundle`)
      assert.equal(statSync(canonicalRoot).isDirectory(), true)
      assert.equal(statSync(bundlePath).isFile(), true)
      rmSync(canonicalRoot, { recursive: true, force: true })
      assert.deepEqual(await port.restoreProjectSourceBundle({ projectId, attemptId: restoreAttemptId, sourceRevision }), {
        status: 'RESTORED', sourceRevision,
      })
      const adoptCandidate = await port.stageExistingGitProjectSource({
        projectId,
        attemptId: adoptAttemptId,
        locator: 'https://git.allowed.test:8443/admitted/repo.git',
      })
      assert.equal(adoptCandidate.status, 'STAGED', JSON.stringify(adoptCandidate))
      assert.equal(adoptCandidate.sourceRevision, sourceRevision)
      assert.deepEqual(await port.promoteStagedProjectSource({ projectId, attemptId: adoptAttemptId, sourceRevision }), {
        status: 'ADOPTED', sourceRevision,
      })
      context.diagnostic('P4-A EXISTING_GIT promoted, bundled, restored and exact canonical re-adopted')
    }
    run('docker', ['kill', '--signal', 'TERM', fixtureName])
    run('docker', ['rm', fixtureName])
    fixtureCreated = false
    await waitFor(logPath)
    const requests = JSON.parse(readFileSync(logPath, 'utf8'))
    assert.equal(requests.some(({ requestTarget }) => requestTarget.startsWith('/forbidden/')), false)
    assert.equal(requests.some(({ authorizationPresent }) => authorizationPresent), true)
    for (const path of filesBelow(workRoot)) {
      if (path === credentialPath || !statSync(path).isFile()) continue
      assert.equal(readFileSync(path).includes(Buffer.from(secret)), false, path)
    }
  } finally {
    if (fixtureCreated) spawnSync('docker', ['rm', '-f', fixtureName])
    if (networkCreated) spawnSync('docker', ['network', 'rm', networkName])
    rmSync(workRoot, { recursive: true, force: true })
  }
})

test('S3-P4-A real exact-image NEW promotes, bundles and restores the same Project revision', {
  skip: process.env.CONEXUS_S3_P4_LIVE !== 'true' ? 'set CONEXUS_S3_P4_LIVE=true for isolated custody proof' : false,
  timeout: 600_000,
}, async (context) => {
  const storageRoot = mkdtempSync('/tmp/conexus-s3-p4-live-')
  const projectId = '99999999-9999-4999-8999-999999999999'
  const stageAttemptId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const restoreAttemptId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  const adoptAttemptId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  const mismatchAttemptId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
  const sourceRevision = R1_NEW_PROJECT_SEED.expectedSourceRevision
  try {
    const port = createOciGitExecutionPort({ projectStorageRoot: storageRoot })
    const staged = await port.stageNewProjectSource({ projectId, attemptId: stageAttemptId })
    assert.equal(staged.status, 'STAGED', JSON.stringify(staged))
    context.diagnostic('NEW staged')
    assert.deepEqual(await port.promoteStagedProjectSource({ projectId, attemptId: stageAttemptId, sourceRevision }), {
      status: 'PROMOTED', sourceRevision,
    })
    context.diagnostic('staging promoted')
    const canonicalRoot = resolve(storageRoot, 'projects', projectId)
    assert.equal(statSync(canonicalRoot).isDirectory(), true)
    assert.deepEqual(await port.createProjectSourceBundle({ projectId, attemptId: stageAttemptId, sourceRevision }), {
      status: 'BUNDLED', sourceRevision,
    })
    context.diagnostic('bundle created and verified')
    const bundlePath = resolve(storageRoot, 'bundles', projectId, `${sourceRevision}.bundle`)
    const exactBundle = readFileSync(bundlePath)
    assert.equal(exactBundle.length > 0, true)
    rmSync(canonicalRoot, { recursive: true, force: true })
    const corruptBundle = Buffer.from(exactBundle)
    corruptBundle[corruptBundle.length - 1] ^= 0xff
    writeFileSync(bundlePath, corruptBundle)
    assert.deepEqual(await port.restoreProjectSourceBundle({ projectId, attemptId: restoreAttemptId, sourceRevision }), {
      status: 'REFUSED', code: 'RESTORE_REFUSED',
    })
    context.diagnostic('corrupt bundle refused')
    assert.equal(existsSync(canonicalRoot), false)
    writeFileSync(bundlePath, exactBundle)
    assert.deepEqual(await port.restoreProjectSourceBundle({ projectId, attemptId: restoreAttemptId, sourceRevision }), {
      status: 'RESTORED', sourceRevision,
    })
    context.diagnostic('same-ID bundle restored')
    assert.equal(statSync(canonicalRoot).isDirectory(), true)
    assert.equal((await port.stageNewProjectSource({ projectId, attemptId: adoptAttemptId })).status, 'STAGED')
    assert.deepEqual(await port.promoteStagedProjectSource({ projectId, attemptId: adoptAttemptId, sourceRevision }), {
      status: 'ADOPTED', sourceRevision,
    })
    context.diagnostic('exact canonical re-adopted')
    assert.equal((await port.stageNewProjectSource({ projectId, attemptId: mismatchAttemptId })).status, 'STAGED')
    const mismatchRepository = resolve(storageRoot, 'staging', projectId, mismatchAttemptId, 'repository.git')
    const mismatchProgram = `
const { spawnSync } = require('node:child_process')
const env = { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', HOME: '/tmp', GIT_AUTHOR_NAME: 'Mismatch', GIT_AUTHOR_EMAIL: 'mismatch@conexus.invalid', GIT_COMMITTER_NAME: 'Mismatch', GIT_COMMITTER_EMAIL: 'mismatch@conexus.invalid', GIT_AUTHOR_DATE: '2001-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2001-01-01T00:00:00Z' }
const git = (args) => { const value = spawnSync('/usr/local/bin/git', args, { env, encoding: 'utf8' }); if (value.status !== 0 || value.signal) process.exit(91); return value.stdout.trim() }
const tree = git(['--git-dir=/repository.git', 'rev-parse', 'refs/heads/main^{tree}'])
const revision = git(['--git-dir=/repository.git', 'commit-tree', tree, '-m', 'mismatch'])
git(['--git-dir=/repository.git', 'update-ref', 'refs/heads/main', revision])
process.stdout.write(revision + '\\n')
`
    const mismatchRevision = run('docker', [
      'run', '--rm', '--pull', 'never', '--network', 'none', '--cap-drop', 'ALL',
      '--security-opt', 'no-new-privileges', '--read-only', '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m',
      '--user', `${process.getuid()}:${process.getgid()}`,
      '--mount', `type=bind,src=${mismatchRepository},dst=/repository.git`,
      '--entrypoint', '/usr/local/bin/node', R1C14_GIT_IDENTITY.ociIndexDigest, '-e', mismatchProgram,
    ])
    assert.match(mismatchRevision, /^[0-9a-f]{40}$/)
    assert.deepEqual(await port.promoteStagedProjectSource({ projectId, attemptId: mismatchAttemptId, sourceRevision: mismatchRevision }), {
      status: 'REFUSED', code: 'CANDIDATE_QUARANTINED',
    })
    assert.equal(statSync(canonicalRoot).isDirectory(), true)
    assert.equal(statSync(resolve(storageRoot, 'quarantine', projectId, mismatchAttemptId)).isDirectory(), true)
    context.diagnostic('mismatched candidate quarantined; canonical preserved')
  } finally {
    rmSync(storageRoot, { recursive: true, force: true })
  }
})

test('S3-P2 real exact-image NEW stages one immutable revision and classifies the CAS loser', {
  skip: process.env.CONEXUS_S3_LIVE !== 'true' ? 'set CONEXUS_S3_LIVE=true for deciding local proof' : false,
  timeout: 180_000,
}, async () => {
  const storageRoot = mkdtempSync('/tmp/conexus-s3-p2-live-')
  try {
    const port = createOciGitExecutionPort({ projectStorageRoot: storageRoot })
    const input = {
      projectId: '11111111-1111-4111-8111-111111111111',
      attemptId: '22222222-2222-4222-8222-222222222222',
    }
    const winner = await port.stageNewProjectSource(input)
    assert.equal(winner.status, 'STAGED', JSON.stringify(winner))
    assert.equal(winner.appOwnedPathCount, 0)
    assert.equal(winner.sourceRevision, R1_NEW_PROJECT_SEED.expectedSourceRevision)
    assert.equal(winner.tree, R1_NEW_PROJECT_SEED.expectedTree)
    assert.deepEqual(await port.stageNewProjectSource(input), {
      status: 'CAS_CONFLICT',
      sourceRevision: winner.sourceRevision,
    })
  } finally {
    rmSync(storageRoot, { recursive: true, force: true })
  }
})
