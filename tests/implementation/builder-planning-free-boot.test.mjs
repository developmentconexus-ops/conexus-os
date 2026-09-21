import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

process.env.MASTRA_TELEMETRY_DISABLED = '1'
const repositoryRoot = resolve(import.meta.dirname, '../..')

const RETIRED_MODEL_CATALOG_VARIABLES = [
  'CONEXUS_PROJECT_MODEL_CATALOG_FILE',
  'CONEXUS_BUILDER_MODEL_ADMISSION_ID',
]

const RETIRED_PLANNING_VARIABLES = [
  'CONEXUS_DB_S4_BASELINE_READ_PASSWORD_FILE',
  'CONEXUS_DB_S4_BASELINE_COMMAND_PASSWORD_FILE',
  'CONEXUS_DB_S6_INCEPTION_COMMAND_PASSWORD_FILE',
]

const compileHub = (t) => {
  const build = mkdtempSync(resolve(repositoryRoot, 'apps/hub/f05-planning-free-build-'))
  t.after(() => rmSync(build, { recursive: true, force: true }))
  const compiled = spawnSync(process.execPath, [
    resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'), '--project',
    resolve(repositoryRoot, 'apps/hub/tsconfig.json'), '--noEmit', 'false', '--outDir', build,
  ], { encoding: 'utf8' })
  assert.equal(compiled.status, 0, `${compiled.stdout}\n${compiled.stderr}`)
  return (path) => pathToFileURL(resolve(build, path)).href
}

const hubEnvironment = (root) => ({
  NODE_ENV: 'test',
  CONEXUS_ORIGIN: 'https://hub.conexus.localhost:3000',
  CONEXUS_PORT: '3000',
  CONEXUS_BOOTSTRAP_SUBJECT: 'bootstrap-subject',
  CONEXUS_DB_HOST: '127.0.0.1',
  CONEXUS_DB_PORT: '5433',
  CONEXUS_DB_NAME: 'conexus_s7',
  CONEXUS_DB_USER: 'hub_bootstrap',
  CONEXUS_DB_PASSWORD_FILE: resolve(root, 'db-password'),
  CONEXUS_DB_PROJECT_COMMAND_PASSWORD_FILE: resolve(root, 'prj03-password'),
  CONEXUS_DB_PROJECT_READ_PASSWORD_FILE: resolve(root, 's3-read-password'),
  CONEXUS_PROJECT_STORAGE_ROOT: resolve(root, 'storage'),
  CONEXUS_GIT_IMPORT_CATALOG_FILE: resolve(root, 'git-import-catalog.json'),
  CONEXUS_GIT_EXTERNAL_FILE_SLOTS_FILE: resolve(root, 'external-file-slots.json'),
  CONEXUS_PROJECT_SOURCE_OWNERSHIP_MANIFEST_FILE: resolve(root, 'source-ownership.json'),
  CONEXUS_DB_BUILDER_INGRESS_PASSWORD_FILE: resolve(root, 'rb-ingress-password'),
  CONEXUS_DB_BUILDER_EXECUTOR_PASSWORD_FILE: resolve(root, 'rb-executor-password'),
  CONEXUS_BUILDER_E2B_API_KEY_FILE: resolve(root, 'e2b-api-key'),
  CONEXUS_BUILDER_E2B_TEMPLATE_ID: 'conexusbuilder:0f9a1c2d-3e4b-4a5c-8d9e-0f1a2b3c4d5e',
  CONEXUS_OIDC_ISSUER: 'https://issuer.conexus.localhost',
  CONEXUS_OIDC_CLIENT_ID: 'conexus-hub',
  CONEXUS_OIDC_CLIENT_SECRET_FILE: resolve(root, 'oidc-client-secret'),
})

test('Builder boot needs no deployment model catalog and no pinned admission id', async (t) => {
  const built = compileHub(t)
  const root = mkdtempSync(resolve(tmpdir(), 'conexus-f05-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const environment = hubEnvironment(root)

  const { readHubConfig } = await import(built('platform/config.js'))

  const config = readHubConfig(environment)
  assert.equal(config.builder.e2bTemplateId, 'conexusbuilder:0f9a1c2d-3e4b-4a5c-8d9e-0f1a2b3c4d5e')
  assert.equal(Object.hasOwn(config.builder, 'modelAdmissionId'), false)
  assert.equal(Object.hasOwn(config.project, 'modelCatalogFile'), false)
  assert.equal(Object.hasOwn(config.project, 'planning'), false)

  const { createBuilderProjectGitCapability } = await import(built('project/module.js'))
  assert.equal(typeof createBuilderProjectGitCapability(config.project.storageRoot).verifyAdmittedImage, 'function')
})

test('a retired Inception or Baseline password variable is refused, not ignored', async (t) => {
  const built = compileHub(t)
  const root = mkdtempSync(resolve(tmpdir(), 'conexus-f05-retired-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const environment = hubEnvironment(root)

  const { readHubConfig } = await import(built('platform/config.js'))

  for (const name of RETIRED_PLANNING_VARIABLES) {
    assert.throws(
      () => readHubConfig({ ...environment, [name]: resolve(root, 'retired-password') }),
      new RegExp(`RETIRED_CONFIG_${name}`),
    )
  }
})

test('a deployment still carrying the model catalog variables is refused, not silently ignored', async (t) => {
  const built = compileHub(t)
  const root = mkdtempSync(resolve(tmpdir(), 'conexus-f05-catalog-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const environment = hubEnvironment(root)

  const { readHubConfig } = await import(built('platform/config.js'))

  for (const name of RETIRED_MODEL_CATALOG_VARIABLES) {
    assert.throws(
      () => readHubConfig({ ...environment, [name]: resolve(root, 'model-admission-catalog.json') }),
      new RegExp(`RETIRED_CONFIG_${name}`),
    )
  }
})

test('a deployment still carrying the model-connection variables is refused, not silently ignored', async (t) => {
  const built = compileHub(t)
  const root = mkdtempSync(resolve(tmpdir(), 'conexus-f05-model-connection-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const environment = hubEnvironment(root)

  const { readHubConfig } = await import(built('platform/config.js'))

  for (const name of [
    'CONEXUS_DB_MODEL_CONNECTION_PASSWORD_FILE',
    'CONEXUS_DB_R2_CONNECTIONS_PASSWORD_FILE',
    'CONEXUS_CONNECTION_CREDENTIAL_ROOT',
    'CONEXUS_CONNECTION_CREDENTIAL_KEY_FILE',
    'CONEXUS_CONNECTION_CREDENTIAL_KEY_GENERATION',
  ]) {
    assert.throws(
      () => readHubConfig({ ...environment, [name]: resolve(root, 'retired') }),
      new RegExp(`^Error: RETIRED_CONFIG_${name}$`),
    )
  }
  assert.equal(Object.hasOwn(readHubConfig(environment), 'connections'), false)
})
