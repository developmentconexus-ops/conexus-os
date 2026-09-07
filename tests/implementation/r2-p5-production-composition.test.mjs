import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { canonicalBytes, sha256 } from '../../packages/canonical-json/src/index.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const buildRoot = mkdtempSync(resolve(repositoryRoot, 'apps/hub/r2-p5-composition-build-'))
const compiled = spawnSync(process.execPath, [
  resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'), '--project', resolve(repositoryRoot, 'apps/hub/tsconfig.json'),
  '--noEmit', 'false', '--outDir', buildRoot,
], { encoding: 'utf8' })
if (compiled.status !== 0) throw new Error(`R2_P5_COMPOSITION_COMPILE_FAILED\n${compiled.stdout}\n${compiled.stderr}`)
process.once('exit', () => rmSync(buildRoot, { recursive: true, force: true }))
const built = (path) => pathToFileURL(resolve(buildRoot, path)).href

const baseEnvironment = {
  NODE_ENV: 'test',
  CONEXUS_ORIGIN: 'https://control.example.test',
  CONEXUS_BOOTSTRAP_SUBJECT: 'bootstrap-subject',
  CONEXUS_DB_HOST: '127.0.0.1',
  CONEXUS_DB_PORT: '5432',
  CONEXUS_DB_NAME: 'conexus',
  CONEXUS_DB_USER: 'conexus',
  CONEXUS_DB_PASSWORD_FILE: '/run/secrets/database',
  CONEXUS_OIDC_ISSUER: 'https://issuer.example.test',
  CONEXUS_OIDC_CLIENT_ID: 'conexus-client',
  CONEXUS_OIDC_CLIENT_SECRET_FILE: '/run/secrets/oidc',
  CONEXUS_DB_R2_PROJECT_BINDING_PASSWORD_FILE: '/run/secrets/project-binding',
  CONEXUS_PROJECT_STORAGE_ROOT: '/var/lib/conexus/projects',
  CONEXUS_DB_R2_BRAIN_READ_PASSWORD_FILE: '/run/secrets/brain-read',
  CONEXUS_DB_R2_CONNECTIONS_PASSWORD_FILE: '/run/secrets/connections',
  CONEXUS_CONNECTION_CREDENTIAL_ROOT: '/var/lib/conexus/credentials',
  CONEXUS_CONNECTION_CREDENTIAL_KEY_FILE: '/run/secrets/credential-key',
  CONEXUS_CONNECTION_CREDENTIAL_KEY_GENERATION: '1',
}

test('R2-P5 project binding Brain configuration is all-or-nothing', async () => {
  const { readHubConfig } = await import(built('platform/config.js'))
  const r1Only = readHubConfig({
    ...baseEnvironment,
    CONEXUS_DB_R2_PROJECT_BINDING_PASSWORD_FILE: undefined,
    CONEXUS_DB_R2_BRAIN_READ_PASSWORD_FILE: undefined,
    CONEXUS_DB_R2_CONNECTIONS_PASSWORD_FILE: undefined,
    CONEXUS_CONNECTION_CREDENTIAL_ROOT: undefined,
    CONEXUS_CONNECTION_CREDENTIAL_KEY_FILE: undefined,
    CONEXUS_CONNECTION_CREDENTIAL_KEY_GENERATION: undefined,
    CONEXUS_DB_PRJ03_COMMAND_PASSWORD_FILE: '/run/secrets/project-command',
    CONEXUS_DB_S3_READ_PASSWORD_FILE: '/run/secrets/project-read',
    CONEXUS_DB_S4_BASELINE_READ_PASSWORD_FILE: '/run/secrets/baseline-read',
    CONEXUS_DB_S4_BASELINE_COMMAND_PASSWORD_FILE: '/run/secrets/baseline-command',
    CONEXUS_DB_S6_INCEPTION_COMMAND_PASSWORD_FILE: '/run/secrets/inception-command',
    CONEXUS_GIT_IMPORT_CATALOG_FILE: '/etc/conexus/imports.json',
    CONEXUS_GIT_EXTERNAL_FILE_SLOTS_FILE: '/etc/conexus/slots.json',
    CONEXUS_PROJECT_MODEL_CATALOG_FILE: '/etc/conexus/models.json',
    CONEXUS_PROJECT_SOURCE_OWNERSHIP_MANIFEST_FILE: '/etc/conexus/r1-source.json',
  })
  assert.equal(r1Only.projectBindings, undefined)
  const full = {
    ...baseEnvironment,
    CONEXUS_DB_R2_BRAIN_ATTESTER_PASSWORD_FILE: '/run/secrets/attester',
    CONEXUS_DB_R2_KEY_CONFORMANCE_SUBJECT_PASSWORD_FILE: '/run/secrets/key-subject',
    CONEXUS_PROJECT_SOURCE_OWNERSHIP_MANIFEST_FILE: '/etc/conexus/source.json',
    CONEXUS_R2_KEY_CONFORMANCE_REGISTRATION_CATALOG_FILE: '/etc/conexus/catalog.json',
  }
  const config = readHubConfig(full)
  assert.deepEqual(config.projectBindings, {
    passwordFile: '/run/secrets/project-binding',
    storageRoot: '/var/lib/conexus/projects',
    brain: {
      attesterPasswordFile: '/run/secrets/attester',
      keyConformanceSubjectPasswordFile: '/run/secrets/key-subject',
      sourceOwnershipManifestFile: '/etc/conexus/source.json',
      registrationCatalogFile: '/etc/conexus/catalog.json',
    },
  })
  for (const omitted of [
    'CONEXUS_DB_R2_BRAIN_ATTESTER_PASSWORD_FILE',
    'CONEXUS_DB_R2_KEY_CONFORMANCE_SUBJECT_PASSWORD_FILE',
    'CONEXUS_PROJECT_SOURCE_OWNERSHIP_MANIFEST_FILE',
    'CONEXUS_R2_KEY_CONFORMANCE_REGISTRATION_CATALOG_FILE',
  ]) {
    const partial = { ...full }
    delete partial[omitted]
    assert.throws(() => readHubConfig(partial), /MISSING_CONFIG_/)
  }
  const withoutBrainRuntime = { ...full }
  delete withoutBrainRuntime.CONEXUS_DB_R2_BRAIN_READ_PASSWORD_FILE
  assert.throws(() => readHubConfig(withoutBrainRuntime), /PROJECT_BINDING_BRAIN_RUNTIME_UNAVAILABLE/)
  const withoutConnectionsRuntime = { ...full }
  delete withoutConnectionsRuntime.CONEXUS_DB_R2_CONNECTIONS_PASSWORD_FILE
  delete withoutConnectionsRuntime.CONEXUS_CONNECTION_CREDENTIAL_ROOT
  delete withoutConnectionsRuntime.CONEXUS_CONNECTION_CREDENTIAL_KEY_FILE
  delete withoutConnectionsRuntime.CONEXUS_CONNECTION_CREDENTIAL_KEY_GENERATION
  assert.throws(() => readHubConfig(withoutConnectionsRuntime), /PROJECT_BINDING_BRAIN_RUNTIME_UNAVAILABLE/)
})

test('R2-P5 registration catalog accepts only the fixed Sankhya producer descriptor', async () => {
  const gateway = await import(built('gateway/module.js'))
  const root = mkdtempSync(resolve(repositoryRoot, 'apps/hub/r2-p5-catalog-'))
  try {
    const entry = {
      descriptor: {
        queryId: 'budget-key-query', queryVersion: '1',
        workspaceId: '22222222-2222-4222-8222-222222222222',
        projectId: '33333333-3333-4333-8333-333333333333',
        connectionId: '44444444-4444-4444-8444-444444444444', environment: 'PRODUCTION',
        datasetId: 'brain.dataset.budget', grainId: 'brain.grain.budget-document',
        mappingDigest: gateway.SANKHYA_TGFCAB_KEY_MAPPING_DIGEST,
      },
      producer: { producerId: 'sankhya-budget-header-key-conformance/v1', companyCode: 2 },
    }
    const path = resolve(root, 'catalog.json')
    const writeCatalog = (entries) => writeFileSync(path, JSON.stringify({
      schemaVersion: 'conexus-key-conformance-registration-catalog/v1', entries,
    }), { mode: 0o600 })
    writeCatalog([entry])
    const catalog = gateway.readSankhyaKeyConformanceRegistrationCatalog(path)
    assert.equal(catalog.length, 1)
    assert.equal(catalog[0].producer.companyCode, 2)
    assert.throws(() => gateway.readSankhyaKeyConformanceRegistrationCatalog(resolve(root, 'missing.json')), /KEY_CONFORMANCE_CATALOG_REFUSED/)
    for (const refused of [
      [],
      [{ ...entry, sql: 'SELECT 1' }],
      [{ ...entry, descriptor: { ...entry.descriptor, queryVersion: '2' } }],
      [{ ...entry, descriptor: { ...entry.descriptor, url: 'https://example.test' } }],
      [{ ...entry, producer: { ...entry.producer, producerId: 'generic-sql/v1' } }],
      [{ ...entry, producer: { ...entry.producer, companyCode: 3 } }],
      [entry, entry],
    ]) {
      writeCatalog(refused)
      assert.throws(() => gateway.readSankhyaKeyConformanceRegistrationCatalog(path), /KEY_CONFORMANCE_CATALOG_REFUSED/)
    }
    writeCatalog([entry])
    chmodSync(path, 0o666)
    assert.throws(() => gateway.readSankhyaKeyConformanceRegistrationCatalog(path), /KEY_CONFORMANCE_CATALOG_REFUSED/)
    chmodSync(path, 0o600)
    const link = resolve(root, 'catalog-link.json')
    symlinkSync(path, link)
    assert.throws(() => gateway.readSankhyaKeyConformanceRegistrationCatalog(link), /KEY_CONFORMANCE_CATALOG_REFUSED/)
    writeFileSync(path, Buffer.alloc(256 * 1024 + 1), { mode: 0o600 })
    assert.throws(() => gateway.readSankhyaKeyConformanceRegistrationCatalog(path), /KEY_CONFORMANCE_CATALOG_REFUSED/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('R2-P5 server composition keeps subject pool and full binding activation behind Brain config', () => {
  const source = readFileSync(resolve(repositoryRoot, 'apps/hub/src/server.ts'), 'utf8')
  const occurrences = (pattern) => source.match(pattern)?.length ?? 0
  assert.match(source, /hub_r2_key_conformance_subject/)
  assert.equal(occurrences(/createEncryptedFileCredentialBackend\(/g), 1)
  assert.equal(occurrences(/createConfiguredProjectBindingModule\(/g), 1)
  assert.equal(occurrences(/createConfiguredProjectConnectionBindingModule\(/g), 1)
  assert.match(source, /if \(config\.projectBindings\?\.brain\)[\s\S]*} else if \(config\.projectBindings\)/)
  assert.match(source, /createProjectBrainRealizationPort\(sharedSourceSnapshot\)/)
  assert.match(source, /createConfiguredProjectModule\([\s\S]*sourceSnapshot: sharedSourceSnapshot/)
  assert.match(source, /createProjectKeyConformanceBasisResolver\(\{ pool: keyConformanceSubjectPool, sourceSnapshot: sharedSourceSnapshot \}\)/)
  assert.match(source, /createConfiguredProjectBindingModule\([\s\S]*sourceSnapshot: sharedSourceSnapshot/)
  assert.match(source, /keyConformanceSubjectPool\?\.end\(\)/)
  assert.match(source, /projectBindings && 'registerProjectBrainBindingRoutes' in projectBindings/)
})

test('R2-P5 P0001/P0412 resolver errors remain indeterminate through validator, Project and PRJ-11', async () => {
  const [gateway, brain, binding, routes, http] = await Promise.all([
    import(built('gateway/module.js')),
    import(built('brain/module.js')),
    import(built('project/brain-binding.js')),
    import(built('project/routes.js')),
    import(built('http/app.js')),
  ])
  const ids = {
    accountId: '11111111-1111-4111-8111-111111111111',
    workspaceId: '22222222-2222-4222-8222-222222222222',
    projectId: '33333333-3333-4333-8333-333333333333',
    connectionId: '44444444-4444-4444-8444-444444444444',
    brainRevisionId: '55555555-5555-4555-8555-555555555555',
  }
  const mappingDigest = 'a'.repeat(64)
  const sourceRevision = 'b'.repeat(40)
  const queryId = 'budget.keys'
  const registration = {
    queryId, queryVersion: '1', workspaceId: ids.workspaceId, projectId: ids.projectId,
    connectionId: ids.connectionId, environment: 'SANDBOX', datasetId: 'budget', grainId: 'budget-line', mappingDigest,
  }
  const brainSource = {
    schemaVersion: 'conexus-brain/v2', reviewText: 'Reviewed budget key meaning.', knowledgeBrowse: { domains: [] },
    items: [{ itemId: 'budget', kind: 'DATASET', grainId: 'budget-line', dependsOn: [] }],
    assertions: [{ assertionId: 'budget-keys', itemId: 'budget', kind: 'KEY_CONFORMANCE', predicateVersion: '1', scope: 'SELECTED' }],
  }
  const realizationManifest = {
    schemaVersion: 'conexus-project-brain-realization/v1', selectedRoots: ['budget'],
    mappings: [{ itemId: 'budget', queryId, mappingDigest }], sourceInputs: [],
  }
  const manifestBytes = canonicalBytes(realizationManifest)
  const manifestDigest = sha256(manifestBytes)
  const source = Object.freeze({
    sourceRevision,
    listPaths: async () => [{
      path: '.conexus/brain/realization.json', ownershipClass: 'APP-OWNED', mediaType: 'application/json',
      byteLength: manifestBytes.length, digest: manifestDigest,
    }],
    readBatch: async () => [{ path: '.conexus/brain/realization.json', digest: manifestDigest, utf8Bytes: manifestBytes.toString('utf8') }],
  })
  const sourceSnapshot = () => source
  const makeCase = async (code) => {
    const conformance = gateway.createRegisteredKeyConformance({
      registrations: [{ ...registration, observe: async () => { throw new Error('MUST_NOT_OBSERVE') } }],
      resolveSubject: async () => { throw Object.assign(new Error(code), { code }) },
    })
    const request = {
      accountId: ids.accountId, projectId: ids.projectId, queryId,
      expectedSourceRevision: sourceRevision, expectedInputDigest: manifestDigest,
    }
    const expectedMapping = { datasetId: 'budget', grainId: 'budget-line', mappingDigest }
    assert.equal((await conformance.execute(request, expectedMapping)).status, 'INDETERMINATE')

    const validator = brain.createBrainBindingValidator({ conformance })
    const validation = await validator.validate({
      accountId: ids.accountId, projectId: ids.projectId, workspaceId: ids.workspaceId,
      brainRevisionId: ids.brainRevisionId, brainDigest: 'c'.repeat(64), brainSource,
      realization: {
        manifest: realizationManifest, applicableItemIds: ['budget'],
        requiredAssertions: brainSource.assertions, inputDigest: manifestDigest,
        sourceRevision, manifestDigest, sourceFiles: [],
      },
    })
    assert.equal(validation.status, 'INDETERMINATE')

    const store = binding.createProjectBrainBindingStore({
      project: {
        getBindingContext: async () => ({ projectId: ids.projectId, workspaceId: ids.workspaceId, sourceRevision, connectionPermitted: true }),
      },
      binding: { getCurrent: async () => null },
      registry: { getRevision: async () => ({ brainRevisionId: ids.brainRevisionId, brainDigest: 'c'.repeat(64), payload: brainSource }) },
      sourceSnapshot, validator,
      attester: { persist: async () => { throw new Error('MUST_NOT_ATTEST') } },
      recovery: { reconcile: async () => { }, executeBrain: async () => { throw new Error('MUST_NOT_SETTLE') }, executeBrainRemoval: async () => { throw new Error('MUST_NOT_REMOVE') } },
    })
    const projectResult = await store.set({ accountId: ids.accountId, projectId: ids.projectId, brainRevisionId: ids.brainRevisionId, expectedCurrent: { state: 'ABSENT' } })
    assert.deepEqual(projectResult, { status: 'UNAVAILABLE' })

    const app = await http.createHttpApp({
      registerRoutes: (server) => routes.registerProjectBrainBindingRoutes(server, {
        store, origin: 'https://control.example.test',
        resolveCurrentSession: async () => ({ account: { accountId: ids.accountId } }),
      }),
    })
    try {
      const response = await app.inject({
        method: 'PUT', url: `/api/control/projects/${ids.projectId}/brain-binding`,
        headers: {
          origin: 'https://control.example.test', cookie: '__Host-conexus_csrf=csrf',
          'x-conexus-csrf': 'csrf', 'if-none-match': '*',
        }, payload: { brainRevisionId: ids.brainRevisionId },
      })
      assert.equal(response.statusCode, 503)
      assert.equal(JSON.parse(response.body).status, 503)
    } finally {
      await app.close()
    }
  }
  await makeCase('P0001')
  await makeCase('P0412')
})
