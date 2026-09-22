import assert from 'node:assert/strict'
import { generateKeyPairSync, randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { startFakeGithub } from './builder-factory-fake-github.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const hubBuild = mkdtempSync(resolve(repositoryRoot, 'apps/hub/builder-repository-routes-build-'))
process.once('exit', () => rmSync(hubBuild, { recursive: true, force: true }))
const compiled = spawnSync(process.execPath, [
  resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'),
  '--project', resolve(repositoryRoot, 'apps/hub/tsconfig.json'),
  '--noEmit', 'false', '--outDir', hubBuild,
], { encoding: 'utf8' })
if (compiled.status !== 0) throw new Error(`HUB_COMPILE_FAILED\n${compiled.stdout}\n${compiled.stderr}`)
const built = (path) => pathToFileURL(resolve(hubBuild, path)).href
const { createGithubApp } = await import(built('builder/factory-github.js'))
const { createProjectRepositoryPort } = await import(built('builder/repository-routes.js'))
const { createHttpApp } = await import(built('http/app.js'))
const { registerProjectRepositoryRoutes } = await import(built('builder/repository-routes.js'))

const privateKeyPem = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs1', format: 'pem' })
const INSTALLATION_ID = 163574754
const accountId = randomUUID()
const boundProjectId = randomUUID()
const unboundProjectId = randomUUID()
const staleProjectId = randomUUID()
const deniedProjectId = randomUUID()

const setup = async (t) => {
  const github = await startFakeGithub({ installations: [{ id: INSTALLATION_ID, account: { login: 'acme-org', type: 'Organization' } }] })
  t.after(() => github.close())
  const repository = github.addRepository({ owner: 'acme-org', name: 'widgets' })
  const app = createGithubApp({ appId: '5015512', privateKey: privateKeyPem, baseUrl: github.baseUrl })
  const bindings = new Map([
    [boundProjectId, { projectId: boundProjectId, factoryProjectId: 'factory-1', projectRepositoryId: 'project-repository-1', repositoryId: 'repository-1', boundAt: new Date().toISOString() }],
    // Bound, but the Factory row resolveRepository would read for it is gone: an outage the route
    // must answer 503 for, not UNREACHABLE (that state is reserved for a GitHub-confirmed refusal).
    [staleProjectId, { projectId: staleProjectId, factoryProjectId: 'factory-2', projectRepositoryId: 'project-repository-2', repositoryId: 'repository-2', boundAt: new Date().toISOString() }],
  ])
  const readFactoryBinding = async ({ accountId: caller, projectId }) => {
    if (projectId === deniedProjectId) throw new Error('NOT_AUTHORIZED')
    return bindings.get(projectId) ?? null
  }
  const resolveRepository = async (binding) => {
    if (binding.projectId === staleProjectId) throw new Error('BUILDER_FACTORY_UNAVAILABLE')
    return { installation: INSTALLATION_ID, externalId: repository.id, slug: repository.fullName, defaultBranch: repository.defaultBranch }
  }
  const port = createProjectRepositoryPort({ readFactoryBinding, resolveRepository, github: app })
  return { github, repository, port, readFactoryBinding }
}

test('the repository port answers REACHABLE for a bound repository GitHub still serves', async (t) => {
  const { port, repository } = await setup(t)
  const answer = await port.read({ accountId, projectId: boundProjectId })
  assert.deepEqual(answer, { state: 'REACHABLE', fullName: repository.fullName, url: `https://github.com/${repository.fullName}` })
})

test('the repository port answers UNREACHABLE for no binding and for a GitHub 404/403', async (t) => {
  const { port, github, repository } = await setup(t)
  assert.deepEqual(await port.read({ accountId, projectId: unboundProjectId }), { state: 'UNREACHABLE' })

  github.state.repositories.delete(repository.fullName)
  assert.deepEqual(await port.read({ accountId, projectId: boundProjectId }), { state: 'UNREACHABLE' })
})

test('the repository port throws for a resolvable binding GitHub cannot be reached about, and the route answers 503', async (t) => {
  const { port } = await setup(t)
  await assert.rejects(port.read({ accountId, projectId: staleProjectId }))

  const app = await createHttpApp({
    staticRoot: null,
    registerRoutes: (server) => registerProjectRepositoryRoutes(server, {
      resolveCurrentSession: async () => ({ account: { accountId } }),
      repository: port,
    }),
  })
  t.after(() => app.close())
  const response = await app.inject({ method: 'GET', url: `/api/control/projects/${staleProjectId}/repository` })
  assert.equal(response.statusCode, 503)
  assert.equal(response.json().type.endsWith('repository-state-unavailable'), true)
})

test('the repository port propagates the Project authority denial for the route to answer 403', async (t) => {
  const { port } = await setup(t)
  await assert.rejects(port.read({ accountId, projectId: deniedProjectId }), /NOT_AUTHORIZED/)
})
