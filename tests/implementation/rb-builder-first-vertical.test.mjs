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

test('Builder admits only an explicitly remote runtime and settles a fully scoped candidate', async () => {
  assert.throws(() => createBuilderService({ store: {}, source: {}, runtime: { kind: 'LOCAL' } }), /BUILDER_LOCAL_RUNTIME_REFUSED/)
  const calls = []
  const store = {
    createChange: async () => projection,
    claimChange: async () => { calls.push('claim'); return claim },
    bindSandbox: async (...args) => { calls.push(['bind', ...args]) },
    settleResult: async (input) => { calls.push(['settle', input]) },
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
  const service = createBuilderService({ store, source, runtime })
  assert.equal((await service.createChange({ accountId: projectId, projectId, idempotencyKey: 'attempt', intent: projection.intent })).changeId, changeId)
  await service.close()
  assert.deepEqual(calls.map((entry) => Array.isArray(entry) ? entry[0] : entry), ['claim', 'source', 'execute', 'bind', 'admit', 'settle', 'close'])
  const settlement = calls.find((entry) => Array.isArray(entry) && entry[0] === 'settle')[1]
  assert.equal(settlement.baseSourceRevision, baseSourceRevision)
  assert.equal(settlement.candidateSourceRevision, candidateSourceRevision)
  assert.equal(settlement.sandboxId, sandboxId)
})

test('Builder refuses mismatched worker lineage and never settles its narration', async () => {
  const state = { settled: false, failed: false }
  const store = {
    createChange: async () => projection, claimChange: async () => claim, bindSandbox: async () => {},
    settleResult: async () => { state.settled = true }, failRun: async () => { state.failed = true },
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
  const service = createBuilderService({ store, source, runtime })
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
  const store = {
    listChanges: async (input) => { calls.push(['list', input]); return [projection] },
    readSnapshot: async (input) => { calls.push(['read', input]); return snapshot },
  }
  const service = { createChange: async (input) => { calls.push(['create', input]); return projection } }
  const resolveCurrentSession = async (_request, requireCsrf) => { calls.push(['session', requireCsrf]); return { account: { accountId: projectId } } }
  const app = await createHttpApp({ registerRoutes: (server) => registerBuilderRoutes(server, { store, service, resolveCurrentSession, origin }) })
  try {
    assert.deepEqual(app.routeCensus(), ['BLD-01', 'BLD-02', 'BLD-03', 'BLD-04', 'BLD-06', 'BLD-07', 'BLD-17'])
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
    writeCatalog([inceptionEntry, builderEntry])
    const selected = resolveProjectModelAdmission({
      catalogFile, credentialSlotsFile: slotsFile, admissionId: builderEntry.admissionId,
      requiredCapabilities: ['BUILDER_CODING'],
    })
    assert.deepEqual({ admissionId: selected.admissionId, providerId: selected.providerId, modelId: selected.modelId }, {
      admissionId: builderEntry.admissionId, providerId: 'anthropic', modelId: 'claude-sonnet-4-5',
    })
    assert.equal(selected.model.modelId, 'claude-sonnet-4-5')
    const inception = resolveProjectCognitionModelAdmission({ catalogFile, credentialSlotsFile: slotsFile })
    assert.equal(inception.modelId, 'claude-opus-5')
    assert.equal(inception.validateCredential, selected.validateCredential)
    writeCatalog([{ ...inceptionEntry, modelId: 'claude-sonnet-4-5' }, builderEntry])
    assert.throws(() => resolveProjectCognitionModelAdmission({ catalogFile, credentialSlotsFile: slotsFile }),
      /PROJECT_MODEL_CATALOG_REFUSED/)
    writeCatalog([inceptionEntry, builderEntry])
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
  }
  assert.equal(readHubConfig(environment).builder?.modelAdmissionId, 'builder-coding-primary')
  for (const omitted of ['CONEXUS_PROJECT_MODEL_CATALOG_FILE', 'CONEXUS_BUILDER_MODEL_ADMISSION_ID']) {
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
    writeFileSync(resolve(work, 'orphan.txt'), 'existing but unowned\n')
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
      writeFileSync(resolve(work, 'orphan.txt'), 'mutated without ownership\n')
      gitFixture(work, ['add', 'orphan.txt'])
      gitFixture(work, ['commit', '-m', 'unowned existing mutation'])
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
  assert.deepEqual((await runCurrentHubMigrations({ connectionString: url.toString() })).versions, Array.from({ length: 19 }, (_, index) => String(index + 1).padStart(3, '0')))
  assert.deepEqual((await runCurrentHubMigrations({ connectionString: url.toString() })).appliedNow, [])
  const tables = await query(current, `SELECT tablename FROM pg_tables WHERE schemaname = 'builder' ORDER BY tablename`)
  assert.deepEqual(tables.rows.map((row) => row.tablename), ['actor_run', 'change', 'coding_session', 'operation_receipt', 'plan', 'work_unit'])
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

  const created = await query(ingress, 'SELECT builder.create_change($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) AS value', [
    accountId, subjectProjectId, 'e'.repeat(64), 'f'.repeat(64), subjectChangeId, planRevision, itemId,
    codingSessionId, subjectWorkUnitId, 'Add a governed page',
  ])
  assert.equal(created.rows[0].value.state, 'QUEUED')
  await assert.rejects(query(ingress, 'SELECT builder.create_change($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [
    accountId, subjectProjectId, 'e'.repeat(64), '9'.repeat(64), subjectChangeId, planRevision, itemId,
    codingSessionId, subjectWorkUnitId, 'Different payload under the same key',
  ]), /BLD03_IDEMPOTENCY_CONFLICT/)
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
    accountId, subjectProjectId, '8'.repeat(64), '9'.repeat(64), staleChange,
    '60000000-0000-4000-8000-000000000051', '60000000-0000-4000-8000-000000000052',
    '60000000-0000-4000-8000-000000000053', '60000000-0000-4000-8000-000000000054', 'Stale baseline refusal',
  ])
  const replacementDigest = 'a'.repeat(64)
  await query(current, `INSERT INTO project.baseline_candidate(project_id, candidate_digest, source_revision, source_text, application_runtime_profile)
    VALUES ($1, $2, $3, 'Replacement baseline', 'MANAGED')`, [subjectProjectId, replacementDigest, 'c'.repeat(40)])
  await query(current, 'UPDATE project.baseline_state SET current_candidate_digest = $2, approved_candidate_digest = $2 WHERE project_id = $1', [subjectProjectId, replacementDigest])
  const stale = await query(executor, 'SELECT builder.claim_change($1,$2,$3,$4,$5,$6) AS value', [
    staleChange, '60000000-0000-4000-8000-000000000055', '60000000-0000-4000-8000-000000000056',
    modelIdentity.admissionId, modelIdentity.providerId, modelIdentity.modelId,
  ])
  assert.equal(stale.rows[0].value.refusedCode, 'BUILDER_BASELINE_STALE')
  assert.equal((await query(current, 'SELECT state FROM builder.change WHERE change_id = $1', [staleChange])).rows[0].state, 'FAILED')
})
