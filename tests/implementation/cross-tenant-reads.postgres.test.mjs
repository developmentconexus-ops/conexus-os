import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { z } from 'zod'
import { hubModuleUrl } from './hub-build.mjs'
import { query } from './hub-database.mjs'
import { ID, setupProjects } from './project-fixture.mjs'
import { seedRevision, seedRevisionThumbnail } from './registry-fixture.mjs'

const { sql } = await import(hubModuleUrl('platform/db.js'))

const OTHER = Object.freeze({
  owner: '10000000-0000-4000-8000-0000000000b1',
  member: '10000000-0000-4000-8000-0000000000b2',
})
const Key = z.object({ key: z.string() })

const seedSession = async (connection, projectId) => {
  const conversationId = randomUUID()
  await query(connection, 'INSERT INTO builder.conversation_session(conversation_id, project_id) VALUES ($1, $2)', [conversationId, projectId])
  return [conversationId]
}

const seed = async (fixture) => {
  const { connection, seedProject, settleRun } = fixture
  await query(connection, `INSERT INTO iam.account(account_id, issuer, external_subject, display_name) VALUES
    ($1, 'https://issuer.test', 'other-owner', 'Other owner'), ($2, 'https://issuer.test', 'other-member', 'Other member')`, [OTHER.owner, OTHER.member])
  await query(connection, "INSERT INTO iam.workspace_membership(account_id, workspace_id, role) VALUES ($1, $3, 'owner'), ($2, $3, 'member')", [OTHER.owner, OTHER.member, ID.otherWorkspace])
  const projects = { a: await seedProject('Atlas', ID.workspace), b: await seedProject('Borealis', ID.otherWorkspace) }
  const doomed = { a: await seedProject('Doomed A', ID.workspace), b: await seedProject('Doomed B', ID.otherWorkspace) }
  await settleRun(projects.a)
  await settleRun(projects.b)
  const tombstone = (projectId, workspaceId) => query(connection, "INSERT INTO project.project_deletion(project_id, workspace_id, name, requested_by) VALUES ($1, $2, 'Doomed', $3)", [projectId, workspaceId, ID.administrator])
  await tombstone(doomed.a, ID.workspace)
  await tombstone(doomed.b, ID.otherWorkspace)
  const sessions = {
    a: await seedSession(connection, projects.a),
    b: await seedSession(connection, projects.b),
  }
  const connections = { a: '33333333-3333-4333-8333-0000000000a1', b: '33333333-3333-4333-8333-0000000000b1' }
  const sealed = 'mastra:factory-secret:v1:seed'
  const digest = 'd'.repeat(64)
  await query(connection, `INSERT INTO connector.connection(connection_id, workspace_id, connector_id, label, credential_sealed, credential_digest, created_by) VALUES
    ($1, $3, 'sankhya', 'ERP A', $5, $7, $4), ($2, $6, 'sankhya', 'ERP B', $5, $7, $4)`, [connections.a, connections.b, ID.workspace, ID.administrator, sealed, ID.otherWorkspace, digest])
  const bindings = { a: '44444444-4444-4444-8444-0000000000a1', b: '44444444-4444-4444-8444-0000000000b1' }
  await query(connection, `INSERT INTO connector.project_binding(binding_id, workspace_id, project_id, environment, connection_id, name, bound_by) VALUES
    ($1, $3, $5, 'preview', $7, 'erp', $9), ($2, $4, $6, 'preview', $8, 'erp', $10)`, [bindings.a, bindings.b, ID.workspace, ID.otherWorkspace, projects.a, projects.b, connections.a, connections.b, ID.owner, OTHER.owner])
  const models = { a: '55555555-5555-4555-8555-0000000000a1', b: '55555555-5555-4555-8555-0000000000b1' }
  await query(connection, `INSERT INTO model.model_account(model_account_id, owner_account_id, provider, kind, secret) VALUES
    ($1, $3, 'anthropic', 'api_key', $5), ($2, $4, 'anthropic', 'api_key', $5)`, [models.a, models.b, ID.member, OTHER.member, sealed])
  await query(connection, "INSERT INTO model.installation_default(role, model_id, updated_by) VALUES ('build', 'anthropic/x', $1), ('memory', 'anthropic/x', $1)", [ID.administrator])
  const revisions = { a: await seedRevision(connection, projects.a, { sourceRevision: 'a'.repeat(40), digest: 'a'.repeat(64) }), b: await seedRevision(connection, projects.b, { sourceRevision: 'b'.repeat(40), digest: 'b'.repeat(64) }) }
  await seedRevisionThumbnail(connection, revisions.a)
  await seedRevisionThumbnail(connection, revisions.b)
  const runs = async (projectId) => (await query(connection, 'SELECT builder_run_id::text AS key FROM builder.builder_run WHERE project_id = $1', [projectId])).rows.map((row) => row.key)
  const slugs = { a: 'atlas-app', b: 'borealis-app' }
  await query(connection, `INSERT INTO iam.application(project_id, slug, created_by) VALUES ($1, $3, $5), ($2, $4, $6)`, [projects.a, projects.b, slugs.a, slugs.b, ID.owner, OTHER.owner])
  const grants = { a: '66666666-6666-4666-8666-0000000000a1', b: '66666666-6666-4666-8666-0000000000b1' }
  await query(connection, `INSERT INTO iam.application_grant(grant_id, project_id, account_id, granted_by) VALUES ($1, $3, $5, $7), ($2, $4, $6, $8)`,
    [grants.a, grants.b, projects.a, projects.b, ID.outsider, OTHER.member, ID.owner, OTHER.owner])
  const applicationInvitations = { a: '77777777-7777-4777-8777-0000000000a1', b: '77777777-7777-4777-8777-0000000000b1' }
  await query(connection, `INSERT INTO iam.application_invitation(invitation_id, project_id, email, invited_by, expires_at) VALUES
    ($1, $3, 'guest-a@example.test', $5, now() + interval '1 day'), ($2, $4, 'guest-b@example.test', $6, now() + interval '1 day')`,
  [applicationInvitations.a, applicationInvitations.b, projects.a, projects.b, ID.owner, OTHER.owner])
  const workspaceInvitations = { a: '88888888-8888-4888-8888-0000000000a1', b: '88888888-8888-4888-8888-0000000000b1' }
  await query(connection, `INSERT INTO iam.workspace_invitation(invitation_id, workspace_id, email, role, invited_by, expires_at) VALUES
    ($1, $3, 'invitee-a@example.test', 'member', $5, now() + interval '1 day'), ($2, $4, 'invitee-b@example.test', 'member', $6, now() + interval '1 day')`,
  [workspaceInvitations.a, workspaceInvitations.b, ID.workspace, ID.otherWorkspace, ID.owner, OTHER.owner])
  const tenures = (await query(connection, 'SELECT tenure_id::text AS key FROM iam.installation_administrator ORDER BY account_id')).rows.map((row) => row.key)
  const memberKeys = { a: [ID.owner, ID.member, ID.memberAdministrator], b: [OTHER.owner, OTHER.member] }
  return {
    'workspace.workspace': { a: [ID.workspace], b: [ID.otherWorkspace] },
    'project.project': { a: [projects.a], b: [projects.b] },
    'project.project_deletion': { a: [doomed.a], b: [doomed.b] },
    'builder.builder_run': { a: await runs(projects.a), b: await runs(projects.b) },
    'builder.project_working_state': { a: [projects.a], b: [projects.b] },
    'builder.conversation_session': sessions,
    'iam.workspace_membership': memberKeys,
    'iam.account': memberKeys,
    'iam.application': { a: [projects.a], b: [projects.b] },
    'iam.application_grant': { a: [grants.a], b: [grants.b] },
    'iam.application_invitation': { a: [applicationInvitations.a], b: [applicationInvitations.b] },
    'iam.workspace_invitation': { a: [workspaceInvitations.a], b: [workspaceInvitations.b] },
    'iam.installation_administrator': { a: tenures.slice(0, 1), b: tenures.slice(1) },
    'connector.connection': { a: [connections.a], b: [connections.b] },
    'reg.artifact_revision': { a: [revisions.a], b: [revisions.b] },
    'reg.application_thumbnail': { a: [revisions.a], b: [revisions.b] },
    'connector.project_binding': { a: [bindings.a], b: [bindings.b] },
    'model.model_account': { a: [models.a], b: [models.b] },
    'model.installation_default': { a: ['build'], b: ['memory'] },
  }
}

const OWNER_ONLY = Object.freeze(['connector.connection', 'connector.project_binding', 'iam.application', 'iam.application_grant', 'iam.application_invitation'])
const ADMINISTRATOR_ONLY = Object.freeze(['iam.installation_administrator'])
const EVERYONE = Object.freeze(['model.installation_default'])
const readerOf = (table, workspace) => (OWNER_ONLY.includes(table) ? { a: ID.owner, b: OTHER.owner }[workspace] : { a: ID.member, b: OTHER.member }[workspace])

const KEY_COLUMN = {
  'workspace.workspace': 'workspace_id',
  'project.project': 'project_id',
  'project.project_deletion': 'project_id',
  'builder.builder_run': 'builder_run_id',
  'builder.project_working_state': 'project_id',
  'builder.conversation_session': 'conversation_id',
  'iam.workspace_membership': 'account_id',
  'iam.account': 'account_id',
  'iam.application': 'project_id',
  'iam.application_grant': 'grant_id',
  'iam.application_invitation': 'invitation_id',
  'iam.workspace_invitation': 'invitation_id',
  'iam.installation_administrator': 'tenure_id',
  'connector.connection': 'connection_id',
  'reg.artifact_revision': 'artifact_revision_id',
  'reg.application_thumbnail': 'artifact_revision_id',
  'connector.project_binding': 'binding_id',
  'model.model_account': 'model_account_id',
  'model.installation_default': 'role',
}

const readableTables = async (connection) => (await query(connection, `SELECT n.nspname || '.' || c.relname AS table_name FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('r', 'p') AND n.nspname IN ('iam', 'workspace', 'project', 'builder', 'connector', 'reg', 'platform', 'model')
    AND has_any_column_privilege('hub_reader', c.oid, 'SELECT') ORDER BY 1`)).rows.map((row) => row.table_name)

const visibleKeys = (database, accountId, table) => {
  const [schema, name] = table.split('.')
  return database.read(accountId, (tx) => tx.rows(Key, sql`SELECT ${sql.identifier(KEY_COLUMN[table])}::text AS key FROM ${sql.identifier(schema)}.${sql.identifier(name)}`)).then((rows) => rows.map((row) => row.key).sort())
}

test('every table hub_reader can SELECT is seeded, and a member of one workspace reads its rows and none of the other', async (t) => {
  const fixture = await setupProjects(t, 'conexus_cross_tenant')
  const seeded = await seed(fixture)
  const tables = await readableTables(fixture.connection)
  assert.deepEqual(tables, Object.keys(seeded).sort(), 'a table with a reader grant has a seed, and a seed has a grant')
  for (const table of tables) {
    const { a, b } = seeded[table]
    assert.ok(a.length > 0 && b.length > 0, `${table} is seeded in both workspaces`)
    const whole = [...a, ...b].sort()
    if (ADMINISTRATOR_ONLY.includes(table)) {
      for (const reader of [ID.member, ID.owner, OTHER.owner]) assert.deepEqual(await visibleKeys(fixture.database, reader, table), [], `${table}: a Workspace reader who is not an installation administrator reads nothing`)
      continue
    }
    assert.deepEqual(await visibleKeys(fixture.database, readerOf(table, 'a'), table), EVERYONE.includes(table) ? whole : [...a].sort(), `${table}: a reader of A reads exactly A's rows`)
    assert.deepEqual(await visibleKeys(fixture.database, readerOf(table, 'b'), table), EVERYONE.includes(table) ? whole : [...b].sort(), `${table}: a reader of B reads exactly B's rows`)
    if (OWNER_ONLY.includes(table)) assert.deepEqual(await visibleKeys(fixture.database, ID.member, table), [], `${table}: a member who is not an owner reads nothing`)
  }
})

// An installation administrator reads every account, to find a person to make administrator (spec 0015 part iam section 4).
test('an installation administrator who belongs to neither workspace reads the deletions of both, every account, and no other tenant row', async (t) => {
  const fixture = await setupProjects(t, 'conexus_cross_tenant_admin')
  const seeded = await seed(fixture)
  const accounts = (await query(fixture.connection, 'SELECT account_id::text AS key FROM iam.account ORDER BY 1')).rows.map((row) => row.key)
  const REACH = ['project.project_deletion', 'connector.connection']
  for (const table of await readableTables(fixture.connection)) {
    const expected = REACH.includes(table) || EVERYONE.includes(table) || ADMINISTRATOR_ONLY.includes(table) ? [...seeded[table].a, ...seeded[table].b].sort() : table === 'iam.account' ? accounts : []
    assert.deepEqual(await visibleKeys(fixture.database, ID.administrator, table), expected, table)
  }
})

test('the reader positive control: a policy that is false for every row fails the member read', async (t) => {
  const fixture = await setupProjects(t, 'conexus_cross_tenant_control')
  const seeded = await seed(fixture)
  await query(fixture.connection, 'ALTER POLICY reader ON workspace.workspace USING (false)')
  assert.notDeepEqual(await visibleKeys(fixture.database, ID.member, 'workspace.workspace'), [...seeded['workspace.workspace'].a])
  for (const table of OWNER_ONLY) {
    assert.deepEqual(await visibleKeys(fixture.database, ID.owner, table), seeded[table].a, `${table} reads for its owner before the policy is broken`)
    await query(fixture.connection, `ALTER POLICY reader ON ${table} USING (false)`)
    assert.deepEqual(await visibleKeys(fixture.database, ID.owner, table), [], `${table} reads nothing once its reader policy is false`)
  }
})
