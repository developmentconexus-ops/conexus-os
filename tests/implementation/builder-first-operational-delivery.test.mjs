import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const buildRoot = await mkdtemp(resolve(repositoryRoot, 'apps/hub/builder-first-operational-delivery-build-'))
const compile = (entry) => {
  const result = spawnSync(resolve(repositoryRoot, 'node_modules/.bin/esbuild'), [
    resolve(repositoryRoot, entry), `--outdir=${buildRoot}`, '--bundle', '--platform=node', '--format=esm', '--packages=external', '--log-level=error',
  ], { cwd: repositoryRoot, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(result.stdout || result.stderr)
}
compile('apps/hub/src/platform/config.ts')
compile('apps/hub/src/builder/runtime.ts')
compile('apps/hub/src/project/routes.ts')
const { readHubConfig } = await import(pathToFileURL(resolve(buildRoot, 'config.js')).href)
const { registerProjectRoutes } = await import(pathToFileURL(resolve(buildRoot, 'routes.js')).href)
const {
  BUILDER_TRACE_REQUEST_CONTEXT_KEYS,
  BUILDER_WORKSPACE_REQUEST_CONTEXT_KEY,
  createBuilderRequestContext,
  createMastraE2BCodingWorkerRuntime,
} = await import(pathToFileURL(resolve(buildRoot, 'runtime.js')).href)

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
  CONEXUS_DB_PRJ03_COMMAND_PASSWORD_FILE: '/run/secrets/project-command',
  CONEXUS_DB_S3_READ_PASSWORD_FILE: '/run/secrets/project-read',
  CONEXUS_PROJECT_STORAGE_ROOT: '/var/lib/conexus/projects',
  CONEXUS_GIT_IMPORT_CATALOG_FILE: '/etc/conexus/imports.json',
  CONEXUS_GIT_EXTERNAL_FILE_SLOTS_FILE: '/etc/conexus/slots.json',
  CONEXUS_PROJECT_MODEL_CATALOG_FILE: '/etc/conexus/models.json',
  CONEXUS_PROJECT_SOURCE_OWNERSHIP_MANIFEST_FILE: '/etc/conexus/source.json',
}

const runtimeConfig = {
  apiKey: 'e2b-api-key',
  templateId: 'template:12345678-1234-4234-8234-123456789012',
  model: { modelId: 'admitted-model' },
  modelIdentity: { admissionId: 'admission', providerId: 'provider', modelId: 'admitted-model' },
  validateModelCredential: () => {},
}

test('planning bootstrap is absent until all exclusive inputs are present', () => {
  const ordinary = readHubConfig(baseEnvironment)
  assert.equal(ordinary.project?.planning, undefined)

  assert.throws(() => readHubConfig({
    ...baseEnvironment,
    CONEXUS_DB_S4_BASELINE_READ_PASSWORD_FILE: '/run/secrets/baseline-read',
  }), /MISSING_CONFIG_CONEXUS_DB_S4_BASELINE_COMMAND_PASSWORD_FILE/)

  assert.throws(() => readHubConfig({
    ...baseEnvironment,
    CONEXUS_DB_S4_BASELINE_READ_PASSWORD_FILE: '/run/secrets/baseline-read',
    CONEXUS_DB_S4_BASELINE_COMMAND_PASSWORD_FILE: '/run/secrets/baseline-command',
    CONEXUS_DB_S6_INCEPTION_COMMAND_PASSWORD_FILE: '/run/secrets/inception-command',
    CONEXUS_DB_PRJ03_COMMAND_PASSWORD_FILE: undefined,
  }), /MISSING_CONFIG_CONEXUS_DB_PRJ03_COMMAND_PASSWORD_FILE/)

  const configured = readHubConfig({
    ...baseEnvironment,
    CONEXUS_DB_S4_BASELINE_READ_PASSWORD_FILE: '/run/secrets/baseline-read',
    CONEXUS_DB_S4_BASELINE_COMMAND_PASSWORD_FILE: '/run/secrets/baseline-command',
    CONEXUS_DB_S6_INCEPTION_COMMAND_PASSWORD_FILE: '/run/secrets/inception-command',
  })
  assert.deepEqual(configured.project?.planning, {
    baselineReadPasswordFile: '/run/secrets/baseline-read',
    baselineCommandPasswordFile: '/run/secrets/baseline-command',
    inceptionCommandPasswordFile: '/run/secrets/inception-command',
  })
})

test('ordinary Project composition registers only ordinary Project routes without planning', async () => {
  const routes = []
  const registered = await registerProjectRoutes({ route: (definition) => routes.push(definition) }, {
    store: {},
    resolveCurrentSession: async () => null,
    origin: 'https://control.example.test',
  })
  assert.deepEqual(registered, ['PRJ-01', 'PRJ-02', 'PRJ-03'])
  assert.equal(routes.length, 3)
  assert.ok(routes.every((route) => !String(route.url).includes('baseline') && !String(route.url).includes('inception')))
})

test('coding runtime requires the Hub shared native composition', () => {
  assert.throws(() => createMastraE2BCodingWorkerRuntime(runtimeConfig), /BUILDER_RUNTIME_SHARED_COMPOSITION_REQUIRED/)
})

test('Builder RequestContext carries Workspace plus only the two trace correlations', () => {
  const workspace = { sentinel: 'workspace-instance' }
  const context = createBuilderRequestContext({
    workspace,
    projectId: 'project-correlation',
    runId: 'run-correlation',
  })
  assert.deepEqual([...context.keys()], [BUILDER_WORKSPACE_REQUEST_CONTEXT_KEY, 'conexusBuilderProjectId', 'conexusBuilderRunId'])
  assert.equal(context.getRaw('conexusBuilderProjectId'), 'project-correlation')
  assert.equal(context.getRaw('conexusBuilderRunId'), 'run-correlation')
  assert.deepEqual(BUILDER_TRACE_REQUEST_CONTEXT_KEYS, ['conexusBuilderProjectId', 'conexusBuilderRunId'])
  assert.deepEqual(Object.fromEntries(BUILDER_TRACE_REQUEST_CONTEXT_KEYS.map((key) => [key, context.getRaw(key)])), {
    conexusBuilderProjectId: 'project-correlation',
    conexusBuilderRunId: 'run-correlation',
  })
})

test('Builder lifecycle serializes native flush and closes observability before its storage', async () => {
  const moduleSource = await readFile(resolve(repositoryRoot, 'apps/hub/src/builder/module.ts'), 'utf8')
  assert.match(moduleSource, /queued = result\.catch\(\(\) => undefined\)/)
  assert.match(moduleSource, /waitBounded = \(operation: Promise<void>\)/)
  assert.doesNotMatch(moduleSource, /await queued\n/)
  assert.match(moduleSource, /await observabilityLifecycle\.close\(\)/)
  assert.match(moduleSource, /await sessionStorage\.close\(\)/)
  assert.ok(moduleSource.indexOf('await observabilityLifecycle.close()') < moduleSource.indexOf('await sessionStorage.close()'))
  assert.match(moduleSource, /process\.emitWarning\('BUILDER_PREPARATION_FAILED'/)
})

test('Hub and live proof commands load the operator configuration explicitly', async () => {
  const packageJson = JSON.parse(await readFile(resolve(repositoryRoot, 'package.json'), 'utf8'))
  assert.match(packageJson.scripts['hub:local'], /node --env-file=\.audit\/slice7\/hub\.env/)
  assert.match(packageJson.scripts['rb:builder:live'], /node --env-file=\.audit\/slice7\/hub\.env/)
  assert.match(packageJson.scripts['rb:builder:composed:live'], /node --env-file=\.audit\/slice7\/hub\.env/)
  const composedRunner = await readFile(resolve(repositoryRoot, 'tests/implementation/rb-builder-production-composed-live-runner.mjs'), 'utf8')
  assert.match(composedRunner, /apps\/hub\/tsconfig\.json/)
  assert.match(composedRunner, /server\.js/)
  assert.match(composedRunner, /rb-builder-production-composed-live\.test\.mjs/)
  assert.doesNotMatch(packageJson.scripts['rb:first:check'], /rb-builder-first-vertical|bld-10-preview/)
  assert.match(packageJson.scripts['rb:first:check'], /builder-first-operational-delivery\.test\.mjs/)
})

test.after(async () => { await rm(buildRoot, { recursive: true, force: true }) })
