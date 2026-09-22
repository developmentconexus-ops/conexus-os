import assert from 'node:assert/strict'
import { generateKeyPairSync, randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { buildHubDatabase, query, testPool } from './hub-database.mjs'
import { startFakeGithub } from './builder-factory-fake-github.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const hubBuild = mkdtempSync(resolve(repositoryRoot, 'apps/hub/builder-factory-provisioning-build-'))
process.once('exit', () => rmSync(hubBuild, { recursive: true, force: true }))
const compiled = spawnSync(process.execPath, [
  resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'),
  '--project', resolve(repositoryRoot, 'apps/hub/tsconfig.json'),
  '--noEmit', 'false', '--outDir', hubBuild,
], { encoding: 'utf8' })
if (compiled.status !== 0) throw new Error(`HUB_COMPILE_FAILED\n${compiled.stdout}\n${compiled.stderr}`)
const built = (path) => pathToFileURL(resolve(hubBuild, path)).href
const { createFactoryStorage } = await import(built('builder/factory.js'))
const { createGithubApp } = await import(built('builder/factory-github.js'))
const { connectFactoryInstallation, factoryRepositoryName, openFactoryRecords, prepareFactoryRepository, provisionFactoryProject, setFactoryMemoryModel } = await import(built('builder/factory-provisioning.js'))
const { APPLICATION_CHECK_FILES, FIXED_APPLICATION_STARTER_FILES } = await import(built('builder/application-starter.js'))

const ORG = 'conexus-installation'
const STARTER = 'a'.repeat(40)
const privateKeyPem = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs1', format: 'pem' })

const setup = async (t, fakeOptions) => {
  const { connectionString, connection, onCleanup } = await buildHubDatabase(t, 'conexus_factory_provisioning')
  const github = await startFakeGithub(fakeOptions)
  onCleanup(() => github.close())
  const factoryPool = testPool({ connectionString, options: '-c search_path=factory', max: 4 })
  const storage = createFactoryStorage(factoryPool)
  onCleanup(async () => { await storage.close().catch(() => {}); await factoryPool.end().catch(() => {}) })
  const records = await openFactoryRecords(storage)
  // Assuming the role at connection start exercises its grants without writing a cluster-global password.
  const executorPool = testPool({ ...connection, max: 2, options: '-c role=hub_builder_executor' })
  onCleanup(() => executorPool.end())
  const app = createGithubApp({ appId: '5015512', privateKey: privateKeyPem, baseUrl: github.baseUrl })
  const workspaceId = randomUUID()
  await query(connectionString, "INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1, 'Factory')", [workspaceId])
  const newProject = async (projectId = randomUUID()) => {
    await query(connectionString, "INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision) VALUES ($1, $2, $3, 'NEW', $4, $3)", [projectId, workspaceId, `p-${projectId.slice(0, 8)}`, STARTER])
    await query(connectionString, 'INSERT INTO builder.project_working_state(project_id, working_source_revision, working_version) VALUES ($1, $2, 0)', [projectId, STARTER])
    return projectId
  }
  const lines = []
  const connect = () => connectFactoryInstallation({ github: app, records, orgId: ORG, write: (line) => lines.push(line) })
  const memory = (modelId) => setFactoryMemoryModel({ records, orgId: ORG, modelId, write: (line) => lines.push(line) })
  const provision = (projectId, projectName = PROJECT_NAME) => provisionFactoryProject({ github: app, records, executorPool, orgId: ORG, projectId, projectName, headAttempts: 2, headDelayMs: 10 })
  const prepareOnly = (projectId, projectName = PROJECT_NAME) => prepareFactoryRepository({ github: app, records, orgId: ORG, projectId, projectName, headAttempts: 2, headDelayMs: 10 })
  const snapshot = async () => {
    const tables = ['source_control_installations', 'source_control_repositories', 'factory_projects', 'factory_project_source_control_connections', 'factory_project_repositories']
    const result = {}
    for (const table of tables) result[table] = (await query(connectionString, `SELECT * FROM factory.${table} ORDER BY id`)).rows
    result.binding = (await query(connectionString, 'SELECT * FROM builder.factory_binding ORDER BY project_id')).rows
    result.working = (await query(connectionString, 'SELECT project_id, working_source_revision, working_version FROM builder.project_working_state ORDER BY project_id')).rows
    return result
  }
  return { connectionString, github, app, records, lines, connect, memory, provision, prepareOnly, newProject, snapshot }
}

const PROJECT_NAME = 'Contador de Visitas'
const repositoryName = (projectId) => `contador-de-visitas-${projectId.slice(0, 8)}`
const INSTALLATION_B = { id: 208000001, account: { login: 'acme-org', type: 'Organization' } }
const creations = (github) => github.state.requests.filter((request) => request.method === 'POST' && request.path.endsWith('/repos')).length

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

test('a repository name is the Project name GitHub accepts plus the head of the Project id', () => {
  const projectId = '3fa85f64-5717-4562-b3fc-2c963f66afa6'
  assert.equal(factoryRepositoryName('Contador de Visitas', projectId), 'contador-de-visitas-3fa85f64')
  assert.equal(factoryRepositoryName('  Orçamento / Cliente #2 ', projectId), 'orcamento-cliente-2-3fa85f64')
  assert.equal(factoryRepositoryName('../.git', projectId), 'git-3fa85f64')
  assert.equal(factoryRepositoryName('日本語', projectId), 'project-3fa85f64')
  assert.equal(factoryRepositoryName('a'.repeat(200), projectId), `${'a'.repeat(60)}-3fa85f64`)
})

test('provision creates a private repository in the organization, seeds the application template once, and binds the Project to that revision', async (t) => {
  const { connectionString, github, connect, provision, newProject } = await setup(t)
  await connect()
  const projectId = await newProject()
  const binding = await provision(projectId)
  const name = repositoryName(projectId)

  const creation = github.state.requests.find((request) => request.method === 'POST' && request.path.endsWith('/repos'))
  assert.deepEqual(creation && { path: creation.path, body: creation.body }, { path: '/orgs/acme-org/repos', body: { name, private: true, auto_init: true } })
  assert.equal(binding.repositorySlug, `acme-org/${name}`)
  assert.equal(binding.repositoryExternalId, 700001)
  assert.equal(binding.defaultBranch, 'main')
  assert.deepEqual(github.state.createdCommits, [{ slug: `acme-org/${name}`, sha: binding.headRevision, message: 'Start the Conexus application', parents: ['c'.repeat(40)] }])
  assert.equal(github.state.refs.get(`acme-org/${name}:main`), binding.headRevision)
  const seeded = github.state.commits.get(`acme-org/${name}@${binding.headRevision}`)
  assert.deepEqual([...seeded.keys()].sort(), ['README.md', 'app/index.html', 'app/src/main.tsx', 'app/src/style.css', 'conexus.json', 'conexus/check.sh'])
  for (const file of [...FIXED_APPLICATION_STARTER_FILES, ...APPLICATION_CHECK_FILES]) assert.equal(seeded.get(file.path).content, file.content)
  assert.equal(seeded.get('conexus/check.sh').mode, '100755')
  const headToken = github.state.tokens.find((token) => token.repositoryIds !== null)
  assert.deepEqual({ repositoryIds: headToken.repositoryIds, permissions: headToken.permissions }, { repositoryIds: [700001], permissions: { contents: 'read' } })
  const writeTokens = github.state.tokens.filter((token) => token.permissions?.contents === 'write')
  assert.deepEqual(writeTokens.map((token) => token.repositoryIds), [[700001]])

  const { bound_at: _boundAt, ...stored } = (await query(connectionString, 'SELECT * FROM builder.factory_binding')).rows[0]
  assert.deepEqual(stored, {
    project_id: projectId, factory_project_id: binding.factoryProjectId, project_repository_id: binding.projectRepositoryId, repository_id: binding.repositoryId,
  })
  const repositoryRow = (await query(connectionString, 'SELECT external_id, slug, default_branch FROM factory.source_control_repositories WHERE id::text = $1', [binding.repositoryId])).rows
  assert.deepEqual(repositoryRow, [{ external_id: '700001', slug: `acme-org/${name}`, default_branch: 'main' }])
  assert.equal((await query(connectionString, 'SELECT working_source_revision FROM builder.project_working_state WHERE project_id = $1', [projectId])).rows[0].working_source_revision, binding.headRevision)
  const link = (await query(connectionString, 'SELECT r.slug, r.external_id, p.name FROM factory.factory_project_repositories pr JOIN factory.source_control_repositories r ON r.id::text = pr.repository_id JOIN factory.factory_project_source_control_connections c ON c.id::text = pr.connection_id JOIN factory.factory_projects p ON p.id::text = c.factory_project_id')).rows
  assert.deepEqual(link, [{ slug: `acme-org/${name}`, external_id: '700001', name: `conexus-project:${projectId}` }])
})

test('a retry after a crash between creating the repository and recording the binding converges to one repository, one seed and one binding', async (t) => {
  const { github, app, connect, provision, prepareOnly, newProject, snapshot } = await setup(t)
  await connect()
  const createdOnly = await newProject()
  assert.notEqual(await app.createOrganizationRepository(163574754, 'acme-org', repositoryName(createdOnly)), null)
  const first = await provision(createdOnly)
  assert.equal(creations(github), 2, 'the retry asked once more and was told the name is taken')
  assert.equal(github.state.repositories.size, 1)

  const unbound = await newProject()
  const prepared = await prepareOnly(unbound)
  const bound = await provision(unbound)
  assert.deepEqual(bound, prepared)
  assert.equal(github.state.repositories.size, 2)
  assert.deepEqual(github.state.createdCommits.map((commit) => commit.sha), [first.headRevision, bound.headRevision])
  const before = await snapshot()
  assert.deepEqual(await provision(unbound), bound)
  assert.deepEqual(await snapshot(), before)
})

test('a GitHub refusal to create the repository leaves no Factory rows and no binding', async (t) => {
  const { github, connect, provision, newProject, snapshot } = await setup(t)
  await connect()
  const before = await snapshot()
  github.state.creationStatus = 403
  await assert.rejects(provision(await newProject()), { message: 'FACTORY_GITHUB_REQUEST_FAILED:403' })
  const after = await snapshot()
  assert.deepEqual({ ...after, working: [] }, { ...before, working: [] })
  assert.deepEqual(after.binding, [])
})

test('a personal-account installation recorded outside connect is refused before GitHub is asked for a repository', async (t) => {
  const { github, records, provision, newProject } = await setup(t)
  await records.sourceControl.installations.upsert({ orgId: ORG, connectedByUserId: 'conexus-operator', externalId: '1', accountName: 'leandro', accountType: 'User' })
  await assert.rejects(provision(await newProject()), /^Error: FACTORY_INSTALLATION_ORGANIZATION_REQUIRED/)
  assert.equal(creations(github), 0)
})

test('a taken name adopts the existing repository only when it is private and not bound to another Project', async (t) => {
  const { github, connect, provision, newProject } = await setup(t)
  await connect()
  const first = await newProject()
  const adopted = github.addRepository({ owner: 'acme-org', name: repositoryName(first), head: 'e'.repeat(40), files: { 'app/index.html': '<!doctype html>\n', 'conexus.json': '{}\n', 'conexus/check.sh': 'true\n' } })
  const binding = await provision(first)
  assert.deepEqual([binding.repositoryExternalId, binding.headRevision], [adopted.id, 'e'.repeat(40)], 'a repository that already has the template is not written')

  const second = await newProject()
  github.addRepository({ owner: 'acme-org', name: repositoryName(second), private: false })
  await assert.rejects(provision(second), { message: 'FACTORY_REPOSITORY_PUBLIC_REFUSED' })
  const sameHead = await newProject(`${first.slice(0, 8)}${randomUUID().slice(8)}`)
  await assert.rejects(provision(sameHead), { message: 'FACTORY_REPOSITORY_BOUND_ELSEWHERE' })
})

test('the project repository carries the setup command that keeps the check link out of Git, and a rerun restores it', async (t) => {
  const { connectionString, connect, provision, newProject } = await setup(t)
  await connect()
  const projectId = await newProject()
  const binding = await provision(projectId)
  const setupCommand = async () => (await query(connectionString, 'SELECT setup_command FROM factory.factory_project_repositories WHERE id::text = $1', [binding.projectRepositoryId])).rows[0].setup_command
  const expected = 'mkdir -p .git/info && { grep -qxF /app/node_modules .git/info/exclude 2>/dev/null || echo /app/node_modules >> .git/info/exclude; }'
  assert.equal(await setupCommand(), expected)
  await query(connectionString, 'UPDATE factory.factory_project_repositories SET setup_command = NULL WHERE id::text = $1', [binding.projectRepositoryId])
  assert.deepEqual(await provision(projectId), binding)
  assert.equal(await setupCommand(), expected)
})

test('a bound Project reaches its Factory project by the bound id, even after that project row is renamed', async (t) => {
  const { connectionString, connect, provision, newProject, snapshot } = await setup(t)
  await connect()
  const projectId = await newProject()
  const first = await provision(projectId)
  await query(connectionString, "UPDATE factory.factory_projects SET name = 'renamed by someone' WHERE id::text = $1", [first.factoryProjectId])
  const before = await snapshot()
  assert.deepEqual(await provision(projectId), first)
  assert.deepEqual(await snapshot(), before)
})

test('reconnecting as another installation of the organization keeps the binding, its repository row and its link', async (t) => {
  const { connectionString, github, connect, provision, newProject } = await setup(t)
  await connect()
  const projectId = await newProject()
  const first = await provision(projectId)
  github.state.installations = [INSTALLATION_B]
  await connect()
  const installations = (await query(connectionString, 'SELECT id::text, external_id FROM factory.source_control_installations')).rows
  assert.deepEqual(installations.map((row) => row.external_id), [String(INSTALLATION_B.id)])
  assert.deepEqual(await provision(projectId), first)
  const repositories = (await query(connectionString, 'SELECT id::text, installation_id, external_id FROM factory.source_control_repositories')).rows
  assert.deepEqual(repositories, [{ id: first.repositoryId, installation_id: installations[0].id, external_id: '700001' }])
  const connections = (await query(connectionString, 'SELECT installation_id FROM factory.factory_project_source_control_connections')).rows
  assert.deepEqual(connections, [{ installation_id: installations[0].id }])
  assert.equal(creations(github), 1, 'a bound Project never asks GitHub to create a repository')
})

test('reconnecting to an installation that already holds a row for the same repository keeps the binding, its link and its conversations', async (t) => {
  const { connectionString, github, records, connect, provision, newProject } = await setup(t)
  await connect()
  const projectId = await newProject()
  const first = await provision(projectId)
  const conversationId = randomUUID()
  await records.sourceControl.sessions.create({
    sessionId: conversationId, projectRepositoryId: first.projectRepositoryId, orgId: ORG, userId: 'conexus-operator',
    branch: `conexus/${conversationId}`, baseBranch: 'main', title: 'Contador', visibility: 'org',
  })
  const incoming = await records.sourceControl.installations.upsert({ orgId: ORG, connectedByUserId: 'conexus-operator', externalId: String(INSTALLATION_B.id), accountName: 'acme-org', accountType: 'Organization' })
  const duplicate = await records.sourceControl.repositories.upsert({ orgId: ORG, input: { installationId: incoming.id, externalId: String(first.repositoryExternalId), slug: first.repositorySlug, defaultBranch: 'main' } })
  assert.notEqual(duplicate.id, first.repositoryId)
  github.state.installations = [INSTALLATION_B]
  await connect()
  assert.deepEqual(await provision(projectId), first)
  const repositories = (await query(connectionString, 'SELECT id::text, installation_id FROM factory.source_control_repositories')).rows
  assert.deepEqual(repositories, [{ id: first.repositoryId, installation_id: incoming.id }])
  assert.equal((await records.sourceControl.sessions.getBySessionId(conversationId))?.projectRepositoryId, first.projectRepositoryId)
  const links = (await query(connectionString, 'SELECT pr.id::text, pr.repository_id, c.installation_id FROM factory.factory_project_repositories pr JOIN factory.factory_project_source_control_connections c ON c.id::text = pr.connection_id')).rows
  assert.deepEqual(links, [{ id: first.projectRepositoryId, repository_id: first.repositoryId, installation_id: incoming.id }])
})

test('an installation the Factory pruned before reconnect still rebinds the Project by its GitHub id', async (t) => {
  const { connectionString, github, records, connect, provision, newProject } = await setup(t)
  await connect()
  const projectId = await newProject()
  const first = await provision(projectId)
  const [stale] = await records.sourceControl.installations.list({ orgId: ORG })
  assert.equal(await records.sourceControl.installations.delete({ orgId: ORG, id: stale.id }), true)
  github.state.installations = [INSTALLATION_B]
  await connect()
  assert.deepEqual(await provision(projectId), first)
  const [live] = await records.sourceControl.installations.list({ orgId: ORG })
  const repositories = (await query(connectionString, 'SELECT id::text, installation_id FROM factory.source_control_repositories')).rows
  assert.deepEqual(repositories, [{ id: first.repositoryId, installation_id: live.id }])
  assert.equal(creations(github), 1)
})

test('a bound Project whose repository is gone or replaced under its name is refused, never given a new one', async (t) => {
  const { github, connect, provision, newProject } = await setup(t)
  await connect()
  const projectId = await newProject()
  await provision(projectId)
  github.state.repositories.delete(`acme-org/${repositoryName(projectId)}`)
  await assert.rejects(provision(projectId), { message: 'FACTORY_REPOSITORY_MISSING' })
  github.addRepository({ owner: 'acme-org', name: repositoryName(projectId) })
  await assert.rejects(provision(projectId), { message: 'FACTORY_REPOSITORY_IDENTITY_CHANGED' })
  assert.equal(creations(github), 1)
})

test('reconnect refuses to move repositories to an installation on another GitHub account', async (t) => {
  const { connectionString, github, connect, provision, newProject } = await setup(t)
  await connect()
  await provision(await newProject())
  github.state.installations = [{ id: 208000002, account: { login: 'other-org', type: 'Organization' } }]
  await assert.rejects(connect(), /^Error: FACTORY_INSTALLATION_ACCOUNT_CHANGED/)
  const repositories = (await query(connectionString, 'SELECT i.external_id FROM factory.source_control_repositories r JOIN factory.source_control_installations i ON i.id::text = r.installation_id')).rows
  assert.deepEqual(repositories, [{ external_id: '163574754' }])
})

test('a second full run of connect and provision changes nothing', async (t) => {
  const { connect, provision, newProject, snapshot } = await setup(t)
  const projectId = await newProject()
  await connect()
  const first = await provision(projectId)
  const before = await snapshot()
  await connect()
  const second = await provision(projectId)
  assert.deepEqual(second, first)
  assert.deepEqual(await snapshot(), before)
})
