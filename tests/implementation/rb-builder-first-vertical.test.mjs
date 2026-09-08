import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import pg from 'pg'
import { runCurrentHubMigrations } from '../../scripts/run-hub-migrations.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const buildRoot = mkdtempSync(resolve(repositoryRoot, 'apps/hub/rb-first-build-'))
const compiled = spawnSync(process.execPath, [
  resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'), '--project', resolve(repositoryRoot, 'apps/hub/tsconfig.json'),
  '--noEmit', 'false', '--outDir', buildRoot,
], { cwd: repositoryRoot, encoding: 'utf8' })
if (compiled.status !== 0) throw new Error(compiled.stdout || compiled.stderr)
const built = (path) => pathToFileURL(resolve(buildRoot, path)).href
const { createHttpApp } = await import(built('http/app.js'))
const { registerBuilderRoutes } = await import(built('builder/routes.js'))
const { createBuilderService } = await import(built('builder/service.js'))
const { createBuilderSourcePort } = await import(built('builder/source.js'))
const { createMastraE2BCodingWorkerRuntime } = await import(built('builder/runtime.js'))
const {
  assertCandidateFileIdentity, assertCandidateInspectionCoverage,
  createCandidateFileReadAdmission, createMastraE2BCandidateVerificationRuntime, gitBlobOid,
} = await import(built('builder/verification-runtime.js'))
const { readHubConfig } = await import(built('platform/config.js'))
const { resolveProjectCognitionModelAdmission, resolveProjectModelAdmission } = await import(built('project/module.js'))
const { createOciProjectBindingGitCapability } = await import(built('project/git-execution.js'))

test.after(() => rmSync(buildRoot, { recursive: true, force: true }))

const projectId = '11111111-1111-4111-8111-111111111111'
const changeId = '22222222-2222-4222-8222-222222222222'
const workUnitId = '33333333-3333-4333-8333-333333333333'
const actorRunId = '44444444-4444-4444-8444-444444444444'
const admissionToken = '55555555-5555-4555-8555-555555555555'
const sandboxId = 'sbx_exact'
const baseSourceRevision = 'a'.repeat(40)
const candidateSourceRevision = 'b'.repeat(40)
const immutableTemplateId = 'fixturetemplate:66666666-6666-4666-8666-666666666666'
const modelIdentity = { admissionId: 'builder-coding-primary', providerId: 'anthropic', modelId: 'claude-opus-5' }
const projection = { changeId, projectId, intent: 'Add a health page', baselineDigest: 'c'.repeat(64), planningDepth: 'DIRECT', rigorProfile: 'CONTROLLED', state: 'QUEUED' }
const claim = { projectId, changeId, workUnitId, actorRunId, admissionToken, intent: projection.intent, baseSourceRevision }
const verificationActorRunId = '77777777-7777-4777-8777-777777777777'
const verificationToken = '88888888-8888-4888-8888-888888888888'
const verificationSandboxId = 'sbx_verifier_exact'
const verificationClaim = {
  ...claim, actorRunId: verificationActorRunId, admissionToken: verificationToken,
  assertionRef: `change-intent:${'d'.repeat(64)}`, contractRevision: admissionToken,
  planRevision: admissionToken, baselineDigest: 'c'.repeat(64), candidateSourceRevision,
}
const verifierIdentity = { admissionId: 'builder-verification-primary', providerId: 'anthropic', modelId: 'claude-opus-5' }

test('Builder admits only an explicitly remote runtime and settles a fully scoped candidate', async () => {
  assert.throws(() => createBuilderService({ store: {}, source: {}, runtime: { kind: 'LOCAL' }, verifier: { kind: 'REMOTE_E2B' } }), /BUILDER_LOCAL_RUNTIME_REFUSED/)
  const calls = []
  const store = {
    createChange: async () => projection,
    claimChange: async () => { calls.push('claim'); return claim },
    bindSandbox: async (...args) => { calls.push(['bind', ...args]) },
    settleResult: async (input) => { calls.push(['settle', input]) },
    claimVerification: async () => { calls.push('claim-verification'); return verificationClaim },
    failVerificationClaim: async () => { calls.push('fail-verification-claim') },
    settleVerification: async (input) => { calls.push(['settle-verification', input]) },
    failVerification: async (...args) => { calls.push(['fail-verification', ...args]) },
    failRun: async (...args) => { calls.push(['fail', ...args]) },
    recoverAndListQueued: async () => [],
    close: async () => { calls.push('close') },
  }
  const source = {
    prepareSource: async (input) => { calls.push(['source', input]); return Uint8Array.from([1, 2, 3]) },
    admitCandidate: async (input) => {
      calls.push(['admit', input])
      return { baseSourceRevision, candidateSourceRevision, patch: 'diff --git a/x b/x' }
    },
    prepareCandidate: async (input) => { calls.push(['candidate-source', input]); return { bundle: Uint8Array.from([5]), changedFiles: [{ path: 'health.ts', status: 'ADDED', base: null, candidate: { mode: '100644', blobOid: 'a'.repeat(40), byteLength: 7 } }] } },
  }
  const runtime = {
    kind: 'REMOTE_E2B',
    modelIdentity,
    execute: async (input) => {
      calls.push(['execute', input])
      await input.bindPhysicalSandbox(sandboxId)
      return { runtimeId: 'mastra-native-e2b-v1', ...claim, sandboxId, candidateSourceRevision, resultBundle: Uint8Array.from([4]), summary: 'Implemented.' }
    },
  }
  const verifier = {
    kind: 'REMOTE_E2B', modelIdentity: verifierIdentity,
    verify: async (input) => {
      calls.push(['verify', input])
      await input.bindPhysicalSandbox(verificationSandboxId)
      return {
        runtimeId: 'mastra-native-e2b-verifier-v1', ...verificationClaim, sandboxId: verificationSandboxId,
        report: { outcome: 'PASS', intentSatisfied: true, summary: 'Verified.', findings: [], checks: [{ name: 'intent', outcome: 'PASS', detail: 'Satisfied.' }] },
      }
    },
  }
  const service = createBuilderService({ store, source, runtime, verifier })
  assert.equal((await service.createChange({ accountId: projectId, projectId, idempotencyKey: 'attempt', intent: projection.intent })).changeId, changeId)
  await service.close()
  assert.deepEqual(calls.map((entry) => Array.isArray(entry) ? entry[0] : entry), [
    'claim', 'source', 'execute', 'bind', 'admit', 'settle', 'claim-verification',
    'candidate-source', 'verify', 'bind', 'settle-verification', 'close',
  ])
  const settlement = calls.find((entry) => Array.isArray(entry) && entry[0] === 'settle')[1]
  assert.equal(settlement.baseSourceRevision, baseSourceRevision)
  assert.equal(settlement.candidateSourceRevision, candidateSourceRevision)
  assert.equal(settlement.sandboxId, sandboxId)
})

test('Builder turns a verifier claim failure into honest unverified state without replaying the writer', async () => {
  const calls = []
  const store = {
    createChange: async () => projection,
    claimChange: async () => { calls.push('claim'); return claim },
    bindSandbox: async () => {},
    settleResult: async () => { calls.push('settle') },
    claimVerification: async () => { calls.push('claim-verification'); throw new Error('VERIFIER_CLAIM_UNAVAILABLE') },
    failVerificationClaim: async (failedChangeId) => { calls.push(['fail-verification-claim', failedChangeId]) },
    settleVerification: async () => { throw new Error('must not settle') },
    failVerification: async () => { throw new Error('must not fail an unclaimed ActorRun') },
    failRun: async () => {},
    recoverAndListQueued: async () => [],
    close: async () => { calls.push('close') },
  }
  const source = {
    prepareSource: async () => Uint8Array.from([1]),
    admitCandidate: async () => ({ baseSourceRevision, candidateSourceRevision, patch: 'diff' }),
  }
  const runtime = {
    kind: 'REMOTE_E2B', modelIdentity,
    execute: async () => ({ runtimeId: 'mastra-native-e2b-v1', ...claim, sandboxId, candidateSourceRevision, resultBundle: Uint8Array.from([2]), summary: 'Implemented.' }),
  }
  const service = createBuilderService({
    store, source, runtime, verifier: { kind: 'REMOTE_E2B', modelIdentity: verifierIdentity },
  })
  await service.createChange({ accountId: projectId, projectId, idempotencyKey: 'claim-failure', intent: projection.intent })
  await service.close()
  assert.deepEqual(calls, [
    'claim', 'settle', 'claim-verification', ['fail-verification-claim', changeId], 'close',
  ])
})

test('Builder refuses mismatched worker lineage and never settles its narration', async () => {
  const state = { settled: false, failed: false }
  const store = {
    createChange: async () => projection, claimChange: async () => claim, bindSandbox: async () => {},
    settleResult: async () => { state.settled = true }, failRun: async () => { state.failed = true },
    claimVerification: async () => { throw new Error('must not verify mismatched output') },
    failVerification: async () => {}, settleVerification: async () => {},
    recoverAndListQueued: async () => [], close: async () => {},
  }
  const source = {
    prepareSource: async () => Uint8Array.from([1]),
    admitCandidate: async () => { throw new Error('must not admit mismatched output') },
  }
  const runtime = {
    kind: 'REMOTE_E2B',
    modelIdentity,
    execute: async () => ({ runtimeId: 'mastra-native-e2b-v1', ...claim, changeId: projectId, sandboxId, candidateSourceRevision, resultBundle: Uint8Array.from([2]), summary: 'I declare success.' }),
  }
  const service = createBuilderService({ store, source, runtime, verifier: { kind: 'REMOTE_E2B', modelIdentity: verifierIdentity } })
  await service.createChange({ accountId: projectId, projectId, idempotencyKey: 'scope', intent: projection.intent })
  await service.close()
  assert.equal(state.settled, false)
  assert.equal(state.failed, true)
})

test('BLD-01/02/03/04/06/07/17 expose owner projections with command authenticity', async () => {
  const origin = 'https://control.example.test'
  const csrf = 'csrf'
  const snapshot = {
    change: projection,
    plan: { planRevision: admissionToken, planningDepth: 'DIRECT', rigorProfile: 'CONTROLLED', items: [], dependencyEdges: [], acceptanceLinks: [], blockers: [], unknowns: [], progress: 'QUEUED' },
    progress: { planRevision: admissionToken, items: [], overallState: 'QUEUED' },
    diff: { baseSourceRevision, candidateSourceRevision, patch: 'diff' },
    execution: { changeId, workUnits: [], actorRuns: [] },
  }
  const calls = []
  const finding = { findingId: actorRunId, changeId, findingRevision: admissionToken, state: 'OPEN', summary: 'Intent is incomplete.' }
  const evidence = { evidenceId: workUnitId, changeId, claim: 'Candidate checked.', subjectDigest: candidateSourceRevision, provenance: [] }
  const store = {
    listChanges: async (input) => { calls.push(['list', input]); return [projection] },
    readSnapshot: async (input) => { calls.push(['read', input]); return snapshot },
    listFindings: async () => [finding], getFinding: async () => finding,
    listEvidence: async () => [evidence], getEvidence: async () => evidence,
  }
  const service = { createChange: async (input) => { calls.push(['create', input]); return projection } }
  const resolveCurrentSession = async (_request, requireCsrf) => { calls.push(['session', requireCsrf]); return { account: { accountId: projectId } } }
  const app = await createHttpApp({ registerRoutes: (server) => registerBuilderRoutes(server, { store, service, resolveCurrentSession, origin }) })
  try {
    assert.deepEqual(app.routeCensus(), ['BLD-01', 'BLD-02', 'BLD-03', 'BLD-04', 'BLD-06', 'BLD-07', 'BLD-11', 'BLD-12', 'BLD-14', 'BLD-15', 'BLD-17'])
    const denied = await app.inject({ method: 'POST', url: `/api/control/projects/${projectId}/changes`, payload: { intent: projection.intent } })
    assert.equal(denied.statusCode, 403)
    const created = await app.inject({
      method: 'POST', url: `/api/control/projects/${projectId}/changes`,
      headers: { origin, cookie: `__Host-conexus_csrf=${csrf}`, 'x-conexus-csrf': csrf, 'idempotency-key': 'one' }, payload: { intent: projection.intent },
    })
    assert.equal(created.statusCode, 201)
    assert.equal(calls.find((entry) => entry[0] === 'create')[1].idempotencyKey, 'one')
    for (const [suffix, expected] of [['', snapshot.change], ['/plan', snapshot.plan], ['/progress', snapshot.progress], ['/diff', snapshot.diff], ['/execution-detail', snapshot.execution]]) {
      const response = await app.inject({ method: 'GET', url: `/api/control/projects/${projectId}/changes/${changeId}${suffix}` })
      assert.equal(response.statusCode, 200)
      assert.deepEqual(JSON.parse(response.body), expected)
    }
    assert.equal(calls.findLast((entry) => entry[0] === 'read')[1].requireSource, false)
    const diffRead = calls.filter((entry) => entry[0] === 'read').find((entry) => entry[1].requireSource)
    assert.equal(diffRead[1].changeId, changeId)
    for (const [suffix, expected] of [
      ['/findings', [finding]], [`/findings/${finding.findingId}`, finding],
      ['/evidence', [evidence]], [`/evidence/${evidence.evidenceId}`, evidence],
    ]) {
      const response = await app.inject({ method: 'GET', url: `/api/control/projects/${projectId}/changes/${changeId}${suffix}` })
      assert.equal(response.statusCode, 200)
      assert.deepEqual(JSON.parse(response.body), expected)
    }
  } finally { await app.close() }
})

test('runtime, migration and custody source preserve the Builder trust boundary', () => {
  const runtime = readFileSync(resolve(repositoryRoot, 'apps/hub/src/builder/runtime.ts'), 'utf8')
  const source = readFileSync(resolve(repositoryRoot, 'apps/hub/src/builder/source.ts'), 'utf8')
  const migration = readFileSync(resolve(repositoryRoot, 'apps/hub/migrations/019_rb_builder_first_vertical.sql'), 'utf8')
  const server = readFileSync(resolve(repositoryRoot, 'apps/hub/src/server.ts'), 'utf8')
  assert.match(runtime, /Sandbox\.create\(config\.templateId/)
  assert.match(runtime, /allowInternetAccess: false/)
  assert.match(runtime, /envs: \{\}/)
  assert.doesNotMatch(runtime, /LocalSandbox/)
  assert.match(runtime, /override retryOnDead/)
  assert.doesNotMatch(readFileSync(resolve(repositoryRoot, 'apps/hub/src/builder/verification-runtime.ts'), 'utf8'), /diff --check/)
  assert.match(source, /'--network', 'none'/)
  assert.match(source, /refs\/conexus\/changes\//)
  assert.match(source, /ownership\[path\] && ownership\[path\] !== 'APP-OWNED'/)
  assert.match(migration, /one_active_writer_per_change/)
  assert.match(migration, /state = 'QUARANTINED'/)
  assert.match(migration, /RETURN false;/)
  assert.doesNotMatch(migration, /can_manage.*can_build/s)
  assert.match(migration, /receipt\.operation_id = 'PRJ-03'/)
  assert.ok(server.indexOf('await builder?.recover()') < server.indexOf("await app.listen({ host: '127.0.0.1'"))
})

test('Builder model admission is a closed purpose-bound catalog, not an Inception hardcode', () => {
  const root = mkdtempSync(resolve(repositoryRoot, 'apps/hub/rb-model-catalog-'))
  const catalogFile = resolve(root, 'models.json')
  const slotsFile = resolve(root, 'slots.json')
  const credentialFile = resolve(root, 'oauth.json')
  const builderEntry = {
    admissionId: 'builder-coding-primary', providerKey: 'anthropic', modelId: 'claude-sonnet-4-5',
    officialHttpsOrigin: 'https://api.anthropic.com', credentialSlot: 'shared-anthropic-oauth',
    capabilitySet: ['BUILDER_CODING'], enabled: true,
  }
  const verifierEntry = {
    admissionId: 'builder-verification-primary', providerKey: 'anthropic', modelId: 'claude-opus-5',
    officialHttpsOrigin: 'https://api.anthropic.com', credentialSlot: 'shared-anthropic-oauth',
    capabilitySet: ['BUILDER_VERIFICATION'], enabled: true,
  }
  const inceptionEntry = {
    admissionId: 'project-inception-opus-5', providerKey: 'anthropic', modelId: 'claude-opus-5',
    officialHttpsOrigin: 'https://api.anthropic.com', credentialSlot: 'shared-anthropic-oauth',
    capabilitySet: ['PROJECT_INCEPTION', 'BASELINE_EXPLANATION'], enabled: true,
  }
  const writeCatalog = (entries) => writeFileSync(catalogFile, JSON.stringify({
    schemaVersion: 'conexus-model-admission-catalog/v1', entries,
  }))
  try {
    writeFileSync(credentialFile, JSON.stringify({ access: 'fixture-access', refresh: 'fixture-refresh', expiresAt: Date.now() + 60_000 }), { mode: 0o600 })
    writeFileSync(slotsFile, JSON.stringify({ 'shared-anthropic-oauth': credentialFile }))
    writeCatalog([inceptionEntry, builderEntry, verifierEntry])
    const selected = resolveProjectModelAdmission({
      catalogFile, credentialSlotsFile: slotsFile, admissionId: builderEntry.admissionId,
      requiredCapabilities: ['BUILDER_CODING'],
    })
    assert.deepEqual({ admissionId: selected.admissionId, providerId: selected.providerId, modelId: selected.modelId }, {
      admissionId: builderEntry.admissionId, providerId: 'anthropic', modelId: 'claude-sonnet-4-5',
    })
    assert.equal(selected.model.modelId, 'claude-sonnet-4-5')
    const verifier = resolveProjectModelAdmission({
      catalogFile, credentialSlotsFile: slotsFile, admissionId: verifierEntry.admissionId,
      requiredCapabilities: ['BUILDER_VERIFICATION'],
    })
    assert.equal(verifier.modelId, 'claude-opus-5')
    const inception = resolveProjectCognitionModelAdmission({ catalogFile, credentialSlotsFile: slotsFile })
    assert.equal(inception.modelId, 'claude-opus-5')
    assert.equal(inception.validateCredential, selected.validateCredential)
    writeCatalog([{ ...inceptionEntry, modelId: 'claude-sonnet-4-5' }, builderEntry])
    assert.throws(() => resolveProjectCognitionModelAdmission({ catalogFile, credentialSlotsFile: slotsFile }),
      /PROJECT_MODEL_CATALOG_REFUSED/)
    writeCatalog([inceptionEntry, builderEntry, verifierEntry])
    assert.throws(() => resolveProjectModelAdmission({
      catalogFile, credentialSlotsFile: slotsFile, admissionId: 'missing', requiredCapabilities: ['BUILDER_CODING'],
    }), /PROJECT_MODEL_ADMISSION_UNAVAILABLE/)
    assert.throws(() => resolveProjectModelAdmission({
      catalogFile, credentialSlotsFile: slotsFile, admissionId: inceptionEntry.admissionId,
      requiredCapabilities: ['BUILDER_CODING'],
    }), /PROJECT_MODEL_ADMISSION_UNAVAILABLE/)
    for (const refused of [
      [{ ...builderEntry, enabled: false }],
      [{ ...builderEntry, modelId: 'claude-latest' }],
      [{ ...builderEntry, modelId: 'claude-sonnet-4-5-typo' }],
      [{ ...builderEntry, capabilitySet: ['PROJECT_INCEPTION'] }],
      [{ ...builderEntry, providerKey: 'openai', officialHttpsOrigin: 'https://api.openai.com' }],
      [builderEntry, builderEntry],
    ]) {
      writeCatalog(refused)
      assert.throws(() => resolveProjectModelAdmission({
        catalogFile, credentialSlotsFile: slotsFile, admissionId: builderEntry.admissionId,
        requiredCapabilities: ['BUILDER_CODING'],
      }), /PROJECT_MODEL_(CATALOG_REFUSED|ADMISSION_UNAVAILABLE|PROVIDER_UNSUPPORTED)/)
    }
    writeCatalog([builderEntry])
    writeFileSync(slotsFile, '{}')
    assert.throws(() => resolveProjectModelAdmission({
      catalogFile, credentialSlotsFile: slotsFile, admissionId: builderEntry.admissionId,
      requiredCapabilities: ['BUILDER_CODING'],
    }), /PROJECT_MODEL_CREDENTIAL_SLOT_REFUSED/)
    writeFileSync(slotsFile, JSON.stringify({ 'shared-anthropic-oauth': resolve(root, 'missing-oauth.json') }))
    assert.throws(() => resolveProjectModelAdmission({
      catalogFile, credentialSlotsFile: slotsFile, admissionId: builderEntry.admissionId,
      requiredCapabilities: ['BUILDER_CODING'],
    }), /ANTHROPIC_OAUTH_LOGIN_REQUIRED/)
    writeFileSync(slotsFile, JSON.stringify({ 'shared-anthropic-oauth': credentialFile }))
    writeFileSync(credentialFile, '{}', { mode: 0o600 })
    assert.throws(() => resolveProjectModelAdmission({
      catalogFile, credentialSlotsFile: slotsFile, admissionId: builderEntry.admissionId,
      requiredCapabilities: ['BUILDER_CODING'],
    }), /ANTHROPIC_OAUTH_TOKEN_FILE_INVALID/)
    writeFileSync(credentialFile, JSON.stringify({ access: 'a', refresh: 'r', expiresAt: Date.now() + 60_000 }), { mode: 0o600 })
    chmodSync(credentialFile, 0o644)
    assert.throws(() => resolveProjectModelAdmission({
      catalogFile, credentialSlotsFile: slotsFile, admissionId: builderEntry.admissionId,
      requiredCapabilities: ['BUILDER_CODING'],
    }), /ANTHROPIC_OAUTH_CUSTODY_INVALID/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('Builder configuration requires one complete catalog-selected runtime', () => {
  const environment = {
    NODE_ENV: 'test', CONEXUS_ORIGIN: 'https://control.example.test', CONEXUS_BOOTSTRAP_SUBJECT: 'subject',
    CONEXUS_DB_HOST: '127.0.0.1', CONEXUS_DB_PORT: '5432', CONEXUS_DB_NAME: 'conexus', CONEXUS_DB_USER: 'conexus',
    CONEXUS_DB_PASSWORD_FILE: '/run/secrets/database', CONEXUS_OIDC_ISSUER: 'https://issuer.example.test',
    CONEXUS_OIDC_CLIENT_ID: 'client', CONEXUS_OIDC_CLIENT_SECRET_FILE: '/run/secrets/oidc',
    CONEXUS_DB_PRJ03_COMMAND_PASSWORD_FILE: '/run/secrets/project-command',
    CONEXUS_DB_S3_READ_PASSWORD_FILE: '/run/secrets/project-read',
    CONEXUS_DB_S4_BASELINE_READ_PASSWORD_FILE: '/run/secrets/baseline-read',
    CONEXUS_DB_S4_BASELINE_COMMAND_PASSWORD_FILE: '/run/secrets/baseline-command',
    CONEXUS_DB_S6_INCEPTION_COMMAND_PASSWORD_FILE: '/run/secrets/inception-command',
    CONEXUS_PROJECT_STORAGE_ROOT: '/var/lib/conexus/projects', CONEXUS_GIT_IMPORT_CATALOG_FILE: '/etc/conexus/git.json',
    CONEXUS_GIT_EXTERNAL_FILE_SLOTS_FILE: '/etc/conexus/slots.json', CONEXUS_PROJECT_MODEL_CATALOG_FILE: '/etc/conexus/project-models.json',
    CONEXUS_PROJECT_SOURCE_OWNERSHIP_MANIFEST_FILE: '/etc/conexus/ownership.json',
    CONEXUS_DB_RB_INGRESS_PASSWORD_FILE: '/run/secrets/rb-ingress', CONEXUS_DB_RB_EXECUTOR_PASSWORD_FILE: '/run/secrets/rb-executor',
    CONEXUS_BUILDER_E2B_API_KEY_FILE: '/run/secrets/e2b', CONEXUS_BUILDER_E2B_TEMPLATE_ID: immutableTemplateId,
    CONEXUS_BUILDER_MODEL_ADMISSION_ID: 'builder-coding-primary',
    CONEXUS_BUILDER_VERIFIER_MODEL_ADMISSION_ID: 'builder-verification-primary',
  }
  assert.equal(readHubConfig(environment).builder?.modelAdmissionId, 'builder-coding-primary')
  assert.equal(readHubConfig(environment).builder?.verifierModelAdmissionId, 'builder-verification-primary')
  for (const omitted of ['CONEXUS_PROJECT_MODEL_CATALOG_FILE', 'CONEXUS_BUILDER_MODEL_ADMISSION_ID', 'CONEXUS_BUILDER_VERIFIER_MODEL_ADMISSION_ID']) {
    const partial = { ...environment }
    delete partial[omitted]
    assert.throws(() => readHubConfig(partial), /MISSING_CONFIG_/)
  }
})

test('Builder runtime refuses a model object that disagrees with the admitted exact model identity', () => {
  assert.throws(() => createMastraE2BCodingWorkerRuntime({
    apiKey: 'fixture-e2b-key', templateId: immutableTemplateId,
    modelIdentity: { admissionId: 'builder-coding-primary', providerId: 'anthropic', modelId: 'claude-sonnet-4-5' },
    model: { modelId: 'claude-opus-5' },
    validateModelCredential() {},
  }), /BUILDER_RUNTIME_CONFIG_REFUSED/)
})

test('Builder runtime refuses a mutable E2B template alias before sandbox creation', () => {
  assert.throws(() => createMastraE2BCodingWorkerRuntime({
    apiKey: 'fixture-e2b-key', templateId: 'mutable-template',
    modelIdentity: { admissionId: 'builder-coding-primary', providerId: 'anthropic', modelId: 'claude-sonnet-4-5' },
    model: { modelId: 'claude-sonnet-4-5' },
    validateModelCredential() {},
  }), /BUILDER_RUNTIME_CONFIG_REFUSED/)
  assert.throws(() => createMastraE2BCodingWorkerRuntime({
    apiKey: 'fixture-e2b-key', templateId: 'fixturetemplate:build-66666666-6666-4666-8666-666666666666',
    modelIdentity: { admissionId: 'builder-coding-primary', providerId: 'anthropic', modelId: 'claude-sonnet-4-5' },
    model: { modelId: 'claude-sonnet-4-5' },
    validateModelCredential() {},
  }), /BUILDER_RUNTIME_CONFIG_REFUSED/)
})

test('Builder revalidates model credential before creating a remote sandbox', async () => {
  let validations = 0
  const runtime = createMastraE2BCodingWorkerRuntime({
    apiKey: 'fixture-e2b-key', templateId: immutableTemplateId,
    modelIdentity: { admissionId: 'builder-coding-primary', providerId: 'anthropic', modelId: 'claude-sonnet-4-5' },
    model: { modelId: 'claude-sonnet-4-5' },
    validateModelCredential() { validations += 1; throw new Error('MODEL_CREDENTIAL_PREFLIGHT_REFUSED') },
  })
  await assert.rejects(runtime.execute({
    projectId, changeId, workUnitId, actorRunId, admissionToken,
    intent: 'bounded intent', baseSourceRevision, sourceBundle: new Uint8Array([1]),
    bindPhysicalSandbox: async () => { throw new Error('SANDBOX_MUST_NOT_EXIST') },
  }), /MODEL_CREDENTIAL_PREFLIGHT_REFUSED/)
  assert.equal(validations, 1)
})

test('Builder verifier is separately admitted and revalidates credentials before E2B creation', async () => {
  assert.throws(() => createMastraE2BCandidateVerificationRuntime({
    apiKey: 'fixture-e2b-key', templateId: immutableTemplateId,
    modelIdentity: { ...verifierIdentity, modelId: 'claude-sonnet-4-5' },
    model: { modelId: 'claude-opus-5' }, validateModelCredential() {},
  }), /BUILDER_VERIFIER_CONFIG_REFUSED/)
  let validations = 0
  const verifier = createMastraE2BCandidateVerificationRuntime({
    apiKey: 'fixture-e2b-key', templateId: immutableTemplateId,
    modelIdentity: verifierIdentity, model: { modelId: verifierIdentity.modelId },
    validateModelCredential() { validations += 1; throw new Error('VERIFIER_CREDENTIAL_PREFLIGHT_REFUSED') },
  })
  await assert.rejects(verifier.verify({
    ...verificationClaim, candidateBundle: new Uint8Array([1]), changedFiles: [{ path: 'health.ts', status: 'ADDED', base: null, candidate: { mode: '100644', blobOid: 'a'.repeat(40), byteLength: 7 } }],
    bindPhysicalSandbox: async () => { throw new Error('VERIFIER_SANDBOX_MUST_NOT_EXIST') },
  }), /VERIFIER_CREDENTIAL_PREFLIGHT_REFUSED/)
  assert.equal(validations, 1)
})

test('Builder verifier refuses unsafe or unbounded file manifests before any credential or sandbox access', async () => {
  let validations = 0
  const verifier = createMastraE2BCandidateVerificationRuntime({
    apiKey: 'fixture-e2b-key', templateId: immutableTemplateId,
    modelIdentity: verifierIdentity, model: { modelId: verifierIdentity.modelId },
    validateModelCredential() { validations += 1 },
  })
  const version = { mode: '100644', blobOid: 'a'.repeat(40), byteLength: 1 }
  await assert.rejects(verifier.verify({
    ...verificationClaim, candidateBundle: new Uint8Array([1]),
    changedFiles: [{ path: '../escape.ts', status: 'ADDED', base: null, candidate: version }],
    bindPhysicalSandbox: async () => { throw new Error('VERIFIER_SANDBOX_MUST_NOT_EXIST') },
  }), /BUILDER_VERIFIER_INPUT_REFUSED/)
  await assert.rejects(verifier.verify({
    ...verificationClaim, candidateBundle: new Uint8Array([1]),
    changedFiles: Array.from({ length: 65 }, (_, index) => ({ path: `file-${index}.ts`, status: 'ADDED', base: null, candidate: version })),
    bindPhysicalSandbox: async () => { throw new Error('VERIFIER_SANDBOX_MUST_NOT_EXIST') },
  }), /BUILDER_VERIFIER_INSPECTION_BUDGET_REFUSED/)
  assert.equal(validations, 0)
})

test('Builder verifier atomically bounds reads, verifies Git bytes and refuses uncovered PASS', async () => {
  const reads = createCandidateFileReadAdmission(10)
  let loads = 0
  let release
  const blocked = new Promise((resolvePromise) => { release = resolvePromise })
  const first = reads.read('CANDIDATE:first.ts', 6, async () => { loads += 1; await blocked; return 'first' })
  const duplicate = reads.read('CANDIDATE:first.ts', 6, async () => { loads += 1; return 'duplicate' })
  await assert.rejects(reads.read('BASE:second.ts', 5, async () => 'second'), /BUILDER_VERIFIER_FILE_READ_BUDGET_EXHAUSTED/)
  release()
  assert.deepEqual(await Promise.all([first, duplicate]), ['first', 'first'])
  assert.equal(loads, 1)

  const exact = Buffer.from('exact candidate bytes\n')
  const version = { mode: '100644', blobOid: gitBlobOid(exact), byteLength: exact.byteLength }
  assert.doesNotThrow(() => assertCandidateFileIdentity(version, exact))
  assert.throws(() => assertCandidateFileIdentity(version, Buffer.from('substituted bytes\n')), /BUILDER_VERIFIER_FILE_IDENTITY_REFUSED/)
  assert.throws(() => assertCandidateInspectionCoverage('PASS', [{ path: 'first.ts', side: 'CANDIDATE' }], new Set()), /BUILDER_VERIFIER_INSPECTION_COVERAGE_REFUSED/)
  assert.doesNotThrow(() => assertCandidateInspectionCoverage('INCONCLUSIVE', [{ path: 'first.ts', side: 'CANDIDATE' }], new Set()))
  assert.doesNotThrow(() => assertCandidateInspectionCoverage('PASS', [{ path: 'first.ts', side: 'CANDIDATE' }], new Set(['CANDIDATE:first.ts'])))
})

const gitFixture = (cwd, args) => {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_AUTHOR_NAME: 'Conexus RB fixture',
      GIT_AUTHOR_EMAIL: 'rb-fixture@conexus.invalid',
      GIT_COMMITTER_NAME: 'Conexus RB fixture',
      GIT_COMMITTER_EMAIL: 'rb-fixture@conexus.invalid',
    },
  })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

test('RB real OCI custody admits one exact child and refuses multi-commit and protected candidates', {
  skip: process.env.CONEXUS_RB_CUSTODY_LIVE !== 'true' ? 'set CONEXUS_RB_CUSTODY_LIVE=true for exact-image custody proof' : false,
  timeout: 300_000,
}, async () => {
  const root = mkdtempSync('/tmp/conexus-rb-custody-')
  const storageRoot = resolve(root, 'storage')
  const work = resolve(root, 'work')
  const repository = resolve(storageRoot, 'projects', projectId)
  mkdirSync(resolve(storageRoot, 'projects'), { recursive: true })
  mkdirSync(work)
  try {
    gitFixture(work, ['init', '--initial-branch=main'])
    writeFileSync(resolve(work, 'README.md'), 'base\n')
    writeFileSync(resolve(work, 'policy.txt'), 'protected\n')
    writeFileSync(resolve(work, ':(literal)protected.txt'), 'existing pathspec-shaped but unowned\n')
    gitFixture(work, ['add', '--all'])
    gitFixture(work, ['commit', '-m', 'base'])
    const base = gitFixture(work, ['rev-parse', 'HEAD'])
    gitFixture(root, ['clone', '--bare', work, repository])
    writeFileSync(resolve(repository, 'refs', 'heads', 'main'), `${base}\n`, { mode: 0o644 })
    gitFixture(root, ['--git-dir', repository, 'remote', 'set-url', 'origin', 'ssh://write.invalid/project.git'])
    const port = createBuilderSourcePort({
      git: {
        verifyAdmittedImage: async () => ({ status: 'VERIFIED' }),
        createProjectSourceBundle: async () => ({ status: 'BUNDLED' }),
      },
      storageRoot,
      sourceOwnership: { 'README.md': 'APP-OWNED', 'policy.txt': 'DOMAIN-OWNED' },
    })
    const candidateBundle = (name, mutate) => {
      gitFixture(work, ['checkout', '-B', 'conexus-result', base])
      mutate()
      const candidate = gitFixture(work, ['rev-parse', 'HEAD'])
      const bundlePath = resolve(root, `${name}.bundle`)
      gitFixture(work, ['bundle', 'create', bundlePath, 'refs/heads/conexus-result'])
      return { candidate, bytes: readFileSync(bundlePath) }
    }

    const accepted = candidateBundle('accepted', () => {
      writeFileSync(resolve(work, 'README.md'), 'base\naccepted\n')
      gitFixture(work, ['add', 'README.md'])
      gitFixture(work, ['commit', '-m', 'accepted child'])
    })
    const admitted = await port.admitCandidate({
      projectId, changeId, actorRunId, baseSourceRevision: base,
      claimedCandidateSourceRevision: accepted.candidate, resultBundle: accepted.bytes,
    })
    assert.equal(admitted.candidateSourceRevision, accepted.candidate)
    assert.match(admitted.patch, /accepted/)
    assert.equal(gitFixture(root, ['--git-dir', repository, 'rev-parse', 'refs/heads/main']), base)
    assert.equal(gitFixture(root, ['--git-dir', repository, 'rev-parse', `refs/conexus/changes/${changeId}`]), accepted.candidate)
    assert.equal(gitFixture(root, ['--git-dir', repository, 'remote', 'get-url', 'origin']), 'ssh://write.invalid/project.git')
    const verifierMaterial = await port.prepareCandidate({
      projectId, changeId, actorRunId, baseSourceRevision: base, candidateSourceRevision: accepted.candidate,
    })
    const verifierBundlePath = resolve(root, 'verifier-candidate.bundle')
    writeFileSync(verifierBundlePath, verifierMaterial.bundle)
    assert.deepEqual(verifierMaterial.changedFiles.map(({ path }) => path), ['README.md'])
    assert.equal(verifierMaterial.changedFiles[0].status, 'MODIFIED')
    assert.equal(verifierMaterial.changedFiles[0].base.byteLength, 5)
    assert.equal(verifierMaterial.changedFiles[0].candidate.byteLength, 14)
    assert.equal(verifierMaterial.changedFiles[0].base.blobOid, gitFixture(root, ['--git-dir', repository, 'rev-parse', `${base}:README.md`]))
    assert.equal(verifierMaterial.changedFiles[0].candidate.blobOid, gitFixture(root, ['--git-dir', repository, 'rev-parse', `${accepted.candidate}:README.md`]))
    assert.match(gitFixture(root, ['bundle', 'list-heads', verifierBundlePath]), new RegExp(`^${accepted.candidate} refs/conexus/changes/${changeId}$`))

    const deleted = candidateBundle('deleted', () => {
      gitFixture(work, ['rm', 'README.md'])
      gitFixture(work, ['commit', '-m', 'deleted child'])
    })
    const deletedChangeId = '22222222-2222-4222-8222-222222222226'
    await port.admitCandidate({
      projectId, changeId: deletedChangeId, actorRunId, baseSourceRevision: base,
      claimedCandidateSourceRevision: deleted.candidate, resultBundle: deleted.bytes,
    })
    const deletedMaterial = await port.prepareCandidate({
      projectId, changeId: deletedChangeId, actorRunId, baseSourceRevision: base, candidateSourceRevision: deleted.candidate,
    })
    assert.deepEqual(deletedMaterial.changedFiles, [{
      path: 'README.md', status: 'DELETED',
      base: { mode: '100644', blobOid: gitFixture(root, ['--git-dir', repository, 'rev-parse', `${base}:README.md`]), byteLength: 5 },
      candidate: null,
    }])

    const multi = candidateBundle('multi', () => {
      writeFileSync(resolve(work, 'one.txt'), 'one\n')
      gitFixture(work, ['add', 'one.txt'])
      gitFixture(work, ['commit', '-m', 'one'])
      writeFileSync(resolve(work, 'two.txt'), 'two\n')
      gitFixture(work, ['add', 'two.txt'])
      gitFixture(work, ['commit', '-m', 'two'])
    })
    await assert.rejects(port.admitCandidate({
      projectId, changeId: '22222222-2222-4222-8222-222222222223', actorRunId,
      baseSourceRevision: base, claimedCandidateSourceRevision: multi.candidate, resultBundle: multi.bytes,
    }), /MULTI_COMMIT_RESULT/)

    const protectedCandidate = candidateBundle('protected', () => {
      gitFixture(work, ['mv', 'policy.txt', 'renamed-policy.txt'])
      gitFixture(work, ['commit', '-m', 'protected rename'])
    })
    await assert.rejects(port.admitCandidate({
      projectId, changeId: '22222222-2222-4222-8222-222222222224', actorRunId,
      baseSourceRevision: base, claimedCandidateSourceRevision: protectedCandidate.candidate, resultBundle: protectedCandidate.bytes,
    }), /PROTECTED_PATH/)

    const unownedCandidate = candidateBundle('unowned-existing', () => {
      writeFileSync(resolve(work, ':(literal)protected.txt'), 'mutated without ownership\n')
      gitFixture(work, ['--literal-pathspecs', 'add', '--', ':(literal)protected.txt'])
      gitFixture(work, ['commit', '-m', 'pathspec-shaped unowned existing mutation'])
    })
    await assert.rejects(port.admitCandidate({
      projectId, changeId: '22222222-2222-4222-8222-222222222225', actorRunId,
      baseSourceRevision: base, claimedCandidateSourceRevision: unownedCandidate.candidate, resultBundle: unownedCandidate.bytes,
    }), /PROTECTED_PATH/)

    assert.equal(gitFixture(root, ['--git-dir', repository, 'rev-parse', 'refs/heads/main']), base)
    gitFixture(root, ['--git-dir', repository, 'remote', 'remove', 'origin'])
    const binding = createOciProjectBindingGitCapability({ projectStorageRoot: storageRoot })
    const bindingInput = {
      projectId,
      expectedSourceRevision: base,
      path: '.conexus/project/connection-bindings.json',
      declarationBytes: Buffer.from('{"bindings":[]}'),
    }
    gitFixture(root, ['--git-dir', repository, 'update-ref', `refs/CONEXUS/CHANGES/${changeId}`, accepted.candidate])
    assert.deepEqual(await binding.applyProjectBinding(bindingInput), { status: 'REFUSED', code: 'UNSAFE_REPOSITORY' })
    gitFixture(root, ['--git-dir', repository, 'update-ref', '-d', `refs/CONEXUS/CHANGES/${changeId}`])
    const applied = await binding.applyProjectBinding(bindingInput)
    assert.equal(applied.status, 'APPLIED', JSON.stringify(applied))
    assert.equal(gitFixture(root, ['--git-dir', repository, 'rev-parse', 'refs/heads/main']), applied.newSourceRevision)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

const postgresConfigured = ['CONEXUS_TEST_DB_HOST', 'CONEXUS_TEST_DB_PORT', 'CONEXUS_TEST_DB_NAME', 'CONEXUS_TEST_DB_USER', 'CONEXUS_TEST_DB_PASSWORD'].every((name) => process.env[name])
const quoteIdentifier = (value) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error('Unsafe database identity')
  return `"${value}"`
}
const query = async (connection, statement, values = []) => {
  const client = new pg.Client(connection)
  await client.connect()
  try { return await client.query(statement, values) } finally { await client.end() }
}

test('RB migration applies atomically and exposes functions, never tables, to runtime roles', {
  skip: postgresConfigured ? false : 'real PostgreSQL configuration not supplied',
}, async (t) => {
  const admin = {
    host: process.env.CONEXUS_TEST_DB_HOST, port: Number(process.env.CONEXUS_TEST_DB_PORT),
    database: process.env.CONEXUS_TEST_DB_NAME, user: process.env.CONEXUS_TEST_DB_USER, password: process.env.CONEXUS_TEST_DB_PASSWORD,
  }
  const database = `conexus_rb_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 8)}`
  await query(admin, `CREATE DATABASE ${quoteIdentifier(database)}`)
  t.after(async () => query(admin, `DROP DATABASE ${quoteIdentifier(database)} WITH (FORCE)`))
  const current = { ...admin, database }
  const url = new URL('postgresql://localhost')
  url.hostname = current.host
  url.port = String(current.port)
  url.pathname = `/${database}`
  url.username = current.user
  url.password = current.password
  assert.deepEqual((await runCurrentHubMigrations({ connectionString: url.toString() })).versions, Array.from({ length: 20 }, (_, index) => String(index + 1).padStart(3, '0')))
  assert.deepEqual((await runCurrentHubMigrations({ connectionString: url.toString() })).appliedNow, [])
  const tables = await query(current, `SELECT tablename FROM pg_tables WHERE schemaname = 'builder' ORDER BY tablename`)
  assert.deepEqual(tables.rows.map((row) => row.tablename), [
    'actor_run', 'change', 'change_acceptance', 'coding_session', 'contract_revision',
    'finding', 'operation_receipt', 'plan', 'verification_evidence', 'work_unit',
  ])
  const leaked = await query(current, `
    SELECT grantee, table_name FROM information_schema.table_privileges
    WHERE table_schema = 'builder' AND grantee IN ('hub_rb_ingress', 'hub_rb_executor')`)
  assert.deepEqual(leaked.rows, [])
  const callable = await query(current, `
    SELECT rolname FROM pg_roles
    WHERE rolname IN ('hub_rb_ingress','hub_rb_executor')
      AND rolsuper = false AND rolbypassrls = false ORDER BY rolname`)
  assert.deepEqual(callable.rows.map((row) => row.rolname), ['hub_rb_executor', 'hub_rb_ingress'])

  const accountId = '60000000-0000-4000-8000-000000000001'
  const workspaceId = '60000000-0000-4000-8000-000000000002'
  const subjectProjectId = '60000000-0000-4000-8000-000000000003'
  const subjectChangeId = '60000000-0000-4000-8000-000000000004'
  const planRevision = '60000000-0000-4000-8000-000000000005'
  const itemId = '60000000-0000-4000-8000-000000000006'
  const codingSessionId = '60000000-0000-4000-8000-000000000007'
  const subjectWorkUnitId = '60000000-0000-4000-8000-000000000008'
  const subjectActorRunId = '60000000-0000-4000-8000-000000000009'
  const subjectToken = '60000000-0000-4000-8000-000000000010'
  const digest = 'd'.repeat(64)
  await query(current, "INSERT INTO iam.account(account_id, issuer, external_subject, display_name) VALUES ($1, 'https://issuer.test', 'rb-owner', 'RB Owner')", [accountId])
  await query(current, "INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1, 'RB Workspace')", [workspaceId])
  await query(current, 'INSERT INTO iam.workspace_membership(account_id, workspace_id, can_create_project) VALUES ($1, $2, true)', [accountId, workspaceId])
  await query(current, `INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision)
    VALUES ($1, $2, 'RB Project', 'NEW', $3, 'rb-revision')`, [subjectProjectId, workspaceId, baseSourceRevision])
  await query(current, 'INSERT INTO iam.account_project_grant(account_id, project_id, can_read, can_manage) VALUES ($1, $2, true, true)', [accountId, subjectProjectId])
  await query(current, `INSERT INTO project.operation_idempotency(operation_id, account_id, workspace_id, key_digest, request_digest,
    reserved_project_id, outcome, response_status, response_digest, response_body, completed_at)
    VALUES ('PRJ-03', $1, $2, $3, $3, $4, 'SUCCEEDED', 201, $3, '{}'::jsonb, clock_timestamp())`, [accountId, workspaceId, digest, subjectProjectId])
  await query(current, `INSERT INTO project.baseline_candidate(project_id, candidate_digest, source_revision, source_text, application_runtime_profile)
    VALUES ($1, $2, $3, 'Accepted baseline', 'MANAGED')`, [subjectProjectId, digest, baseSourceRevision])
  await query(current, `INSERT INTO project.baseline_state(project_id, current_candidate_digest, approved_candidate_digest, approval_revision)
    VALUES ($1, $2, $2, $3)`, [subjectProjectId, digest, planRevision])
  await query(current, "ALTER ROLE hub_rb_ingress PASSWORD 'rb-ingress-test'; ALTER ROLE hub_rb_executor PASSWORD 'rb-executor-test'")
  const ingress = { ...current, user: 'hub_rb_ingress', password: 'rb-ingress-test' }
  const executor = { ...current, user: 'hub_rb_executor', password: 'rb-executor-test' }
  const unauthorizedAccount = '60000000-0000-4000-8000-000000000030'
  await query(current, "INSERT INTO iam.account(account_id, issuer, external_subject, display_name) VALUES ($1, 'https://issuer.test', 'rb-reader', 'RB Reader')", [unauthorizedAccount])
  await query(current, 'INSERT INTO iam.workspace_membership(account_id, workspace_id, can_create_project) VALUES ($1, $2, false)', [unauthorizedAccount, workspaceId])
  await query(current, 'INSERT INTO iam.account_project_grant(account_id, project_id, can_read, can_manage) VALUES ($1, $2, true, true)', [unauthorizedAccount, subjectProjectId])
  await assert.rejects(query(ingress, 'SELECT builder.create_change($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [
    unauthorizedAccount, subjectProjectId, '3'.repeat(64), '4'.repeat(64), '60000000-0000-4000-8000-000000000031',
    '60000000-0000-4000-8000-000000000032', '60000000-0000-4000-8000-000000000033',
    '60000000-0000-4000-8000-000000000034', '60000000-0000-4000-8000-000000000035', 'Unauthorized build',
  ]), /BLD03_NOT_AUTHORIZED/)

  const noBaselineProject = '60000000-0000-4000-8000-000000000040'
  await query(current, `INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision)
    VALUES ($1, $2, 'No Baseline', 'NEW', $3, 'no-baseline-revision')`, [noBaselineProject, workspaceId, baseSourceRevision])
  await query(current, 'INSERT INTO iam.account_project_grant(account_id, project_id, can_read, can_manage) VALUES ($1, $2, true, true)', [accountId, noBaselineProject])
  await query(current, `INSERT INTO project.operation_idempotency(operation_id, account_id, workspace_id, key_digest, request_digest,
    reserved_project_id, outcome, response_status, response_digest, response_body, completed_at)
    VALUES ('PRJ-03', $1, $2, $3, $3, $4, 'SUCCEEDED', 201, $3, '{}'::jsonb, clock_timestamp())`, [accountId, workspaceId, '5'.repeat(64), noBaselineProject])
  await assert.rejects(query(ingress, 'SELECT builder.create_change($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [
    accountId, noBaselineProject, '6'.repeat(64), '7'.repeat(64), '60000000-0000-4000-8000-000000000041',
    '60000000-0000-4000-8000-000000000042', '60000000-0000-4000-8000-000000000043',
    '60000000-0000-4000-8000-000000000044', '60000000-0000-4000-8000-000000000045', 'Missing baseline',
  ]), /BLD03_BASELINE_REQUIRED/)
  await query(current, `INSERT INTO project.baseline_candidate(project_id, candidate_digest, source_revision, source_text, application_runtime_profile)
    VALUES ($1, $2, $3, 'Foreign accepted baseline', 'MANAGED')`, [noBaselineProject, '5'.repeat(64), baseSourceRevision])
  await query(current, `INSERT INTO project.baseline_state(project_id, current_candidate_digest, approved_candidate_digest, approval_revision)
    VALUES ($1, $2, $2, $3)`, [noBaselineProject, '5'.repeat(64), '60000000-0000-4000-8000-000000000046'])
  await query(current, 'SELECT iam.ensure_project_builder_grant($1,$2)', [accountId, noBaselineProject])
  assert.equal((await query(current, `SELECT count(*)::int AS count FROM iam.project_builder_grant
    WHERE account_id = $1 AND project_id = $2 AND can_review`, [accountId, noBaselineProject])).rows[0].count, 1)

  const created = await query(ingress, 'SELECT builder.create_change($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) AS value', [
    accountId, subjectProjectId, 'e'.repeat(64), 'f'.repeat(64), subjectChangeId, planRevision, itemId,
    codingSessionId, subjectWorkUnitId, 'Add a governed page',
  ])
  assert.equal(created.rows[0].value.state, 'QUEUED')
  const repeatedIntent = await query(ingress, 'SELECT builder.create_change($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) AS value', [
    accountId, subjectProjectId, '0'.repeat(64), 'f'.repeat(64), '60000000-0000-4000-8000-000000000060',
    '60000000-0000-4000-8000-000000000061', '60000000-0000-4000-8000-000000000062',
    '60000000-0000-4000-8000-000000000063', '60000000-0000-4000-8000-000000000064', 'Add a governed page',
  ])
  assert.equal(repeatedIntent.rows[0].value.state, 'QUEUED')
  await assert.rejects(query(ingress, 'SELECT builder.create_change($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [
    accountId, subjectProjectId, 'e'.repeat(64), '9'.repeat(64), subjectChangeId, planRevision, itemId,
    codingSessionId, subjectWorkUnitId, 'Different payload under the same key',
  ]), /BLD03_IDEMPOTENCY_CONFLICT/)

  const verifiedChange = '61000000-0000-4000-8000-000000000001'
  const verifiedWorkUnit = '61000000-0000-4000-8000-000000000002'
  const verifiedCodingRun = '61000000-0000-4000-8000-000000000003'
  const verifiedCodingToken = '61000000-0000-4000-8000-000000000004'
  const verifiedRun = '61000000-0000-4000-8000-000000000005'
  const verifiedToken = '61000000-0000-4000-8000-000000000006'
  const verifiedPlan = '61000000-0000-4000-8000-000000000007'
  await query(ingress, 'SELECT builder.create_change($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [
    accountId, subjectProjectId, 'a'.repeat(64), 'b'.repeat(64), verifiedChange, verifiedPlan,
    '61000000-0000-4000-8000-000000000008', '61000000-0000-4000-8000-000000000009',
    verifiedWorkUnit, 'Add a verified health page',
  ])
  await query(executor, 'SELECT builder.claim_change($1,$2,$3,$4,$5,$6)', [
    verifiedChange, verifiedCodingRun, verifiedCodingToken, modelIdentity.admissionId, modelIdentity.providerId, modelIdentity.modelId,
  ])
  await query(executor, 'SELECT builder.bind_sandbox($1,$2,$3)', [verifiedCodingRun, verifiedCodingToken, 'coding_exact'])
  assert.equal((await query(executor, 'SELECT builder.settle_result($1,$2,$3,$4,$5,$6,$7) AS settled', [
    verifiedCodingRun, verifiedCodingToken, 'coding_exact', baseSourceRevision, candidateSourceRevision, 'diff', 'worker narration',
  ])).rows[0].settled, true)
  assert.equal((await query(current, 'SELECT count(*)::int AS count FROM builder.change_acceptance WHERE change_id = $1', [verifiedChange])).rows[0].count, 0)
  const verification = (await query(executor, 'SELECT builder.claim_verification($1,$2,$3,$4,$5,$6) AS value', [
    verifiedChange, verifiedRun, verifiedToken, verifierIdentity.admissionId, verifierIdentity.providerId, verifierIdentity.modelId,
  ])).rows[0].value
  assert.equal(verification.candidateSourceRevision, candidateSourceRevision)
  assert.equal(verification.assertionRef, `change-intent:${'b'.repeat(64)}`)
  await query(executor, 'SELECT builder.bind_sandbox($1,$2,$3)', [verifiedRun, verifiedToken, 'verifier_exact'])
  const passingReport = {
    outcome: 'PASS', intentSatisfied: true, summary: 'The exact candidate satisfies the accepted intent.', findings: [],
    checks: [{ name: 'intent', outcome: 'PASS', detail: 'The health page is present.' }],
  }
  assert.equal((await query(executor, 'SELECT builder.settle_verification($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) AS settled', [
    verifiedRun, verifiedToken, 'verifier_exact', verification.assertionRef, verification.contractRevision,
    verification.planRevision, verification.baselineDigest, verification.baseSourceRevision,
    verification.candidateSourceRevision, '61000000-0000-4000-8000-000000000010',
    [], [],
    '1'.repeat(64), passingReport,
  ])).rows[0].settled, true)
  assert.equal((await query(current, 'SELECT state FROM builder.change WHERE change_id = $1', [verifiedChange])).rows[0].state, 'VERIFIED')

  const prepareVerification = async ({ change, plan, item, session, unit, codingRun, codingToken, verifierRun, verifierToken, keyDigest, requestDigest, candidate, intent }) => {
    await query(ingress, 'SELECT builder.create_change($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [
      accountId, subjectProjectId, keyDigest, requestDigest, change, plan, item, session, unit, intent,
    ])
    await query(executor, 'SELECT builder.claim_change($1,$2,$3,$4,$5,$6)', [
      change, codingRun, codingToken, modelIdentity.admissionId, modelIdentity.providerId, modelIdentity.modelId,
    ])
    await query(executor, 'SELECT builder.bind_sandbox($1,$2,$3)', [codingRun, codingToken, `${change}-coding`])
    await query(executor, 'SELECT builder.settle_result($1,$2,$3,$4,$5,$6,$7)', [
      codingRun, codingToken, `${change}-coding`, baseSourceRevision, candidate, 'diff', 'summary',
    ])
    const claimedVerification = (await query(executor, 'SELECT builder.claim_verification($1,$2,$3,$4,$5,$6) AS value', [
      change, verifierRun, verifierToken, verifierIdentity.admissionId, verifierIdentity.providerId, verifierIdentity.modelId,
    ])).rows[0].value
    await query(executor, 'SELECT builder.bind_sandbox($1,$2,$3)', [verifierRun, verifierToken, `${change}-verifier`])
    return claimedVerification
  }

  const missingReportChange = '64000000-0000-4000-8000-000000000001'
  const missingReportVerification = await prepareVerification({
    change: missingReportChange, plan: '64000000-0000-4000-8000-000000000002', item: '64000000-0000-4000-8000-000000000003',
    session: '64000000-0000-4000-8000-000000000004', unit: '64000000-0000-4000-8000-000000000005',
    codingRun: '64000000-0000-4000-8000-000000000006', codingToken: '64000000-0000-4000-8000-000000000007',
    verifierRun: '64000000-0000-4000-8000-000000000008', verifierToken: '64000000-0000-4000-8000-000000000009',
    keyDigest: '6'.repeat(64), requestDigest: '7'.repeat(64), candidate: '6'.repeat(40), intent: 'Reject an incomplete verifier report',
  })
  assert.equal((await query(executor, 'SELECT builder.fail_verification_claim($1) AS changed', [missingReportChange])).rows[0].changed, false)
  assert.equal((await query(current, 'SELECT state FROM builder.change WHERE change_id = $1', [missingReportChange])).rows[0].state, 'VERIFYING')
  assert.equal((await query(executor, 'SELECT builder.settle_verification($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) AS settled', [
    missingReportVerification.actorRunId, missingReportVerification.admissionToken, `${missingReportChange}-verifier`,
    missingReportVerification.assertionRef, missingReportVerification.contractRevision, missingReportVerification.planRevision,
    missingReportVerification.baselineDigest, missingReportVerification.baseSourceRevision,
    missingReportVerification.candidateSourceRevision, '64000000-0000-4000-8000-000000000010', [], [],
    '6'.repeat(64), { outcome: 'PASS', intentSatisfied: true, summary: 'Missing checks must not pass.', findings: [] },
  ])).rows[0].settled, false)
  assert.equal((await query(current, 'SELECT state FROM builder.change WHERE change_id = $1', [missingReportChange])).rows[0].state, 'UNVERIFIED')
  assert.equal((await query(current, 'SELECT count(*)::int AS count FROM builder.change_acceptance WHERE change_id = $1', [missingReportChange])).rows[0].count, 0)

  const emptyCheckChange = '64100000-0000-4000-8000-000000000001'
  const emptyCheckVerification = await prepareVerification({
    change: emptyCheckChange, plan: '64100000-0000-4000-8000-000000000002', item: '64100000-0000-4000-8000-000000000003',
    session: '64100000-0000-4000-8000-000000000004', unit: '64100000-0000-4000-8000-000000000005',
    codingRun: '64100000-0000-4000-8000-000000000006', codingToken: '64100000-0000-4000-8000-000000000007',
    verifierRun: '64100000-0000-4000-8000-000000000008', verifierToken: '64100000-0000-4000-8000-000000000009',
    keyDigest: '8'.repeat(64), requestDigest: '9'.repeat(64), candidate: '7'.repeat(40), intent: 'Reject an empty verifier check',
  })
  assert.equal((await query(executor, 'SELECT builder.settle_verification($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) AS settled', [
    emptyCheckVerification.actorRunId, emptyCheckVerification.admissionToken, `${emptyCheckChange}-verifier`,
    emptyCheckVerification.assertionRef, emptyCheckVerification.contractRevision, emptyCheckVerification.planRevision,
    emptyCheckVerification.baselineDigest, emptyCheckVerification.baseSourceRevision,
    emptyCheckVerification.candidateSourceRevision, '64100000-0000-4000-8000-000000000010', [], [],
    null, { outcome: 'PASS', intentSatisfied: true, summary: 'An empty check must not pass.', findings: [], checks: [{}] },
  ])).rows[0].settled, false)
  assert.equal((await query(current, 'SELECT state FROM builder.change WHERE change_id = $1', [emptyCheckChange])).rows[0].state, 'UNVERIFIED')
  assert.equal((await query(current, 'SELECT count(*)::int AS count FROM builder.change_acceptance WHERE change_id = $1', [emptyCheckChange])).rows[0].count, 0)

  const inconclusiveChange = '64200000-0000-4000-8000-000000000001'
  const inconclusiveVerification = await prepareVerification({
    change: inconclusiveChange, plan: '64200000-0000-4000-8000-000000000002', item: '64200000-0000-4000-8000-000000000003',
    session: '64200000-0000-4000-8000-000000000004', unit: '64200000-0000-4000-8000-000000000005',
    codingRun: '64200000-0000-4000-8000-000000000006', codingToken: '64200000-0000-4000-8000-000000000007',
    verifierRun: '64200000-0000-4000-8000-000000000008', verifierToken: '64200000-0000-4000-8000-000000000009',
    keyDigest: '8b'.repeat(32), requestDigest: '9b'.repeat(32), candidate: '9'.repeat(40), intent: 'Preserve an inconclusive verifier result',
  })
  assert.equal((await query(executor, 'SELECT builder.settle_verification($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) AS settled', [
    inconclusiveVerification.actorRunId, inconclusiveVerification.admissionToken, `${inconclusiveChange}-verifier`,
    inconclusiveVerification.assertionRef, inconclusiveVerification.contractRevision, inconclusiveVerification.planRevision,
    inconclusiveVerification.baselineDigest, inconclusiveVerification.baseSourceRevision,
    inconclusiveVerification.candidateSourceRevision, '64200000-0000-4000-8000-000000000010', [], [],
    '9'.repeat(64), { outcome: 'INCONCLUSIVE', intentSatisfied: false, summary: 'Available evidence is insufficient.', findings: [], checks: [{ name: 'intent', outcome: 'INCONCLUSIVE', detail: 'The candidate cannot establish this assertion.' }] },
  ])).rows[0].settled, true)
  assert.equal((await query(current, 'SELECT state FROM builder.change WHERE change_id = $1', [inconclusiveChange])).rows[0].state, 'UNVERIFIED')
  assert.equal((await query(current, 'SELECT outcome FROM builder.verification_evidence WHERE change_id = $1', [inconclusiveChange])).rows[0].outcome, 'INCONCLUSIVE')
  assert.equal((await query(current, 'SELECT count(*)::int AS count FROM builder.change_acceptance WHERE change_id = $1', [inconclusiveChange])).rows[0].count, 0)

  const claimRevokedChange = '64300000-0000-4000-8000-000000000001'
  await query(ingress, 'SELECT builder.create_change($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [
    accountId, subjectProjectId, '8c'.repeat(32), '9c'.repeat(32), claimRevokedChange,
    '64300000-0000-4000-8000-000000000002', '64300000-0000-4000-8000-000000000003',
    '64300000-0000-4000-8000-000000000004', '64300000-0000-4000-8000-000000000005', 'Refuse verifier admission after build revocation',
  ])
  await query(executor, 'SELECT builder.claim_change($1,$2,$3,$4,$5,$6)', [
    claimRevokedChange, '64300000-0000-4000-8000-000000000006', '64300000-0000-4000-8000-000000000007',
    modelIdentity.admissionId, modelIdentity.providerId, modelIdentity.modelId,
  ])
  await query(executor, 'SELECT builder.bind_sandbox($1,$2,$3)', [
    '64300000-0000-4000-8000-000000000006', '64300000-0000-4000-8000-000000000007', 'claim-revoked-coding',
  ])
  await query(executor, 'SELECT builder.settle_result($1,$2,$3,$4,$5,$6,$7)', [
    '64300000-0000-4000-8000-000000000006', '64300000-0000-4000-8000-000000000007', 'claim-revoked-coding',
    baseSourceRevision, 'a'.repeat(40), 'claim revoked diff', 'completed before revocation',
  ])
  await query(current, 'UPDATE iam.project_builder_grant SET can_build = false WHERE account_id = $1 AND project_id = $2', [accountId, subjectProjectId])
  const refusedVerification = (await query(executor, 'SELECT builder.claim_verification($1,$2,$3,$4,$5,$6) AS value', [
    claimRevokedChange, '64300000-0000-4000-8000-000000000008', '64300000-0000-4000-8000-000000000009',
    verifierIdentity.admissionId, verifierIdentity.providerId, verifierIdentity.modelId,
  ])).rows[0].value
  assert.equal(refusedVerification.refusedCode, 'BUILDER_VERIFICATION_AUTHORITY_REVOKED')
  assert.deepEqual((await query(current, 'SELECT state, patch FROM builder.change WHERE change_id = $1', [claimRevokedChange])).rows[0], {
    state: 'UNVERIFIED', patch: 'claim revoked diff',
  })
  assert.equal((await query(current, `SELECT count(*)::int AS count FROM builder.actor_run
    WHERE change_id = $1 AND purpose = 'VERIFICATION'`, [claimRevokedChange])).rows[0].count, 0)
  await query(current, 'UPDATE iam.project_builder_grant SET can_build = true WHERE account_id = $1 AND project_id = $2', [accountId, subjectProjectId])

  const settlementRevokedChange = '64400000-0000-4000-8000-000000000001'
  const settlementRevokedVerification = await prepareVerification({
    change: settlementRevokedChange, plan: '64400000-0000-4000-8000-000000000002', item: '64400000-0000-4000-8000-000000000003',
    session: '64400000-0000-4000-8000-000000000004', unit: '64400000-0000-4000-8000-000000000005',
    codingRun: '64400000-0000-4000-8000-000000000006', codingToken: '64400000-0000-4000-8000-000000000007',
    verifierRun: '64400000-0000-4000-8000-000000000008', verifierToken: '64400000-0000-4000-8000-000000000009',
    keyDigest: '8d'.repeat(32), requestDigest: '9d'.repeat(32), candidate: 'b'.repeat(40), intent: 'Refuse acceptance after build revocation',
  })
  await query(current, 'UPDATE iam.project_builder_grant SET can_build = false WHERE account_id = $1 AND project_id = $2', [accountId, subjectProjectId])
  assert.equal((await query(executor, 'SELECT builder.settle_verification($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) AS settled', [
    settlementRevokedVerification.actorRunId, settlementRevokedVerification.admissionToken, `${settlementRevokedChange}-verifier`,
    settlementRevokedVerification.assertionRef, settlementRevokedVerification.contractRevision, settlementRevokedVerification.planRevision,
    settlementRevokedVerification.baselineDigest, settlementRevokedVerification.baseSourceRevision,
    settlementRevokedVerification.candidateSourceRevision, '64400000-0000-4000-8000-000000000010', [], [], 'b'.repeat(64), passingReport,
  ])).rows[0].settled, false)
  assert.deepEqual((await query(current, 'SELECT state, patch FROM builder.change WHERE change_id = $1', [settlementRevokedChange])).rows[0], {
    state: 'UNVERIFIED', patch: 'diff',
  })
  assert.equal((await query(current, 'SELECT count(*)::int AS count FROM builder.change_acceptance WHERE change_id = $1', [settlementRevokedChange])).rows[0].count, 0)
  await query(current, 'UPDATE iam.project_builder_grant SET can_build = true WHERE account_id = $1 AND project_id = $2', [accountId, subjectProjectId])

  const recoveryChange = '65000000-0000-4000-8000-000000000001'
  await query(ingress, 'SELECT builder.create_change($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [
    accountId, subjectProjectId, 'a1'.repeat(32), 'b1'.repeat(32), recoveryChange,
    '65000000-0000-4000-8000-000000000002', '65000000-0000-4000-8000-000000000003',
    '65000000-0000-4000-8000-000000000004', '65000000-0000-4000-8000-000000000005', 'Preserve a result across recovery',
  ])
  await query(executor, 'SELECT builder.claim_change($1,$2,$3,$4,$5,$6)', [
    recoveryChange, '65000000-0000-4000-8000-000000000006', '65000000-0000-4000-8000-000000000007',
    modelIdentity.admissionId, modelIdentity.providerId, modelIdentity.modelId,
  ])
  await query(executor, 'SELECT builder.bind_sandbox($1,$2,$3)', [
    '65000000-0000-4000-8000-000000000006', '65000000-0000-4000-8000-000000000007', 'recovery-coding',
  ])
  await query(executor, 'SELECT builder.settle_result($1,$2,$3,$4,$5,$6,$7)', [
    '65000000-0000-4000-8000-000000000006', '65000000-0000-4000-8000-000000000007', 'recovery-coding',
    baseSourceRevision, '8'.repeat(40), 'recovery diff', 'completed before restart',
  ])
  assert.equal((await query(current, 'SELECT state FROM builder.change WHERE change_id = $1', [recoveryChange])).rows[0].state, 'RESULT_READY')
  await query(executor, 'SELECT builder.recover_and_list_queued()')
  await query(executor, 'SELECT builder.recover_and_list_queued()')
  const recovered = (await query(current, 'SELECT state, patch FROM builder.change WHERE change_id = $1', [recoveryChange])).rows[0]
  assert.deepEqual(recovered, { state: 'UNVERIFIED', patch: 'recovery diff' })
  assert.equal((await query(current, 'SELECT count(*)::int AS count FROM builder.actor_run WHERE change_id = $1', [recoveryChange])).rows[0].count, 1)
  assert.equal((await query(current, 'SELECT state FROM builder.change WHERE change_id = $1', [verifiedChange])).rows[0].state, 'VERIFIED')
  assert.equal((await query(current, 'SELECT count(*)::int AS count FROM builder.change_acceptance WHERE change_id = $1', [verifiedChange])).rows[0].count, 1)
  const disclosedEvidence = await query(ingress, 'SELECT value FROM builder.list_evidence($1,$2,$3) AS value', [accountId, subjectProjectId, verifiedChange])
  assert.equal(disclosedEvidence.rows[0].value.subjectDigest, candidateSourceRevision)
  assert.deepEqual(Object.keys(disclosedEvidence.rows[0].value).sort(), ['changeId', 'claim', 'evidenceId', 'provenance', 'subjectDigest'])
  assert.equal((await query(current, 'SELECT outcome FROM builder.verification_evidence WHERE change_id = $1', [verifiedChange])).rows[0].outcome, 'PASS')
  assert.equal((await query(ingress, 'SELECT builder.get_evidence($1,$2,$3,$4) AS value', [
    accountId, subjectProjectId, verifiedChange, disclosedEvidence.rows[0].value.evidenceId,
  ])).rows[0].value.evidenceId, disclosedEvidence.rows[0].value.evidenceId)
  assert.equal((await query(ingress, 'SELECT count(*)::int AS count FROM builder.list_evidence($1,$2,$3)', [
    accountId, noBaselineProject, verifiedChange,
  ])).rows[0].count, 0)
  await query(current, 'UPDATE iam.project_builder_grant SET can_review = false WHERE account_id = $1 AND project_id = $2', [accountId, subjectProjectId])
  assert.equal((await query(ingress, 'SELECT count(*)::int AS count FROM builder.list_evidence($1,$2,$3)', [
    accountId, subjectProjectId, verifiedChange,
  ])).rows[0].count, 0)
  assert.equal((await query(ingress, 'SELECT builder.read_snapshot($1,$2,$3,false) AS value', [
    accountId, subjectProjectId, verifiedChange,
  ])).rows[0].value.change.changeId, verifiedChange)
  await query(current, 'UPDATE iam.project_builder_grant SET can_review = true WHERE account_id = $1 AND project_id = $2', [accountId, subjectProjectId])
  assert.equal((await query(executor, 'SELECT builder.settle_verification($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) AS settled', [
    verifiedRun, verifiedToken, 'replacement_verifier', verification.assertionRef, verification.contractRevision,
    verification.planRevision, verification.baselineDigest, verification.baseSourceRevision,
    verification.candidateSourceRevision, '61000000-0000-4000-8000-000000000013',
    [], [],
    '2'.repeat(64), passingReport,
  ])).rows[0].settled, false)
  assert.equal((await query(current, 'SELECT state FROM builder.change WHERE change_id = $1', [verifiedChange])).rows[0].state, 'VERIFIED')

  const failedChange = '62000000-0000-4000-8000-000000000001'
  const failedPlan = '62000000-0000-4000-8000-000000000002'
  const failedCodingRun = '62000000-0000-4000-8000-000000000003'
  const failedCodingToken = '62000000-0000-4000-8000-000000000004'
  const failedVerifierRun = '62000000-0000-4000-8000-000000000005'
  const failedVerifierToken = '62000000-0000-4000-8000-000000000006'
  await query(ingress, 'SELECT builder.create_change($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [
    accountId, subjectProjectId, 'c'.repeat(64), 'd'.repeat(64), failedChange, failedPlan,
    '62000000-0000-4000-8000-000000000007', '62000000-0000-4000-8000-000000000008',
    '62000000-0000-4000-8000-000000000009', 'Require a missing status endpoint',
  ])
  await query(executor, 'SELECT builder.claim_change($1,$2,$3,$4,$5,$6)', [failedChange, failedCodingRun, failedCodingToken,
    modelIdentity.admissionId, modelIdentity.providerId, modelIdentity.modelId])
  await query(executor, 'SELECT builder.bind_sandbox($1,$2,$3)', [failedCodingRun, failedCodingToken, 'failed_coding'])
  await query(executor, 'SELECT builder.settle_result($1,$2,$3,$4,$5,$6,$7)', [failedCodingRun, failedCodingToken,
    'failed_coding', baseSourceRevision, 'e'.repeat(40), 'diff', 'worker success claim'])
  await query(current, 'UPDATE iam.project_builder_grant SET can_review = false WHERE account_id = $1 AND project_id = $2', [accountId, subjectProjectId])
  const failedVerification = (await query(executor, 'SELECT builder.claim_verification($1,$2,$3,$4,$5,$6) AS value', [
    failedChange, failedVerifierRun, failedVerifierToken, verifierIdentity.admissionId, verifierIdentity.providerId, verifierIdentity.modelId,
  ])).rows[0].value
  assert.equal(failedVerification.changeId, failedChange)
  await query(executor, 'SELECT builder.bind_sandbox($1,$2,$3)', [failedVerifierRun, failedVerifierToken, 'failed_verifier'])
  const failingReport = { outcome: 'FAIL', intentSatisfied: false, summary: 'The requested endpoint is absent.', findings: ['Missing endpoint.', 'Missing route registration.'], checks: [{ name: 'intent', outcome: 'FAIL', detail: 'No route exists.' }] }
  await query(executor, 'SELECT builder.settle_verification($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)', [
    failedVerifierRun, failedVerifierToken, 'failed_verifier', failedVerification.assertionRef,
    failedVerification.contractRevision, failedVerification.planRevision, failedVerification.baselineDigest,
    failedVerification.baseSourceRevision, failedVerification.candidateSourceRevision,
    '62000000-0000-4000-8000-000000000010',
    ['62000000-0000-4000-8000-000000000011', '62000000-0000-4000-8000-000000000012'],
    ['62000000-0000-4000-8000-000000000013', '62000000-0000-4000-8000-000000000014'],
    '3'.repeat(64), failingReport,
  ])
  assert.equal((await query(current, 'SELECT state FROM builder.change WHERE change_id = $1', [failedChange])).rows[0].state, 'VERIFICATION_FAILED')
  assert.equal((await query(current, 'SELECT count(*)::int AS count FROM builder.change_acceptance WHERE change_id = $1', [failedChange])).rows[0].count, 0)
  assert.equal((await query(ingress, 'SELECT count(*)::int AS count FROM builder.list_findings($1,$2,$3)', [
    accountId, subjectProjectId, failedChange,
  ])).rows[0].count, 0)
  await query(current, 'UPDATE iam.project_builder_grant SET can_review = true WHERE account_id = $1 AND project_id = $2', [accountId, subjectProjectId])
  const disclosedFindings = await query(ingress, 'SELECT value FROM builder.list_findings($1,$2,$3) AS value', [accountId, subjectProjectId, failedChange])
  assert.deepEqual(disclosedFindings.rows.map((row) => row.value.summary), ['Missing endpoint.', 'Missing route registration.'])
  assert.equal((await query(ingress, 'SELECT builder.get_finding($1,$2,$3,$4) AS value', [
    accountId, subjectProjectId, failedChange, disclosedFindings.rows[0].value.findingId,
  ])).rows[0].value.findingId, disclosedFindings.rows[0].value.findingId)

  const settlementStaleChange = '63000000-0000-4000-8000-000000000001'
  const settlementStalePlan = '63000000-0000-4000-8000-000000000002'
  const settlementStaleCodingRun = '63000000-0000-4000-8000-000000000003'
  const settlementStaleCodingToken = '63000000-0000-4000-8000-000000000004'
  const settlementStaleVerifierRun = '63000000-0000-4000-8000-000000000005'
  const settlementStaleVerifierToken = '63000000-0000-4000-8000-000000000006'
  await query(ingress, 'SELECT builder.create_change($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [
    accountId, subjectProjectId, 'ab'.repeat(32), 'cd'.repeat(32), settlementStaleChange, settlementStalePlan,
    '63000000-0000-4000-8000-000000000007', '63000000-0000-4000-8000-000000000008',
    '63000000-0000-4000-8000-000000000009', 'Refuse stale verification settlement',
  ])
  await query(executor, 'SELECT builder.claim_change($1,$2,$3,$4,$5,$6)', [
    settlementStaleChange, settlementStaleCodingRun, settlementStaleCodingToken,
    modelIdentity.admissionId, modelIdentity.providerId, modelIdentity.modelId,
  ])
  await query(executor, 'SELECT builder.bind_sandbox($1,$2,$3)', [settlementStaleCodingRun, settlementStaleCodingToken, 'stale_coding'])
  await query(executor, 'SELECT builder.settle_result($1,$2,$3,$4,$5,$6,$7)', [
    settlementStaleCodingRun, settlementStaleCodingToken, 'stale_coding', baseSourceRevision, candidateSourceRevision, 'diff', 'summary',
  ])
  const settlementStaleVerification = (await query(executor, 'SELECT builder.claim_verification($1,$2,$3,$4,$5,$6) AS value', [
    settlementStaleChange, settlementStaleVerifierRun, settlementStaleVerifierToken,
    verifierIdentity.admissionId, verifierIdentity.providerId, verifierIdentity.modelId,
  ])).rows[0].value
  await query(executor, 'SELECT builder.bind_sandbox($1,$2,$3)', [settlementStaleVerifierRun, settlementStaleVerifierToken, 'stale_verifier'])
  const replacementDigest = 'a'.repeat(64)
  await query(current, `INSERT INTO project.baseline_candidate(project_id, candidate_digest, source_revision, source_text, application_runtime_profile)
    VALUES ($1, $2, $3, 'Replacement baseline', 'MANAGED')`, [subjectProjectId, replacementDigest, 'c'.repeat(40)])
  await query(current, 'UPDATE project.baseline_state SET current_candidate_digest = $2, approved_candidate_digest = $2 WHERE project_id = $1', [subjectProjectId, replacementDigest])
  assert.equal((await query(executor, 'SELECT builder.settle_verification($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) AS settled', [
    settlementStaleVerifierRun, settlementStaleVerifierToken, 'stale_verifier', settlementStaleVerification.assertionRef,
    settlementStaleVerification.contractRevision, settlementStaleVerification.planRevision, settlementStaleVerification.baselineDigest,
    settlementStaleVerification.baseSourceRevision, settlementStaleVerification.candidateSourceRevision,
    '63000000-0000-4000-8000-000000000010', [], [], '4'.repeat(64), passingReport,
  ])).rows[0].settled, false)
  assert.equal((await query(current, 'SELECT state FROM builder.change WHERE change_id = $1', [settlementStaleChange])).rows[0].state, 'UNVERIFIED')
  assert.equal((await query(current, 'SELECT count(*)::int AS count FROM builder.change_acceptance WHERE change_id = $1', [settlementStaleChange])).rows[0].count, 0)
  await query(current, 'UPDATE project.baseline_state SET current_candidate_digest = $2, approved_candidate_digest = $2 WHERE project_id = $1', [subjectProjectId, digest])

  const claimed = await query(executor, 'SELECT builder.claim_change($1,$2,$3,$4,$5,$6) AS value', [
    subjectChangeId, subjectActorRunId, subjectToken, modelIdentity.admissionId, modelIdentity.providerId, modelIdentity.modelId,
  ])
  assert.equal(claimed.rows[0].value.baseSourceRevision, baseSourceRevision)
  assert.deepEqual((await query(current, `SELECT model_admission_id, model_provider_id, model_id
    FROM builder.actor_run WHERE actor_run_id = $1`, [subjectActorRunId])).rows[0], {
    model_admission_id: modelIdentity.admissionId,
    model_provider_id: modelIdentity.providerId,
    model_id: modelIdentity.modelId,
  })
  await assert.rejects(query(executor, 'SELECT builder.claim_change($1,$2,$3,$4,$5,$6)', [
    subjectChangeId, '60000000-0000-4000-8000-000000000011', '60000000-0000-4000-8000-000000000012',
    modelIdentity.admissionId, modelIdentity.providerId, modelIdentity.modelId,
  ]), /BUILDER_CHANGE_NOT_QUEUED/)
  await query(executor, 'SELECT builder.bind_sandbox($1,$2,$3)', [subjectActorRunId, subjectToken, sandboxId])
  const late = await query(executor, 'SELECT builder.settle_result($1,$2,$3,$4,$5,$6,$7) AS settled', [
    subjectActorRunId, subjectToken, 'replacement_sandbox', baseSourceRevision, candidateSourceRevision, 'diff', 'narration',
  ])
  assert.equal(late.rows[0].settled, false)
  assert.equal((await query(current, 'SELECT state FROM builder.actor_run WHERE actor_run_id = $1', [subjectActorRunId])).rows[0].state, 'QUARANTINED')
  assert.equal((await query(current, 'SELECT state FROM builder.change WHERE change_id = $1', [subjectChangeId])).rows[0].state, 'FAILED')

  await query(current, 'UPDATE iam.project_builder_grant SET can_build = false, can_read_source = true WHERE account_id = $1 AND project_id = $2', [accountId, subjectProjectId])
  const sourceOnly = await query(ingress, 'SELECT builder.read_snapshot($1,$2,$3,true) AS value', [accountId, subjectProjectId, subjectChangeId])
  const buildOnly = await query(ingress, 'SELECT builder.read_snapshot($1,$2,$3,false) AS value', [accountId, subjectProjectId, subjectChangeId])
  assert.equal(sourceOnly.rows[0].value.change.changeId, subjectChangeId)
  assert.equal(buildOnly.rows[0].value, null)
  await query(current, 'UPDATE iam.project_builder_grant SET can_build = true WHERE account_id = $1 AND project_id = $2', [accountId, subjectProjectId])

  const revokedChange = '60000000-0000-4000-8000-000000000020'
  await query(ingress, 'SELECT builder.create_change($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [
    accountId, subjectProjectId, '1'.repeat(64), '2'.repeat(64), revokedChange,
    '60000000-0000-4000-8000-000000000021', '60000000-0000-4000-8000-000000000022',
    '60000000-0000-4000-8000-000000000023', '60000000-0000-4000-8000-000000000024', 'Revoked authority refusal',
  ])
  await query(current, 'UPDATE iam.project_builder_grant SET can_build = false WHERE account_id = $1 AND project_id = $2', [accountId, subjectProjectId])
  const revoked = await query(executor, 'SELECT builder.claim_change($1,$2,$3,$4,$5,$6) AS value', [
    revokedChange, '60000000-0000-4000-8000-000000000025', '60000000-0000-4000-8000-000000000026',
    modelIdentity.admissionId, modelIdentity.providerId, modelIdentity.modelId,
  ])
  assert.equal(revoked.rows[0].value.refusedCode, 'BUILDER_AUTHORITY_REVOKED')
  assert.equal((await query(current, 'SELECT state FROM builder.change WHERE change_id = $1', [revokedChange])).rows[0].state, 'FAILED')
  await query(current, 'UPDATE iam.project_builder_grant SET can_build = true WHERE account_id = $1 AND project_id = $2', [accountId, subjectProjectId])

  const staleChange = '60000000-0000-4000-8000-000000000050'
  await query(ingress, 'SELECT builder.create_change($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [
    accountId, subjectProjectId, '8a'.repeat(32), '9a'.repeat(32), staleChange,
    '60000000-0000-4000-8000-000000000051', '60000000-0000-4000-8000-000000000052',
    '60000000-0000-4000-8000-000000000053', '60000000-0000-4000-8000-000000000054', 'Stale baseline refusal',
  ])
  await query(current, 'UPDATE project.baseline_state SET current_candidate_digest = $2, approved_candidate_digest = $2 WHERE project_id = $1', [subjectProjectId, replacementDigest])
  const stale = await query(executor, 'SELECT builder.claim_change($1,$2,$3,$4,$5,$6) AS value', [
    staleChange, '60000000-0000-4000-8000-000000000055', '60000000-0000-4000-8000-000000000056',
    modelIdentity.admissionId, modelIdentity.providerId, modelIdentity.modelId,
  ])
  assert.equal(stale.rows[0].value.refusedCode, 'BUILDER_BASELINE_STALE')
  assert.equal((await query(current, 'SELECT state FROM builder.change WHERE change_id = $1', [staleChange])).rows[0].state, 'FAILED')
})
