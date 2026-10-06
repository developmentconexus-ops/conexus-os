import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { OPERATIONS } from '../../packages/contract/dist/index.js'
import { hubModuleUrl } from './hub-build.mjs'
import { query } from './hub-database.mjs'
import { ID, STARTER, setupProjects } from './project-fixture.mjs'

const { createProjectStore } = await import(hubModuleUrl('project/store.js'))
const { builderProjectPorts, purgeProjectBuilder } = await import(hubModuleUrl('builder/project-ports.js'))
const { createBuilderStore } = await import(hubModuleUrl('builder/store.js'))
const { createConnectorStore, purgeProjectBindings } = await import(hubModuleUrl('connectors/store.js'))
const { createSecretEnvelope } = await import(hubModuleUrl('platform/secrets.js'))
const { createModelAccounts } = await import(hubModuleUrl('builder/model-account/accounts.js'))
const { createWorkspaceStore } = await import(hubModuleUrl('workspace/store.js'))
const { createServedApplicationReader } = await import(hubModuleUrl('registry/served-application.js'))

const BODY = { name: 'Intruder', sourceBootstrap: { mode: 'NEW' } }

const recording = (database, entries) => new Proxy(database, {
  get: (target, name) => (['read', 'transaction', 'system'].includes(name)
    ? (...args) => { entries.push(name); return target[name](...args) }
    : target[name]),
})

const CENSUS = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../contracts/technical/hub-catalog-census.json'), 'utf8'))

const OTHER = Object.freeze({ owner: '10000000-0000-4000-8000-0000000000b1', member: '10000000-0000-4000-8000-0000000000b2' })
const CONNECTION = Object.freeze({
  a: '33333333-3333-4333-8333-0000000000a1', spare: '33333333-3333-4333-8333-0000000000a2', created: '33333333-3333-4333-8333-0000000000a3', b: '33333333-3333-4333-8333-0000000000b1',
})
const BINDING_B = '44444444-4444-4444-8444-0000000000b1'
const SEALED = 'mastra:factory-secret:v1:seed'

// How each split table reaches tenant B: $1 is B's Workspace, $2 is B's Project. A split table in the
// register without an entry here, or without a seeded row of B, fails the test below.
const TENANT_B = Object.freeze({
  'workspace.workspace': 'workspace_id = $1',
  'model.installation_default': 'updated_by IN (SELECT account_id FROM iam.workspace_membership WHERE workspace_id = $1)',
  'model.model_account': 'owner_account_id IN (SELECT account_id FROM iam.workspace_membership WHERE workspace_id = $1)',
  'model.model_account_sharing_history': 'changed_by_account_id IN (SELECT account_id FROM iam.workspace_membership WHERE workspace_id = $1)',
  'platform.operation_receipt': 'resource_id IN ($1, $2)',
  'project.project': 'workspace_id = $1',
  'project.project_deletion': 'workspace_id = $1',
  'builder.builder_run': 'project_id = $2',
  'builder.builder_run_model_account': 'builder_run_id IN (SELECT builder_run_id FROM builder.builder_run WHERE project_id = $2)',
  'builder.conversation_session': 'project_id = $2',
  'builder.project_repository': 'project_id = $2',
  'builder.project_working_state': 'project_id = $2',
  'connector.connection': 'workspace_id = $1',
  'connector.project_binding': 'workspace_id = $1',
  'iam.account': 'account_id IN (SELECT account_id FROM iam.workspace_membership WHERE workspace_id = $1)',
  'iam.workspace_membership': 'workspace_id = $1',
})

const registerTables = () => CENSUS.register.split.map((entry) => entry.table).sort()

const rowsOfB = async (connection, projectId) => {
  const tables = registerTables()
  assert.deepEqual(tables, Object.keys(TENANT_B).sort(), 'every split table of the register has a tenant path here, and none is listed that the register lacks')
  const found = new Map()
  for (const table of tables) {
    const predicate = TENANT_B[table].replace('$1', `'${ID.otherWorkspace}'`).replace('$2', `'${projectId}'`)
    const { rows } = await query(connection, `SELECT t::text AS row FROM ${table} t WHERE ${predicate} ORDER BY 1`)
    found.set(table, rows.map((row) => row.row))
  }
  return found
}

const seedTenantB = async ({ connection, seedProject }, projectId, sealed) => {
  await query(connection, `INSERT INTO iam.account(account_id, issuer, external_subject, display_name) VALUES
    ($1, 'https://issuer.test', 'other-owner', 'Other owner'), ($2, 'https://issuer.test', 'other-member', 'Other member')`, [OTHER.owner, OTHER.member])
  await query(connection, "INSERT INTO iam.workspace_membership(account_id, workspace_id, role) VALUES ($1, $3, 'owner'), ($2, $3, 'member')", [OTHER.owner, OTHER.member, ID.otherWorkspace])
  const doomed = await seedProject('Doomed', ID.otherWorkspace)
  await query(connection, "INSERT INTO project.project_deletion(project_id, workspace_id, name, requested_by) VALUES ($1, $2, 'Doomed', $3)", [doomed, ID.otherWorkspace, OTHER.owner])
  await query(connection, `INSERT INTO connector.connection(connection_id, workspace_id, connector_id, label, credential_sealed, credential_digest, created_by) VALUES
    ($1, $2, 'sankhya', 'ERP B', $3, $4, $5)`, [CONNECTION.b, ID.otherWorkspace, SEALED, 'd'.repeat(64), ID.administrator])
  await query(connection, `INSERT INTO connector.project_binding(binding_id, workspace_id, project_id, environment, connection_id, name, bound_by) VALUES
    ($1, $2, $3, 'preview', $4, 'erp', $5)`, [BINDING_B, ID.otherWorkspace, projectId, CONNECTION.b, OTHER.owner])
  await query(connection, `INSERT INTO platform.operation_receipt(operation_id, authority, account_id, key_digest, request_digest, resource_id, state)
    VALUES ('PRJ-03', 'account:b', $1, $2, $3, $4, 'reserved')`, [OTHER.owner, Buffer.from('k'), Buffer.from('r'), projectId])
  const privateOfB = (await query(connection, `INSERT INTO model.model_account(owner_account_id, provider, kind, secret) VALUES
    ($1, 'anthropic', 'api_key', $2), ($1, 'google-ai-pro', 'google_ai_pro', $2) RETURNING model_account_id`, [OTHER.owner, await sealed('private-of-b')])).rows[0].model_account_id
  await query(connection, "INSERT INTO model.model_account_sharing_history(model_account_id, previous_sharing, new_sharing, changed_by_account_id) VALUES ($1, 'just_me', 'everyone', $2)", [privateOfB, OTHER.owner])
  await query(connection, "INSERT INTO model.installation_default(role, model_id, updated_by) VALUES ('build', 'anthropic/claude-sonnet-5', $1)", [OTHER.owner])
}

// A thumbnail needs a served revision, an application and a retained image: seeded here by SQL for one Project.
const seedThumbnail = async (connection, projectId, bytes) => {
  const artifactId = randomUUID()
  const revisionId = randomUUID()
  await query(connection, "INSERT INTO reg.artifact(artifact_id, kind, semantic_name, project_id) VALUES ($1, 'application', 'app', $2)", [artifactId, projectId])
  await query(connection, "INSERT INTO reg.artifact_revision(artifact_revision_id, artifact_id, source_revision, digest, payload, availability) VALUES ($1, $2, $3, $4, '{}'::jsonb, 'AVAILABLE')", [revisionId, artifactId, STARTER, 'd'.repeat(64)])
  await query(connection, 'UPDATE builder.project_working_state SET last_preview_source_revision = $2, last_preview_artifact_revision_id = $3, last_preview_artifact_digest = $4 WHERE project_id = $1', [projectId, STARTER, revisionId, 'd'.repeat(64)])
  await query(connection, "INSERT INTO iam.application(project_id, slug, created_by) VALUES ($1, $2, $3)", [projectId, `app-${projectId.slice(0, 8)}`, ID.owner])
  await query(connection, 'INSERT INTO reg.application_thumbnail(project_id, artifact_revision_id, media_type, bytes, byte_length, sha256) VALUES ($1, $2, $3, $4, $5, $6)',
    [projectId, revisionId, 'image/png', bytes, bytes.length, createHash('sha256').update(bytes).digest('hex')])
  return revisionId
}

// The path parameters of an operation beyond the two tenant ids name a child of a tenant (a run, a
// member, a connection, a grant). Such an operation needs an attempt that admits the actor in its own
// tenant and passes a child id of another. None of today's operations takes one.
const TENANT_PARAMETERS = Object.freeze(['workspaceId', 'projectId', 'provider', 'loginId'])
const IN_MEMORY = Object.freeze(['MDL-04', 'MDL-06', 'MDL-07', 'MDL-09', 'MDL-11'])
const childParameters = (operation) => [...operation.path.matchAll(/:(\w+)/g)].map((found) => found[1]).filter((name) => !TENANT_PARAMETERS.includes(name))

const digestOfB = async (connection, projectId) => {
  const found = await rowsOfB(connection, projectId)
  return createHash('sha256').update(JSON.stringify([...found])).digest('hex')
}

test('each operation answers its own tenant its rows, and with the ids of another tenant answers its refusal and leaves the other tenant rows unchanged', async (t) => {
  const fixture = await setupProjects(t, 'conexus_operation_tenant')
  const { connection, seedProject, settleRun } = fixture
  const projectA = await seedProject('Atlas')
  const projectBuild = await seedProject('Builds')
  const doomedA = await seedProject('Doomed A')
  const projectB = await seedProject('Borealis', ID.otherWorkspace)
  await settleRun(projectB)
  await query(connection, 'INSERT INTO builder.conversation_session(conversation_id, project_id) VALUES ($1, $2)', [randomUUID(), projectB])
  await query(connection, 'INSERT INTO builder.builder_run_model_account(builder_run_id, model_account_id) SELECT builder_run_id, $2 FROM builder.builder_run WHERE project_id = $1', [projectB, randomUUID()])
  const envelope = createSecretEnvelope('ab'.repeat(32))
  await seedTenantB(fixture, projectB, (plain) => envelope.seal(plain))
  for (const [table, rows] of await rowsOfB(connection, projectB)) assert.ok(rows.length > 0, `${table} has a seeded row of tenant B`)
  const thumbnailA = Buffer.from('thumbnail-of-a')
  await query(connection, `INSERT INTO connector.connection(connection_id, workspace_id, connector_id, label, credential_sealed, credential_digest, created_by) VALUES
    ($1, $3, 'sankhya', 'ERP', $5, $6, $4), ($2, $3, 'sankhya', 'Spare', $5, $6, $4)`, [CONNECTION.a, CONNECTION.spare, ID.workspace, ID.administrator, SEALED, 'd'.repeat(64)])
  const revisionA = await seedThumbnail(connection, projectA, thumbnailA)
  await seedThumbnail(connection, projectB, Buffer.from('thumbnail-of-b'))
  const entries = []
  const database = recording(fixture.database, entries)
  const projects = createProjectStore({ database, repository: { prepare: async () => STARTER }, deletion: { releaseApplicationData: async () => undefined, killSandboxes: async () => undefined, deleteRepository: async () => undefined, purgeConnectorBindings: purgeProjectBindings, purgeBuilder: purgeProjectBuilder }, builder: builderProjectPorts })
  const workspaces = createWorkspaceStore(database)
  const builder = createBuilderStore({ database, ownerId: randomUUID() })
  const runOfB = (await query(connection, 'SELECT builder_run_id FROM builder.builder_run WHERE project_id = $1', [projectB])).rows[0].builder_run_id
  const member = ID.member
  const FOREIGN_BASE = 'c'.repeat(40)
  const connectors = createConnectorStore({ database, envelope })
  const modelAccounts = createModelAccounts({ database, envelope, ownerId: randomUUID() })
  await query(connection, "INSERT INTO model.model_account(owner_account_id, provider, kind, secret) VALUES ($1, 'openai-codex', 'oauth', $2)", [member, await envelope.seal('codex-of-member')])
  const KEY = { provider: 'anthropic', kind: 'api_key' }
  const served = createServedApplicationReader(database)
  const before = await digestOfB(connection, projectB)
  const revisionOfA = (await query(connection, 'SELECT project_revision FROM project.project WHERE project_id = $1', [projectA])).rows[0].project_revision
  const withoutActivity = (summaries) => summaries.map(({ lastActivityAt: _at, ...rest }) => rest)
  const cardA = { projectId: projectA, workspaceId: ID.workspace, name: 'Atlas', archived: false }
  const cardBuilds = { projectId: projectBuild, workspaceId: ID.workspace, name: 'Builds', archived: false }
  const cardDoomed = { projectId: doomedA, workspaceId: ID.workspace, name: 'Doomed A', archived: false }

  // own: admission passes on the tenant's own ids and the answer holds the tenant's literal rows.
  // cross: the same call with the ids of tenant B answers its refusal and nothing of B.
  // child: null while no operation takes a child id of a tenant.
  let bindingOfA
  const ABSENT = { own: { state: 'absent' }, shared: false }
  const attempts = {
    'MDL-01': {
      own: async () => assert.deepEqual((await modelAccounts.standing(member))['openai-codex'], { own: { state: 'connected', kind: 'oauth' }, shared: false }),
      cross: async () => assert.deepEqual((await modelAccounts.standing(member)).anthropic, ABSENT),
      child: null,
    },
    'MDL-02': {
      own: async () => assert.deepEqual(await modelAccounts.standing(member), { anthropic: ABSENT, 'openai-codex': { own: { state: 'connected', kind: 'oauth' }, shared: false }, 'google-ai-pro': ABSENT }),
      cross: async () => assert.deepEqual((await modelAccounts.standing(member)).anthropic, ABSENT),
      child: null,
    },
    'MDL-08': {
      own: async () => assert.deepEqual((await modelAccounts.standing(member))['google-ai-pro'], ABSENT),
      cross: async () => assert.deepEqual((await modelAccounts.standing(member))['google-ai-pro'].own, { state: 'absent' }),
      child: null,
    },
    'MDL-03': {
      own: async () => {
        await modelAccounts.write({ accountId: member, credential: KEY, secret: 'key-of-member' })
        assert.deepEqual((await query(connection, "SELECT provider, kind, sharing FROM model.model_account WHERE owner_account_id = $1 AND provider = 'anthropic'", [member])).rows, [{ provider: 'anthropic', kind: 'api_key', sharing: 'just_me' }])
      },
      cross: () => assert.rejects(modelAccounts.write({ accountId: randomUUID(), credential: KEY, secret: 'intruder' }), { id: 'ACCOUNT_NOT_FOUND' }),
      child: null,
    },
    'MDL-05': {
      own: async () => assert.deepEqual(await modelAccounts.connect({ accountId: member, credential: { provider: 'anthropic', kind: 'oauth' }, secret: 'tokens' }), { ok: true }),
      cross: async () => assert.deepEqual(await modelAccounts.connect({ accountId: randomUUID(), credential: { provider: 'anthropic', kind: 'oauth' }, secret: 'tokens' }), { ok: false, reason: 'ACCOUNT_NOT_FOUND' }),
      child: null,
    },
    'MDL-10': {
      own: async () => assert.deepEqual(await modelAccounts.connect({ accountId: member, credential: { provider: 'google-ai-pro', kind: 'google_ai_pro' }, secret: 'session' }), { ok: true }),
      cross: async () => assert.deepEqual(await modelAccounts.connect({ accountId: randomUUID(), credential: { provider: 'google-ai-pro', kind: 'google_ai_pro' }, secret: 'session' }), { ok: false, reason: 'ACCOUNT_NOT_FOUND' }),
      child: null,
    },
    'WS-01': {
      own: async () => {
        const created = await workspaces.createWorkspace({ accountId: member, idempotencyKey: 'tenant', body: { name: 'Mine' } })
        assert.equal(created.reply.creatorAccountId, member)
        assert.equal(created.reply.name, 'Mine')
      },
      cross: null,
      child: null,
    },
    'PRJ-01': {
      own: async () => assert.deepEqual(await projects.listProjects({ accountId: member, workspaceId: ID.workspace }), [cardA, cardBuilds, cardDoomed]),
      cross: async () => assert.deepEqual(await projects.listProjects({ accountId: member, workspaceId: ID.otherWorkspace }), []),
      child: null,
    },
    'PRJ-02': {
      own: async () => assert.deepEqual(await projects.getProject({ accountId: member, projectId: projectA }), { ...cardA, projectRevision: revisionOfA, deleting: false }),
      cross: async () => assert.equal(await projects.getProject({ accountId: member, projectId: projectB }), null),
      child: null,
    },
    'PRJ-03': {
      own: async () => {
        const created = await projects.createProject({ accountId: member, workspaceId: ID.workspace, idempotencyKey: 'own', body: { name: 'Mine', sourceBootstrap: { mode: 'NEW' } } })
        assert.deepEqual({ replayed: created.replayed, name: created.reply.name, workspaceId: created.reply.workspaceId }, { replayed: false, name: 'Mine', workspaceId: ID.workspace })
      },
      cross: () => assert.rejects(projects.createProject({ accountId: member, workspaceId: ID.otherWorkspace, idempotencyKey: 'intruder', body: BODY }), { id: 'PROJECT_CREATE_DENIED' }),
      child: null,
    },
    'PRJ-04': {
      own: async () => {
        await projects.deleteProject({ accountId: ID.administrator, projectId: doomedA, confirmName: 'Doomed A' })
        assert.deepEqual((await query(connection, 'SELECT project_id, name, requested_by FROM project.project_deletion WHERE project_id = $1', [doomedA])).rows, [{ project_id: doomedA, name: 'Doomed A', requested_by: ID.administrator }])
      },
      cross: () => assert.rejects(projects.deleteProject({ accountId: member, projectId: projectB, confirmName: 'Borealis' }), { id: 'PROJECT_DELETE_DENIED' }),
      child: null,
    },
    'PRJ-SUMMARIES': {
      own: async () => {
        const summaries = withoutActivity(await projects.listProjectSummariesWithActivity({ accountId: member, workspaceId: ID.workspace }))
        assert.deepEqual(summaries.map((summary) => summary.name).sort(), ['Atlas', 'Builds', 'Mine'])
        assert.deepEqual(summaries.find((summary) => summary.name === 'Atlas'), { projectId: projectA, name: 'Atlas', archived: false, latestRun: null, hasPreview: true, deleting: false })
      },
      cross: async () => assert.deepEqual(await projects.listProjectSummariesWithActivity({ accountId: member, workspaceId: ID.otherWorkspace }), []),
      child: null,
    },
    'BLD-08': {
      own: async () => assert.equal(await builder.admitSourceRevision({ accountId: member, projectId: projectA, sourceRevision: FOREIGN_BASE, readMain: async () => FOREIGN_BASE }), true),
      cross: async () => assert.equal(await builder.admitSourceRevision({ accountId: member, projectId: projectB, sourceRevision: FOREIGN_BASE, readMain: async () => FOREIGN_BASE }), false),
      child: null,
    },
    'BLD-09': {
      own: async () => assert.equal(await builder.admitSourceRevision({ accountId: member, projectId: projectA, sourceRevision: FOREIGN_BASE, readMain: async () => FOREIGN_BASE }), true),
      cross: async () => assert.equal(await builder.admitSourceRevision({ accountId: member, projectId: projectB, sourceRevision: FOREIGN_BASE, readMain: async () => FOREIGN_BASE }), false),
      child: null,
    },
    'BLD-29': {
      own: async () => assert.equal(await builder.admitSourceRevision({ accountId: member, projectId: projectA, sourceRevision: FOREIGN_BASE, readMain: async () => FOREIGN_BASE }), true),
      cross: async () => assert.equal(await builder.admitSourceRevision({ accountId: member, projectId: projectB, sourceRevision: FOREIGN_BASE, readMain: async () => FOREIGN_BASE }), false),
      child: null,
    },
    'BLD-23': {
      own: async () => assert.deepEqual(await builder.readBuilderRun({ accountId: member, projectId: projectA }), null),
      cross: async () => assert.deepEqual(await builder.readBuilderRun({ accountId: member, projectId: projectB }), null),
      child: null,
    },
    'BLD-24': {
      own: async () => {
        const run = await builder.createBuilderRun({ accountId: member, projectId: projectBuild, conversationId: '33333333-3333-4333-8333-333333333333', idempotencyKey: 'own', content: 'build', readBase: async () => FOREIGN_BASE })
        assert.deepEqual({ state: run.state, baseSourceRevision: run.baseSourceRevision, requestText: run.requestText }, { state: 'QUEUED', baseSourceRevision: FOREIGN_BASE, requestText: 'build' })
      },
      cross: () => assert.rejects(builder.createBuilderRun({ accountId: member, projectId: projectB, conversationId: '33333333-3333-4333-8333-333333333333', idempotencyKey: 'intruder', content: 'build', readBase: async () => FOREIGN_BASE }), { id: 'PROJECT_BUILD_DENIED' }),
      child: null,
    },
    'BLD-25': {
      own: async () => {
        const ownRun = (await query(connection, 'SELECT builder_run_id FROM builder.builder_run WHERE project_id = $1', [projectBuild])).rows[0].builder_run_id
        const cancelled = await builder.requestBuilderRunCancellation({ accountId: member, projectId: projectBuild, builderRunId: ownRun })
        assert.equal(cancelled.state, 'INTERRUPTED')
      },
      cross: () => assert.rejects(builder.requestBuilderRunCancellation({ accountId: member, projectId: projectB, builderRunId: runOfB }), { id: 'PROJECT_BUILD_DENIED' }),
      child: () => assert.rejects(builder.requestBuilderRunCancellation({ accountId: member, projectId: projectBuild, builderRunId: runOfB }), { id: 'BUILDER_RUN_NOT_FOUND' }),
    },
    'BLD-26': {
      own: async () => assert.deepEqual((await builder.listBuilderRuns({ accountId: member, projectId: projectBuild })).map((run) => run.state), ['INTERRUPTED']),
      cross: async () => assert.equal(await builder.readBuilderRun({ accountId: member, projectId: projectB }), null),
      child: async () => assert.notEqual((await builder.readBuilderRun({ accountId: member, projectId: projectBuild })).builderRunId, runOfB),
    },
    'BLD-30': {
      own: async () => assert.deepEqual(await builder.readLaunchSubject({ accountId: member, projectId: projectA }), { lastPreviewSourceRevision: STARTER, lastPreviewArtifactRevisionId: revisionA, lastPreviewArtifactDigest: 'd'.repeat(64) }),
      cross: () => assert.rejects(builder.readLaunchSubject({ accountId: member, projectId: projectB }), { id: 'PROJECT_BUILD_DENIED' }),
      child: null,
    },
    'PRJ-THUMBNAIL': {
      own: async () => {
        const thumbnail = await served.readThumbnail({ accountId: member, projectId: projectA })
        assert.deepEqual({ revision: thumbnail.artifactRevisionId, mediaType: thumbnail.mediaType, bytes: Buffer.from(thumbnail.bytes).toString() }, { revision: revisionA, mediaType: 'image/png', bytes: 'thumbnail-of-a' })
      },
      cross: async () => assert.equal(await served.readThumbnail({ accountId: member, projectId: projectB }), null),
      child: null,
    },
    'CON-01': {
      own: async () => assert.deepEqual(await connectors.listConnections({ accountId: ID.administrator, workspaceId: ID.workspace }), [
        { connectionId: CONNECTION.a, connectorId: 'sankhya', label: 'ERP', createdAt: (await query(connection, 'SELECT created_at FROM connector.connection WHERE connection_id = $1', [CONNECTION.a])).rows[0].created_at.toISOString() },
        { connectionId: CONNECTION.spare, connectorId: 'sankhya', label: 'Spare', createdAt: (await query(connection, 'SELECT created_at FROM connector.connection WHERE connection_id = $1', [CONNECTION.spare])).rows[0].created_at.toISOString() },
      ]),
      cross: () => assert.rejects(connectors.listConnections({ accountId: member, workspaceId: ID.otherWorkspace }), { id: 'INSTALLATION_ADMINISTRATOR_REQUIRED' }),
      child: null,
    },
    'CON-02': {
      own: async () => {
        const created = await connectors.createConnection({ accountId: ID.administrator, workspaceId: ID.workspace, body: { connectionId: CONNECTION.created, connectorId: 'sankhya', label: 'Mine', credential: { clientId: 'c', clientSecret: 's', xToken: 'x' } } })
        assert.deepEqual({ created: created.created, label: created.connection.label, connectionId: created.connection.connectionId }, { created: true, label: 'Mine', connectionId: CONNECTION.created })
      },
      cross: () => assert.rejects(connectors.createConnection({ accountId: member, workspaceId: ID.otherWorkspace, body: { connectionId: randomUUID(), connectorId: 'sankhya', label: 'Intruder', credential: { clientId: 'c', clientSecret: 's', xToken: 'x' } } }), { id: 'INSTALLATION_ADMINISTRATOR_REQUIRED' }),
      child: null,
    },
    'CON-03': {
      own: async () => assert.deepEqual(await connectors.readCredentialForCheck({ accountId: ID.administrator, workspaceId: ID.workspace, connectionId: CONNECTION.a }), { connectorId: 'sankhya', sealed: SEALED }),
      cross: () => assert.rejects(connectors.readCredentialForCheck({ accountId: member, workspaceId: ID.otherWorkspace, connectionId: CONNECTION.b }), { id: 'INSTALLATION_ADMINISTRATOR_REQUIRED' }),
      child: () => assert.rejects(connectors.readCredentialForCheck({ accountId: ID.administrator, workspaceId: ID.workspace, connectionId: CONNECTION.b }), { id: 'CONNECTOR_CONNECTION_NOT_FOUND' }),
    },
    'CON-04': {
      own: async () => {
        await connectors.disableConnection({ accountId: ID.administrator, workspaceId: ID.workspace, connectionId: CONNECTION.spare })
        assert.deepEqual((await query(connection, 'SELECT disabled_at IS NOT NULL AS disabled FROM connector.connection WHERE connection_id = $1', [CONNECTION.spare])).rows, [{ disabled: true }])
      },
      cross: () => assert.rejects(connectors.disableConnection({ accountId: member, workspaceId: ID.otherWorkspace, connectionId: CONNECTION.b }), { id: 'INSTALLATION_ADMINISTRATOR_REQUIRED' }),
      child: () => assert.rejects(connectors.disableConnection({ accountId: ID.administrator, workspaceId: ID.workspace, connectionId: CONNECTION.b }), { id: 'CONNECTOR_CONNECTION_NOT_FOUND' }),
    },
    'CON-08': {
      own: async () => assert.deepEqual(await connectors.listProjectBindings({ accountId: ID.owner, projectId: projectA }), [
        { kind: 'bindable', connectionId: CONNECTION.a, connectorId: 'sankhya', label: 'ERP' },
        { kind: 'bindable', connectionId: CONNECTION.created, connectorId: 'sankhya', label: 'Mine' },
      ]),
      cross: () => assert.rejects(connectors.listProjectBindings({ accountId: ID.owner, projectId: projectB }), { id: 'PROJECT_NOT_FOUND' }),
      child: null,
    },
    'CON-09': {
      own: async () => {
        const { binding: bound, created } = await connectors.bindConnection({ accountId: ID.owner, projectId: projectA, body: { connectionId: CONNECTION.a, name: 'erp' } })
        bindingOfA = bound.bindingId
        assert.deepEqual({ created, name: bound.name, connectionId: bound.connectionId, connectorId: bound.connectorId }, { created: true, name: 'erp', connectionId: CONNECTION.a, connectorId: 'sankhya' })
      },
      cross: async () => {
        await assert.rejects(connectors.bindConnection({ accountId: ID.owner, projectId: projectB, body: { connectionId: CONNECTION.b, name: 'erp' } }), { id: 'PROJECT_NOT_FOUND' })
        await assert.rejects(connectors.bindConnection({ accountId: ID.owner, projectId: projectA, body: { connectionId: CONNECTION.b, name: 'intruder' } }), { id: 'CONNECTOR_CONNECTION_NOT_AVAILABLE' })
      },
      child: null,
    },
    'CON-10': {
      own: async () => {
        await connectors.unbindConnection({ accountId: ID.owner, projectId: projectA, bindingId: bindingOfA })
        assert.deepEqual((await query(connection, 'SELECT unbound_at IS NOT NULL AS unbound FROM connector.project_binding WHERE binding_id = $1', [bindingOfA])).rows, [{ unbound: true }])
      },
      cross: () => assert.rejects(connectors.unbindConnection({ accountId: ID.owner, projectId: projectB, bindingId: BINDING_B }), { id: 'PROJECT_NOT_FOUND' }),
      child: () => assert.rejects(connectors.unbindConnection({ accountId: ID.owner, projectId: projectA, bindingId: BINDING_B }), { id: 'CONNECTOR_BINDING_NOT_FOUND' }),
    },
  }
  assert.deepEqual(Object.keys(attempts).sort(), OPERATIONS.map((operation) => operation.id).filter((id) => !IN_MEMORY.includes(id)).sort(), 'every operation of the contract has its attempts')

  for (const operation of OPERATIONS) {
    if (IN_MEMORY.includes(operation.id)) continue
    const attempt = attempts[operation.id]
    if (childParameters(operation).length > 0) assert.equal(typeof attempt.child, 'function', `${operation.id} takes a child id (${childParameters(operation).join(', ')}) and needs the attempt that passes a child of another tenant`)
    else assert.equal(attempt.child, null, `${operation.id} takes no child id, so it has no child attempt`)
    if (operation.id !== 'WS-01') assert.equal(typeof attempt.cross, 'function', `${operation.id} has a cross tenant attempt`)
    for (const [kind, run] of [['own', attempt.own], ['cross', attempt.cross], ['child', attempt.child]]) {
      if (run === null) continue
      entries.length = 0
      await run()
      assert.equal(await digestOfB(connection, projectB), before, `${operation.id} ${kind} left the other tenant's rows unchanged`)
      if (operation.method === 'GET') assert.deepEqual([...new Set(entries)], ['read'], `${operation.id} ${kind} is a read and opens only read()`)
      else assert.ok(entries.length > 0 && (kind === 'own' || !entries.includes('system')), `${operation.id} ${kind} opens a person entry, and only an admitted deletion goes on to the purge job`)
    }
  }
})
