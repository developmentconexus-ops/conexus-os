import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { canonicalBytes, sha256 } from '../../packages/canonical-json/src/index.mjs'

const ids = {
  account: '11111111-1111-4111-8111-111111111111',
  workspace: '22222222-2222-4222-8222-222222222222',
  project: '33333333-3333-4333-8333-333333333333',
  connection: '44444444-4444-4444-8444-444444444444',
  revision: '55555555-5555-4555-8555-555555555555',
  qualification: '66666666-6666-4666-8666-666666666666',
}
const sourceRevision = 'a'.repeat(40)
const mappingDigest = 'b'.repeat(64)
const manifest = Object.freeze({
  schemaVersion: 'conexus-project-brain-realization/v1',
  selectedRoots: Object.freeze(['budget']),
  mappings: Object.freeze([Object.freeze({ itemId: 'budget', queryId: 'budget.keys', mappingDigest })]),
  sourceInputs: Object.freeze([]),
})

test('R2-P4 trusted Project/Connections basis composes one closed Gateway subject without self-attestation', async (t) => {
  const root = resolve(import.meta.dirname, '../..')
  const build = mkdtempSync(resolve(root, 'apps/hub/r2-p4-subject-build-'))
  t.after(() => rmSync(build, { recursive: true, force: true }))
  const compiled = spawnSync(process.execPath, [resolve(root, 'node_modules/typescript/bin/tsc'),
    '--project', resolve(root, 'apps/hub/tsconfig.json'), '--noEmit', 'false', '--outDir', build], { encoding: 'utf8' })
  assert.equal(compiled.status, 0, `${compiled.stdout}\n${compiled.stderr}`)
  const gateway = await import(pathToFileURL(resolve(build, 'gateway/module.js')).href)
  const project = await import(pathToFileURL(resolve(build, 'project/module.js')).href)

  const manifestBytes = canonicalBytes(manifest)
  const manifestDigest = sha256(manifestBytes)
  const bindingBytes = canonicalBytes({ bindings: [{
    connectionId: ids.connection, connectionRevisionId: ids.revision,
    environment: 'SANDBOX', qualificationId: ids.qualification,
  }] })
  const bindingDigest = sha256(bindingBytes)
  const databaseRow = (overrides = {}) => ({
    workspace_id: ids.workspace, project_id: ids.project, connection_id: ids.connection,
    connection_revision_id: ids.revision, qualification_id: ids.qualification,
    credential_generation: '7', environment: 'SANDBOX', company_code: 1,
    connector_definition_id: 'sankhya-om', connector_version: '1.0.0',
    source_revision: sourceRevision, ...overrides,
  })
  let rows = [databaseRow(), databaseRow()]
  let reads = 0
  const pool = { query: async () => ({ rows: [rows[Math.min(reads++, rows.length - 1)]] }) }
  const sourceSnapshot = ({ projectId, sourceRevision: revision }) => {
    assert.equal(projectId, ids.project)
    assert.equal(revision, sourceRevision)
    return Object.freeze({
      sourceRevision: revision,
      listPaths: async () => Object.freeze([
        Object.freeze({
          path: '.conexus/brain/realization.json', ownershipClass: 'APP-OWNED',
          mediaType: 'application/json', byteLength: manifestBytes.length, digest: manifestDigest,
        }),
        Object.freeze({
          path: '.conexus/project/connection-bindings.json', ownershipClass: 'PLATFORM-CONTRACT',
          mediaType: 'application/json', byteLength: bindingBytes.length, digest: bindingDigest,
        }),
      ]),
      readBatch: async (paths) => Object.freeze(paths.map((path) => path === '.conexus/brain/realization.json'
        ? Object.freeze({ path, digest: manifestDigest, utf8Bytes: manifestBytes.toString('utf8') })
        : Object.freeze({ path, digest: bindingDigest, utf8Bytes: bindingBytes.toString('utf8') }))),
    })
  }
  const resolveBasis = project.createProjectKeyConformanceBasisResolver({ pool, sourceSnapshot })
  let capturedResolution
  const resolveSubject = gateway.createSankhyaKeyConformanceSubjectResolver({
    resolveBasis: async (request) => {
      capturedResolution = request
      return resolveBasis(request)
    },
  })
  const registration = {
    queryId: 'budget.keys', queryVersion: '1', workspaceId: ids.workspace, projectId: ids.project,
    connectionId: ids.connection, environment: 'SANDBOX', datasetId: 'budget', grainId: 'budget-line', mappingDigest,
  }
  let observed = 0
  const conformance = gateway.createRegisteredKeyConformance({
    resolveSubject,
    registrations: [{ ...registration, observe: async ({ registrationDigest, subjectDigest }) => {
      observed++
      return { registrationDigest, subjectDigest, observationId: 'controlled-local-observation',
        complete: true, coherence: 'SINGLE_STATEMENT', totalRows: '1', nullKeyRows: '0', duplicateKeyGroups: '0' }
    } }],
  })
  const inputDigest = sha256(canonicalBytes(manifest))
  const result = await conformance.execute({
    accountId: ids.account, projectId: ids.project, queryId: registration.queryId,
    expectedSourceRevision: sourceRevision, expectedInputDigest: inputDigest,
  }, { datasetId: registration.datasetId, grainId: registration.grainId, mappingDigest })
  assert.equal(result.status, 'PROVEN')
  assert.equal(result.outcome, 'PASS')
  assert.equal(observed, 1)
  assert.equal(result.subject.sourceScopeId, gateway.sankhyaSourceScopeId({
    connectorDefinitionId: 'sankhya-om', connectorVersion: '1.0.0',
    connectionId: ids.connection, companyCode: 1, environment: 'SANDBOX',
  }))
  assert.equal(result.subject.sourceScopeId, sha256(Buffer.from(
    `{"schemaVersion":"conexus-sankhya-source-scope/v1","connectorDefinitionId":"sankhya-om","connectorVersion":"1.0.0","connectionId":"${ids.connection}","companyCode":1,"environment":"SANDBOX"}`,
    'utf8',
  )))
  assert.match(result.subject.sourceScopeId, /^[0-9a-f]{64}$/)
  assert.deepEqual(Object.keys(capturedResolution).sort(), ['accountId', 'registration'])
  assert.equal(Object.isFrozen(capturedResolution.registration), true)
  assert.equal('expectedInputDigest' in capturedResolution, false)
  assert.equal('expectedSourceRevision' in capturedResolution, false)

  reads = 0
  rows = [databaseRow(), databaseRow({ credential_generation: '8' })]
  await assert.rejects(resolveBasis({ accountId: ids.account, registration }), /KEY_CONFORMANCE_SUBJECT_DRIFT/)
  reads = 0
  rows = [databaseRow(), databaseRow()]
  assert.equal(await resolveBasis({ accountId: ids.account,
    registration: { ...registration, mappingDigest: 'c'.repeat(64) } }), null)

  const refusedPool = { query: async () => { throw Object.assign(new Error('denied'), { code: '42501' }) } }
  assert.equal(await project.createProjectKeyConformanceBasisResolver({ pool: refusedPool, sourceSnapshot })({
    accountId: ids.account, registration,
  }), null)
  const notFoundPool = { query: async () => { throw Object.assign(new Error('not found'), { code: 'P0002' }) } }
  assert.equal(await project.createProjectKeyConformanceBasisResolver({ pool: notFoundPool, sourceSnapshot })({
    accountId: ids.account, registration,
  }), null)
  for (const code of ['P0001', 'P0412']) {
    const activeOrStalePool = { query: async () => { throw Object.assign(new Error(code), { code }) } }
    await assert.rejects(
      project.createProjectKeyConformanceBasisResolver({ pool: activeOrStalePool, sourceSnapshot })({
        accountId: ids.account, registration,
      }),
      (error) => error?.code === code,
    )
    const gatewayResult = await gateway.createRegisteredKeyConformance({
      registrations: [{ ...registration, observe: async () => { throw new Error('MUST_NOT_OBSERVE') } }],
      resolveSubject: async () => {
        throw Object.assign(new Error(code), { code })
      },
    }).execute({
      accountId: ids.account, projectId: ids.project, queryId: registration.queryId,
      expectedSourceRevision: sourceRevision, expectedInputDigest: inputDigest,
    }, { datasetId: registration.datasetId, grainId: registration.grainId, mappingDigest })
    assert.equal(gatewayResult.status, 'INDETERMINATE')
  }
})
