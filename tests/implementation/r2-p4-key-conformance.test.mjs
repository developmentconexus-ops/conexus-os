import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { canonicalBytes } from '../../packages/canonical-json/src/index.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const buildRoot = mkdtempSync(resolve(repositoryRoot, 'apps/hub/r2-p4-key-build-'))
const compiled = spawnSync(process.execPath, [
  resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'),
  '--project', resolve(repositoryRoot, 'apps/hub/tsconfig.json'), '--noEmit', 'false', '--outDir', buildRoot,
], { encoding: 'utf8' })
if (compiled.status !== 0) throw new Error(`R2_P4_KEY_CONFORMANCE_HUB_COMPILE_FAILED\n${compiled.stdout}\n${compiled.stderr}`)
process.once('exit', () => rmSync(buildRoot, { recursive: true, force: true }))

const { createRegisteredKeyConformance } = await import(pathToFileURL(resolve(buildRoot, 'gateway/module.js')).href)
const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const DIGEST = 'a'.repeat(64)
const SOURCE = 'b'.repeat(40)
const ACCOUNT = '11111111-1111-4111-8111-111111111111'
const WORKSPACE = '22222222-2222-4222-8222-222222222222'
const PROJECT = '33333333-3333-4333-8333-333333333333'
const CONNECTION = '44444444-4444-4444-8444-444444444444'
const REVISION = '55555555-5555-4555-8555-555555555555'
const QUALIFICATION = '66666666-6666-4666-8666-666666666666'
const SOURCE_SCOPE = '7'.repeat(64)

const subject = (overrides = {}) => ({
  workspaceId: WORKSPACE,
  projectId: PROJECT,
  connectionId: CONNECTION,
  connectionRevisionId: REVISION,
  qualificationId: QUALIFICATION,
  credentialGeneration: '1',
  environment: 'SANDBOX',
  sourceScopeId: SOURCE_SCOPE,
  sourceRevision: SOURCE,
  inputDigest: DIGEST,
  ...overrides,
})
const request = (overrides = {}) => ({
  accountId: ACCOUNT,
  projectId: PROJECT,
  queryId: 'budget.document-keys',
  expectedSourceRevision: SOURCE,
  expectedInputDigest: DIGEST,
  ...overrides,
})
const descriptor = (overrides = {}) => ({
  queryId: 'budget.document-keys',
  queryVersion: '1',
  workspaceId: WORKSPACE,
  projectId: PROJECT,
  connectionId: CONNECTION,
  environment: 'SANDBOX',
  datasetId: 'budget.documents',
  grainId: 'budget.document',
  mappingDigest: DIGEST,
  ...overrides,
})
const expectedMapping = (overrides = {}) => ({
  datasetId: 'budget.documents',
  grainId: 'budget.document',
  mappingDigest: DIGEST,
  ...overrides,
})
const observation = (input) => ({
  registrationDigest: input.registrationDigest,
  subjectDigest: input.subjectDigest,
  observationId: input.observationId ?? 'observation-1',
  complete: input.complete ?? true,
  coherence: input.coherence ?? 'SINGLE_STATEMENT',
  totalRows: input.totalRows ?? '2',
  nullKeyRows: input.nullKeyRows ?? '0',
  duplicateKeyGroups: input.duplicateKeyGroups ?? '0',
  ...(input.proofAccepted === undefined ? {} : { proofAccepted: input.proofAccepted }),
})
const create = ({ resolve = async () => subject(), observe = async ({ registrationDigest, subjectDigest }) => observation({ registrationDigest, subjectDigest }) } = {}) => {
  const input = descriptor()
  return createRegisteredKeyConformance({ registrations: [{ ...input, observe }], resolveSubject: resolve })
}

test('registered conformance proves only a trusted complete matching observation', async () => {
  let received
  const module = create({ observe: async (input) => {
    received = input
    return observation(input)
  } })
  const result = await module.execute(request(), expectedMapping())
  assert.equal(result.status, 'PROVEN')
  assert.equal(result.outcome, 'PASS')
  assert.equal(result.empty, false)
  assert.deepEqual(result.counts, { totalRows: '2', nullKeyRows: '0', duplicateKeyGroups: '0' })
  assert.match(result.registrationDigest, /^[a-f0-9]{64}$/)
  assert.match(result.subjectDigest, /^[a-f0-9]{64}$/)
  assert.match(result.proofDigest, /^[a-f0-9]{64}$/)
  assert.equal(Object.isFrozen(received), true)
  assert.equal(Object.isFrozen(received.registration), true)
  assert.equal(Object.isFrozen(received.subject), true)
  assert.equal(Object.isFrozen(result), true)
  assert.equal(Object.isFrozen(result.counts), true)
})

test('registration and request are closed, unique and captured before execution', async () => {
  assert.throws(() => createRegisteredKeyConformance({
    registrations: [{ ...descriptor(), observe: () => observation({ registrationDigest: DIGEST, subjectDigest: DIGEST }), sql: 'SELECT 1' }],
    resolveSubject: async () => subject(),
  }), /REGISTRATION_INVALID/)
  assert.throws(() => createRegisteredKeyConformance({
    registrations: [
      { ...descriptor(), observe: () => observation({ registrationDigest: DIGEST, subjectDigest: DIGEST }) },
      { ...descriptor(), observe: () => observation({ registrationDigest: DIGEST, subjectDigest: DIGEST }) },
    ], resolveSubject: async () => subject(),
  }), /REGISTRATION_DUPLICATE/)
  const mutable = { ...descriptor(), observe: async ({ registrationDigest, subjectDigest }) => observation({ registrationDigest, subjectDigest }) }
  const module = createRegisteredKeyConformance({
    registrations: [mutable],
    resolveSubject: async () => subject(),
  })
  mutable.projectId = '88888888-8888-4888-8888-888888888888'
  mutable.observe = async () => { throw new Error('mutated executor must not run') }
  assert.equal((await module.execute(request(), expectedMapping())).status, 'PROVEN')
  assert.equal((await module.execute({ ...request(), sql: 'SELECT * FROM unsafe' }, expectedMapping())).status, 'REFUSED')
  assert.equal((await module.execute({ ...request(), projectId: '88888888-8888-4888-8888-888888888888' }, expectedMapping())).status, 'REFUSED')
})

test('unknown registration or unresolved scope is refused and does not observe', async () => {
  let observed = false
  const module = create({
    resolve: async () => null,
    observe: async (input) => { observed = true; return observation(input) },
  })
  assert.equal((await module.execute(request(), expectedMapping())).status, 'REFUSED')
  assert.equal(observed, false)
  assert.equal((await create().execute(request({ queryId: 'not-registered' }), expectedMapping())).status, 'REFUSED')
})

test('source and input expectation mismatch is indeterminate before observing', async () => {
  let observed = false
  const module = create({
    resolve: async () => subject({ sourceRevision: 'c'.repeat(40) }),
    observe: async (input) => { observed = true; return observation(input) },
  })
  assert.equal((await module.execute(request(), expectedMapping())).status, 'INDETERMINATE')
  assert.equal(observed, false)
  const wrongInput = create({ resolve: async () => subject({ inputDigest: 'c'.repeat(64) }) })
  assert.equal((await wrongInput.execute(request(), expectedMapping())).status, 'INDETERMINATE')
  const legacyScope = create({ resolve: async () => subject({ sourceScopeId: '77777777-7777-4777-8777-777777777777' }) })
  assert.equal((await legacyScope.execute(request(), expectedMapping())).status, 'INDETERMINATE')
})

test('post-observation subject drift and resolver failures cannot produce proof', async () => {
  let calls = 0
  const shared = subject()
  const module = create({
    resolve: async () => {
      calls += 1
      if (calls === 2) shared.connectionRevisionId = '88888888-8888-4888-8888-888888888888'
      return shared
    },
  })
  assert.equal((await module.execute(request(), expectedMapping())).status, 'INDETERMINATE')
  assert.equal(calls, 2)
  assert.equal((await create({ resolve: async () => { throw new Error('provider unavailable') } }).execute(request(), expectedMapping())).status, 'INDETERMINATE')
  assert.equal((await create({ resolve: async () => subject(), observe: async () => { throw new Error('executor unavailable') } }).execute(request(), expectedMapping())).status, 'INDETERMINATE')
})

test('null and duplicate key predicates preserve assertion failure with bounded decimal counts', async () => {
  for (const counts of [
    { totalRows: '10', nullKeyRows: '1', duplicateKeyGroups: '0' },
    { totalRows: '10', nullKeyRows: '0', duplicateKeyGroups: '5' },
    { totalRows: '10', nullKeyRows: '2', duplicateKeyGroups: '4' },
  ]) {
    const module = create({ observe: async (input) => observation({ ...input, ...counts }) })
    const result = await module.execute(request(), expectedMapping())
    assert.equal(result.status, 'PROVEN')
    assert.equal(result.outcome, 'ASSERTION_FAILED')
    assert.deepEqual(result.counts, counts)
  }
})

test('empty complete observations are valid and preserve empty truth', async () => {
  const module = create({ observe: async (input) => observation({
    ...input, totalRows: '0', nullKeyRows: '0', duplicateKeyGroups: '0', observationId: 'empty-observation',
  }) })
  const result = await module.execute(request(), expectedMapping())
  assert.equal(result.status, 'PROVEN')
  assert.equal(result.outcome, 'PASS')
  assert.equal(result.empty, true)
})

test('malformed, incomplete, foreign or arithmetically impossible observations are indeterminate', async () => {
  const cases = [
    { totalRows: '01' },
    { totalRows: '9223372036854775808' },
    { totalRows: '9'.repeat(100) },
    { totalRows: '-1' },
    { totalRows: '10', nullKeyRows: '11' },
    { totalRows: '10', nullKeyRows: '0', duplicateKeyGroups: '6' },
    { complete: false },
    { registrationDigest: 'f'.repeat(64) },
    { subjectDigest: 'f'.repeat(64) },
    { totalRows: '10', nullKeyRows: '0', duplicateKeyGroups: '0', proofAccepted: true },
  ]
  for (const change of cases) {
    const module = create({ observe: async (input) => observation({ ...input, ...change }) })
    assert.equal((await module.execute(request(), expectedMapping())).status, 'INDETERMINATE', JSON.stringify(change))
  }
})

test('resolver receives only account and the frozen captured registration', async () => {
  let resolverRequest
  let observerInput
  const module = create({
    resolve: async (input) => { resolverRequest = input; return subject() },
    observe: async (input) => { observerInput = input; return observation(input) },
  })
  await module.execute(request(), expectedMapping())
  assert.deepEqual(Object.keys(resolverRequest).sort(), ['accountId', 'registration'])
  assert.equal(resolverRequest.accountId, ACCOUNT)
  assert.deepEqual(resolverRequest.registration, descriptor())
  assert.equal(Object.isFrozen(resolverRequest), true)
  assert.equal(Object.isFrozen(resolverRequest.registration), true)
  assert.equal('expectedInputDigest' in resolverRequest, false)
  assert.equal('expectedSourceRevision' in resolverRequest, false)
  assert.deepEqual(Object.keys(observerInput.registration).sort(), [
    'connectionId', 'datasetId', 'environment', 'grainId', 'mappingDigest', 'projectId', 'queryId', 'queryVersion', 'workspaceId',
  ].sort())
  assert.equal('sql' in observerInput, false)
  assert.equal('url' in observerInput, false)
  assert.equal('scope' in observerInput, false)
})

test('registration digest uses the canonical descriptor identity', async () => {
  let digest
  const module = create({ observe: async (input) => { digest = input.registrationDigest; return observation(input) } })
  await module.execute(request(), expectedMapping())
  assert.match(digest, /^[a-f0-9]{64}$/)
  assert.equal(digest, sha256(canonicalBytes(descriptor())))
  assert.notEqual(digest, sha256(Buffer.from('SELECT * FROM budget.documents')))
})

test('matching expected mapping permits the registered producer', async () => {
  let resolved = false
  let observed = false
  const module = create({
    resolve: async () => { resolved = true; return subject() },
    observe: async (input) => { observed = true; return observation(input) },
  })
  const result = await module.execute(request(), expectedMapping())
  assert.equal(result.status, 'PROVEN')
  assert.equal(resolved, true)
  assert.equal(observed, true)
})

test('each expected mapping mismatch refuses before resolver or observer', async () => {
  let resolved = 0
  let observed = 0
  const module = create({
    resolve: async () => { resolved += 1; return subject() },
    observe: async (input) => { observed += 1; return observation(input) },
  })
  for (const mismatch of [
    { datasetId: 'budget.other-documents' },
    { grainId: 'budget.other-document' },
    { mappingDigest: 'c'.repeat(64) },
  ]) {
    assert.equal((await module.execute(request(), expectedMapping(mismatch))).status, 'REFUSED')
  }
  assert.equal(resolved, 0)
  assert.equal(observed, 0)
})

test('malformed and mutated expected mappings are closed and captured before awaiting', async () => {
  let resolved = 0
  const module = create({
    resolve: async () => {
      resolved += 1
      return subject()
    },
  })
  for (const malformed of [
    undefined,
    null,
    { ...expectedMapping(), extra: true },
    { ...expectedMapping(), datasetId: '' },
    { ...expectedMapping(), mappingDigest: 'not-a-digest' },
  ]) {
    assert.equal((await module.execute(request(), malformed)).status, 'REFUSED')
  }
  const mutable = expectedMapping()
  const pending = module.execute(request(), mutable)
  mutable.datasetId = 'budget.other-documents'
  assert.equal((await pending).status, 'PROVEN')
  assert.equal(resolved, 2)
})

test('proven result returns captured frozen registration, subject and coherence', async () => {
  const result = await create().execute(request(), expectedMapping())
  assert.equal(result.status, 'PROVEN')
  assert.deepEqual(result.registration, descriptor())
  assert.deepEqual(result.subject, subject())
  assert.equal(result.coherence, 'SINGLE_STATEMENT')
  assert.equal(Object.isFrozen(result.registration), true)
  assert.equal(Object.isFrozen(result.subject), true)
  assert.equal(result.registrationDigest, sha256(canonicalBytes(result.registration)))
  assert.equal(result.subjectDigest, sha256(canonicalBytes(result.subject)))
})
