import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { EventEmitter } from 'node:events'
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
compile('apps/hub/src/builder/module.ts')
compile('apps/hub/src/project/routes.ts')
const { readHubConfig } = await import(pathToFileURL(resolve(buildRoot, 'config.js')).href)
const { registerProjectRoutes } = await import(pathToFileURL(resolve(buildRoot, 'routes.js')).href)
const {
  BUILDER_TRACE_REQUEST_CONTEXT_KEYS,
  BUILDER_WORKSPACE_REQUEST_CONTEXT_KEY,
  createBuilderRequestContext,
  createMastraE2BCodingWorkerRuntime,
} = await import(pathToFileURL(resolve(buildRoot, 'runtime.js')).href)
const { createBuilderObservabilityLifecycle } = await import(pathToFileURL(resolve(buildRoot, 'module.js')).href)
const { requestHubShell, waitForHub } = await import(pathToFileURL(resolve(repositoryRoot, 'tests/implementation/rb-builder-production-composed-live-runner.mjs')).href)

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

test('Builder lifecycle lets Product timeout without closing storage under pending native work', async () => {
  let releaseFlush
  const pendingFlush = new Promise((resolve) => { releaseFlush = resolve })
  const events = []
  const lifecycle = createBuilderObservabilityLifecycle({
    flush: async () => { events.push('flush-start'); await pendingFlush; events.push('flush-end') },
    shutdown: async () => { events.push('shutdown') },
  }, 5)
  const productFlush = lifecycle.flush()
  await new Promise((resolve) => setTimeout(resolve, 20))
  await productFlush
  let closed = false
  const close = lifecycle.close().then(() => { closed = true })
  await new Promise((resolve) => setTimeout(resolve, 10))
  assert.equal(closed, false)
  assert.deepEqual(events, ['flush-start'])
  releaseFlush()
  await close
  assert.equal(closed, true)
  assert.deepEqual(events, ['flush-start', 'flush-end', 'shutdown'])
  await lifecycle.close()
  assert.deepEqual(events, ['flush-start', 'flush-end', 'shutdown'])
  events.push('storage-close')
  assert.deepEqual(events.slice(-2), ['shutdown', 'storage-close'])
})

test('Builder lifecycle completes native shutdown after a rejected flush', async () => {
  const events = []
  const lifecycle = createBuilderObservabilityLifecycle({
    flush: async () => { events.push('flush'); throw new Error('synthetic exporter failure') },
    shutdown: async () => { events.push('shutdown') },
  }, 5)
  await lifecycle.flush()
  await lifecycle.close()
  assert.deepEqual(events, ['flush', 'shutdown'])
})

test('Hub and live proof commands load the operator configuration explicitly', async () => {
  const packageJson = JSON.parse(await readFile(resolve(repositoryRoot, 'package.json'), 'utf8'))
  assert.match(packageJson.scripts['hub:local'], /node --env-file=\.audit\/slice7\/hub\.env/)
  assert.match(packageJson.scripts['rb:builder:live'], /node --env-file=\.audit\/slice7\/hub\.env/)
  assert.match(packageJson.scripts['rb:builder:composed:live'], /node --env-file=\.audit\/slice7\/hub\.env/)
  const composedRunner = await readFile(resolve(repositoryRoot, 'tests/implementation/rb-builder-production-composed-live-runner.mjs'), 'utf8')
  const localBuildScript = await readFile(resolve(repositoryRoot, 'scripts/build-hub-local.mjs'), 'utf8')
  assert.match(localBuildScript, /apps\/hub\/tsconfig\.json/)
  assert.match(localBuildScript, /vite\.js/)
  assert.match(localBuildScript, /apps\/web\/vite\.config\.mjs/)
  assert.match(composedRunner, /server\.js/)
  assert.match(composedRunner, /rb-builder-production-composed-live\.test\.mjs/)
  assert.match(composedRunner, /https:/)
  assert.match(composedRunner, /RB_COMPOSED_HUB_RESPONSE_REFUSED/)
  assert.match(composedRunner, /buildHubLocal/)
  assert.doesNotMatch(composedRunner, /http:\/\/127\.0\.0\.1/)
  assert.doesNotMatch(packageJson.scripts['rb:first:check'], /rb-builder-first-vertical|bld-10-preview/)
  assert.match(packageJson.scripts['rb:first:check'], /builder-first-operational-delivery\.test\.mjs/)
})

test('composed readiness uses both lookup forms, expected shell response, and a bounded request', async () => {
  const previousCa = process.env.NODE_EXTRA_CA_CERTS
  const caPath = resolve(buildRoot, 'readiness-ca.pem')
  await writeFile(caPath, 'configured local CA')
  process.env.NODE_EXTRA_CA_CERTS = caPath
  let lookupResult
  let scalarLookupResult
  let configuredCa
  const requestImplementation = (_origin, options, callback) => {
    const requestHandle = new EventEmitter()
    configuredCa = options.ca
    requestHandle.end = () => queueMicrotask(() => {
      options.lookup('hub.conexus.localhost', { all: true }, (error, addresses) => { lookupResult = { error, addresses } })
      options.lookup('hub.conexus.localhost', { all: false }, (...result) => { scalarLookupResult = result })
      const response = new EventEmitter()
      response.statusCode = 200
      response.headers = { 'content-type': 'text/html' }
      response.setEncoding = () => {}
      callback(response)
      response.emit('data', '<div id="root"></div><script src="/assets/app.js"></script>')
      response.emit('end')
    })
    requestHandle.destroy = () => {}
    return requestHandle
  }
  try {
    const response = await requestHubShell(new URL('https://hub.conexus.localhost:3443/'), { requestImplementation, timeoutMs: 50 })
    assert.equal(response.status, 200)
    assert.equal(configuredCa.toString(), 'configured local CA')
    assert.deepEqual(lookupResult.addresses, [{ address: '127.0.0.1', family: 4 }])
    assert.deepEqual(scalarLookupResult, [null, '127.0.0.1', 4])
  } finally {
    if (previousCa === undefined) delete process.env.NODE_EXTRA_CA_CERTS
    else process.env.NODE_EXTRA_CA_CERTS = previousCa
  }

  await assert.rejects(
    waitForHub(new URL('https://hub.conexus.localhost:3443/'), { exitCode: null }, {
      requestImplementation: (_origin, _options, callback) => {
        const requestHandle = new EventEmitter()
        requestHandle.end = () => queueMicrotask(() => {
          const response = new EventEmitter()
          response.statusCode = 503
          response.headers = { 'content-type': 'text/plain' }
          response.setEncoding = () => {}
          callback(response)
          response.emit('data', 'not-ready')
          response.emit('end')
        })
        requestHandle.destroy = () => {}
        return requestHandle
      },
      maxAttempts: 1,
      totalTimeoutMs: 50,
      sleep: async () => {},
    }),
    (error) => {
      assert.equal(error.message, 'RB_COMPOSED_SERVER_NOT_READY: RB_COMPOSED_HUB_RESPONSE_REFUSED')
      return true
    },
  )

  let destroyed = false
  await assert.rejects(requestHubShell(new URL('https://hub.conexus.localhost:3443/'), {
    requestImplementation: (_origin, _options, _callback) => {
      const requestHandle = new EventEmitter()
      requestHandle.end = () => {}
      requestHandle.destroy = () => { destroyed = true }
      return requestHandle
    },
    timeoutMs: 5,
  }), /RB_COMPOSED_HUB_REQUEST_TIMEOUT/)
  assert.equal(destroyed, true)
})

test('composed readiness refuses an unreadable configured CA before requesting', async () => {
  const previousCa = process.env.NODE_EXTRA_CA_CERTS
  process.env.NODE_EXTRA_CA_CERTS = resolve(buildRoot, 'missing-readiness-ca.pem')
  try {
    await assert.rejects(
      requestHubShell(new URL('https://hub.conexus.localhost:3443/'), {
        requestImplementation: () => { throw new Error('REQUEST_MUST_NOT_START') },
      }),
      /RB_COMPOSED_CA_UNREADABLE/,
    )
  } finally {
    if (previousCa === undefined) delete process.env.NODE_EXTRA_CA_CERTS
    else process.env.NODE_EXTRA_CA_CERTS = previousCa
  }
})

test.after(async () => { await rm(buildRoot, { recursive: true, force: true }) })
