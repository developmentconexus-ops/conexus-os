import assert from 'node:assert/strict'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { OPERATIONS } from '@conexus/contract'
import { hubModuleUrl } from './hub-build.mjs'
import { query } from './hub-database.mjs'
import { ID, STARTER, setupProjects } from './project-fixture.mjs'
import { hubJsonWrite, hubSessionCookie, hubWrite, opaque, testListener } from './access/test-listener.mjs'
import { launchablePayload, seedRevision, seedRevisionThumbnail } from './registry-fixture.mjs'

const { createProjectStore } = await import(hubModuleUrl('project/store.js'))
const { builderProjectPorts, purgeProjectBuilder } = await import(hubModuleUrl('builder/project-ports.js'))
const { createBuilderStore } = await import(hubModuleUrl('builder/store.js'))
const { createConnectorStore, purgeProjectBindings } = await import(hubModuleUrl('connectors/store.js'))
const { purgeProject } = await import(hubModuleUrl('identity-access/application-access.js'))
const { registerRosterRoutes } = await import(hubModuleUrl('identity-access/roster.js'))
const { createApplicationAccess } = await import(hubModuleUrl('identity-access/application-access.js'))
const { registerAdministratorRoutes } = await import(hubModuleUrl('identity-access/administrators.js'))
const { createSessions } = await import(hubModuleUrl('identity-access/sessions.js'))
const { createWorkspaceModule } = await import(hubModuleUrl('workspace/module.js'))
const { createSecretEnvelope } = await import(hubModuleUrl('platform/secrets.js'))
const { createModelAccounts } = await import(hubModuleUrl('builder/model-account/accounts.js'))
const { createWorkspaceStore } = await import(hubModuleUrl('workspace/store.js'))
const { createRegistryModule } = await import(hubModuleUrl('registry/module.js'))

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
  'reg.artifact_revision': 'project_id = $2',
  'reg.application_thumbnail': 'artifact_revision_id IN (SELECT artifact_revision_id FROM reg.artifact_revision WHERE project_id = $2)',
  'connector.project_binding': 'workspace_id = $1',
  'iam.account': 'account_id IN (SELECT account_id FROM iam.workspace_membership WHERE workspace_id = $1)',
  'iam.workspace_membership': 'workspace_id = $1',
  'iam.workspace_invitation': 'workspace_id = $1',
  'iam.installation_administrator': 'account_id IN (SELECT account_id FROM iam.workspace_membership WHERE workspace_id = $1)',
  'iam.application': 'project_id = $2',
  'iam.application_grant': 'project_id = $2',
  'iam.application_invitation': 'project_id = $2',
  'iam.handoff': 'project_id = $2',
  'iam.oidc_transaction': 'application_project_id = $2',
  'iam.host_session': 'account_id IN (SELECT account_id FROM iam.workspace_membership WHERE workspace_id = $1)',
})

const registerTables = () => CENSUS.register.tables.map((entry) => entry.table).sort()

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
    VALUES ('createProject', 'account:b', $1, $2, $3, $4, 'reserved')`, [OTHER.owner, Buffer.from('k'), Buffer.from('r'), projectId])
  const privateOfB = (await query(connection, `INSERT INTO model.model_account(owner_account_id, provider, kind, secret) VALUES
    ($1, 'anthropic', 'api_key', $2), ($1, 'google-ai-pro', 'google_ai_pro', $2) RETURNING model_account_id`, [OTHER.owner, await sealed('private-of-b')])).rows[0].model_account_id
  await query(connection, "INSERT INTO model.model_account_sharing_history(model_account_id, previous_sharing, new_sharing, changed_by_account_id) VALUES ($1, 'just_me', 'everyone', $2)", [privateOfB, OTHER.owner])
  await query(connection, "INSERT INTO model.installation_default(role, model_id, updated_by) VALUES ('build', 'anthropic/claude-sonnet-5', $1)", [OTHER.owner])
}

// The identity rows of tenant B: its Workspace invitation and administrator tenure, a Hub session of its owner, and what an application of its Project holds.
const seedIdentityOfB = async (connection, projectId) => {
  await query(connection, "INSERT INTO iam.workspace_invitation(invitation_id, workspace_id, email, role, invited_by, expires_at) VALUES ($1, $2, 'invitee-b@example.test', 'member', $3, now() + interval '1 day')", [randomUUID(), ID.otherWorkspace, OTHER.owner])
  await query(connection, "INSERT INTO iam.installation_administrator(account_id, granted_via) VALUES ($1, 'OPERATOR_BOOTSTRAP')", [OTHER.member])
  await query(connection, "INSERT INTO iam.application_invitation(invitation_id, project_id, email, invited_by, expires_at) VALUES ($1, $2, 'guest-b@example.test', $3, now() + interval '1 day')", [randomUUID(), projectId, OTHER.owner])
  await query(connection, 'INSERT INTO iam.application_grant(project_id, account_id, granted_by) VALUES ($1, $2, $3)', [projectId, OTHER.member, OTHER.owner])
  await query(connection, "INSERT INTO iam.handoff(handoff_digest, kind, account_id, project_id, binding_digest, provider_refresh_token, minted_at, expires_at) VALUES ($1, 'APPLICATION', $2, $3, $4, $5, now(), now() + interval '30 seconds')", [randomBytes(32), OTHER.member, projectId, randomBytes(32), SEALED])
  await query(connection, "INSERT INTO iam.oidc_transaction(state_digest, pkce_verifier, nonce, expires_at, application_project_id, sign_in_binding_digest) VALUES ($1, 'verifier', 'nonce', now() + interval '10 minutes', $2, $3)", [randomBytes(32), projectId, randomBytes(32)])
  const opened = new Date()
  await query(connection, `INSERT INTO iam.host_session(token_digest, kind, account_id, started_at, absolute_expires_at, provider_refresh_token, provider_checked_at, idle_expires_at)
    VALUES ($1, 'HUB', $2, $3, $3::timestamptz + interval '8 hours', $4, $3, $3::timestamptz + interval '30 minutes')`, [randomBytes(32), OTHER.owner, opened, SEALED])
  const one = async (text, values) => (await query(connection, text, values)).rows[0].id
  return {
    workspaceInvitation: await one('SELECT invitation_id AS id FROM iam.workspace_invitation WHERE workspace_id = $1', [ID.otherWorkspace]),
    applicationInvitation: await one('SELECT invitation_id AS id FROM iam.application_invitation WHERE project_id = $1', [projectId]),
    grant: await one('SELECT grant_id AS id FROM iam.application_grant WHERE project_id = $1', [projectId]),
  }
}

// A thumbnail needs a served revision, an application and a retained image: seeded here by SQL for one Project.
const seedThumbnail = async (connection, projectId, bytes) => {
  const revisionId = await seedRevision(connection, projectId, { sourceRevision: STARTER, digest: 'd'.repeat(64), payload: launchablePayload() })
  await query(connection, 'UPDATE builder.project_working_state SET last_preview_source_revision = $2, last_preview_artifact_revision_id = $3, last_preview_artifact_digest = $4 WHERE project_id = $1', [projectId, STARTER, revisionId, 'd'.repeat(64)])
  await query(connection, "INSERT INTO iam.application(project_id, slug, created_by) VALUES ($1, $2, $3)", [projectId, `app-${projectId.slice(0, 8)}`, ID.owner])
  await seedRevisionThumbnail(connection, revisionId, bytes)
  return revisionId
}

// The path parameters of an operation beyond the two tenant ids name a child of a tenant (a run, a
// member, a connection, a grant). Such an operation needs an attempt that admits the actor in its own
// tenant and passes a child id of another. None of today's operations takes one.
const TENANT_PARAMETERS = Object.freeze(['workspaceId', 'projectId'])
// A provider name and a sign-in handle that only the person who started it can see: neither names a tenant's row.
const NON_TENANT_PARAMETERS = Object.freeze(['provider', 'loginId'])
const IN_MEMORY = Object.freeze(['startClaudeModelLogin', 'startCodexModelLogin', 'startGoogleModelLogin'])
// Ends the Hub session named by the caller's own cookie and touches no tenant row; its database work is an authentication entry, which the entry recording does not see.
const OWN_COOKIE_ONLY = Object.freeze(['endSession'])
const childParameters = (operation) => [...operation.path.matchAll(/:(\w+)/g)].map((found) => found[1]).filter((name) => ![...TENANT_PARAMETERS, ...NON_TENANT_PARAMETERS].includes(name))

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
  const thumbnailA = Buffer.from('thumbnail-of-a')
  await query(connection, `INSERT INTO connector.connection(connection_id, workspace_id, connector_id, label, credential_sealed, credential_digest, created_by) VALUES
    ($1, $3, 'sankhya', 'ERP', $5, $6, $4), ($2, $3, 'sankhya', 'Spare', $5, $6, $4)`, [CONNECTION.a, CONNECTION.spare, ID.workspace, ID.administrator, SEALED, 'd'.repeat(64)])
  const revisionA = await seedThumbnail(connection, projectA, thumbnailA)
  await seedThumbnail(connection, projectB, Buffer.from('thumbnail-of-b'))
  const identityOfB = await seedIdentityOfB(connection, projectB)
  for (const [table, rows] of await rowsOfB(connection, projectB)) assert.ok(rows.length > 0, `${table} has a seeded row of tenant B`)
  const entries = []
  const database = recording(fixture.database, entries)
  const registry = createRegistryModule({ database })
  const projects = createProjectStore({ database, repository: { prepare: async () => STARTER }, deletion: { releaseApplicationData: async () => undefined, killSandboxes: async () => undefined, deleteRepository: async () => undefined, purgeIdentityAccess: purgeProject, purgeRegistry: registry.purge, purgeConnectorBindings: purgeProjectBindings, purgeBuilder: purgeProjectBuilder }, builder: builderProjectPorts })
  const workspaces = createWorkspaceStore(database)
  const builder = createBuilderStore({ database, ownerId: randomUUID(), registry })
  const runOfB = (await query(connection, 'SELECT builder_run_id FROM builder.builder_run WHERE project_id = $1', [projectB])).rows[0].builder_run_id
  const member = ID.member
  const FOREIGN_BASE = 'c'.repeat(40)
  const connectors = createConnectorStore({ database, envelope })
  const modelAccounts = createModelAccounts({ database, envelope, ownerId: randomUUID() })
  await query(connection, "INSERT INTO model.model_account(owner_account_id, provider, kind, secret) VALUES ($1, 'openai-codex', 'oauth', $2)", [member, await envelope.seal('codex-of-member')])
  const KEY = { provider: 'anthropic', kind: 'api_key' }
  const before = await digestOfB(connection, projectB)
  const revisionOfA = (await query(connection, 'SELECT project_revision FROM project.project WHERE project_id = $1', [projectA])).rows[0].project_revision
  const withoutActivity = (summaries) => summaries.map(({ lastActivityAt: _at, ...rest }) => rest)
  const cardA = { projectId: projectA, workspaceId: ID.workspace, name: 'Atlas', state: 'live', archived: false }
  const cardBuilds = { projectId: projectBuild, workspaceId: ID.workspace, name: 'Builds', state: 'live', archived: false }
  const cardDoomed = { projectId: doomedA, workspaceId: ID.workspace, name: 'Doomed A', state: 'live', archived: false }

  // own: admission passes on the tenant's own ids and the answer holds the tenant's literal rows.
  // cross: the same call with the ids of tenant B answers its refusal and nothing of B.
  // child: null while no operation takes a child id of a tenant.
  const people = { owner: ID.owner, member: ID.member, administrator: ID.administrator }
  const tokens = Object.fromEntries(Object.keys(people).map((name) => [name, opaque(`cross-tenant ${name}`)]))
  const { app } = await testListener({
    sessions: Object.fromEntries(Object.entries(people).map(([name, accountId]) => [tokens[name], { account: { accountId, displayName: name }, issuer: 'https://issuer.test', subject: name }])),
    registerRoutes: async (server) => {
      await createSessions({ database, envelope: {}, provider: {} }).registerRoutes(server, createWorkspaceModule({ database }))
      await registerRosterRoutes(server, database)
      await createApplicationAccess({ database, addressOf: () => null }).registerRoutes(server)
      await registerAdministratorRoutes(server, database)
      return []
    },
  })
  t.after(() => app.close())
  const call = async (who, method, url, body) => {
    const response = await app.inject({
      method, url, headers: { ...(body === undefined ? hubWrite : hubJsonWrite), cookie: hubSessionCookie(tokens[who]), 'idempotency-key': randomUUID() },
      ...(body === undefined ? {} : { payload: body }),
    })
    return { status: response.statusCode, code: response.statusCode >= 400 ? response.json().code : undefined, body: response.statusCode === 204 ? undefined : response.json() }
  }
  const refused = async (who, method, url, status, code, body) => assert.deepEqual(await call(who, method, url, body).then(({ status: got, code: gotCode }) => ({ status: got, code: gotCode })), { status, code })
  const W = (workspaceId) => `/api/control/workspaces/${workspaceId}`
  const P = (projectId) => `/api/control/projects/${projectId}/application-access`
  const ADMINISTRATORS = '/api/control/installation/administrators'
  let bindingOfA
  let administratorAdded
  const ABSENT = { own: { state: 'absent' }, shared: false }
  const attempts = {
    'getSession': {
      own: async () => {
        const answered = await call('member', 'GET', '/api/session')
        assert.deepEqual({ status: answered.status, administrator: answered.body.administrator, workspaces: answered.body.workspaces }, { status: 200, administrator: false, workspaces: [{ workspaceId: ID.workspace, name: 'Operations' }] })
      },
      cross: async () => assert.deepEqual((await call('administrator', 'GET', '/api/session')).body.workspaces,
        [{ workspaceId: ID.otherWorkspace, name: 'Elsewhere' }, { workspaceId: ID.workspace, name: 'Operations' }]),
      child: null,
    },
    'getWorkspaceRoster': {
      own: async () => {
        const answered = await call('member', 'GET', `${W(ID.workspace)}/roster`)
        assert.deepEqual({ status: answered.status, viewerRole: answered.body.viewerRole, members: answered.body.entries.map((entry) => entry.accountId).sort() }, { status: 200, viewerRole: 'member', members: [ID.owner, ID.member, ID.memberAdministrator].sort() })
      },
      cross: () => refused('member', 'GET', `${W(ID.otherWorkspace)}/roster`, 404, 'WORKSPACE_NOT_FOUND'),
      child: null,
    },
    'inviteWorkspaceMember': {
      own: async () => {
        const answered = await call('owner', 'POST', `${W(ID.workspace)}/invitations`, { email: 'newcomer@example.test', role: 'member' })
        assert.deepEqual({ status: answered.status, email: answered.body.email, role: answered.body.role }, { status: 201, email: 'newcomer@example.test', role: 'member' })
      },
      cross: () => refused('owner', 'POST', `${W(ID.otherWorkspace)}/invitations`, 404, 'WORKSPACE_NOT_FOUND', { email: 'intruder@example.test', role: 'member' }),
      child: null,
    },
    'removeWorkspaceMember': {
      own: async () => {
        const leaver = randomUUID()
        await query(connection, "INSERT INTO iam.account(account_id, issuer, external_subject, display_name) VALUES ($1, 'https://issuer.test', $2, 'Leaver')", [leaver, `leaver-${leaver}`])
        await query(connection, "INSERT INTO iam.workspace_membership(account_id, workspace_id, role) VALUES ($1, $2, 'member')", [leaver, ID.workspace])
        assert.equal((await call('owner', 'DELETE', `${W(ID.workspace)}/members/${leaver}`)).status, 204)
        assert.deepEqual((await query(connection, 'SELECT count(*)::integer AS count FROM iam.workspace_membership WHERE account_id = $1', [leaver])).rows, [{ count: 0 }])
      },
      cross: () => refused('owner', 'DELETE', `${W(ID.otherWorkspace)}/members/${OTHER.member}`, 404, 'WORKSPACE_NOT_FOUND'),
      child: () => refused('owner', 'DELETE', `${W(ID.workspace)}/members/${OTHER.member}`, 404, 'ROSTER_ENTRY_NOT_FOUND'),
    },
    'cancelWorkspaceInvitation': {
      own: async () => {
        const invited = await call('owner', 'POST', `${W(ID.workspace)}/invitations`, { email: 'withdrawn@example.test', role: 'member' })
        assert.equal((await call('owner', 'DELETE', `${W(ID.workspace)}/invitations/${invited.body.invitationId}`)).status, 204)
      },
      cross: () => refused('owner', 'DELETE', `${W(ID.otherWorkspace)}/invitations/${identityOfB.workspaceInvitation}`, 404, 'WORKSPACE_NOT_FOUND'),
      child: () => refused('owner', 'DELETE', `${W(ID.workspace)}/invitations/${identityOfB.workspaceInvitation}`, 404, 'ROSTER_ENTRY_NOT_FOUND'),
    },
    'setWorkspaceMemberRole': {
      own: async () => {
        const answered = await call('owner', 'PUT', `${W(ID.workspace)}/members/${ID.member}`, { role: 'owner' })
        assert.deepEqual({ status: answered.status, accountId: answered.body.accountId, role: answered.body.role }, { status: 200, accountId: ID.member, role: 'owner' })
      },
      cross: () => refused('owner', 'PUT', `${W(ID.otherWorkspace)}/members/${OTHER.member}`, 404, 'WORKSPACE_NOT_FOUND', { role: 'owner' }),
      child: () => refused('owner', 'PUT', `${W(ID.workspace)}/members/${OTHER.member}`, 404, 'ROSTER_ENTRY_NOT_FOUND', { role: 'owner' }),
    },
    'getApplicationAccess': {
      own: async () => assert.deepEqual({ ...(await call('owner', 'GET', P(projectA))), body: undefined }, { status: 200, code: undefined, body: undefined }),
      cross: () => refused('owner', 'GET', P(projectB), 404, 'PROJECT_NOT_FOUND'),
      child: null,
    },
    'grantApplicationAccess': {
      own: async () => {
        const answered = await call('owner', 'POST', P(projectA), { email: 'guest@example.test' })
        assert.deepEqual({ status: answered.status, email: answered.body.email }, { status: 201, email: 'guest@example.test' })
      },
      cross: () => refused('owner', 'POST', P(projectB), 404, 'PROJECT_NOT_FOUND', { email: 'intruder@example.test' }),
      child: null,
    },
    'revokeApplicationGrant': {
      own: async () => {
        const grantId = (await query(connection, 'INSERT INTO iam.application_grant(project_id, account_id, granted_by) VALUES ($1, $2, $3) RETURNING grant_id', [projectA, ID.outsider, ID.owner])).rows[0].grant_id
        assert.equal((await call('owner', 'DELETE', `${P(projectA)}/grants/${grantId}`)).status, 204)
        assert.deepEqual((await query(connection, 'SELECT revoked_at IS NOT NULL AS revoked FROM iam.application_grant WHERE grant_id = $1', [grantId])).rows, [{ revoked: true }])
      },
      cross: () => refused('owner', 'DELETE', `${P(projectB)}/grants/${identityOfB.grant}`, 404, 'PROJECT_NOT_FOUND'),
      child: () => refused('owner', 'DELETE', `${P(projectA)}/grants/${identityOfB.grant}`, 404, 'APPLICATION_ACCESS_ENTRY_NOT_FOUND'),
    },
    'cancelApplicationInvitation': {
      own: async () => {
        const invited = await call('owner', 'POST', P(projectA), { email: 'withdrawn-guest@example.test' })
        assert.equal((await call('owner', 'DELETE', `${P(projectA)}/invitations/${invited.body.invitationId}`)).status, 204)
      },
      cross: () => refused('owner', 'DELETE', `${P(projectB)}/invitations/${identityOfB.applicationInvitation}`, 404, 'PROJECT_NOT_FOUND'),
      child: () => refused('owner', 'DELETE', `${P(projectA)}/invitations/${identityOfB.applicationInvitation}`, 404, 'APPLICATION_ACCESS_ENTRY_NOT_FOUND'),
    },
    'listInstallationAdministrators': {
      own: async () => {
        const answered = await call('administrator', 'GET', ADMINISTRATORS)
        assert.deepEqual({ status: answered.status, accounts: answered.body.administrators.map((entry) => entry.accountId).sort() }, { status: 200, accounts: [ID.administrator, ID.memberAdministrator, OTHER.member].sort() })
      },
      cross: () => refused('member', 'GET', ADMINISTRATORS, 403, 'INSTALLATION_ADMINISTRATOR_REQUIRED'),
      child: null,
    },
    'addInstallationAdministrator': {
      own: async () => {
        administratorAdded = randomUUID()
        await query(connection, "INSERT INTO iam.account(account_id, issuer, external_subject, display_name, email) VALUES ($1, 'https://issuer.test', $2, 'Newly made', 'newly-made@example.test')", [administratorAdded, `made-${administratorAdded}`])
        const answered = await call('administrator', 'POST', ADMINISTRATORS, { email: 'newly-made@example.test' })
        assert.deepEqual({ status: answered.status, accountId: answered.body.accountId, grantedVia: answered.body.grantedVia }, { status: 201, accountId: administratorAdded, grantedVia: 'ADMINISTRATOR' })
      },
      cross: () => refused('member', 'POST', ADMINISTRATORS, 403, 'INSTALLATION_ADMINISTRATOR_REQUIRED', { email: 'newly-made@example.test' }),
      child: null,
    },
    'removeInstallationAdministrator': {
      own: async () => {
        assert.equal((await call('administrator', 'DELETE', `${ADMINISTRATORS}/${administratorAdded}`)).status, 204)
        assert.deepEqual((await query(connection, 'SELECT revoked_at IS NOT NULL AS revoked FROM iam.installation_administrator WHERE account_id = $1', [administratorAdded])).rows, [{ revoked: true }])
      },
      cross: () => refused('member', 'DELETE', `${ADMINISTRATORS}/${ID.administrator}`, 403, 'INSTALLATION_ADMINISTRATOR_REQUIRED'),
      child: () => refused('administrator', 'DELETE', `${ADMINISTRATORS}/${OTHER.owner}`, 404, 'INSTALLATION_ADMINISTRATOR_NOT_FOUND'),
    },
    'listAvailableModels': {
      own: async () => assert.deepEqual((await modelAccounts.standing(member))['openai-codex'], { own: { state: 'connected', kind: 'oauth' }, shared: false }),
      cross: async () => assert.deepEqual((await modelAccounts.standing(member)).anthropic, ABSENT),
      child: null,
    },
    'listModelAccounts': {
      own: async () => assert.deepEqual(await modelAccounts.standing(member), { anthropic: ABSENT, 'openai-codex': { own: { state: 'connected', kind: 'oauth' }, shared: false }, 'google-ai-pro': ABSENT }),
      cross: async () => assert.deepEqual((await modelAccounts.standing(member)).anthropic, ABSENT),
      child: null,
    },
    'getGoogleModelConnection': {
      own: async () => assert.deepEqual((await modelAccounts.standing(member))['google-ai-pro'], ABSENT),
      cross: async () => assert.deepEqual((await modelAccounts.standing(member))['google-ai-pro'].own, { state: 'absent' }),
      child: null,
    },
    'setModelAccountApiKey': {
      own: async () => {
        await modelAccounts.write({ accountId: member, credential: KEY, secret: 'key-of-member' })
        assert.deepEqual((await query(connection, "SELECT provider, kind, sharing FROM model.model_account WHERE owner_account_id = $1 AND provider = 'anthropic'", [member])).rows, [{ provider: 'anthropic', kind: 'api_key', sharing: 'just_me' }])
      },
      cross: () => assert.rejects(modelAccounts.write({ accountId: randomUUID(), credential: KEY, secret: 'intruder' }), { id: 'ACCOUNT_NOT_FOUND' }),
      child: null,
    },
    'completeClaudeModelLogin': {
      own: async () => assert.deepEqual(await modelAccounts.connect({ accountId: member, credential: { provider: 'anthropic', kind: 'oauth' }, secret: 'tokens' }), { ok: true }),
      cross: async () => assert.deepEqual(await modelAccounts.connect({ accountId: randomUUID(), credential: { provider: 'anthropic', kind: 'oauth' }, secret: 'tokens' }), { ok: false, reason: 'ACCOUNT_NOT_FOUND' }),
      child: null,
    },
    'completeGoogleModelLogin': {
      own: async () => assert.deepEqual(await modelAccounts.connect({ accountId: member, credential: { provider: 'google-ai-pro', kind: 'google_ai_pro' }, secret: 'session' }), { ok: true }),
      cross: async () => assert.deepEqual(await modelAccounts.connect({ accountId: randomUUID(), credential: { provider: 'google-ai-pro', kind: 'google_ai_pro' }, secret: 'session' }), { ok: false, reason: 'ACCOUNT_NOT_FOUND' }),
      child: null,
    },
    'pollCodexModelLogin': {
      own: async () => assert.deepEqual(await modelAccounts.connect({ accountId: member, credential: { provider: 'openai-codex', kind: 'oauth' }, secret: 'tokens' }), { ok: true }),
      cross: async () => assert.deepEqual(await modelAccounts.connect({ accountId: randomUUID(), credential: { provider: 'openai-codex', kind: 'oauth' }, secret: 'tokens' }), { ok: false, reason: 'ACCOUNT_NOT_FOUND' }),
      child: null,
    },
    'getGoogleModelLoginStatus': {
      own: async () => assert.deepEqual(await modelAccounts.connect({ accountId: member, credential: { provider: 'google-ai-pro', kind: 'google_ai_pro' }, secret: 'session' }), { ok: true }),
      cross: async () => assert.deepEqual(await modelAccounts.connect({ accountId: randomUUID(), credential: { provider: 'google-ai-pro', kind: 'google_ai_pro' }, secret: 'session' }), { ok: false, reason: 'ACCOUNT_NOT_FOUND' }),
      child: null,
    },
    'createWorkspace': {
      own: async () => {
        const created = await workspaces.createWorkspace({ accountId: member, idempotencyKey: 'tenant', body: { name: 'Mine' } })
        assert.equal(created.reply.creatorAccountId, member)
        assert.equal(created.reply.name, 'Mine')
      },
      cross: null,
      child: null,
    },
    'listProjects': {
      own: async () => assert.deepEqual(await projects.listProjects({ accountId: member, workspaceId: ID.workspace }), [cardA, cardBuilds, cardDoomed]),
      cross: () => assert.rejects(projects.listProjects({ accountId: member, workspaceId: ID.otherWorkspace }), { id: 'WORKSPACE_NOT_FOUND' }),
      child: null,
    },
    'getProject': {
      own: async () => assert.deepEqual(await projects.getProject({ accountId: member, projectId: projectA }), { ...cardA, state: 'live', projectRevision: revisionOfA }),
      cross: () => assert.rejects(projects.getProject({ accountId: member, projectId: projectB }), { id: 'PROJECT_NOT_FOUND' }),
      child: null,
    },
    'createProject': {
      own: async () => {
        const created = await projects.createProject({ accountId: member, workspaceId: ID.workspace, idempotencyKey: 'own', body: { name: 'Mine', sourceBootstrap: { mode: 'NEW' } } })
        assert.deepEqual({ replayed: created.replayed, name: created.reply.name, workspaceId: created.reply.workspaceId }, { replayed: false, name: 'Mine', workspaceId: ID.workspace })
      },
      cross: () => assert.rejects(projects.createProject({ accountId: member, workspaceId: ID.otherWorkspace, idempotencyKey: 'intruder', body: BODY }), { id: 'WORKSPACE_NOT_FOUND' }),
      child: null,
    },
    'deleteProject': {
      own: async () => {
        await projects.deleteProject({ accountId: ID.owner, projectId: doomedA, confirmName: 'Doomed A' })
        assert.deepEqual((await query(connection, 'SELECT project_id, name, requested_by FROM project.project_deletion WHERE project_id = $1', [doomedA])).rows, [{ project_id: doomedA, name: 'Doomed A', requested_by: ID.owner }])
      },
      cross: () => assert.rejects(projects.deleteProject({ accountId: member, projectId: projectB, confirmName: 'Borealis' }), { id: 'PROJECT_NOT_FOUND' }),
      child: null,
    },
    'listProjectSummaries': {
      own: async () => {
        const summaries = withoutActivity(await projects.listProjectSummariesWithActivity({ accountId: member, workspaceId: ID.workspace }))
        assert.deepEqual(summaries.map((summary) => summary.name).sort(), ['Atlas', 'Builds', 'Mine'])
        assert.deepEqual(summaries.find((summary) => summary.name === 'Atlas'), { projectId: projectA, name: 'Atlas', state: 'live', archived: false, latestRun: null, hasPreview: true })
      },
      cross: () => assert.rejects(projects.listProjectSummariesWithActivity({ accountId: member, workspaceId: ID.otherWorkspace }), { id: 'WORKSPACE_NOT_FOUND' }),
      child: null,
    },
    'listProjectSourceTree': {
      own: async () => assert.equal(await builder.admitSourceRevision({ accountId: member, projectId: projectA, sourceRevision: FOREIGN_BASE, readMain: async () => FOREIGN_BASE }), true),
      cross: async () => assert.equal(await builder.admitSourceRevision({ accountId: member, projectId: projectB, sourceRevision: FOREIGN_BASE, readMain: async () => FOREIGN_BASE }), false),
      child: null,
    },
    'getProjectSourceFile': {
      own: async () => assert.equal(await builder.admitSourceRevision({ accountId: member, projectId: projectA, sourceRevision: FOREIGN_BASE, readMain: async () => FOREIGN_BASE }), true),
      cross: async () => assert.equal(await builder.admitSourceRevision({ accountId: member, projectId: projectB, sourceRevision: FOREIGN_BASE, readMain: async () => FOREIGN_BASE }), false),
      child: null,
    },
    'compareProjectSourceRevisions': {
      own: async () => assert.equal(await builder.admitSourceRevision({ accountId: member, projectId: projectA, sourceRevision: FOREIGN_BASE, readMain: async () => FOREIGN_BASE }), true),
      cross: async () => assert.equal(await builder.admitSourceRevision({ accountId: member, projectId: projectB, sourceRevision: FOREIGN_BASE, readMain: async () => FOREIGN_BASE }), false),
      child: null,
    },
    'getBuilderSession': {
      own: async () => assert.deepEqual(await builder.readBuilderRun({ accountId: member, projectId: projectA }), null),
      cross: () => assert.rejects(builder.readBuilderRun({ accountId: member, projectId: projectB }), { id: 'PROJECT_NOT_FOUND' }),
      child: null,
    },
    'sendBuilderMessage': {
      own: async () => {
        const run = await builder.createBuilderRun({ accountId: member, projectId: projectBuild, conversationId: '33333333-3333-4333-8333-333333333333', idempotencyKey: 'own', content: 'build', readBase: async () => FOREIGN_BASE })
        assert.deepEqual({ state: run.state, baseSourceRevision: run.baseSourceRevision, requestText: run.requestText }, { state: 'QUEUED', baseSourceRevision: FOREIGN_BASE, requestText: 'build' })
      },
      cross: () => assert.rejects(builder.createBuilderRun({ accountId: member, projectId: projectB, conversationId: '33333333-3333-4333-8333-333333333333', idempotencyKey: 'intruder', content: 'build', readBase: async () => FOREIGN_BASE }), { id: 'PROJECT_NOT_FOUND' }),
      child: null,
    },
    'cancelBuilderRun': {
      own: async () => {
        const ownRun = (await query(connection, 'SELECT builder_run_id FROM builder.builder_run WHERE project_id = $1', [projectBuild])).rows[0].builder_run_id
        const cancelled = await builder.requestBuilderRunCancellation({ accountId: member, projectId: projectBuild, builderRunId: ownRun })
        assert.equal(cancelled.state, 'INTERRUPTED')
      },
      cross: () => assert.rejects(builder.requestBuilderRunCancellation({ accountId: member, projectId: projectB, builderRunId: runOfB }), { id: 'PROJECT_NOT_FOUND' }),
      child: () => assert.rejects(builder.requestBuilderRunCancellation({ accountId: member, projectId: projectBuild, builderRunId: runOfB }), { id: 'BUILDER_RUN_NOT_FOUND' }),
    },
    'getBuilderRunTrace': {
      own: async () => assert.deepEqual((await builder.listBuilderRuns({ accountId: member, projectId: projectBuild })).map((run) => run.state), ['INTERRUPTED']),
      cross: () => assert.rejects(builder.readBuilderRun({ accountId: member, projectId: projectB }), { id: 'PROJECT_NOT_FOUND' }),
      child: async () => assert.notEqual((await builder.readBuilderRun({ accountId: member, projectId: projectBuild })).builderRunId, runOfB),
    },
    'launchBuilderPreview': {
      own: async () => assert.deepEqual(await builder.openLaunch({ accountId: member, projectId: projectA }, async (_proof, launch) => launch), { sourceRevision: STARTER, artifactRevisionId: revisionA, digest: 'd'.repeat(64), entryPath: 'index.html', files: [{ path: 'index.html', mediaType: 'text/html; charset=utf-8' }] }),
      cross: () => assert.rejects(builder.openLaunch({ accountId: member, projectId: projectB }, async () => assert.fail('a refused admission opens nothing')), { id: 'PROJECT_NOT_FOUND' }),
      child: null,
    },
    'getProjectThumbnail': {
      own: async () => {
        const thumbnail = await registry.readProjectThumbnail(member, projectA)
        assert.deepEqual({ revision: thumbnail.artifactRevisionId, bytes: Buffer.from(thumbnail.bytes).toString() }, { revision: revisionA, bytes: 'thumbnail-of-a' })
      },
      cross: () => assert.rejects(registry.readProjectThumbnail(member, projectB), { id: 'PROJECT_NOT_FOUND' }),
      child: null,
    },
    'listWorkspaceConnections': {
      own: async () => assert.deepEqual(await connectors.listConnections({ accountId: ID.administrator, workspaceId: ID.workspace }), [
        { connectionId: CONNECTION.a, connectorId: 'sankhya', label: 'ERP', createdAt: (await query(connection, 'SELECT created_at FROM connector.connection WHERE connection_id = $1', [CONNECTION.a])).rows[0].created_at.toISOString() },
        { connectionId: CONNECTION.spare, connectorId: 'sankhya', label: 'Spare', createdAt: (await query(connection, 'SELECT created_at FROM connector.connection WHERE connection_id = $1', [CONNECTION.spare])).rows[0].created_at.toISOString() },
      ]),
      cross: () => assert.rejects(connectors.listConnections({ accountId: member, workspaceId: ID.otherWorkspace }), { id: 'INSTALLATION_ADMINISTRATOR_REQUIRED' }),
      child: null,
    },
    'createWorkspaceConnection': {
      own: async () => {
        const created = await connectors.createConnection({ accountId: ID.administrator, workspaceId: ID.workspace, body: { connectionId: CONNECTION.created, connectorId: 'sankhya', label: 'Mine', credential: { clientId: 'c', clientSecret: 's', xToken: 'x' } } })
        assert.deepEqual({ created: created.created, label: created.connection.label, connectionId: created.connection.connectionId }, { created: true, label: 'Mine', connectionId: CONNECTION.created })
      },
      cross: () => assert.rejects(connectors.createConnection({ accountId: member, workspaceId: ID.otherWorkspace, body: { connectionId: randomUUID(), connectorId: 'sankhya', label: 'Intruder', credential: { clientId: 'c', clientSecret: 's', xToken: 'x' } } }), { id: 'INSTALLATION_ADMINISTRATOR_REQUIRED' }),
      child: null,
    },
    'checkWorkspaceConnection': {
      own: async () => assert.deepEqual(await connectors.readCredentialForCheck({ accountId: ID.administrator, workspaceId: ID.workspace, connectionId: CONNECTION.a }), { connectorId: 'sankhya', sealed: SEALED }),
      cross: () => assert.rejects(connectors.readCredentialForCheck({ accountId: member, workspaceId: ID.otherWorkspace, connectionId: CONNECTION.b }), { id: 'INSTALLATION_ADMINISTRATOR_REQUIRED' }),
      child: () => assert.rejects(connectors.readCredentialForCheck({ accountId: ID.administrator, workspaceId: ID.workspace, connectionId: CONNECTION.b }), { id: 'CONNECTOR_CONNECTION_NOT_FOUND' }),
    },
    'disableWorkspaceConnection': {
      own: async () => {
        await connectors.disableConnection({ accountId: ID.administrator, workspaceId: ID.workspace, connectionId: CONNECTION.spare })
        assert.deepEqual((await query(connection, 'SELECT disabled_at IS NOT NULL AS disabled FROM connector.connection WHERE connection_id = $1', [CONNECTION.spare])).rows, [{ disabled: true }])
      },
      cross: () => assert.rejects(connectors.disableConnection({ accountId: member, workspaceId: ID.otherWorkspace, connectionId: CONNECTION.b }), { id: 'INSTALLATION_ADMINISTRATOR_REQUIRED' }),
      child: () => assert.rejects(connectors.disableConnection({ accountId: ID.administrator, workspaceId: ID.workspace, connectionId: CONNECTION.b }), { id: 'CONNECTOR_CONNECTION_NOT_FOUND' }),
    },
    'listProjectConnectionBindings': {
      own: async () => assert.deepEqual(await connectors.listProjectBindings({ accountId: ID.owner, projectId: projectA }), [
        { kind: 'bindable', connectionId: CONNECTION.a, connectorId: 'sankhya', label: 'ERP' },
        { kind: 'bindable', connectionId: CONNECTION.created, connectorId: 'sankhya', label: 'Mine' },
      ]),
      cross: () => assert.rejects(connectors.listProjectBindings({ accountId: ID.owner, projectId: projectB }), { id: 'PROJECT_NOT_FOUND' }),
      child: null,
    },
    'bindProjectConnection': {
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
    'unbindProjectConnection': {
      own: async () => {
        await connectors.unbindConnection({ accountId: ID.owner, projectId: projectA, bindingId: bindingOfA })
        assert.deepEqual((await query(connection, 'SELECT unbound_at IS NOT NULL AS unbound FROM connector.project_binding WHERE binding_id = $1', [bindingOfA])).rows, [{ unbound: true }])
      },
      cross: () => assert.rejects(connectors.unbindConnection({ accountId: ID.owner, projectId: projectB, bindingId: BINDING_B }), { id: 'PROJECT_NOT_FOUND' }),
      child: () => assert.rejects(connectors.unbindConnection({ accountId: ID.owner, projectId: projectA, bindingId: BINDING_B }), { id: 'CONNECTOR_BINDING_NOT_FOUND' }),
    },
  }
  assert.deepEqual(Object.keys(attempts).sort(), Object.values(OPERATIONS).map((operation) => operation.id).filter((id) => !IN_MEMORY.includes(id) && !OWN_COOKIE_ONLY.includes(id)).sort(), 'every operation of the contract has its attempts')

  for (const operation of Object.values(OPERATIONS)) {
    if (IN_MEMORY.includes(operation.id) || OWN_COOKIE_ONLY.includes(operation.id)) continue
    const attempt = attempts[operation.id]
    if (childParameters(operation).length > 0) assert.equal(typeof attempt.child, 'function', `${operation.id} takes a child id (${childParameters(operation).join(', ')}) and needs the attempt that passes a child of another tenant`)
    else assert.equal(attempt.child, null, `${operation.id} takes no child id, so it has no child attempt`)
    if (operation.id !== 'createWorkspace') assert.equal(typeof attempt.cross, 'function', `${operation.id} has a cross tenant attempt`)
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
