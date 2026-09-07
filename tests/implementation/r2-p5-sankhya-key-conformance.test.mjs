import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { canonicalBytes, sha256 } from '../../packages/canonical-json/src/index.mjs'
import { parseBrainRealization, validateBrainSource } from '../../packages/brain-contract/src/index.mjs'
import test from 'node:test'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const buildRoot = mkdtempSync(resolve(repositoryRoot, 'apps/hub/r2-p5-key-build-'))
const compiled = spawnSync(process.execPath, [
  resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'), '--project', resolve(repositoryRoot, 'apps/hub/tsconfig.json'),
  '--noEmit', 'false', '--outDir', buildRoot,
], { encoding: 'utf8' })
if (compiled.status !== 0) throw new Error(`R2_P5_HUB_COMPILE_FAILED\n${compiled.stdout}\n${compiled.stderr}`)
process.once('exit', () => rmSync(buildRoot, { recursive: true, force: true }))
const built = (path) => pathToFileURL(resolve(buildRoot, path)).href
const gateway = await import(built('gateway/module.js'))
const connections = await import(built('connections/module.js'))
const brainModule = await import(built('brain/module.js'))
const { createRegisteredKeyConformance } = gateway
const {
  createSankhyaKeyConformanceObserver,
  sankhyaSourceScopeId,
  SANKHYA_TGFCAB_KEY_MAPPING_DIGEST,
  SANKHYA_KEY_CONFORMANCE_QUERY_VERSION,
  SANKHYA_KEY_CONFORMANCE_SERVICE_NAME,
} = gateway
const { authenticateSankhya, sankhyaProductionResponseAdmission } = connections

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111'
const WORKSPACE_ID = '22222222-2222-4222-8222-222222222222'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const CONNECTION_ID = '44444444-4444-4444-8444-444444444444'
const REVISION_ID = '55555555-5555-4555-8555-555555555555'
const QUALIFICATION_ID = '66666666-6666-4666-8666-666666666666'
const SOURCE_REVISION = 'a'.repeat(40)
const INPUT_DIGEST = 'b'.repeat(64)
const COMPANY_CODE = 1
const transactionId = '0123456789abcdefghijklmnopqrstuv'

const configuration = Object.freeze({ environment: 'SANDBOX', companyCode: COMPANY_CODE })
const registration = Object.freeze({
  queryId: 'brain-budget-key-conformance',
  queryVersion: SANKHYA_KEY_CONFORMANCE_QUERY_VERSION,
  workspaceId: WORKSPACE_ID,
  projectId: PROJECT_ID,
  connectionId: CONNECTION_ID,
  environment: 'SANDBOX',
  datasetId: 'brain.dataset.budget',
  grainId: 'brain.grain.budget-document',
  mappingDigest: SANKHYA_TGFCAB_KEY_MAPPING_DIGEST,
})
const subject = Object.freeze({
  workspaceId: WORKSPACE_ID,
  projectId: PROJECT_ID,
  connectionId: CONNECTION_ID,
  connectionRevisionId: REVISION_ID,
  qualificationId: QUALIFICATION_ID,
  credentialGeneration: '1',
  environment: 'SANDBOX',
  sourceScopeId: sankhyaSourceScopeId({
    connectorDefinitionId: 'sankhya-om', connectorVersion: '1.0.0', connectionId: CONNECTION_ID,
    companyCode: COMPANY_CODE, environment: 'SANDBOX',
  }),
  sourceRevision: SOURCE_REVISION,
  inputDigest: INPUT_DIGEST,
})
const registrationDigest = sha256(canonicalBytes(registration))
const subjectDigest = sha256(canonicalBytes(subject))
const request = Object.freeze({ accountId: ACCOUNT_ID, projectId: PROJECT_ID, queryId: registration.queryId, expectedSourceRevision: SOURCE_REVISION, expectedInputDigest: INPUT_DIGEST })
const expectedMapping = Object.freeze({ datasetId: registration.datasetId, grainId: registration.grainId, mappingDigest: registration.mappingDigest })

const responseFor = ({ total = 3, nullRows = 0, duplicates = 0, status = '1', serviceName = SANKHYA_KEY_CONFORMANCE_SERVICE_NAME, tx = transactionId, extras = {}, bodyExtras = {} } = {}) => ({
  status,
  serviceName,
  transactionId: tx,
  ...extras,
  pendingPrinting: 'false',
  responseBody: {
    fieldsMetadata: [
      { description: 'Total rows', name: 'TOTAL_ROWS', order: 1, userType: 'I' },
      { description: 'Null key rows', name: 'NULL_KEY_ROWS', order: 2, userType: 'I' },
      { description: 'Duplicate key groups', name: 'DUPLICATE_KEY_GROUPS', order: 3, userType: 'I' },
    ],
    rows: [[total, nullRows, duplicates]],
    timeQuery: '1',
    timeResultSet: '1',
    burstLimit: false,
    ...bodyExtras,
  },
})

const createBackend = (mode = 'OK') => ({
  writes: [],
  async materialize(coordinate) {
    this.writes.push(coordinate)
    if (mode === 'UNAVAILABLE') throw new Error('CREDENTIAL_UNAVAILABLE')
    if (mode === 'INVALID') return Buffer.from('{"not":"credential"}')
    return Buffer.from('{"clientId":"test-client","clientSecret":"test-secret","xToken":"test-x-token"}')
  },
})

const startStandIn = async (t) => {
  const requests = []
  let queryResponse = responseFor()
  let authResponse = { access_token: 'stand-in-bearer', expires_in: 1800, 'not-before-policy': 0, refresh_expires_in: 0, token_type: 'Bearer', scope: 'gateway' }
  const server = createServer(async (incoming, outgoing) => {
    const chunks = []
    for await (const chunk of incoming) chunks.push(chunk)
    const body = Buffer.concat(chunks).toString('utf8')
    requests.push({ method: incoming.method, url: incoming.url, headers: incoming.headers, body })
    outgoing.setHeader('content-type', 'application/json; charset=utf-8')
    if (incoming.url === '/authenticate') return outgoing.end(JSON.stringify(authResponse))
    return outgoing.end(JSON.stringify(queryResponse))
  })
  await new Promise((resolveListen, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolveListen)
  })
  t.after(() => new Promise((resolveClose) => server.close(resolveClose)))
  const address = server.address()
  const localOrigin = `http://127.0.0.1:${address.port}`
  return {
    requests,
    setQueryResponse: (next) => { queryResponse = next },
    setAuthResponse: (next) => { authResponse = next },
    fetchImpl: async (input, init) => {
      const requested = new URL(String(input))
      assert.equal(requested.origin, 'https://api.sandbox.sankhya.com.br')
      return fetch(`${localOrigin}${requested.pathname}${requested.search}`, init)
    },
  }
}

const createModule = (standIn, backend = createBackend(), resolvedSubject = subject) => {
  const observer = createSankhyaKeyConformanceObserver({
    origin: 'https://api.sandbox.sankhya.com.br',
    environment: configuration.environment,
    companyCode: configuration.companyCode,
    authenticate: (credentialCoordinate) => authenticateSankhya({
      configuration,
      credentialCoordinate,
      credentialBackend: backend,
      responseAdmission: sankhyaProductionResponseAdmission,
      fetchImpl: standIn.fetchImpl,
    }),
    fetchImpl: standIn.fetchImpl,
  })
  return createRegisteredKeyConformance({ registrations: [{ ...registration, observe: observer }], resolveSubject: async () => resolvedSubject })
}

test('R2-P5 fixed mapping and query are immutable and caller-independent', () => {
  assert.equal(SANKHYA_KEY_CONFORMANCE_QUERY_VERSION, '1')
  assert.match(SANKHYA_TGFCAB_KEY_MAPPING_DIGEST, /^[a-f0-9]{64}$/)
  const sql = gateway.sankhyaTgfcabKeyConformanceSql(2)
  assert.match(sql, /FROM TGFCAB/)
  assert.match(sql, /CODEMP = 2/)
  assert.match(sql, /CODTIPOPER IN \(14, 714\)/)
  assert.match(sql, /NUNOTA/)
  assert.throws(() => gateway.sankhyaTgfcabKeyConformanceSql(0), /SANKHYA_COMPANY_CODE_REFUSED/)
  assert.throws(() => gateway.sankhyaTgfcabKeyConformanceSql(1.5), /SANKHYA_COMPANY_CODE_REFUSED/)
  assert.throws(() => gateway.sankhyaTgfcabKeyConformanceSql(Number.MAX_SAFE_INTEGER), /SANKHYA_COMPANY_CODE_REFUSED/)
})

test('R2-P5 local HTTP stand-in proves one fixed aggregate and exact provenance', async (t) => {
  const standIn = await startStandIn(t)
  const backend = createBackend()
  const module = createModule(standIn, backend)
  const result = await module.execute(request, expectedMapping)
  assert.equal(result.status, 'PROVEN')
  assert.equal(result.outcome, 'PASS')
  assert.equal(result.coherence, 'SINGLE_STATEMENT')
  assert.equal(result.observationId, `conexus-sankhya-key-conformance/v1:${transactionId}`)
  assert.equal(result.registrationDigest, registrationDigest)
  assert.equal(result.subjectDigest, subjectDigest)
  assert.deepEqual(backend.writes, [{ connectionId: CONNECTION_ID, generation: '1' }])
  assert.deepEqual(standIn.requests.map(({ method, url }) => ({ method, url })), [
    { method: 'POST', url: '/authenticate' },
    { method: 'POST', url: '/gateway/v1/mge/service.sbr?serviceName=DbExplorerSP.executeQuery&outputType=json' },
  ])
  const queryRequest = JSON.parse(standIn.requests[1].body)
  assert.deepEqual(Object.keys(queryRequest).sort(), ['requestBody', 'serviceName'])
  assert.equal(queryRequest.serviceName, SANKHYA_KEY_CONFORMANCE_SERVICE_NAME)
  assert.match(queryRequest.requestBody.sql, /CODEMP = 1/)
  assert.doesNotMatch(queryRequest.requestBody.sql, /SELECT 1|DROP|INSERT|UPDATE|DELETE/i)
  assert.equal(JSON.stringify(result).includes('test-secret'), false)

  for (const [name, response, expected] of [
    ['empty', responseFor({ total: 0 }), 'PASS'],
    ['duplicates', responseFor({ total: 4, duplicates: 1 }), 'ASSERTION_FAILED'],
    ['nulls', responseFor({ total: 3, nullRows: 1 }), 'ASSERTION_FAILED'],
  ]) {
    standIn.setQueryResponse(response)
    const next = await createModule(standIn).execute(request, expectedMapping)
    assert.equal(next.status, 'PROVEN', name)
    assert.equal(next.outcome, expected, name)
  }
})

test('R2-P5 fixed producer composes through the Brain validator', async (t) => {
  const standIn = await startStandIn(t)
  const brainSource = {
    schemaVersion: 'conexus-brain/v2',
    reviewText: 'Controlled Budget key-conformance composition.',
    knowledgeBrowse: { domains: [] },
    items: [{ itemId: registration.datasetId, kind: 'DATASET', grainId: registration.grainId, dependsOn: [] }],
    assertions: [{
      assertionId: 'budget-header-keys', itemId: registration.datasetId,
      kind: 'KEY_CONFORMANCE', predicateVersion: '1', scope: 'SELECTED',
    }],
  }
  const manifest = {
    schemaVersion: 'conexus-project-brain-realization/v1',
    selectedRoots: [registration.datasetId],
    mappings: [{
      itemId: registration.datasetId,
      queryId: registration.queryId,
      mappingDigest: registration.mappingDigest,
    }],
    sourceInputs: [],
  }
  validateBrainSource(brainSource)
  const parsed = parseBrainRealization(manifest, brainSource)
  const conformance = createModule(standIn, createBackend(), {
    ...subject,
    inputDigest: parsed.inputDigest,
  })
  const result = await brainModule.createBrainBindingValidator({ conformance }).validate({
    accountId: ACCOUNT_ID,
    projectId: PROJECT_ID,
    workspaceId: WORKSPACE_ID,
    brainRevisionId: '77777777-7777-4777-8777-777777777777',
    brainDigest: 'c'.repeat(64),
    brainSource,
    realization: {
      ...parsed,
      sourceRevision: SOURCE_REVISION,
      manifestDigest: sha256(canonicalBytes(manifest)),
      sourceFiles: [],
    },
  })
  assert.equal(result.status, 'VALIDATED')
  assert.equal(result.candidate.proofs.length, 1)
  assert.equal(result.candidate.proofs[0].registration.mappingDigest, SANKHYA_TGFCAB_KEY_MAPPING_DIGEST)
  assert.equal(result.candidate.proofs[0].coherence, 'SINGLE_STATEMENT')
  assert.equal(standIn.requests.length, 2)
})

test('R2-P5 refuses missing admission, wrong registration, malformed provider response and credential failures', async (t) => {
  const standIn = await startStandIn(t)
  const missingAdmission = createSankhyaKeyConformanceObserver({
    origin: 'https://api.sandbox.sankhya.com.br', environment: configuration.environment, companyCode: configuration.companyCode,
    authenticate: async () => { throw new Error('ADMISSION_MUST_BE_INJECTED') }, fetchImpl: standIn.fetchImpl,
  })
  const noAdmissionModule = createRegisteredKeyConformance({ registrations: [{ ...registration, observe: missingAdmission }], resolveSubject: async () => subject })
  assert.equal((await noAdmissionModule.execute(request, expectedMapping)).status, 'INDETERMINATE')
  assert.equal(standIn.requests.length, 0)

  assert.equal((await createModule(standIn).execute(request, { ...expectedMapping, mappingDigest: '0'.repeat(64) })).status, 'REFUSED')
  assert.equal((await createModule(standIn).execute({ ...request, queryId: 'wrong' }, expectedMapping)).status, 'REFUSED')

  for (const [label, response] of [
    ['bad-status', responseFor({ status: '0' })],
    ['bad-service', responseFor({ serviceName: 'Other.service' })],
    ['bad-transaction', responseFor({ tx: 'short' })],
    ['bad-metadata', responseFor({ bodyExtras: { fieldsMetadata: [{ name: 'TOTAL_ROWS' }] } })],
    ['bad-count', responseFor({ bodyExtras: { rows: [['-1', 0, 0]] } })],
    ['bad-completeness', responseFor({ bodyExtras: { burstLimit: true } })],
    ['extra-envelope', responseFor({ extras: { extra: true } })],
    ['wrong-content-type', responseFor()],
  ]) {
    if (label === 'wrong-content-type') {
      const original = standIn.fetchImpl
      standIn.fetchImpl = async (input, init) => {
        const response = await original(input, init)
        return new Response(await response.text(), { status: response.status, headers: { 'content-type': 'text/plain' } })
      }
    } else standIn.setQueryResponse(response)
    assert.equal((await createModule(standIn).execute(request, expectedMapping)).status, 'INDETERMINATE', label)
  }

  const unavailable = createModule(standIn, createBackend('UNAVAILABLE'))
  assert.equal((await unavailable.execute(request, expectedMapping)).status, 'INDETERMINATE')
  const invalidCredential = createModule(standIn, createBackend('INVALID'))
  assert.equal((await invalidCredential.execute(request, expectedMapping)).status, 'INDETERMINATE')
})
