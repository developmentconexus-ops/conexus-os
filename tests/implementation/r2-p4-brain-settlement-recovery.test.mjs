import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { canonicalBytes, sha256 } from '../../packages/canonical-json/src/index.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const buildRoot = mkdtempSync(resolve(repositoryRoot, 'apps/hub/r2-p4-brain-settlement-build-'))
const compiled = spawnSync(process.execPath, [
  resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'),
  '--project', resolve(repositoryRoot, 'apps/hub/tsconfig.json'), '--noEmit', 'false', '--outDir', buildRoot,
], { encoding: 'utf8' })
if (compiled.status !== 0) throw new Error(`R2_P4_BRAIN_SETTLEMENT_HUB_COMPILE_FAILED\n${compiled.stdout}\n${compiled.stderr}`)
process.once('exit', () => rmSync(buildRoot, { recursive: true, force: true }))

const { createProjectBindingRecovery } = await import(
  pathToFileURL(resolve(buildRoot, 'project/binding-recovery.js')).href,
)

const ACCOUNT = '11111111-1111-4111-8111-111111111111'
const PROJECT = '22222222-2222-4222-8222-222222222222'
const WORKSPACE = '33333333-3333-4333-8333-333333333333'
const BRAIN_REVISION = '44444444-4444-4444-8444-444444444444'
const CONNECTION = '55555555-5555-4555-8555-555555555555'
const CONNECTION_REVISION = '66666666-6666-4666-8666-666666666666'
const QUALIFICATION = '77777777-7777-4777-8777-777777777777'
const VALIDATION_ID = '99999999-9999-4999-8999-999999999999'
const SOURCE_REVISION = 'a'.repeat(40)
const APPLY_SOURCE_REVISION = 'b'.repeat(40)
const CANCEL_BASE_SOURCE_REVISION = 'c'.repeat(40)
const CANCEL_APPLIED_SOURCE_REVISION = 'd'.repeat(40)
const BASE_TREE = 'e'.repeat(40)
const BRAIN_DIGEST = 'f'.repeat(64)
const CONNECTION_DECLARATION = {
  bindings: [{
    connectionId: CONNECTION,
    connectionRevisionId: CONNECTION_REVISION,
    environment: 'SANDBOX',
    qualificationId: QUALIFICATION,
  }],
}

const proofSubject = (inputDigest) => ({
  workspaceId: WORKSPACE,
  projectId: PROJECT,
  connectionId: CONNECTION,
  connectionRevisionId: CONNECTION_REVISION,
  qualificationId: QUALIFICATION,
  credentialGeneration: '1',
  environment: 'SANDBOX',
  sourceScopeId: '8'.repeat(64),
  sourceRevision: SOURCE_REVISION,
  inputDigest,
})

const candidate = () => {
  const inputDigest = '1'.repeat(64)
  const registration = {
    queryId: 'registered-document-keys',
    queryVersion: '1',
    workspaceId: WORKSPACE,
    projectId: PROJECT,
    connectionId: CONNECTION,
    environment: 'SANDBOX',
    datasetId: 'documents',
    grainId: 'document',
    mappingDigest: '2'.repeat(64),
  }
  const subject = proofSubject(inputDigest)
  const registrationDigest = sha256(canonicalBytes(registration))
  const subjectDigest = sha256(canonicalBytes(subject))
  const counts = { totalRows: '2', nullKeyRows: '0', duplicateKeyGroups: '0' }
  const proofDigest = sha256(canonicalBytes({
    registrationDigest,
    subjectDigest,
    observationId: 'document-observation',
    coherence: 'SINGLE_STATEMENT',
    totalRows: counts.totalRows,
    nullKeyRows: counts.nullKeyRows,
    duplicateKeyGroups: counts.duplicateKeyGroups,
    outcome: 'PASS',
  }))
  return {
    schemaVersion: 'conexus-brain-binding-validation/v1',
    validationState: 'VALID',
    projectId: PROJECT,
    workspaceId: WORKSPACE,
    brainRevisionId: BRAIN_REVISION,
    brainDigest: BRAIN_DIGEST,
    sourceRevision: SOURCE_REVISION,
    inputDigest,
    manifestDigest: '3'.repeat(64),
    applicableItemIds: ['documents'],
    proofs: [{
      assertionId: 'document-keys', itemId: 'documents', predicateVersion: '1', outcome: 'PASS',
      registration, registrationDigest, subject, subjectDigest,
      observationId: 'document-observation', coherence: 'SINGLE_STATEMENT', counts, empty: false, proofDigest,
    }],
  }
}

const projection = (declaration = candidate()) => ({
  brainRevisionId: BRAIN_REVISION,
  brainDigest: BRAIN_DIGEST,
  projectBindingDigest: sha256(canonicalBytes(declaration)),
  validationState: 'VALID',
  updateAvailable: false,
})

const makeIntent = ({ state = 'PREPARING', declaration = candidate(), projectId = PROJECT } = {}) => ({
  intent_id: VALIDATION_ID,
  project_id: projectId,
  account_id: ACCOUNT,
  workspace_id: WORKSPACE,
  operation_kind: 'BRAIN',
  connection_id: null,
  connection_revision_id: null,
  environment: null,
  brain_revision_id: BRAIN_REVISION,
  brain_digest: BRAIN_DIGEST,
  source_revision: SOURCE_REVISION,
  declaration,
  prepared_result: projection(declaration),
  remove_binding: false,
  state,
  version: state === 'PREPARING' ? 0 : state === 'APPLYING' ? 1 : state === 'COMPLETED' ? 2 : 2,
  declaration_digest: state === 'PREPARING' ? null : sha256(canonicalBytes(declaration)),
  base_tree: state === 'PREPARING' ? null : BASE_TREE,
  previous_declaration_blob: null,
  apply_source_revision: state === 'PREPARING' ? null : APPLY_SOURCE_REVISION,
  cancel_base_source_revision: state === 'PREPARING' ? null : CANCEL_BASE_SOURCE_REVISION,
  cancel_applied_source_revision: state === 'PREPARING' ? null : CANCEL_APPLIED_SOURCE_REVISION,
  terminal_source_revision: state === 'COMPLETED' ? APPLY_SOURCE_REVISION : null,
  terminal_result: state === 'COMPLETED' ? projection(declaration) : null,
  refusal_code: null,
})

const fixture = ({ beginIntent, settleCode } = {}) => {
  const events = []
  const gitCalls = []
  const dbCalls = []
  let intent = beginIntent ?? null
  const beginResult = beginIntent ?? makeIntent()
  const settleFailure = settleCode
  const basis = {
    connectionDeclaration: CONNECTION_DECLARATION,
    brainBindingDigest: '5'.repeat(64),
  }
  const client = {
    async query(sql, args = []) {
      dbCalls.push({ sql, args })
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
        events.push(sql)
        return { rows: [] }
      }
      if (sql.includes('project.get_binding_source_intent')) {
        events.push('read-intent')
        return { rows: [{ intent }] }
      }
      if (sql.includes('project.begin_brain_binding_intent')) {
        events.push('prepare')
        intent = { ...beginResult, intent_id: args[7] }
        return { rows: [{ intent }] }
      }
      if (sql.includes('project.get_binding_source_basis')) {
        events.push('basis')
        return { rows: [{ basis }] }
      }
      if (sql.includes('project.freeze_binding_source_intent')) {
        events.push('freeze')
        intent = {
          ...intent,
          state: 'APPLYING', version: 1,
          declaration_digest: args[4], base_tree: args[5], previous_declaration_blob: args[6],
          apply_source_revision: args[7], cancel_base_source_revision: args[8],
          cancel_applied_source_revision: args[9],
        }
        return { rows: [{ intent }] }
      }
      if (sql.includes('project.validate_binding_source_intent')) {
        events.push('validate')
        return { rows: [{ intent }] }
      }
      if (sql.includes('project.complete_binding_source_intent')) {
        events.push('settle')
        if (settleFailure) throw Object.assign(new Error('database refusal'), { code: settleFailure })
        intent = { ...intent, state: 'COMPLETED', version: 2,
          terminal_source_revision: APPLY_SOURCE_REVISION, terminal_result: projection(intent.declaration) }
        return { rows: [{ intent }] }
      }
      if (sql.includes('project.abort_binding_source_intent')) {
        events.push('abort')
        intent = { ...intent, state: 'ABORTING', version: 2, refusal_code: args[4] }
        return { rows: [{ intent }] }
      }
      if (sql.includes('project.complete_binding_source_abort')) {
        events.push('aborted')
        intent = { ...intent, state: 'ABORTED', version: 3, terminal_source_revision: args[4] }
        return { rows: [{ intent }] }
      }
      throw new Error(`UNEXPECTED_SQL:${sql}`)
    },
    release() { events.push('release') },
  }
  const pool = { connect: async () => client }
  const git = {
    async stageProjectBindingIntent(input) {
      events.push('stage')
      gitCalls.push({ kind: 'stage', input })
      return {
        status: 'STAGED', oldSourceRevision: SOURCE_REVISION,
        applySourceRevision: APPLY_SOURCE_REVISION,
        cancelBaseSourceRevision: CANCEL_BASE_SOURCE_REVISION,
        cancelAppliedSourceRevision: CANCEL_APPLIED_SOURCE_REVISION,
        baseTree: BASE_TREE, previousDeclarationBlob: null,
      }
    },
    async applyProjectBindingIntent(input) {
      events.push('git')
      gitCalls.push({ kind: 'apply', input })
      return { status: 'APPLIED', oldSourceRevision: SOURCE_REVISION, newSourceRevision: APPLY_SOURCE_REVISION }
    },
    async cancelProjectBindingIntent(input) {
      events.push('cancel')
      gitCalls.push({ kind: 'cancel', input })
      return { status: 'CANCELLED_APPLIED', oldSourceRevision: SOURCE_REVISION, newSourceRevision: CANCEL_APPLIED_SOURCE_REVISION }
    },
  }
  return { recovery: createProjectBindingRecovery({ pool, git }), events, gitCalls, dbCalls }
}

const executeInput = (overrides = {}) => {
  const declaration = overrides.candidate ?? candidate()
  return {
  accountId: ACCOUNT,
  projectId: PROJECT,
  brainRevisionId: BRAIN_REVISION,
  brainDigest: BRAIN_DIGEST,
  expectedCurrent: { state: 'ABSENT' },
  candidate: declaration,
  projectBindingDigest: sha256(canonicalBytes(declaration)),
  bindingValidationId: VALIDATION_ID,
  ...overrides,
  }
}

test('executeBrain settles a canonical Brain declaration on the Brain path with both source declarations bound', async () => {
  const f = fixture()
  const input = executeInput()
  const result = await f.recovery.executeBrain(input)
  assert.equal(result.operation_kind, 'BRAIN')
  assert.equal(result.state, 'COMPLETED')
  assert.deepEqual(f.events.filter((event) => !['BEGIN', 'COMMIT', 'release'].includes(event)),
    ['read-intent', 'prepare', 'basis', 'stage', 'freeze', 'validate', 'git', 'settle'])
  const staged = f.gitCalls.find((call) => call.kind === 'stage').input
  assert.equal(staged.path, '.conexus/project/brain-binding.json')
  assert.deepEqual(Buffer.from(staged.declarationBytes), canonicalBytes(input.candidate))
  assert.deepEqual(staged.expectedDeclarations, [
    { path: '.conexus/project/connection-bindings.json', digest: sha256(canonicalBytes(CONNECTION_DECLARATION)), allowAbsent: false },
    { path: '.conexus/project/brain-binding.json', digest: '5'.repeat(64), allowAbsent: false },
  ])
  const frozen = f.gitCalls.find((call) => call.kind === 'apply')
  const freeze = f.dbCalls.find((call) => call.sql.includes('project.freeze_binding_source_intent'))
  assert.equal(freeze.args[4], sha256(canonicalBytes(input.candidate)))
  assert.deepEqual(Buffer.from(frozen.input.declarationBytes), canonicalBytes(input.candidate))
  assert.equal(frozen.input.path, '.conexus/project/brain-binding.json')
})

test('malformed and foreign Brain intent rows fail closed before any Git operation', async () => {
  for (const [name, mutate] of [
    ['malformed candidate', (value) => { value.proofs[0].outcome = 'ASSERTION_FAILED' }],
    ['foreign candidate', (value) => { value.projectId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }],
  ]) {
    const value = candidate()
    mutate(value)
    const f = fixture({ beginIntent: makeIntent({ declaration: value }) })
    await assert.rejects(() => f.recovery.executeBrain(executeInput({ candidate: value })),
      /PROJECT_BINDING_RECOVERY_UNAVAILABLE/, name)
    assert.equal(f.events.includes('stage'), false, name)
    assert.equal(f.events.includes('git'), false, name)
  }
})

test('a post-Git database refusal enters the shared abort/cancel protocol and never reports success', async () => {
  const f = fixture({ settleCode: 'P0412' })
  const result = await f.recovery.executeBrain(executeInput())
  assert.equal(result.state, 'ABORTED')
  assert.equal(result.refusal_code, 'P0412')
  assert.ok(f.events.indexOf('settle') < f.events.indexOf('abort'))
  assert.ok(f.events.indexOf('abort') < f.events.indexOf('cancel'))
  assert.ok(f.events.indexOf('cancel') < f.events.indexOf('aborted'))
  assert.equal(f.events.includes('COMMIT'), true)
  assert.equal(f.gitCalls.filter((call) => call.kind === 'apply').length, 1)
  assert.equal(f.gitCalls.filter((call) => call.kind === 'cancel').length, 1)
})
