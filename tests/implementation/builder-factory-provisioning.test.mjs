import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { test } from 'node:test'
import { buildHubDatabase, query, testPool } from './hub-database.mjs'
import { startFakeGithub } from './builder-factory-fake-github.mjs'
import { hubModuleUrl } from './hub-build.mjs'

const built = hubModuleUrl
const { createFactoryStorage } = await import(built('builder/factory.js'))
const { createGithubApp } = await import(built('builder/factory-github.js'))
const { connectFactoryInstallation, openFactoryRecords, setFactoryMemoryModel } = await import(built('builder/factory-provisioning.js'))

const ORG = 'conexus-installation'
const privateKeyPem = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs1', format: 'pem' })

const setup = async (t, fakeOptions) => {
  const { connectionString, onCleanup } = await buildHubDatabase(t, 'conexus_factory_provisioning')
  const github = await startFakeGithub(fakeOptions)
  onCleanup(() => github.close())
  const factoryPool = testPool({ connectionString, options: '-c search_path=factory', max: 4 })
  const storage = createFactoryStorage(factoryPool)
  onCleanup(async () => { try { await storage.close() } finally { await factoryPool.end() } })
  const records = await openFactoryRecords(storage)
  const app = createGithubApp({ appId: '5015512', privateKey: privateKeyPem, baseUrl: github.baseUrl })
  const lines = []
  const connect = () => connectFactoryInstallation({ github: app, records, orgId: ORG, write: (line) => lines.push(line) })
  const memory = (modelId) => setFactoryMemoryModel({ records, orgId: ORG, modelId, write: (line) => lines.push(line) })
  const snapshot = async () => {
    const tables = ['source_control_installations', 'source_control_repositories', 'factory_projects', 'factory_project_source_control_connections', 'factory_project_repositories']
    const result = {}
    for (const table of tables) result[table] = (await query(connectionString, `SELECT * FROM factory.${table} ORDER BY id`)).rows
    return result
  }
  return { connectionString, github, lines, connect, memory, snapshot }
}

test('connect prints the App identity for the operator and records the organization installation once', async (t) => {
  const { connectionString, github, lines, connect, snapshot } = await setup(t)
  await connect()
  assert.deepEqual(lines, [
    'CONEXUS_FACTORY_GITHUB_CLIENT_ID=Iv23-fake-client',
    'CONEXUS_FACTORY_GITHUB_APP_SLUG=conexus-fake-app',
    'FACTORY_INSTALLATION=163574754 ACCOUNT=acme-org TYPE=Organization',
  ])
  const rows = (await query(connectionString, 'SELECT org_id, external_id, account_name, account_type FROM factory.source_control_installations')).rows
  assert.deepEqual(rows, [{ org_id: ORG, external_id: '163574754', account_name: 'acme-org', account_type: 'Organization' }])
  const before = await snapshot()
  await connect()
  assert.deepEqual(await snapshot(), before)
  const printed = lines.join('\n')
  assert.doesNotMatch(printed, /ghs_|PRIVATE KEY|eyJ/)
  // GitHub answers 401 to an App JWT sent under any scheme but bearer.
  const appCalls = github.state.requests.filter((request) => request.path === '/app' || request.path === '/app/installations')
  assert.deepEqual(appCalls.map((request) => [request.path, request.authorization?.split(' ')[0].toLowerCase()]), [
    ['/app', 'bearer'], ['/app/installations', 'bearer'], ['/app', 'bearer'], ['/app/installations', 'bearer'],
  ])
})

test('memory records one observer and reflector model for the organization, and a rerun converges', async (t) => {
  const { connectionString, lines, memory } = await setup(t)
  await memory('openai/gpt-5.6-luna')
  await memory('openai/gpt-5.6-luna')
  const rows = (await query(connectionString, 'SELECT org_id, user_id, observer_model_id, reflector_model_id FROM factory.memory_settings')).rows
  assert.deepEqual(rows, [{ org_id: ORG, user_id: 'conexus-operator', observer_model_id: 'openai/gpt-5.6-luna', reflector_model_id: 'openai/gpt-5.6-luna' }])
  assert.deepEqual(lines, ['FACTORY_MEMORY_MODEL=openai/gpt-5.6-luna', 'FACTORY_MEMORY_MODEL=openai/gpt-5.6-luna'])
  await assert.rejects(memory('gpt 5; rm -rf'), { message: 'FACTORY_MEMORY_MODEL_REFUSED' })
})

test('a personal-account installation is refused with the organization message', async (t) => {
  const { connectionString, connect } = await setup(t, { installations: [{ id: 1, account: { login: 'leandro', type: 'User' } }] })
  await assert.rejects(connect(), /^Error: FACTORY_INSTALLATION_ORGANIZATION_REQUIRED: GitHub does not let an App create repositories in a personal account/)
  assert.equal((await query(connectionString, 'SELECT count(*)::int AS n FROM factory.source_control_installations')).rows[0].n, 0)
})

test('zero or two installations are refused', async (t) => {
  const none = await setup(t, { installations: [] })
  await assert.rejects(none.connect(), /^Error: FACTORY_INSTALLATION_MISSING/)
  const two = await setup(t, { installations: [
    { id: 1, account: { login: 'acme-org', type: 'Organization' } },
    { id: 2, account: { login: 'other-org', type: 'Organization' } },
  ] })
  await assert.rejects(two.connect(), /^Error: FACTORY_INSTALLATION_AMBIGUOUS/)
})
