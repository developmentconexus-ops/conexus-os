import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const migration = readFileSync(resolve(repositoryRoot, 'apps/hub/migrations/011_r2_brain_connections.sql'), 'utf8')
const hubBuild = mkdtempSync(resolve(repositoryRoot, 'apps/hub/r2-p2-brain-build-'))
process.once('exit', () => rmSync(hubBuild, { recursive: true, force: true }))
const compiled = spawnSync(process.execPath, [
  resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'),
  '--project', resolve(repositoryRoot, 'apps/hub/tsconfig.json'),
  '--noEmit', 'false', '--outDir', hubBuild,
], { encoding: 'utf8' })
if (compiled.status !== 0) throw new Error(`R2_P2_HUB_COMPILE_FAILED\n${compiled.stdout}\n${compiled.stderr}`)

const built = (path) => pathToFileURL(resolve(hubBuild, path)).href
const { createBrainModule } = await import(built('brain/module.js'))
const { createBrainStore } = await import(built('brain/store.js'))
const { createHttpApp } = await import(built('http/app.js'))
const { readHubConfig } = await import(built('platform/config.js'))
const { createRegistryStore } = await import(built('registry/module.js'))

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111'
const WORKSPACE_ID = '22222222-2222-4222-8222-222222222222'
const REVISION_ID = '33333333-3333-4333-8333-333333333333'
const PROJECT_ID = '44444444-4444-4444-8444-444444444444'
const BRAIN_DIGEST = 'a'.repeat(64)
const HEALTH_DIGEST = 'b'.repeat(64)
const SOURCE_REVISION = 'c'.repeat(40)
const CURRENT = Object.freeze({ account: Object.freeze({ accountId: ACCOUNT_ID }) })
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

const knowledgeBrowse = Object.freeze({
  domains: [Object.freeze({
    domainRef: 'finance',
    label: 'Finance',
    concepts: [Object.freeze({
      conceptRef: 'finance.budget',
      label: 'Budget',
      summary: 'Synthetic budget meaning.',
      contentClasses: ['SEMANTIC', 'KNOWLEDGE'],
      sections: [
        Object.freeze({ kind: 'DEFINITION', text: 'A synthetic approved spending envelope.' }),
        Object.freeze({ kind: 'VERIFICATION', text: 'Compare synthetic planned and actual values.' }),
      ],
      provenanceRefs: ['synthetic://brain/finance/budget'],
    })],
  })],
})
const registryPayload = Object.freeze({
  schemaVersion: 'conexus-brain/v1',
  reviewText: 'Synthetic canonical Workspace Brain revision.',
  knowledgeBrowse,
})
const healthItems = Object.freeze([
  Object.freeze({ semanticRef: 'finance.valid', state: 'VALID', critical: true }),
  Object.freeze({ semanticRef: 'finance.unverified', state: 'UNVERIFIED', critical: false }),
  Object.freeze({ semanticRef: 'finance.suspect', state: 'SUSPECT', critical: true }),
  Object.freeze({ semanticRef: 'finance.invalid', state: 'INVALID', critical: true }),
  Object.freeze({ semanticRef: 'finance.check-error', state: 'CHECK_ERROR', critical: false }),
])

const revisionRow = (payload = registryPayload) => ({
  brain_revision_id: REVISION_ID,
  brain_digest: BRAIN_DIGEST,
  source_revision: SOURCE_REVISION,
  availability: 'AVAILABLE',
  payload,
})

// This is intentionally a local DB-boundary control. It proves production
// module behavior and query ordering only; it cannot satisfy the P2 claim that
// requires the exact real PostgreSQL service and independently bootstrapped Git.
const localPostgresControl = ({
  admitted = true,
  membershipPresent = true,
  workspacePresent = true,
  revisionPresent = true,
  payload = registryPayload,
  healthRows = [{
    brain_revision_id: REVISION_ID,
    brain_digest: BRAIN_DIGEST,
    health_snapshot_digest: HEALTH_DIGEST,
    items: healthItems,
  }],
  selectionPresent = true,
  selectionScopeExists = true,
  selectionPermitted = true,
  failWhen = () => false,
} = {}) => {
  const calls = []
  let ends = 0
  const client = {
    async query(statement, values = []) {
      const sql = String(statement).trim()
      calls.push({ sql, values })
      if (failWhen(sql, values)) throw new Error('LOCAL_POSTGRES_CONTROL_FAILURE')
      if (sql === 'BEGIN READ ONLY' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] }
      if (sql.includes('iam.admit_brain_revision_selection')) {
        if (!UUID.test(String(values[0])) || !UUID.test(String(values[1])) || !UUID.test(String(values[2]))) {
          throw Object.assign(new Error('invalid uuid'), { code: '22P02' })
        }
        return { rows: selectionPresent ? [{
          project_id: PROJECT_ID,
          workspace_id: WORKSPACE_ID,
          scope_exists: selectionScopeExists,
          permitted: selectionPermitted,
        }] : [] }
      }
      if (sql.includes('iam.admit_brain_read')) {
        if (!UUID.test(String(values[0])) || !UUID.test(String(values[1]))) {
          throw Object.assign(new Error('invalid uuid'), { code: '22P02' })
        }
        return { rows: membershipPresent ? [{ workspace_id: WORKSPACE_ID, can_read_brain: admitted }] : [] }
      }
      if (sql.includes('reg.get_workspace_brain')) return { rows: workspacePresent ? [{
        workspace_id: WORKSPACE_ID,
        published_brain_revision_id: REVISION_ID,
      }] : [] }
      if (sql.includes('reg.list_brain_revisions')) return { rows: revisionPresent ? [revisionRow(payload)] : [] }
      if (sql.includes('reg.get_brain_revision')) {
        if (!UUID.test(String(values[1]))) throw Object.assign(new Error('invalid uuid'), { code: '22P02' })
        return { rows: revisionPresent ? [revisionRow(payload)] : [] }
      }
      if (sql.includes('brn.get_brain_health')) return { rows: healthRows }
      throw new Error(`UNEXPECTED_LOCAL_POSTGRES_CONTROL_QUERY:${sql}`)
    },
    release() { calls.push({ sql: 'RELEASE', values: [] }) },
  }
  return {
    calls,
    get ends() { return ends },
    pool: {
      connect: async () => client,
      end: async () => { ends += 1 },
    },
  }
}

const createLocalControlApp = async (t, {
  control = localPostgresControl(),
  resolveCurrentSession = async () => CURRENT,
} = {}) => {
  const brain = createBrainModule({
    pool: control.pool,
    registry: createRegistryStore(),
    resolveCurrentSession,
  })
  const app = await createHttpApp({
    staticRoot: null,
    registerRoutes: (server) => brain.registerBrainRoutes(server),
  })
  t.after(async () => {
    await app.close()
    await brain.close()
  })
  return { app, brain, control }
}

const brainUrls = Object.freeze([
  `/api/control/workspaces/${WORKSPACE_ID}/brain`,
  `/api/control/workspaces/${WORKSPACE_ID}/brain/revisions`,
  `/api/control/workspaces/${WORKSPACE_ID}/brain/revisions/${REVISION_ID}`,
  `/api/control/workspaces/${WORKSPACE_ID}/brain/health`,
])

test('R2-P2 materializes explicit brain.read and immutable published revision custody', () => {
  assert.match(migration, /can_read_brain boolean NOT NULL DEFAULT false/)
  assert.match(migration, /iam\.admit_brain_read/)
  assert.match(migration, /hub_r2_brain_read/)
  assert.match(migration, /published_revision_id uuid/)
  assert.match(migration, /artifact_published_revision_fkey/)
  assert.match(migration, /reg\.bootstrap_workspace_brain/)
  assert.match(migration, /brn\.bootstrap_brain_health/)
})

test('R2-P2 owns production Brain routes, stores and independent Git bootstrap', () => {
  for (const path of [
    'apps/hub/src/registry/module.ts',
    'apps/hub/src/registry/store.ts',
    'apps/hub/src/brain/store.ts',
    'apps/hub/src/brain/routes.ts',
    'apps/hub/src/brain/module.ts',
    'scripts/bootstrap-r2-brain.mjs',
  ]) assert.doesNotThrow(() => readFileSync(resolve(repositoryRoot, path)))
})

test('R2-P2 local HTTP control emits exact BRN-01/02/03/10 DTOs without Registry payload leakage', async (t) => {
  const { app, control } = await createLocalControlApp(t)
  assert.deepEqual(app.routeCensus(), ['BRN-01', 'BRN-02', 'BRN-03', 'BRN-10'])

  const current = await app.inject({ method: 'GET', url: brainUrls[0] })
  assert.equal(current.statusCode, 200)
  assert.deepEqual(current.json(), { workspaceId: WORKSPACE_ID, publishedBrainRevisionId: REVISION_ID })

  const history = await app.inject({ method: 'GET', url: brainUrls[1] })
  assert.equal(history.statusCode, 200)
  assert.deepEqual(history.json(), [{
    brainRevisionId: REVISION_ID,
    brainDigest: BRAIN_DIGEST,
    sourceRevision: SOURCE_REVISION,
    availability: 'AVAILABLE',
    reviewText: registryPayload.reviewText,
  }])

  const detail = await app.inject({ method: 'GET', url: brainUrls[2] })
  assert.equal(detail.statusCode, 200)
  assert.deepEqual(detail.json(), {
    brainRevisionId: REVISION_ID,
    brainDigest: BRAIN_DIGEST,
    sourceRevision: SOURCE_REVISION,
    availability: 'AVAILABLE',
    reviewText: registryPayload.reviewText,
    knowledgeBrowse,
  })

  const health = await app.inject({ method: 'GET', url: brainUrls[3] })
  assert.equal(health.statusCode, 200)
  assert.deepEqual(health.json(), {
    brainRevisionId: REVISION_ID,
    brainDigest: BRAIN_DIGEST,
    healthSnapshotDigest: HEALTH_DIGEST,
    items: healthItems,
  })

  for (const response of [current, history, detail, health]) {
    assert.equal(JSON.stringify(response.json()).includes('"payload"'), false)
    assert.equal(JSON.stringify(response.json()).includes('"schemaVersion"'), false)
  }
  const statements = control.calls.map(({ sql }) => sql)
  assert.equal(statements.filter((sql) => sql === 'BEGIN READ ONLY').length, 4)
  assert.equal(statements.filter((sql) => sql.includes('iam.admit_brain_read')).length, 4)
  assert.equal(statements.filter((sql) => sql === 'COMMIT').length, 4)
  assert.equal(statements.filter((sql) => sql === 'ROLLBACK').length, 0)
  assert.equal(statements.filter((sql) => sql === 'RELEASE').length, 4)
  assert.equal(statements.some((sql) => /\b(?:INSERT|UPDATE|DELETE)\b/i.test(sql)), false)
})

test('R2-P2 local HTTP controls fail closed before Brain disclosure', async (t) => {
  const unauthenticatedControl = localPostgresControl()
  const unauthenticated = await createLocalControlApp(t, {
    control: unauthenticatedControl,
    resolveCurrentSession: async () => null,
  })
  for (const url of brainUrls) {
    const response = await unauthenticated.app.inject({ method: 'GET', url })
    assert.equal(response.statusCode, 401)
    assert.deepEqual(response.json(), {
      type: 'urn:conexus:problem:authentication-required',
      title: 'Authentication required',
      status: 401,
    })
  }
  assert.equal(unauthenticatedControl.calls.length, 0)

  const deniedControl = localPostgresControl({ admitted: false })
  const denied = await createLocalControlApp(t, { control: deniedControl })
  for (const url of brainUrls) {
    const response = await denied.app.inject({ method: 'GET', url })
    assert.equal(response.statusCode, 403)
    assert.deepEqual(response.json(), {
      type: 'urn:conexus:problem:brain-read-required',
      title: 'Brain read required',
      status: 403,
    })
  }
  const deniedStatements = deniedControl.calls.map(({ sql }) => sql)
  assert.equal(deniedStatements.filter((sql) => sql.includes('iam.admit_brain_read')).length, 4)
  assert.equal(deniedStatements.filter((sql) => sql.startsWith('SELECT * FROM reg.')).length, 0)
  assert.equal(deniedStatements.filter((sql) => sql.includes('brn.get_brain_health')).length, 0)
  assert.equal(deniedStatements.filter((sql) => sql === 'COMMIT').length, 4)
  assert.equal(deniedStatements.filter((sql) => sql === 'RELEASE').length, 4)

  const foreignControl = localPostgresControl({ membershipPresent: false })
  const foreign = await createLocalControlApp(t, { control: foreignControl })
  for (const url of brainUrls) {
    const response = await foreign.app.inject({ method: 'GET', url })
    assert.equal(response.statusCode, 404)
    assert.deepEqual(response.json(), {
      type: 'urn:conexus:problem:brain-not-found',
      title: 'Brain not found',
      status: 404,
    })
  }
  assert.equal(foreignControl.calls.some(({ sql }) => sql.startsWith('SELECT * FROM reg.')), false)

  const selectionControl = localPostgresControl({ admitted: false })
  const selection = await createLocalControlApp(t, { control: selectionControl })
  const purposeBound = await selection.app.inject({
    method: 'GET',
    url: `${brainUrls[1]}?forProjectId=${PROJECT_ID}`,
  })
  assert.equal(purposeBound.statusCode, 200)
  assert.deepEqual(purposeBound.json(), [{
    brainRevisionId: REVISION_ID,
    brainDigest: BRAIN_DIGEST,
    sourceRevision: SOURCE_REVISION,
    availability: 'AVAILABLE',
    reviewText: registryPayload.reviewText,
  }])
  const ordinary = await selection.app.inject({ method: 'GET', url: brainUrls[1] })
  assert.equal(ordinary.statusCode, 403)
  const selectionStatements = selectionControl.calls.map(({ sql }) => sql)
  assert.equal(selectionStatements.filter((sql) => sql.includes('iam.admit_brain_revision_selection')).length, 1)
  assert.equal(selectionStatements.filter((sql) => sql.includes('iam.admit_brain_read')).length, 1)
})

test('R2-P2 local HTTP controls preserve canonical miss and failure status boundaries', async (t) => {
  const absent = await createLocalControlApp(t, {
    control: localPostgresControl({ workspacePresent: false, revisionPresent: false }),
  })
  for (const url of brainUrls) {
    const response = await absent.app.inject({ method: 'GET', url })
    assert.equal(response.statusCode, 404)
    assert.deepEqual(response.json(), {
      type: 'urn:conexus:problem:brain-not-found',
      title: 'Brain not found',
      status: 404,
    })
  }

  const malformed = await createLocalControlApp(t)
  const malformedResponse = await malformed.app.inject({
    method: 'GET',
    url: '/api/control/workspaces/not-a-uuid/brain',
  })
  assert.equal(malformedResponse.statusCode, 404)

  const invalidProjection = await createLocalControlApp(t, {
    control: localPostgresControl({ payload: { schemaVersion: 'forged', reviewText: 'x', knowledgeBrowse } }),
  })
  for (const url of [brainUrls[1], brainUrls[2]]) {
    const response = await invalidProjection.app.inject({ method: 'GET', url })
    assert.equal(response.statusCode, 500)
    assert.deepEqual(response.json(), {
      type: 'urn:conexus:problem:internal-error',
      title: 'Internal server error',
      status: 500,
    })
    assert.equal(response.body.includes('forged'), false)
    assert.equal(response.body.includes('BRAIN_PROJECTION_INVALID'), false)
  }

  const unavailableHealth = await createLocalControlApp(t, {
    control: localPostgresControl({ healthRows: [] }),
  })
  const response = await unavailableHealth.app.inject({ method: 'GET', url: brainUrls[3] })
  assert.equal(response.statusCode, 503)
  assert.deepEqual(response.json(), {
    type: 'urn:conexus:problem:brain-unavailable',
    title: 'Brain unavailable',
    status: 503,
  })
})

test('R2-P2 local transaction control rolls back, releases and closes without claiming real PostgreSQL proof', async () => {
  const control = localPostgresControl({ failWhen: (sql) => sql.includes('reg.list_brain_revisions') })
  const store = createBrainStore({ pool: control.pool, registry: createRegistryStore() })
  await assert.rejects(store.listBrainRevisions({ accountId: ACCOUNT_ID, workspaceId: WORKSPACE_ID }), /LOCAL_POSTGRES_CONTROL_FAILURE/)
  const statements = control.calls.map(({ sql }) => sql)
  assert.equal(statements[0], 'BEGIN READ ONLY')
  assert.equal(statements[1].includes('iam.admit_brain_read'), true)
  assert.equal(statements[2].includes('reg.get_workspace_brain'), true)
  assert.equal(statements[3].includes('reg.list_brain_revisions'), true)
  assert.deepEqual(statements.slice(-2), ['ROLLBACK', 'RELEASE'])
  assert.equal(statements.includes('COMMIT'), false)

  const brain = createBrainModule({
    pool: control.pool,
    registry: createRegistryStore(),
    resolveCurrentSession: async () => CURRENT,
  })
  assert.equal(control.ends, 0)
  await brain.close()
  assert.equal(control.ends, 1)
})

test('R2-P2 Brain configuration and production composition select the exact read capability', () => {
  const baseEnvironment = {
    NODE_ENV: 'test',
    CONEXUS_ORIGIN: 'https://conexus.test',
    CONEXUS_BOOTSTRAP_SUBJECT: 'operator-subject',
    CONEXUS_DB_HOST: '127.0.0.1',
    CONEXUS_DB_PORT: '5432',
    CONEXUS_DB_NAME: 'conexus',
    CONEXUS_DB_USER: 'hub_iam',
    CONEXUS_DB_PASSWORD_FILE: '/secrets/iam',
    CONEXUS_OIDC_ISSUER: 'https://issuer.test',
    CONEXUS_OIDC_CLIENT_ID: 'hub',
    CONEXUS_OIDC_CLIENT_SECRET_FILE: '/secrets/oidc',
  }
  assert.equal(readHubConfig(baseEnvironment).brain, undefined)
  assert.deepEqual(readHubConfig({
    ...baseEnvironment,
    CONEXUS_DB_R2_BRAIN_READ_PASSWORD_FILE: '/secrets/r2-brain-read',
  }).brain, { readPasswordFile: '/secrets/r2-brain-read' })

  const server = readFileSync(resolve(repositoryRoot, 'apps/hub/src/server.ts'), 'utf8')
  assert.match(server, /createBrainModule/)
  assert.match(server, /createRegistryStore/)
  assert.match(server, /user:\s*'hub_r2_brain_read'/)
  assert.match(server, /readSecretFile\(config\.brain\.readPasswordFile\)/)
  assert.match(server, /brain\?\.close\(\)/)
})
