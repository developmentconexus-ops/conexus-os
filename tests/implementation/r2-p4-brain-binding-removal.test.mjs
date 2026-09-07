import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { canonicalBytes, sha256 } from '../../packages/canonical-json/src/index.mjs'

const root = resolve(import.meta.dirname, '../..')
const build = mkdtempSync(resolve(root, 'apps/hub/r2-p4-brain-removal-build-'))
const compiled = spawnSync(process.execPath, [resolve(root, 'node_modules/typescript/bin/tsc'),
  '--project', resolve(root, 'apps/hub/tsconfig.json'), '--noEmit', 'false', '--outDir', build], { encoding: 'utf8' })
if (compiled.status !== 0) throw new Error(`R2_P4_BRAIN_REMOVAL_COMPILE_FAILED\n${compiled.stdout}\n${compiled.stderr}`)
process.once('exit', () => rmSync(build, { recursive: true, force: true }))
const { createProjectBindingRecovery } = await import(pathToFileURL(resolve(build, 'project/binding-recovery.js')).href)
const { createOciProjectBindingGitCapability } = await import(pathToFileURL(resolve(build, 'project/git-execution.js')).href)
const { R1C14_GIT_IDENTITY } = await import(pathToFileURL(resolve(build, 'generated/r1c14-git-identity.js')).href)

const ACCOUNT = '11111111-1111-4111-8111-111111111111'
const PROJECT = '22222222-2222-4222-8222-222222222222'
const WORKSPACE = '33333333-3333-4333-8333-333333333333'
const BRAIN_REVISION = '44444444-4444-4444-8444-444444444444'
const INTENT = '55555555-5555-4555-8555-555555555555'
const SOURCE = 'a'.repeat(40)
const APPLY = 'b'.repeat(40)
const CANCEL_BASE = 'c'.repeat(40)
const CANCEL_APPLIED = 'd'.repeat(40)
const TREE = 'e'.repeat(40)
const BRAIN_DIGEST = '1'.repeat(64)
const BINDING_DIGEST = '2'.repeat(64)
const CONNECTION_DECLARATION = { bindings: [] }
const envelope = {
  schemaVersion: 'conexus-brain-binding-removal/v1', projectId: PROJECT,
  brainRevisionId: BRAIN_REVISION, brainDigest: BRAIN_DIGEST,
  projectBindingDigest: BINDING_DIGEST,
}

const processResult = ({ status = 0, stdout = '', stderr = '', error = undefined } = {}) => ({
  exitCode: status, signal: null, stdout, stderr, overflow: false, spawnError: Boolean(error),
})

const createLocalProgramRunner = (root, { distortApplyTree = false } = {}) => {
  let programRuns = 0
  const runner = async (_executable, args) => {
    if (args[0] === 'image') return processResult({ stdout: `${R1C14_GIT_IDENTITY.ociIndexDigest}\n` })
    if (args.at(-1) === '--version') return processResult({ stdout: `git version ${R1C14_GIT_IDENTITY.gitVersion}\n` })
    if (!args.some((value) => value.startsWith('type=bind,'))) {
      return processResult({ stdout: `${R1C14_GIT_IDENTITY.gitExecutableSha256}\n` })
    }
    programRuns += 1
    const mounts = args.filter((_value, index) => args[index - 1] === '--mount')
    const mounted = (destination) => {
      const match = mounts.map((entry) => /^type=bind,src=(.*),dst=([^,]+)(?:,.*)?$/.exec(entry))
        .find((entry) => entry?.[2] === destination)
      assert.ok(match, `missing ${destination} mount`)
      return match[1]
    }
    let program = args[args.indexOf('-e') + 1]
      .replaceAll('/usr/local/bin/git', '/usr/bin/git')
      .replaceAll('/repository.git', mounted('/repository.git'))
      .replaceAll('/run/conexus/request.json', mounted('/run/conexus/request.json'))
      .replaceAll('/run/conexus/declaration.json', mounted('/run/conexus/declaration.json'))
    if (distortApplyTree) {
      const original = "const applyEntries = entries(run(['ls-tree', '-r', '-z', applySourceRevision]))"
      const falsified = `${original}\napplyEntries.push({ mode: '100644', type: 'blob', oid: '${'0'.repeat(40)}', path: 'forged-preserved.txt' })`
      assert.ok(program.includes(original), 'production apply-tree observation seam missing')
      program = program.replace(original, falsified)
    }
    const result = spawnSync(process.execPath, ['-e', program], { cwd: root, encoding: 'utf8' })
    return processResult({ status: result.status ?? 1, stdout: result.stdout, stderr: result.stderr, error: result.error })
  }
  return { runner, programRuns: () => programRuns }
}

const createBareRepository = (storageRoot, projectId, files) => {
  const repository = resolve(storageRoot, 'projects', projectId)
  mkdirSync(repository, { recursive: true, mode: 0o700 })
  const environment = {
    ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid', GIT_AUTHOR_DATE: '2000-01-01T00:00:00Z',
    GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid', GIT_COMMITTER_DATE: '2000-01-01T00:00:00Z',
  }
  const git = (args, input) => {
    const result = spawnSync('git', ['--git-dir', repository, ...args], { env: environment, input, encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    return result.stdout.trim()
  }
  const initialized = spawnSync('git', ['init', '--bare', '--initial-branch=main', repository], { env: environment, encoding: 'utf8' })
  assert.equal(initialized.status, 0, initialized.stderr)
  const index = resolve(storageRoot, `index-${projectId}`)
  environment.GIT_INDEX_FILE = index
  try {
    git(['read-tree', '--empty'])
    for (const [path, bytes] of files) {
      const blob = git(['hash-object', '-w', '--stdin'], bytes)
      git(['update-index', '--add', '--cacheinfo', `100644,${blob},${path}`])
    }
    const tree = git(['write-tree'])
    const revision = git(['commit-tree', tree, '-m', 'deletion refusal fixture'])
    git(['update-ref', 'refs/heads/main', revision, '0'.repeat(40)])
    return { repository, revision, tree }
  } finally {
    rmSync(index, { force: true })
  }
}

const removalInput = ({ projectId, intentId, sourceRevision, brainBytes }) => ({
  projectId, intentId, expectedSourceRevision: sourceRevision,
  path: '.conexus/project/brain-binding.json', mutation: 'DELETE', declarationBytes: Buffer.alloc(0),
  expectedDeclarations: [
    { path: '.conexus/project/connection-bindings.json', digest: null, allowAbsent: true },
    { path: '.conexus/project/brain-binding.json', digest: brainBytes ? sha256(brainBytes) : null, allowAbsent: !brainBytes },
  ],
})

const makeIntent = (state = 'PREPARING') => ({
  intent_id: INTENT, project_id: PROJECT, account_id: ACCOUNT, workspace_id: WORKSPACE,
  operation_kind: 'BRAIN', connection_id: null, connection_revision_id: null, environment: null,
  brain_revision_id: BRAIN_REVISION, brain_digest: BRAIN_DIGEST, source_revision: SOURCE,
  declaration: envelope, prepared_result: null, remove_binding: true, state,
  version: state === 'PREPARING' ? 0 : state === 'APPLYING' ? 1 : 2,
  declaration_digest: state === 'PREPARING' ? null : BINDING_DIGEST,
  base_tree: state === 'PREPARING' ? null : TREE,
  previous_declaration_blob: state === 'PREPARING' ? null : 'f'.repeat(40),
  apply_source_revision: state === 'PREPARING' ? null : APPLY,
  cancel_base_source_revision: state === 'PREPARING' ? null : CANCEL_BASE,
  cancel_applied_source_revision: state === 'PREPARING' ? null : CANCEL_APPLIED,
  terminal_source_revision: state === 'COMPLETED' ? APPLY : null,
  terminal_result: null, refusal_code: null,
})

const fixture = ({ settleCode, initialIntent = null } = {}) => {
  let intent = initialIntent
  const gitCalls = []
  const dbCalls = []
  const client = {
    async query(sql, args = []) {
      dbCalls.push({ sql, args })
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return { rows: [] }
      if (sql.includes('get_binding_source_intent')) return { rows: [{ intent }] }
      if (sql.includes('begin_brain_binding_removal_intent')) {
        intent = { ...makeIntent(), intent_id: args[3] }
        return { rows: [{ intent }] }
      }
      if (sql.includes('get_binding_source_basis')) return { rows: [{ basis: {
        connectionDeclaration: CONNECTION_DECLARATION, brainBindingDigest: BINDING_DIGEST,
      } }] }
      if (sql.includes('freeze_binding_source_intent')) {
        intent = { ...intent, state: 'APPLYING', version: 1, declaration_digest: args[4],
          base_tree: args[5], previous_declaration_blob: args[6], apply_source_revision: args[7],
          cancel_base_source_revision: args[8], cancel_applied_source_revision: args[9] }
        return { rows: [{ intent }] }
      }
      if (sql.includes('validate_binding_source_intent')) return { rows: [{ intent }] }
      if (sql.includes('complete_binding_source_intent')) {
        if (settleCode) throw Object.assign(new Error('settlement refused'), { code: settleCode })
        intent = { ...intent, state: 'COMPLETED', version: 2, terminal_source_revision: APPLY, terminal_result: null }
        return { rows: [{ intent }] }
      }
      if (sql.includes('abort_binding_source_intent')) {
        intent = { ...intent, state: 'ABORTING', version: 2, refusal_code: args[4] }
        return { rows: [{ intent }] }
      }
      if (sql.includes('complete_binding_source_abort')) {
        intent = { ...intent, state: 'ABORTED', version: 3, terminal_source_revision: args[4] }
        return { rows: [{ intent }] }
      }
      throw new Error(`UNEXPECTED_SQL:${sql}`)
    },
    release() {},
  }
  const git = {
    async stageProjectBindingIntent(input) {
      gitCalls.push({ kind: 'stage', input })
      return { status: 'STAGED', mutation: 'DELETE', oldSourceRevision: SOURCE, baseTree: TREE,
        previousDeclarationBlob: 'f'.repeat(40), applySourceRevision: APPLY,
        cancelBaseSourceRevision: CANCEL_BASE, cancelAppliedSourceRevision: CANCEL_APPLIED }
    },
    async applyProjectBindingIntent(input) {
      gitCalls.push({ kind: 'apply', input })
      return { status: 'APPLIED', oldSourceRevision: SOURCE, newSourceRevision: APPLY }
    },
    async cancelProjectBindingIntent(input) {
      gitCalls.push({ kind: 'cancel', input })
      return { status: 'CANCELLED_APPLIED', oldSourceRevision: APPLY, newSourceRevision: CANCEL_APPLIED }
    },
  }
  return { recovery: createProjectBindingRecovery({ pool: { connect: async () => client }, git }), gitCalls, dbCalls }
}

test('PRJ-12 recovery stages a delete-only Brain mutation and freezes the old binding digest', async () => {
  const f = fixture()
  const result = await f.recovery.executeBrainRemoval({
    accountId: ACCOUNT, projectId: PROJECT,
    expectedCurrent: { state: 'PRESENT', projectBindingDigest: BINDING_DIGEST },
  })
  assert.equal(result.state, 'COMPLETED')
  assert.equal(result.terminal_result, null)
  const staged = f.gitCalls.find((call) => call.kind === 'stage').input
  assert.equal(staged.mutation, 'DELETE')
  assert.equal(staged.path, '.conexus/project/brain-binding.json')
  assert.equal(staged.declarationBytes.byteLength, 0)
  assert.deepEqual(staged.expectedDeclarations, [
    { path: '.conexus/project/connection-bindings.json', digest: sha256(canonicalBytes(CONNECTION_DECLARATION)), allowAbsent: true },
    { path: '.conexus/project/brain-binding.json', digest: BINDING_DIGEST, allowAbsent: false },
  ])
  assert.equal(f.dbCalls.find((call) => call.sql.includes('freeze_binding_source_intent')).args[4], BINDING_DIGEST)
  assert.equal(f.gitCalls.find((call) => call.kind === 'apply').input.mutation, 'DELETE')
})

test('PRJ-12 post-Git stale settlement cancels the same frozen deletion child', async () => {
  const f = fixture({ settleCode: 'P0412' })
  const result = await f.recovery.executeBrainRemoval({
    accountId: ACCOUNT, projectId: PROJECT,
    expectedCurrent: { state: 'PRESENT', projectBindingDigest: BINDING_DIGEST },
  })
  assert.equal(result.state, 'ABORTED')
  assert.equal(result.terminal_source_revision, CANCEL_APPLIED)
  assert.equal(f.gitCalls.filter((call) => call.kind === 'apply').length, 1)
  assert.equal(f.gitCalls.filter((call) => call.kind === 'cancel').length, 1)
  assert.equal(f.gitCalls.find((call) => call.kind === 'cancel').input.mutation, 'DELETE')
})

test('PRJ-12 crash recovery reuses the frozen delete child without restaging', async () => {
  const f = fixture({ initialIntent: makeIntent('APPLYING') })
  await f.recovery.reconcile(ACCOUNT, PROJECT)
  assert.equal(f.gitCalls.filter((call) => call.kind === 'stage').length, 0)
  assert.equal(f.gitCalls.filter((call) => call.kind === 'apply').length, 1)
  assert.equal(f.gitCalls[0].input.mutation, 'DELETE')
  assert.equal(f.gitCalls[0].input.declarationBytes.byteLength, 0)
})

test('production Git capability refuses DELETE carrying bytes before invoking the staging program', async (t) => {
  const storageRoot = mkdtempSync('/tmp/conexus-r2-p4-delete-bytes-')
  t.after(() => rmSync(storageRoot, { recursive: true, force: true }))
  const local = createLocalProgramRunner(storageRoot)
  const capability = createOciProjectBindingGitCapability({ projectStorageRoot: storageRoot }, local.runner)
  const result = await capability.stageProjectBindingIntent({
    projectId: PROJECT, intentId: INTENT, expectedSourceRevision: SOURCE,
    path: '.conexus/project/brain-binding.json', mutation: 'DELETE',
    declarationBytes: Buffer.from('{}'), expectedDeclarations: [],
  })
  assert.deepEqual(result, { status: 'REFUSED', code: 'DECLARATION_REFUSED' })
  assert.equal(local.programRuns(), 0)
})

test('production DELETE staging program refuses an absent Brain target before object creation', async (t) => {
  const storageRoot = mkdtempSync('/tmp/conexus-r2-p4-delete-absent-')
  t.after(() => rmSync(storageRoot, { recursive: true, force: true }))
  const source = createBareRepository(storageRoot, PROJECT, [['preserved.txt', Buffer.from('preserved')]])
  const beforeHead = readFileSync(resolve(source.repository, 'refs/heads/main'), 'utf8')
  const beforeObjects = spawnSync('git', ['--git-dir', source.repository, 'count-objects', '-v'], { encoding: 'utf8' }).stdout
  const local = createLocalProgramRunner(storageRoot)
  const capability = createOciProjectBindingGitCapability({ projectStorageRoot: storageRoot }, local.runner)
  assert.deepEqual(await capability.stageProjectBindingIntent(removalInput({
    projectId: PROJECT, intentId: INTENT, sourceRevision: source.revision,
  })), { status: 'REFUSED', code: 'SOURCE_DB_DIVERGENCE' })
  assert.equal(local.programRuns(), 1)
  assert.equal(readFileSync(resolve(source.repository, 'refs/heads/main'), 'utf8'), beforeHead)
  assert.equal(spawnSync('git', ['--git-dir', source.repository, 'count-objects', '-v'], { encoding: 'utf8' }).stdout,
    beforeObjects)
})

test('production DELETE staging program refuses a non-delete-only APPLY tree and preserves the source tree', async (t) => {
  const storageRoot = mkdtempSync('/tmp/conexus-r2-p4-delete-tree-')
  t.after(() => rmSync(storageRoot, { recursive: true, force: true }))
  const brainBytes = canonicalBytes(envelope)
  const source = createBareRepository(storageRoot, PROJECT, [
    ['.conexus/project/brain-binding.json', brainBytes],
    ['preserved.txt', Buffer.from('preserved')],
  ])
  // Fault-inject one foreign entry into the production program's observed
  // APPLY tree. The production exactApplyTree predicate must reject it before
  // any ref mutation; the source commit/tree remain the deciding control.
  const local = createLocalProgramRunner(storageRoot, { distortApplyTree: true })
  const capability = createOciProjectBindingGitCapability({ projectStorageRoot: storageRoot }, local.runner)
  const result = await capability.stageProjectBindingIntent(removalInput({
    projectId: PROJECT, intentId: INTENT, sourceRevision: source.revision, brainBytes,
  }))
  assert.deepEqual(result, { status: 'REFUSED', code: 'GIT_RESULT_REFUSED' })
  assert.equal(local.programRuns(), 1)
  assert.equal(readFileSync(resolve(source.repository, 'refs/heads/main'), 'utf8').trim(), source.revision)
  assert.equal(spawnSync('git', ['--git-dir', source.repository, 'rev-parse', `${source.revision}^{tree}`],
    { encoding: 'utf8' }).stdout.trim(), source.tree)
  assert.equal(spawnSync('git', ['--git-dir', source.repository, 'show', `${source.revision}:preserved.txt`],
    { encoding: 'utf8' }).stdout, 'preserved')
})

test('PRJ-12 migration is manage-only and preserves exact removal identities', () => {
  const sql = readFileSync(resolve(root, 'apps/hub/migrations/016_r2_brain_binding_removal.sql'), 'utf8')
  const activeIntentGuard = sql.indexOf('PROJECT_BRAIN_REMOVAL_MIGRATION_ACTIVE_INTENT')
  const shapeChange = sql.indexOf('ALTER TABLE project.binding_source_intent')
  assert.ok(activeIntentGuard >= 0 && activeIntentGuard < shapeChange)
  assert.match(sql, /state IN \('PREPARING', 'APPLYING', 'ABORTING'\)/)
  assert.match(sql, /iam\.admit_project_manage/)
  assert.doesNotMatch(sql, /iam\.admit_brain_binding|brn\.admit_binding_validation|con\.admit_brain_proof_subject/)
  assert.match(sql, /IF EXISTS \(SELECT 1 FROM project\.binding_source_intent[\s\S]*project_id = p_project_id AND state IN \('PREPARING','APPLYING','ABORTING'\)\)[\s\S]*PROJECT_BINDING_IN_PROGRESS/)
  assert.match(sql, /prepared\.old_binding_digest <> p_declaration_digest/)
  assert.match(sql, /DELETE FROM project\.brain_binding/)
  assert.match(sql, /binding\.brain_revision_id = \(p_declaration->>'brainRevisionId'\)::uuid/)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION project\.begin_brain_binding_removal_intent[\s\S]*TO hub_r2_project_binding/)
})

test('PRJ-12 ledger preserves the complete 015 census before checking 016', () => {
  const runner = readFileSync(resolve(root, 'scripts/run-hub-migrations.mjs'), 'utf8')
  assert.match(runner, /if \(applied\.has\('016'\)\) \{[\s\S]*await assert015Catalog\([\s\S]*\{ after016: true \}[\s\S]*await assert016Catalog\(/)
  assert.match(runner, /MIGRATION_015_CUMULATIVE_FUNCTION_CENSUS_REFUSED/)
  assert.match(runner, /MIGRATION_015_RUNTIME_ACL_CENSUS_REFUSED/)
})

test('PRJ-12 Git deletion fails closed on bytes, absence, mismatch, and preserves cancellation trees', () => {
  const source = readFileSync(resolve(root, 'apps/hub/src/project/git-execution.ts'), 'utf8')
  assert.match(source, /request\.mutation === 'DELETE'[\s\S]*declaration\.length === 0/)
  assert.match(source, /request\.mutation === 'DELETE' && !target[\s\S]*SOURCE_DB_DIVERGENCE/)
  assert.match(source, /createHash\('sha256'\)\.update\(content\.stdout\)\.digest\('hex'\) !== check\.digest\)\s*finish\(\{ status: 'REFUSED', code: 'SOURCE_DB_DIVERGENCE' \}\)/)
  assert.match(source, /update-index', '--index-info'[\s\S]*'0 '\s*\+\s*'0'\.repeat\(40\)/)
  assert.match(source, /sameTree\(cancelBaseSourceRevision, before\)[\s\S]*sameTree\(cancelAppliedSourceRevision, before\)/)
})
