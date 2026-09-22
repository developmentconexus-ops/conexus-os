import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { refuseProtectedCluster } from './protected-cluster.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const identityPath = resolve(repositoryRoot, 'apps/hub/src/project/identity.ts')
const generatedRoutePath = resolve(repositoryRoot, 'apps/hub/src/generated/s3-routes.ts')

const compileHub = (t) => {
  const build = mkdtempSync(resolve(repositoryRoot, 'apps/hub/r1-s3-project-build-'))
  t.after(() => rmSync(build, { recursive: true, force: true }))
  const compiled = spawnSync(process.execPath, [
    resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'),
    '--project', resolve(repositoryRoot, 'apps/hub/tsconfig.json'),
    '--noEmit', 'false', '--outDir', build,
  ], { encoding: 'utf8' })
  assert.equal(compiled.status, 0, `${compiled.stdout}\n${compiled.stderr}`)
  return (path) => pathToFileURL(resolve(build, path)).href
}

test('S3-P5 centralizes one Project identity law for UUID versions 1 through 8', async (t) => {
  await refuseProtectedCluster()
  assert.equal(existsSync(identityPath), true)

  const built = compileHub(t)
  const { isProjectIdentity } = await import(built('project/identity.js'))
  for (let version = 1; version <= 8; version += 1) {
    assert.equal(isProjectIdentity(`30000000-0000-${version}000-8000-000000000051`), true)
  }
  assert.equal(isProjectIdentity('30000000-0000-9000-8000-000000000051'), false)
  assert.equal(isProjectIdentity('../project'), false)
})

test('S3-P5 preserves generated PRJ-03 inside the bounded S3 projection', () => {
  assert.equal(existsSync(generatedRoutePath), true)
  const source = readFileSync(generatedRoutePath, 'utf8')
  assert.match(source, /export type S3OwnerId = 'PRJ-01' \| 'PRJ-02' \| 'PRJ-03'/)
  assert.match(source, /CreateProject/)
  assert.match(source, /\/api\/control\/workspaces\/:workspaceId\/projects/)
  assert.doesNotMatch(source, /workspace-client/)
})

test('S3-P5 store prepares the repository after the reservation and creates the Project bound to it in one transaction', async (t) => {
  const built = compileHub(t)
  const { createProjectStore } = await import(built('project/store.js'))
  const projectId = '30000000-0000-8000-8000-000000000061'
  const projectRevision = '50000000-0000-8000-8000-000000000061'
  const reservationState = 'RESERVED'
  const settlementFailure = null
  const statements = []
  const client = {
    async query(statement, values = []) {
      statements.push({ statement, values })
      if (statement.includes('reserve_or_replay_create_project')) {
        return { rows: [{ state: reservationState, project_id: projectId, response_status: null, response_body: null }] }
      }
      if (statement.includes('lock_create_project_receipt')) return { rows: [{ outcome: 'RESERVED', project_id: projectId }] }
      if (settlementFailure && statement.includes('create_project_with_repository')) throw settlementFailure
      return { rows: [] }
    },
    release() {},
  }
  const binding = {
    projectId, factoryProjectId: 'factory-project-61', projectRepositoryId: 'project-repository-61', repositoryId: 'repository-61',
    repositoryExternalId: 700061, repositorySlug: 'acme-org/project-p5-30000000', defaultBranch: 'main', headRevision: '1'.repeat(40),
  }
  const prepared = []
  const identities = [projectId, projectRevision]
  const store = createProjectStore({
    commandPool: { connect: async () => client },
    repository: { prepare: async (input) => { prepared.push({ input, statementsBefore: statements.length }); return binding } },
    mintIdentity: () => identities.shift(),
  })
  assert.deepEqual(await store.createProject({
    accountId: '10000000-0000-4000-8000-000000000061',
    workspaceId: '20000000-0000-4000-8000-000000000061',
    idempotencyKey: 'p5-key',
    body: { name: 'Project P5', sourceBootstrap: { mode: 'NEW' } },
  }), {
    projectId,
    workspaceId: '20000000-0000-4000-8000-000000000061',
    name: 'Project P5',
    projectRevision,
    archived: false,
    replayed: false,
  })
  assert.deepEqual(prepared.map(({ input }) => input), [{ projectId, projectName: 'Project P5' }])
  assert.deepEqual(statements.slice(0, prepared[0].statementsBefore).map(({ statement }) => statement.trim().split('(')[0]), [
    'BEGIN', 'SELECT * FROM project.reserve_or_replay_create_project', 'COMMIT',
  ])
  const created = statements.find(({ statement }) => statement.includes('create_project_with_repository'))
  assert.deepEqual(created.values, [
    '10000000-0000-4000-8000-000000000061', '20000000-0000-4000-8000-000000000061', created.values[2], created.values[3], projectId,
    'Project P5', projectRevision, 'factory-project-61', 'project-repository-61', 'repository-61', '1'.repeat(40),
  ])
  assert.equal(statements.some(({ statement }) => statement.includes('create_project_with_source')), false)
  // Creating a Project no longer manufactures a grant: membership in the Workspace is the whole
  // of the creator's access.
  assert.equal(statements.some(({ statement }) => statement.includes('iam.')), false)
  assert.equal(statements.some(({ statement }) => statement.includes('complete_create_project_receipt')), true)
  assert.equal(statements.filter(({ statement }) => statement === 'COMMIT').length, 2)
})

test('S3-P5 command failure matrix never reaches a false terminal receipt', async (t) => {
  const built = compileHub(t)
  const { createProjectStore } = await import(built('project/store.js'))
  const projectId = '30000000-0000-8000-8000-000000000065'
  const projectRevision = '50000000-0000-8000-8000-000000000065'
  const input = {
    accountId: '10000000-0000-4000-8000-000000000065',
    workspaceId: '20000000-0000-4000-8000-000000000065',
    idempotencyKey: 'failure-key',
    body: { name: 'Failure Matrix', sourceBootstrap: { mode: 'NEW' } },
  }
  const binding = {
    projectId, factoryProjectId: 'factory-project-65', projectRepositoryId: 'project-repository-65', repositoryId: 'repository-65',
    repositoryExternalId: 700065, repositorySlug: 'acme-org/failure-matrix-30000000', defaultBranch: 'main', headRevision: '1'.repeat(40),
  }
  const scenario = async ({ reservationState = 'RESERVED', prepare = async () => binding, settlementFailure = null, body = input.body }, expected) => {
    const statements = []
    const client = {
      async query(statement, values = []) {
        statements.push({ statement, values })
        if (statement.includes('reserve_or_replay_create_project')) {
          return { rows: [{ state: reservationState, project_id: projectId, response_status: null, response_body: null }] }
        }
        if (statement.includes('lock_create_project_receipt')) return { rows: [{ outcome: 'RESERVED', project_id: projectId }] }
        if (settlementFailure && statement.includes('create_project_with_repository')) throw settlementFailure
        return { rows: [] }
      },
      release() {},
    }
    const identities = [projectId, projectRevision]
    const store = createProjectStore({
      commandPool: { connect: async () => client },
      repository: { prepare },
      mintIdentity: () => identities.shift(),
    })
    await assert.rejects(store.createProject({ ...input, body }), expected)
    assert.equal(statements.some(({ statement }) => statement.includes('complete_create_project_receipt')), false)
    return statements.map(({ statement }) => statement)
  }

  await scenario({ reservationState: 'CONFLICT' }, { code: 'IDEMPOTENCY_CONFLICT' })
  const imported = await scenario({ body: { name: 'Imported', sourceBootstrap: { mode: 'EXISTING_GIT', repositoryLocator: 'https://example.test/app.git' } } }, { code: 'SOURCE_INPUT_REFUSED' })
  assert.deepEqual(imported, [])
  await scenario({ prepare: async () => { throw new Error('FACTORY_GITHUB_REQUEST_FAILED:502') } }, { code: 'REPOSITORY_REFUSED', reason: 'FACTORY_GITHUB_REQUEST_FAILED:502' })
  await scenario({ prepare: async () => { throw new Error('FACTORY_INSTALLATION_ORGANIZATION_REQUIRED: GitHub does not let an App create repositories in a personal account.') } }, { code: 'REPOSITORY_REFUSED', reason: 'FACTORY_INSTALLATION_ORGANIZATION_REQUIRED' })
  await scenario({ prepare: async () => { throw new Error('connect ECONNREFUSED 10.0.0.1:443 token=ghs_secret') } }, { code: 'REPOSITORY_REFUSED', reason: 'FACTORY_REPOSITORY_FAILED' })
  await scenario({ prepare: async () => ({ ...binding, projectId: '30000000-0000-8000-8000-000000000066' }) }, { code: 'OUTCOME_UNKNOWN' })
  const bound = await scenario({ settlementFailure: new Error('FACTORY_BINDING_REPOSITORY_BOUND') }, { code: 'REPOSITORY_REFUSED', reason: 'FACTORY_BINDING_REPOSITORY_BOUND' })
  assert.equal(bound.includes('ROLLBACK'), true)
  const settlement = await scenario({ settlementFailure: new Error('SYNTHETIC_SETTLEMENT_FAILURE') }, /SYNTHETIC_SETTLEMENT_FAILURE/)
  assert.equal(settlement.includes('ROLLBACK'), true)
})

test('S3-P5 generated HTTP route enforces authenticity/session and returns only terminal representation', async (t) => {
  const built = compileHub(t)
  const { createHttpApp } = await import(built('http/app.js'))
  const { registerProjectRoutes } = await import(built('project/routes.js'))
  const { ProjectError } = await import(built('project/errors.js'))
  const response = {
    projectId: '30000000-0000-8000-8000-000000000063',
    workspaceId: '20000000-0000-4000-8000-000000000063',
    name: 'HTTP Project',
    projectRevision: '50000000-0000-8000-8000-000000000063',
    archived: false,
    replayed: false,
  }
  let authenticated = true
  let refusal = null
  const app = await createHttpApp({
    staticRoot: null,
    registerRoutes: (server) => registerProjectRoutes(server, {
      origin: 'https://conexus.test',
      resolveCurrentSession: async () => authenticated ? { account: { accountId: 'account-63' } } : null,
      store: { createProject: async () => { if (refusal) throw refusal; return response } },
    }),
  })
  t.after(() => app.close())
  const request = (overrides = {}) => app.inject({
    method: 'POST',
    url: '/api/control/workspaces/20000000-0000-4000-8000-000000000063/projects',
    headers: {
      origin: 'https://conexus.test',
      cookie: '__Host-conexus_csrf=token',
      'x-conexus-csrf': 'token',
      'idempotency-key': 'http-key',
      'content-type': 'application/json',
      ...overrides.headers,
    },
    payload: overrides.payload ?? { name: 'HTTP Project', sourceBootstrap: { mode: 'NEW' } },
  })
  const success = await request()
  assert.equal(success.statusCode, 201)
  assert.deepEqual(success.json(), Object.fromEntries(Object.entries(response).filter(([key]) => key !== 'replayed')))
  const forged = await request({ headers: { origin: 'https://forged.test' } })
  assert.equal(forged.statusCode, 403)
  authenticated = false
  const anonymous = await request()
  assert.equal(anonymous.statusCode, 401)
  authenticated = true
  const malformed = await request({ payload: { name: 'Missing source' } })
  assert.equal(malformed.statusCode, 400)
  refusal = new ProjectError('REPOSITORY_REFUSED', 'FACTORY_INSTALLATION_ORGANIZATION_REQUIRED')
  const refused = await request()
  assert.deepEqual([refused.statusCode, refused.json()], [503, {
    type: 'urn:conexus:problem:project-repository-unavailable', title: 'Project repository unavailable', status: 503, detail: 'FACTORY_INSTALLATION_ORGANIZATION_REQUIRED',
  }])
})

