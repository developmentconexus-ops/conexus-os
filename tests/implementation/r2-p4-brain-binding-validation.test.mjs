import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { canonicalBytes, sha256 } from '../../packages/canonical-json/src/index.mjs'
import { parseBrainRealization, validateBrainSource } from '../../packages/brain-contract/src/index.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const buildRoot = mkdtempSync(resolve(repositoryRoot, 'apps/hub/r2-p4-brain-binding-build-'))
const compiled = spawnSync(process.execPath, [
  resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'),
  '--project', resolve(repositoryRoot, 'apps/hub/tsconfig.json'), '--noEmit', 'false', '--outDir', buildRoot,
], { encoding: 'utf8' })
if (compiled.status !== 0) throw new Error(`R2_P4_BRAIN_BINDING_HUB_COMPILE_FAILED\n${compiled.stdout}\n${compiled.stderr}`)
process.once('exit', () => rmSync(buildRoot, { recursive: true, force: true }))

const { createBrainBindingValidator } = await import(pathToFileURL(resolve(buildRoot, 'brain/binding-validation.js')).href)
const { createRegisteredKeyConformance } = await import(pathToFileURL(resolve(buildRoot, 'gateway/module.js')).href)

const ACCOUNT = '11111111-1111-4111-8111-111111111111'
const WORKSPACE = '22222222-2222-4222-8222-222222222222'
const PROJECT = '33333333-3333-4333-8333-333333333333'
const CONNECTION = '44444444-4444-4444-8444-444444444444'
const CONNECTION_REVISION = '55555555-5555-4555-8555-555555555555'
const QUALIFICATION = '66666666-6666-4666-8666-666666666666'
const SOURCE_SCOPE = '7'.repeat(64)
const BRAIN_REVISION = '88888888-8888-4888-8888-888888888888'
const SOURCE_REVISION = 'a'.repeat(40)
const BRAIN_DIGEST = 'b'.repeat(64)
const MANIFEST_DIGEST = 'c'.repeat(64)
const SOURCE_INPUT_DIGEST = 'd'.repeat(64)
const DOCUMENT_MAPPING_DIGEST = 'e'.repeat(64)
const INVOICE_MAPPING_DIGEST = 'f'.repeat(64)

const brain = () => ({
  schemaVersion: 'conexus-brain/v2',
  reviewText: 'Synthetic reviewed meaning.',
  knowledgeBrowse: { domains: [] },
  items: [
    { itemId: 'documents', kind: 'DATASET', grainId: 'document', dependsOn: [] },
    { itemId: 'invoices', kind: 'DATASET', grainId: 'invoice', dependsOn: [] },
  ],
  assertions: [
    { assertionId: 'document-keys', itemId: 'documents', kind: 'KEY_CONFORMANCE', predicateVersion: '1', scope: 'SELECTED' },
    { assertionId: 'invoice-keys', itemId: 'invoices', kind: 'KEY_CONFORMANCE', predicateVersion: '1', scope: 'SELECTED' },
  ],
})

const manifest = () => ({
  schemaVersion: 'conexus-project-brain-realization/v1',
  selectedRoots: ['documents', 'invoices'],
  mappings: [
    { itemId: 'documents', queryId: 'registered-document-keys', mappingDigest: DOCUMENT_MAPPING_DIGEST },
    { itemId: 'invoices', queryId: 'registered-invoice-keys', mappingDigest: INVOICE_MAPPING_DIGEST },
  ],
  sourceInputs: [{ path: 'src/data.ts', digest: SOURCE_INPUT_DIGEST }],
})

const subject = (inputDigest, overrides = {}) => ({
  workspaceId: WORKSPACE,
  projectId: PROJECT,
  connectionId: CONNECTION,
  connectionRevisionId: CONNECTION_REVISION,
  qualificationId: QUALIFICATION,
  credentialGeneration: '1',
  environment: 'SANDBOX',
  sourceScopeId: SOURCE_SCOPE,
  sourceRevision: SOURCE_REVISION,
  inputDigest,
  ...overrides,
})

const fixture = () => {
  const inputBrain = brain()
  validateBrainSource(inputBrain)
  const parsed = parseBrainRealization(manifest(), inputBrain)
  const input = {
    accountId: ACCOUNT,
    projectId: PROJECT,
    workspaceId: WORKSPACE,
    brainRevisionId: BRAIN_REVISION,
    brainDigest: BRAIN_DIGEST,
    brainSource: inputBrain,
    realization: {
      ...parsed,
      sourceRevision: SOURCE_REVISION,
      manifestDigest: MANIFEST_DIGEST,
      sourceFiles: [{ path: 'src/data.ts', digest: SOURCE_INPUT_DIGEST, byteLength: 12 }],
    },
  }
  const calls = []
  const conformance = createRegisteredKeyConformance({
    registrations: [
      {
        queryId: 'registered-document-keys', queryVersion: '1', workspaceId: WORKSPACE, projectId: PROJECT,
        connectionId: CONNECTION, environment: 'SANDBOX', datasetId: 'documents', grainId: 'document',
        mappingDigest: DOCUMENT_MAPPING_DIGEST,
        observe: async ({ registrationDigest, subjectDigest }) => ({
          registrationDigest, subjectDigest, observationId: 'document-observation', complete: true,
          coherence: 'SINGLE_STATEMENT', totalRows: '2', nullKeyRows: '0', duplicateKeyGroups: '0',
        }),
      },
      {
        queryId: 'registered-invoice-keys', queryVersion: '1', workspaceId: WORKSPACE, projectId: PROJECT,
        connectionId: CONNECTION, environment: 'SANDBOX', datasetId: 'invoices', grainId: 'invoice',
        mappingDigest: INVOICE_MAPPING_DIGEST,
        observe: async ({ registrationDigest, subjectDigest }) => ({
          registrationDigest, subjectDigest, observationId: 'invoice-empty-observation', complete: true,
          coherence: 'IMMUTABLE_SNAPSHOT', totalRows: '0', nullKeyRows: '0', duplicateKeyGroups: '0',
        }),
      },
    ],
    resolveSubject: async (request) => {
      calls.push(request)
      return subject(parsed.inputDigest)
    },
  })
  return { input, parsed, conformance, calls }
}

const digestOf = (value) => sha256(canonicalBytes(value))
const refreshProofDigests = (proof) => {
  proof.registrationDigest = digestOf(proof.registration)
  proof.subjectDigest = digestOf(proof.subject)
  proof.proofDigest = digestOf({
    registrationDigest: proof.registrationDigest,
    subjectDigest: proof.subjectDigest,
    observationId: proof.observationId,
    coherence: proof.coherence,
    totalRows: proof.counts.totalRows,
    nullKeyRows: proof.counts.nullKeyRows,
    duplicateKeyGroups: proof.counts.duplicateKeyGroups,
    outcome: proof.outcome,
  })
}

test('validates every required assertion, preserves empty truth, and commits no self-referential digest', async () => {
  const f = fixture()
  const result = await createBrainBindingValidator({ conformance: f.conformance }).validate(f.input)
  assert.equal(result.status, 'VALIDATED')
  assert.equal(result.candidate.validationState, 'VALID')
  assert.deepEqual(result.candidate.applicableItemIds, ['documents', 'invoices'])
  assert.equal(result.candidate.proofs.length, 2)
  assert.equal(result.candidate.proofs[0].outcome, 'PASS')
  assert.equal(result.candidate.proofs[1].empty, true)
  assert.equal(result.candidate.proofs[1].coherence, 'IMMUTABLE_SNAPSHOT')
  assert.equal(f.calls.length, 4) // resolver is called before and after each observation
  assert.equal('projectBindingDigest' in result.candidate, false)
  assert.equal(result.projectBindingDigest, digestOf(result.candidate))
  assert.equal(Object.isFrozen(result), true)
  assert.equal(Object.isFrozen(result.candidate), true)
  assert.equal(Object.isFrozen(result.candidate.proofs), true)
  assert.equal(Object.isFrozen(result.candidate.proofs[0]), true)
})

test('captures Brain and realization input before the first asynchronous conformance call', async () => {
  const f = fixture()
  const originalSource = f.input.brainSource
  const originalRealization = f.input.realization
  const originalExecute = f.conformance.execute
  f.conformance = { execute: async (...args) => {
    originalSource.items[0].itemId = 'forged-after-await'
    originalRealization.applicableItemIds = ['forged-after-await']
    return originalExecute(...args)
  } }
  const result = await createBrainBindingValidator({ conformance: f.conformance }).validate(f.input)
  assert.equal(result.status, 'VALIDATED')
  assert.deepEqual(result.candidate.applicableItemIds, ['documents', 'invoices'])
  assert.equal(result.candidate.proofs[0].itemId, 'documents')
})

test('refuses malformed, tampered, accessor-backed, or stale realization inputs before provider execution', async () => {
  const changes = [
    (input) => { input.extra = true },
    (input) => { input.brainDigest = 'not-a-digest' },
    (input) => { input.brainSource.items[0].itemId = 'forged' },
    (input) => { input.realization.applicableItemIds = ['invoices'] },
    (input) => { input.realization.requiredAssertions = [] },
    (input) => { input.realization.inputDigest = '0'.repeat(64) },
    (input) => { input.realization.sourceRevision = 'not-a-source-revision' },
    (input) => { input.realization.manifestDigest = 'not-a-digest' },
    (input) => { input.realization.sourceFiles[0].digest = '0'.repeat(64) },
    (input) => { input.realization.sourceFiles.push({ path: 'other.ts', digest: SOURCE_INPUT_DIGEST, byteLength: 1 }) },
  ]
  for (const change of changes) {
    const f = fixture()
    let executions = 0
    f.conformance = { execute: async () => { executions += 1; return { status: 'INDETERMINATE' } } }
    change(f.input)
    assert.equal((await createBrainBindingValidator({ conformance: f.conformance }).validate(f.input)).status, 'REFUSED', change.toString())
    assert.equal(executions, 0)
  }
  const accessor = fixture()
  Object.defineProperty(accessor.input, 'projectId', { enumerable: true, get: () => PROJECT })
  assert.equal((await createBrainBindingValidator({ conformance: accessor.conformance }).validate(accessor.input)).status, 'REFUSED')
})

test('propagates refused, indeterminate, thrown, and assertion-failed conformance without manufacturing validity', async () => {
  for (const [status, expected] of [
    [{ status: 'REFUSED' }, 'REFUSED'],
    [{ status: 'INDETERMINATE' }, 'INDETERMINATE'],
    [{ status: 'PROVEN', outcome: 'ASSERTION_FAILED' }, 'ASSERTION_FAILED'],
  ]) {
    const f = fixture()
    f.conformance = { execute: async () => status }
    assert.equal((await createBrainBindingValidator({ conformance: f.conformance }).validate(f.input)).status, expected)
  }
  const thrown = fixture()
  thrown.conformance = { execute: async () => { throw new Error('provider unavailable') } }
  assert.equal((await createBrainBindingValidator({ conformance: thrown.conformance }).validate(thrown.input)).status, 'INDETERMINATE')
})

test('refuses a forged PROVEN record whose identities or proof digest do not match the frozen call', async () => {
  const f = fixture()
  const valid = await f.conformance.execute({
    accountId: ACCOUNT, projectId: PROJECT, queryId: 'registered-document-keys',
    expectedSourceRevision: SOURCE_REVISION, expectedInputDigest: f.parsed.inputDigest,
  }, { datasetId: 'documents', grainId: 'document', mappingDigest: DOCUMENT_MAPPING_DIGEST })
  assert.equal(valid.status, 'PROVEN')
  for (const forge of [
    (result) => { result.registration = { ...result.registration, projectId: '99999999-9999-4999-8999-999999999999' } },
    (result) => { result.subject = { ...result.subject, inputDigest: '0'.repeat(64) } },
    (result) => { result.registrationDigest = '0'.repeat(64) },
    (result) => { result.proofDigest = '0'.repeat(64) },
    (result) => {
      result.subject = { ...result.subject, sourceScopeId: '77777777-7777-4777-8777-777777777777' }
      refreshProofDigests(result)
    },
    (result) => {
      result.registration = { ...result.registration, queryVersion: ' ' }
      refreshProofDigests(result)
    },
    (result) => {
      result.counts = { totalRows: '10', nullKeyRows: '4', duplicateKeyGroups: '4' }
      refreshProofDigests(result)
    },
  ]) {
    const forged = structuredClone(valid)
    forge(forged)
    const validator = createBrainBindingValidator({ conformance: { execute: async () => forged } })
    assert.equal((await validator.validate(f.input)).status, 'REFUSED')
  }
})

test('mapping disagreement is refused before any resolver or observer can run', async () => {
  const f = fixture()
  const descriptor = {
    queryId: 'registered-document-keys', queryVersion: '1', workspaceId: WORKSPACE, projectId: PROJECT,
    connectionId: CONNECTION, environment: 'SANDBOX', datasetId: 'documents', grainId: 'document',
    mappingDigest: '0'.repeat(64),
  }
  let resolved = false
  const conformance = createRegisteredKeyConformance({
    registrations: [{ ...descriptor, observe: () => { throw new Error('must not observe') } }],
    resolveSubject: async () => { resolved = true; return subject(f.parsed.inputDigest) },
  })
  assert.equal((await createBrainBindingValidator({ conformance }).validate(f.input)).status, 'REFUSED')
  assert.equal(resolved, false)
})
