import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'

process.env.MASTRA_TELEMETRY_DISABLED = '1'

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
  CONEXUS_DB_BUILDER_INGRESS_PASSWORD_FILE: resolve(root, 'rb-ingress-password'),
  CONEXUS_DB_BUILDER_EXECUTOR_PASSWORD_FILE: resolve(root, 'rb-executor-password'),
  CONEXUS_DB_MODEL_ACCOUNT_PASSWORD_FILE: resolve(root, 'model-account-password'),
  CONEXUS_BUILDER_E2B_API_KEY_FILE: resolve(root, 'e2b-api-key'),
  CONEXUS_BUILDER_E2B_TEMPLATE_ID: 'conexusbuilder:0f9a1c2d-3e4b-4a5c-8d9e-0f1a2b3c4d5e',
  CONEXUS_OIDC_ISSUER: 'https://issuer.conexus.localhost',
  CONEXUS_OIDC_CLIENT_ID: 'conexus-hub',
  CONEXUS_OIDC_CLIENT_SECRET_FILE: resolve(root, 'oidc-client-secret'),
  CONEXUS_FACTORY_SECRET_KEY_FILE: resolve(root, 'factory-secret-key'),
  CONEXUS_DB_FACTORY_PASSWORD_FILE: resolve(root, 'factory-password'),
})

test('a Builder without its Mastra storage role is refused', async (t) => {
  const root = mkdtempSync(resolve(tmpdir(), 'conexus-f05-factory-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const { readHubConfig } = await import(hubModuleUrl('platform/config.js'))
  const environment = Object.fromEntries(Object.entries(hubEnvironment(root)).filter(([name]) => !name.includes('_FACTORY_') || name === 'CONEXUS_FACTORY_SECRET_KEY_FILE'))
  assert.throws(() => readHubConfig(environment), { message: 'BUILDER_FACTORY_RUNTIME_REQUIRED' })
})

test('Builder boot needs no deployment model catalog and no pinned admission id', async (t) => {
  const root = mkdtempSync(resolve(tmpdir(), 'conexus-f05-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const environment = hubEnvironment(root)

  const { readHubConfig } = await import(hubModuleUrl('platform/config.js'))

  const config = readHubConfig(environment)
  assert.equal(config.builder.e2bTemplateId, 'conexusbuilder:0f9a1c2d-3e4b-4a5c-8d9e-0f1a2b3c4d5e')
  assert.equal(Object.hasOwn(config.builder, 'modelAdmissionId'), false)
  assert.equal(Object.hasOwn(config.project, 'modelCatalogFile'), false)
  assert.equal(Object.hasOwn(config.project, 'planning'), false)
})
