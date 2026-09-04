import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const fixturePath = resolve(repositoryRoot, 'tests/fixtures/r1-s4-baseline-candidate.sql')

const compileHub = (t) => {
  const build = mkdtempSync(resolve(repositoryRoot, 'apps/hub/r1-s4-reentry-build-'))
  t.after(() => rmSync(build, { recursive: true, force: true }))
  const compiled = spawnSync(process.execPath, [
    resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'), '--project',
    resolve(repositoryRoot, 'apps/hub/tsconfig.json'), '--noEmit', 'false', '--outDir', build,
  ], { encoding: 'utf8' })
  assert.equal(compiled.status, 0, `${compiled.stdout}\n${compiled.stderr}`)
  return (path) => pathToFileURL(resolve(build, path)).href
}

test('S4-P1 fixture is qualification-only and computes immutable canonical digest', () => {
  assert.equal(existsSync(fixturePath), true)
  const fixture = readFileSync(fixturePath, 'utf8')
  assert.match(fixture, /CREATE FUNCTION project\.inject_baseline_candidate/)
  assert.match(fixture, /digest\(convert_to\(canonical_candidate/)
  assert.match(fixture, /ON CONFLICT \(project_id, candidate_digest\) DO NOTHING/)
  assert.doesNotMatch(fixture, /GRANT EXECUTE/)
})

test('S4-P1 store performs one read-only PRJ-23 admission and maps exact server truth', async (t) => {
  const built = compileHub(t)
  const { createProjectStore } = await import(built('project/store.js'))
  const statements = []
  const baselineReadPool = { connect: async () => ({
    async query(statement, values = []) {
      statements.push({ statement, values })
      if (statement.includes('get_baseline_candidate')) return { rows: [{
        candidate_baseline_digest: 'a'.repeat(64), source_revision: 'revision-a',
        source_text: 'Exact candidate', application_runtime_profile: 'MANAGED',
      }] }
      return { rows: [] }
    },
    release() {},
  }) }
  const store = createProjectStore({
    commandPool: { connect: async () => { throw new Error('COMMAND_NOT_ADMITTED') } },
    baselineReadPool,
    git: {}, recovery: {},
  })
  assert.deepEqual(await store.getBaselineCandidate({
    accountId: '10000000-0000-4000-8000-000000000081',
    projectId: '30000000-0000-4000-8000-000000000081',
    candidateBaselineDigest: 'a'.repeat(64),
  }), {
    candidateBaselineDigest: 'a'.repeat(64), sourceRevision: 'revision-a',
    sourceText: 'Exact candidate', applicationRuntimeProfile: 'MANAGED',
  })
  assert.equal(statements[0].statement, 'BEGIN READ ONLY')
  assert.match(statements[1].statement, /iam\.admit_project_manage/)
  assert.match(statements[1].statement, /project\.get_baseline_candidate/)
  assert.equal(statements[2].statement, 'COMMIT')
})

test('S4-P1 HTTP registers PRJ-23 with authentication and non-oracular miss', async (t) => {
  const built = compileHub(t)
  const { createHttpApp } = await import(built('http/app.js'))
  const { registerProjectRoutes } = await import(built('project/routes.js'))
  let authenticated = true
  let disclosed = true
  const app = await createHttpApp({ staticRoot: null, registerRoutes: (server) => registerProjectRoutes(server, {
    origin: 'https://conexus.test',
    resolveCurrentSession: async () => authenticated ? { account: { accountId: 'account-81' } } : null,
    store: {
      listProjects: async () => [], getProject: async () => null,
      createProject: async () => { throw new Error('NOT_USED') },
      getBaselineCandidate: async () => disclosed ? {
        candidateBaselineDigest: 'a'.repeat(64), sourceRevision: 'revision-a',
        sourceText: 'Exact candidate', applicationRuntimeProfile: 'MANAGED',
      } : null,
    },
  }) })
  t.after(() => app.close())
  const url = `/api/control/projects/project-81/baseline-candidates/${'a'.repeat(64)}`
  assert.equal((await app.inject({ method: 'GET', url })).statusCode, 200)
  disclosed = false
  assert.equal((await app.inject({ method: 'GET', url })).statusCode, 404)
  authenticated = false
  assert.equal((await app.inject({ method: 'GET', url })).statusCode, 401)
})
