import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

process.env.MASTRA_TELEMETRY_DISABLED = '1'
const repositoryRoot = resolve(import.meta.dirname, '../..')

const BUILDER_ADMISSION_ID = 'builder-coding-opus-5'
const BUILDER_MODEL_ID = 'claude-opus-5'

const compileHub = (t) => {
  const build = mkdtempSync(resolve(repositoryRoot, 'apps/hub/f04-inception-free-build-'))
  t.after(() => rmSync(build, { recursive: true, force: true }))
  const compiled = spawnSync(process.execPath, [
    resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'), '--project',
    resolve(repositoryRoot, 'apps/hub/tsconfig.json'), '--noEmit', 'false', '--outDir', build,
  ], { encoding: 'utf8' })
  assert.equal(compiled.status, 0, `${compiled.stdout}\n${compiled.stderr}`)
  return (path) => pathToFileURL(resolve(build, path)).href
}

const writeModelCatalog = (root) => {
  const catalogFile = resolve(root, 'model-admission-catalog.json')
  writeFileSync(catalogFile, JSON.stringify({
    schemaVersion: 'conexus-model-admission-catalog/v1',
    entries: [{
      admissionId: BUILDER_ADMISSION_ID,
      providerKey: 'anthropic',
      modelId: BUILDER_MODEL_ID,
      officialHttpsOrigin: 'https://api.anthropic.com',
      credentialSlot: 'ANTHROPIC_OAUTH_TOKEN_FILE',
      capabilitySet: ['BUILDER_CODING'],
      enabled: true,
    }],
  }), 'utf8')
  return catalogFile
}

const hubEnvironment = (root, catalogFile) => ({
  NODE_ENV: 'test',
  CONEXUS_ORIGIN: 'https://hub.conexus.localhost:3000',
  CONEXUS_PORT: '3000',
  CONEXUS_BOOTSTRAP_SUBJECT: 'bootstrap-subject',
  CONEXUS_DB_HOST: '127.0.0.1',
  CONEXUS_DB_PORT: '5433',
  CONEXUS_DB_NAME: 'conexus_s7',
  CONEXUS_DB_USER: 'hub_bootstrap',
  CONEXUS_DB_PASSWORD_FILE: resolve(root, 'db-password'),
  CONEXUS_DB_PRJ03_COMMAND_PASSWORD_FILE: resolve(root, 'prj03-password'),
  CONEXUS_DB_S3_READ_PASSWORD_FILE: resolve(root, 's3-read-password'),
  CONEXUS_PROJECT_STORAGE_ROOT: resolve(root, 'storage'),
  CONEXUS_GIT_IMPORT_CATALOG_FILE: resolve(root, 'git-import-catalog.json'),
  CONEXUS_GIT_EXTERNAL_FILE_SLOTS_FILE: resolve(root, 'external-file-slots.json'),
  CONEXUS_PROJECT_MODEL_CATALOG_FILE: catalogFile,
  CONEXUS_PROJECT_SOURCE_OWNERSHIP_MANIFEST_FILE: resolve(root, 'source-ownership.json'),
  CONEXUS_DB_RB_INGRESS_PASSWORD_FILE: resolve(root, 'rb-ingress-password'),
  CONEXUS_DB_RB_EXECUTOR_PASSWORD_FILE: resolve(root, 'rb-executor-password'),
  CONEXUS_BUILDER_E2B_API_KEY_FILE: resolve(root, 'e2b-api-key'),
  CONEXUS_BUILDER_E2B_TEMPLATE_ID: 'conexusbuilder:0f9a1c2d-3e4b-4a5c-8d9e-0f1a2b3c4d5e',
  CONEXUS_BUILDER_MODEL_ADMISSION_ID: BUILDER_ADMISSION_ID,
  CONEXUS_OIDC_ISSUER: 'https://issuer.conexus.localhost',
  CONEXUS_OIDC_CLIENT_ID: 'conexus-hub',
  CONEXUS_OIDC_CLIENT_SECRET_FILE: resolve(root, 'oidc-client-secret'),
})

test('Builder boot resolves its model with no Inception credential configured', async (t) => {
  const built = compileHub(t)
  const root = mkdtempSync(resolve(tmpdir(), 'conexus-f04-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const catalogFile = writeModelCatalog(root)
  const environment = hubEnvironment(root, catalogFile)

  const { readHubConfig } = await import(built('platform/config.js'))
  const { readModelChoices, resolveModelAdmission } = await import(built('model-connection/model-catalog.js'))

  const inceptionVariables = [
    'CONEXUS_DB_S6_INCEPTION_COMMAND_PASSWORD_FILE',
    'CONEXUS_DB_S4_BASELINE_READ_PASSWORD_FILE',
    'CONEXUS_DB_S4_BASELINE_COMMAND_PASSWORD_FILE',
  ]
  for (const name of inceptionVariables) assert.equal(environment[name], undefined)

  const config = readHubConfig(environment)
  assert.equal(config.project.planning, undefined)
  assert.equal(config.builder.modelAdmissionId, BUILDER_ADMISSION_ID)

  const admission = resolveModelAdmission({
    catalogFile: config.project.modelCatalogFile,
    admissionId: config.builder.modelAdmissionId,
    requiredCapabilities: ['BUILDER_CODING'],
    credentialRequired: false,
  })
  assert.equal(admission.admissionId, BUILDER_ADMISSION_ID)
  assert.equal(admission.providerId, 'anthropic')
  assert.equal(admission.modelId, BUILDER_MODEL_ID)
  assert.equal(admission.validateCredential(), undefined)

  const choices = readModelChoices({
    catalogFile: config.project.modelCatalogFile,
    requiredCapabilities: ['BUILDER_CODING'],
  })
  assert.deepEqual(choices.map((choice) => choice.choiceId), [BUILDER_ADMISSION_ID])
  assert.deepEqual(choices[0].capabilities, ['BUILDER_CODING'])

  const { createBuilderProjectGitCapability } = await import(built('project/module.js'))
  assert.equal(typeof createBuilderProjectGitCapability(config.project.storageRoot).verifyAdmittedImage, 'function')
})

test('a configured model credential still fails closed when its file is absent', async (t) => {
  const built = compileHub(t)
  const root = mkdtempSync(resolve(tmpdir(), 'conexus-f04-credential-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const catalogFile = writeModelCatalog(root)
  const slotsFile = resolve(root, 'external-file-slots.json')
  writeFileSync(slotsFile, JSON.stringify({ ANTHROPIC_OAUTH_TOKEN_FILE: resolve(root, 'absent-oauth-token.json') }), 'utf8')

  const { resolveModelAdmission } = await import(built('model-connection/model-catalog.js'))
  assert.throws(() => resolveModelAdmission({
    catalogFile,
    credentialSlotsFile: slotsFile,
    admissionId: BUILDER_ADMISSION_ID,
    requiredCapabilities: ['BUILDER_CODING'],
  }), /ANTHROPIC_OAUTH_LOGIN_REQUIRED/)
})
