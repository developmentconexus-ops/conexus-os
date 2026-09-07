import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const buildRoot = mkdtempSync(resolve(repositoryRoot, 'apps/hub/r2-p4-postgres-adapters-build-'))
const compiled = spawnSync(process.execPath, [
  resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'),
  '--project', resolve(repositoryRoot, 'apps/hub/tsconfig.json'),
  '--noEmit', 'false', '--outDir', buildRoot,
], { cwd: repositoryRoot, encoding: 'utf8' })
if (compiled.status !== 0) {
  throw new Error(`R2_P4_POSTGRES_ADAPTERS_HUB_COMPILE_FAILED\n${compiled.stdout}\n${compiled.stderr}`)
}
test.after(() => rmSync(buildRoot, { recursive: true, force: true }))

const built = (path) => pathToFileURL(resolve(buildRoot, path)).href
const { createProjectBrainBindingDatabasePorts } = await import(built('project/brain-binding-postgres.js'))
const { createProjectBrainContextBasisPort } = await import(built('brain/context-store.js'))
const { createProjectBindingModule } = await import(built('project/module.js'))

test('future Project Brain HTTP composition separates attestation from settlement and bootstrap', () => {
  const moduleSource = readFileSync(resolve(repositoryRoot, 'apps/hub/src/project/module.ts'), 'utf8')
  const migration = readFileSync(resolve(
    repositoryRoot, 'apps/hub/migrations/015_r2_project_brain_read_envelopes.sql',
  ), 'utf8')

  assert.doesNotMatch(moduleSource, /hub_r2_brain_bootstrap/)
  assert.match(moduleSource, /user: 'hub_r2_project_binding'/)
  assert.match(moduleSource, /user: 'hub_r2_brain_attester'/)
  assert.match(moduleSource, /attesterPasswordFile/)
  assert.match(moduleSource,
    /brainAuthorityPool: createPostgresPool\(\{[\s\S]*?user: 'hub_r2_brain_attester',[\s\S]*?attesterPasswordFile[\s\S]*?\}\),/)
  assert.match(migration, /CREATE ROLE hub_r2_brain_attester LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS/)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION reg\.get_project_brain_candidate\(uuid, uuid\)\n {2}TO hub_r2_brain_attester;/)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION brn\.persist_binding_validation\(uuid, uuid, uuid, text, text, jsonb\)\n {2}TO hub_r2_brain_attester;/)
  for (const forbiddenRole of ['hub_r2_brain_bootstrap', 'hub_r2_project_binding']) {
    assert.doesNotMatch(migration, new RegExp(
      `GRANT EXECUTE ON FUNCTION reg\\.get_project_brain_candidate\\(uuid, uuid\\)\\n  TO ${forbiddenRole};`,
    ))
    assert.doesNotMatch(migration, new RegExp(
      `GRANT EXECUTE ON FUNCTION brn\\.persist_binding_validation\\(uuid, uuid, uuid, text, text, jsonb\\)\\n  TO ${forbiddenRole};`,
    ))
  }
})

test('Project binding module wires distinct settlement and attestation pools and closes both', async () => {
  const closed = { binding: 0, attester: 0 }
  const bindingPool = { query: async () => ({ rows: [] }), end: async () => { closed.binding += 1 } }
  const attesterPool = { query: async () => ({ rows: [] }), end: async () => { closed.attester += 1 } }
  let received
  const module = createProjectBindingModule({
    pool: bindingPool,
    brainAuthorityPool: attesterPool,
    createDatabasePorts: (input) => {
      received = input
      return {
        project: { getBindingContext: async () => null },
        binding: { getCurrent: async () => null },
        registry: { getRevision: async () => null },
        attester: { persist: async () => {} },
      }
    },
    git: {},
    sourceSnapshot: () => { throw new Error('UNREACHABLE') },
    validator: { validate: async () => ({ status: 'REFUSED' }) },
    origin: 'https://control.example.test',
    resolveCurrentSession: async () => null,
  })

  assert.equal(received.bindingPool, bindingPool)
  assert.equal(received.brainAuthorityPool, attesterPool)
  await module.close()
  assert.deepEqual(closed, { binding: 1, attester: 1 })
})

test('Project owns exact proof binding admission without a Connections-to-Project callback', () => {
  const migration = readFileSync(resolve(
    repositoryRoot, 'apps/hub/migrations/015_r2_project_brain_read_envelopes.sql',
  ), 'utf8')

  assert.doesNotMatch(migration, /project\.admit_brain_proof_binding/)
  const connectionPort = migration.match(
    /CREATE OR REPLACE FUNCTION con\.admit_brain_proof_subject\([\s\S]*?\n\$\$;/,
  )?.[0]
  assert.ok(connectionPort)
  assert.doesNotMatch(connectionPort, /project\./)
  const projectPreparation = migration.match(
    /CREATE OR REPLACE FUNCTION project\.prepare_brain_binding\([\s\S]*?\n\$\$;/,
  )?.[0]
  assert.ok(projectPreparation)
  assert.match(projectPreparation, /FROM project\.connection_binding AS binding/)
  assert.match(projectPreparation, /con\.admit_brain_proof_subject/)
})

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111'
const PROJECT_ID = '22222222-2222-4222-8222-222222222222'
const WORKSPACE_ID = '33333333-3333-4333-8333-333333333333'
const REVISION_ID = '44444444-4444-4444-8444-444444444444'
const VALIDATION_ID = '55555555-5555-4555-8555-555555555555'
const SOURCE_REVISION = 'a'.repeat(40)
const BRAIN_DIGEST = 'b'.repeat(64)
const BINDING_DIGEST = 'c'.repeat(64)
const HEALTH_DIGEST = 'd'.repeat(64)

const fakePool = (respond) => {
  const calls = []
  return {
    calls,
    pool: {
      query: async (text, values) => {
        const call = { text: String(text), values }
        calls.push(call)
        return respond(call)
      },
    },
  }
}

test('Project Brain binding database ports preserve owner pools, positional parameters and snake-case projections', async () => {
  const payload = { schemaVersion: 'conexus-brain/v2' }
  const candidate = { schemaVersion: 'conexus-brain-binding-validation/v1' }
  const bindingPool = fakePool(({ text }) => {
    if (text.includes('admit_brain_binding_preflight')) return { rows: [{
      project_id: PROJECT_ID,
      workspace_id: WORKSPACE_ID,
      current_project_source_revision: SOURCE_REVISION,
      connection_permitted: false,
    }] }
    return { rows: [{
      project_id: PROJECT_ID,
      workspace_id: WORKSPACE_ID,
      brain_revision_id: REVISION_ID,
      brain_digest: BRAIN_DIGEST,
      project_binding_digest: BINDING_DIGEST,
      validation_state: 'VALID',
      update_available: false,
    }] }
  })
  const brainAuthorityPool = fakePool(({ text }) => text.includes('get_project_brain_candidate')
    ? { rows: [{ brain_revision_id: REVISION_ID, brain_digest: BRAIN_DIGEST, payload }] }
    : { rows: [{ persist_binding_validation: null }] })
  const ports = createProjectBrainBindingDatabasePorts({
    bindingPool: bindingPool.pool,
    brainAuthorityPool: brainAuthorityPool.pool,
  })

  assert.deepEqual(await ports.project.getBindingContext({ accountId: ACCOUNT_ID, projectId: PROJECT_ID }), {
    projectId: PROJECT_ID,
    workspaceId: WORKSPACE_ID,
    sourceRevision: SOURCE_REVISION,
    connectionPermitted: false,
  })
  assert.deepEqual(await ports.binding.getCurrent({ accountId: ACCOUNT_ID, projectId: PROJECT_ID }), {
    projectId: PROJECT_ID,
    workspaceId: WORKSPACE_ID,
    brainRevisionId: REVISION_ID,
    brainDigest: BRAIN_DIGEST,
    projectBindingDigest: BINDING_DIGEST,
    validationState: 'VALID',
    updateAvailable: false,
  })
  assert.deepEqual(await ports.registry.getRevision({ workspaceId: WORKSPACE_ID, brainRevisionId: REVISION_ID }), {
    brainRevisionId: REVISION_ID,
    brainDigest: BRAIN_DIGEST,
    payload,
  })
  assert.equal(await ports.attester.persist({
    bindingValidationId: VALIDATION_ID,
    projectId: PROJECT_ID,
    brainRevisionId: REVISION_ID,
    brainDigest: BRAIN_DIGEST,
    projectBindingDigest: BINDING_DIGEST,
    candidate,
  }), undefined)

  assert.deepEqual(bindingPool.calls, [
    {
      text: 'SELECT * FROM project.admit_brain_binding_preflight($1, $2)',
      values: [ACCOUNT_ID, PROJECT_ID],
    },
    {
      text: 'SELECT * FROM project.get_project_brain_binding($1, $2)',
      values: [ACCOUNT_ID, PROJECT_ID],
    },
  ])
  assert.deepEqual(brainAuthorityPool.calls, [
    {
      text: 'SELECT * FROM reg.get_project_brain_candidate($1, $2)',
      values: [WORKSPACE_ID, REVISION_ID],
    },
    {
      text: 'SELECT brn.persist_binding_validation($1, $2, $3, $4, $5, $6)',
      values: [VALIDATION_ID, PROJECT_ID, REVISION_ID, BRAIN_DIGEST, BINDING_DIGEST, candidate],
    },
  ])
})

test('Project Brain binding database reads distinguish absence from invalid cardinality and preserve database failures', async () => {
  const absentPool = fakePool(() => ({ rows: [] }))
  const absent = createProjectBrainBindingDatabasePorts({
    bindingPool: absentPool.pool,
    brainAuthorityPool: absentPool.pool,
  })
  assert.equal(await absent.project.getBindingContext({ accountId: ACCOUNT_ID, projectId: PROJECT_ID }), null)
  assert.equal(await absent.binding.getCurrent({ accountId: ACCOUNT_ID, projectId: PROJECT_ID }), null)
  assert.equal(await absent.registry.getRevision({ workspaceId: WORKSPACE_ID, brainRevisionId: REVISION_ID }), null)

  const duplicatePool = fakePool(() => ({ rows: [{ project_id: PROJECT_ID }, { project_id: PROJECT_ID }] }))
  const duplicate = createProjectBrainBindingDatabasePorts({
    bindingPool: duplicatePool.pool,
    brainAuthorityPool: duplicatePool.pool,
  })
  await assert.rejects(duplicate.project.getBindingContext({ accountId: ACCOUNT_ID, projectId: PROJECT_ID }), /CONTEXT_INVALID/)
  await assert.rejects(duplicate.binding.getCurrent({ accountId: ACCOUNT_ID, projectId: PROJECT_ID }), /PROJECTION_INVALID/)
  await assert.rejects(duplicate.registry.getRevision({ workspaceId: WORKSPACE_ID, brainRevisionId: REVISION_ID }), /PROJECTION_INVALID/)

  const databaseFailure = Object.assign(new Error('role boundary refused the call'), { code: '42501' })
  const failingPool = fakePool(() => { throw databaseFailure })
  const ports = createProjectBrainBindingDatabasePorts({
    bindingPool: failingPool.pool,
    brainAuthorityPool: failingPool.pool,
  })
  await assert.rejects(
    ports.binding.getCurrent({ accountId: ACCOUNT_ID, projectId: PROJECT_ID }),
    (error) => error === databaseFailure,
  )
  await assert.rejects(
    ports.attester.persist({
      bindingValidationId: VALIDATION_ID,
      projectId: PROJECT_ID,
      brainRevisionId: REVISION_ID,
      brainDigest: BRAIN_DIGEST,
      projectBindingDigest: BINDING_DIGEST,
      candidate: {},
    }),
    (error) => error === databaseFailure,
  )
})

test('BRN-14 basis port sends one owner query and projects the complete snake-case envelope', async () => {
  const validationCandidate = { schemaVersion: 'conexus-brain-binding-validation/v1' }
  const revisionPayload = { schemaVersion: 'conexus-brain/v2' }
  const healthItems = [{ semanticRef: 'sales', state: 'VALID', critical: true }]
  const database = fakePool(() => ({ rows: [{
    project_id: PROJECT_ID,
    workspace_id: WORKSPACE_ID,
    brain_revision_id: REVISION_ID,
    brain_digest: BRAIN_DIGEST,
    project_binding_digest: BINDING_DIGEST,
    validation_state: 'VALID',
    update_available: true,
    current_project_source_revision: SOURCE_REVISION,
    validation_candidate: validationCandidate,
    revision_source_revision: SOURCE_REVISION,
    revision_payload: revisionPayload,
    health_snapshot_digest: HEALTH_DIGEST,
    health_items: healthItems,
  }] }))
  const basis = createProjectBrainContextBasisPort(database.pool)

  assert.deepEqual(await basis.load({ accountId: ACCOUNT_ID, projectId: PROJECT_ID }), {
    status: 'FOUND',
    value: {
      authorization: { projectRead: true, brainRead: true, projectBuild: false },
      binding: {
        projectId: PROJECT_ID,
        workspaceId: WORKSPACE_ID,
        brainRevisionId: REVISION_ID,
        brainDigest: BRAIN_DIGEST,
        projectBindingDigest: BINDING_DIGEST,
        validationState: 'VALID',
        updateAvailable: true,
        currentProjectSourceRevision: SOURCE_REVISION,
        validationCandidate,
      },
      revision: {
        brainRevisionId: REVISION_ID,
        brainDigest: BRAIN_DIGEST,
        sourceRevision: SOURCE_REVISION,
        availability: 'AVAILABLE',
        payload: revisionPayload,
      },
      health: {
        brainRevisionId: REVISION_ID,
        brainDigest: BRAIN_DIGEST,
        healthSnapshotDigest: HEALTH_DIGEST,
        items: healthItems,
      },
    },
  })
  assert.deepEqual(database.calls, [{
    text: 'SELECT * FROM brn.get_project_brain_basis($1, $2)',
    values: [ACCOUNT_ID, PROJECT_ID],
  }])
})

test('BRN-14 basis port fails closed for cardinality and maps only admitted database codes', async (context) => {
  const absent = createProjectBrainContextBasisPort(fakePool(() => ({ rows: [] })).pool)
  assert.deepEqual(await absent.load({ accountId: ACCOUNT_ID, projectId: PROJECT_ID }), { status: 'NOT_FOUND' })
  const duplicate = createProjectBrainContextBasisPort(fakePool(() => ({
    rows: [{ project_id: PROJECT_ID }, { project_id: PROJECT_ID }],
  })).pool)
  assert.deepEqual(await duplicate.load({ accountId: ACCOUNT_ID, projectId: PROJECT_ID }), { status: 'UNAVAILABLE' })

  for (const [failure, expected] of [
    [Object.assign(new Error('permission denied'), { code: '42501' }), 'DENIED'],
    [Object.assign(new Error('missing'), { code: 'P0002' }), 'NOT_FOUND'],
    [Object.assign(new Error('invalid identifier'), { code: '22P02' }), 'NOT_FOUND'],
    [Object.assign(new Error('database unavailable'), { code: '08006' }), 'UNAVAILABLE'],
    [new Error('unclassified'), 'UNAVAILABLE'],
    ['non-object rejection', 'UNAVAILABLE'],
  ]) {
    await context.test(`maps ${typeof failure === 'object' && failure !== null && 'code' in failure ? failure.code : String(failure)}`, async () => {
      const basis = createProjectBrainContextBasisPort(fakePool(() => { throw failure }).pool)
      assert.deepEqual(await basis.load({ accountId: ACCOUNT_ID, projectId: PROJECT_ID }), {
        status: expected,
      })
    })
  }
})
