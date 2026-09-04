import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const migrationPath = resolve(repositoryRoot, 'apps/hub/migrations/007_project_read_disclosure.sql')
const generatedRoutePath = resolve(repositoryRoot, 'apps/hub/src/generated/s3-routes.ts')
const generatedClientPath = resolve(repositoryRoot, 'apps/web/src/generated/project-client.ts')

const compileHub = (t) => {
  const build = mkdtempSync(resolve(repositoryRoot, 'apps/hub/r1-s3-project-disclosure-build-'))
  t.after(() => rmSync(build, { recursive: true, force: true }))
  const compiled = spawnSync(process.execPath, [
    resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'),
    '--project', resolve(repositoryRoot, 'apps/hub/tsconfig.json'),
    '--noEmit', 'false', '--outDir', build,
  ], { encoding: 'utf8' })
  assert.equal(compiled.status, 0, `${compiled.stdout}\n${compiled.stderr}`)
  return (path) => pathToFileURL(resolve(build, path)).href
}

test('S3-P6 migration freezes direct project.read admission behind one execute-only role', () => {
  assert.equal(existsSync(migrationPath), true)
  const source = readFileSync(migrationPath, 'utf8')
  assert.match(source, /CREATE ROLE hub_s3_read LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS/)
  assert.match(source, /iam\.list_workspace_readable_project_ids/)
  assert.match(source, /iam\.admit_project_read/)
  assert.match(source, /project\.list_project_summaries/)
  assert.match(source, /project\.get_project_representation/)
  assert.match(source, /membership\.account_id = p_account_id/)
  assert.match(source, /project_grant\.can_read/)
  assert.match(source, /REVOKE ALL ON ALL TABLES IN SCHEMA project FROM hub_s3_read/)
  assert.doesNotMatch(source, /workspace_access_manage|can_manage/)
})

test('S3-P6 closed routes remain projected beside the bounded S4 extensions', () => {
  assert.equal(existsSync(generatedRoutePath), true)
  assert.equal(existsSync(generatedClientPath), true)
  const routes = readFileSync(generatedRoutePath, 'utf8')
  const client = readFileSync(generatedClientPath, 'utf8')
  assert.match(routes, /export type S3OwnerId = 'PRJ-01' \| 'PRJ-02' \| 'PRJ-03' \| 'PRJ-08' \| 'PRJ-09' \| 'PRJ-23'/)
  assert.match(routes, /ListProjects/)
  assert.match(routes, /GetProject/)
  assert.match(routes, /CreateProject/)
  assert.match(client, /credentials: 'same-origin'/)
  assert.match(client, /listProjects/)
  assert.match(client, /getProject/)
  assert.match(client, /createProject/)
})

test('S3-P6 store composes read-only current admission before Project disclosure', async (t) => {
  const built = compileHub(t)
  const { createProjectStore } = await import(built('project/store.js'))
  const statements = []
  const readClient = {
    async query(statement, values = []) {
      statements.push({ statement, values })
      if (statement.includes('list_project_summaries')) return { rows: [{
        project_id: '30000000-0000-4000-8000-000000000071',
        workspace_id: '20000000-0000-4000-8000-000000000071',
        name: 'Visible Project',
        archived: false,
      }] }
      if (statement.includes('get_project_representation')) return { rows: [{
        project_id: '30000000-0000-4000-8000-000000000071',
        workspace_id: '20000000-0000-4000-8000-000000000071',
        name: 'Visible Project',
        project_revision: '50000000-0000-4000-8000-000000000071',
        archived: false,
      }] }
      return { rows: [] }
    },
    release() {},
  }
  const store = createProjectStore({
    commandPool: { connect: async () => { throw new Error('COMMAND_POOL_NOT_ADMITTED_FOR_READ') } },
    readPool: { connect: async () => readClient },
    git: {},
    recovery: {},
  })
  assert.deepEqual(await store.listProjects({
    accountId: '10000000-0000-4000-8000-000000000071',
    workspaceId: '20000000-0000-4000-8000-000000000071',
  }), [{
    projectId: '30000000-0000-4000-8000-000000000071',
    workspaceId: '20000000-0000-4000-8000-000000000071',
    name: 'Visible Project',
    archived: false,
  }])
  assert.equal((await store.getProject({
    accountId: '10000000-0000-4000-8000-000000000071',
    projectId: '30000000-0000-4000-8000-000000000071',
  }))?.projectRevision, '50000000-0000-4000-8000-000000000071')
  assert.equal(statements.filter(({ statement }) => statement === 'BEGIN READ ONLY').length, 2)
  assert.equal(statements.filter(({ statement }) => statement === 'COMMIT').length, 2)
  assert.equal(statements.some(({ statement }) => statement.includes('list_workspace_readable_project_ids')), true)
  assert.equal(statements.some(({ statement }) => statement.includes('admit_project_read')), true)
})

test('S3-P6 HTTP reads separate authentication, empty list, exact detail and non-disclosure', async (t) => {
  const built = compileHub(t)
  const { createHttpApp } = await import(built('http/app.js'))
  const { registerProjectRoutes } = await import(built('project/routes.js'))
  const summary = {
    projectId: '30000000-0000-4000-8000-000000000072',
    workspaceId: '20000000-0000-4000-8000-000000000072',
    name: 'Disclosed Project',
    archived: false,
  }
  let authenticated = true
  let disclose = true
  const app = await createHttpApp({
    staticRoot: null,
    registerRoutes: (server) => registerProjectRoutes(server, {
      origin: 'https://conexus.test',
      resolveCurrentSession: async () => authenticated ? { account: { accountId: 'account-72' } } : null,
      store: {
        listProjects: async () => disclose ? [summary] : [],
        getProject: async () => disclose ? { ...summary, projectRevision: 'revision-72' } : null,
        createProject: async () => { throw new Error('COMMAND_NOT_IN_READ_PROOF') },
      },
    }),
  })
  t.after(() => app.close())

  const list = () => app.inject({ method: 'GET', url: `/api/control/workspaces/${summary.workspaceId}/projects` })
  const detail = () => app.inject({ method: 'GET', url: `/api/control/projects/${summary.projectId}` })
  assert.deepEqual((await list()).json(), [summary])
  assert.deepEqual((await detail()).json(), { ...summary, projectRevision: 'revision-72' })
  disclose = false
  assert.deepEqual((await list()).json(), [])
  assert.equal((await detail()).statusCode, 404)
  authenticated = false
  assert.equal((await list()).statusCode, 401)
  assert.equal((await detail()).statusCode, 401)
})
