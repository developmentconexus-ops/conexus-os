import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadHubMigrationFiles, runMigrations } from '../../scripts/run-hub-migrations.mjs'
import { createEmptyDatabase, query, withClient } from './hub-database.mjs'

const OWNER = 'a0000000-0000-4000-8000-000000000001'
const MEMBER = 'a0000000-0000-4000-8000-000000000002'
const WORKSPACE = 'b0000000-0000-4000-8000-000000000001'
const PROJECT = 'c0000000-0000-4000-8000-000000000001'
const ARTIFACT = 'e0000000-0000-4000-8000-000000000001'
const PREVIEW_ONE = '60000000-0000-4000-8000-000000000001'
const PREVIEW_TWO = '60000000-0000-4000-8000-000000000002'
const SEALED = 'mastra:factory-secret:v1:t'

const corpus = loadHubMigrationFiles()
const beforeIam = corpus.filter(({ version }) => version < '0070')
const iamMigration = corpus.filter(({ version }) => version === '0070')

const seed = `
INSERT INTO iam.account(account_id, issuer, external_subject, display_name, email) VALUES
  ('${OWNER}', 'https://kc.test', 'sub-owner', 'Owner', 'o@x.test'),
  ('${MEMBER}', 'https://kc.test', 'sub-member', 'Member', 'm@x.test');
INSERT INTO workspace.workspace(workspace_id, name) VALUES ('${WORKSPACE}', 'W');
INSERT INTO iam.workspace_membership(account_id, workspace_id, role) VALUES ('${OWNER}', '${WORKSPACE}', 'owner'), ('${MEMBER}', '${WORKSPACE}', 'member');
INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision) VALUES ('${PROJECT}', '${WORKSPACE}', 'P', 'NEW', repeat('a', 40), 'r1');
INSERT INTO reg.artifact_revision(artifact_revision_id, source_revision, digest, payload, project_id) VALUES ('${ARTIFACT}', repeat('a', 40), repeat('1', 64), '{}', '${PROJECT}');
INSERT INTO iam.application(project_id, slug, created_by) VALUES ('${PROJECT}', 'demo', '${OWNER}');
INSERT INTO iam.preview(preview_id, account_id, project_id, source_revision, artifact_revision_id, artifact_digest, exact_host, manifest, opened_at, expires_at) VALUES
  ('${PREVIEW_ONE}', '${OWNER}', '${PROJECT}', repeat('a', 40), '${ARTIFACT}', repeat('1', 64), 'preview-e0000000-0000-4000-8000-000000000001.x.test', '{"entryPath":"index.html","files":[]}', now(), now() + interval '15 minutes'),
  ('${PREVIEW_TWO}', '${MEMBER}', '${PROJECT}', repeat('a', 40), '${ARTIFACT}', repeat('1', 64), 'preview-e0000000-0000-4000-8000-000000000001.y.test', '{"entryPath":"index.html","files":[]}', now() - interval '3 hours', now() - interval '2 hours 45 minutes');

INSERT INTO iam.host_session(token_digest, kind, account_id, started_at, absolute_expires_at, provider_refresh_token, provider_checked_at, idle_expires_at) VALUES
  ('\\x01', 'HUB', '${OWNER}', now(), now() + interval '8 hours', '${SEALED}', now(), now() + interval '30 minutes');
INSERT INTO iam.host_session(token_digest, kind, account_id, started_at, absolute_expires_at, project_id, provider_refresh_token, provider_checked_at) VALUES
  ('\\x23', 'APPLICATION', '${OWNER}', now(), now() + interval '8 hours', '${PROJECT}', '${SEALED}', now());
INSERT INTO iam.host_session(token_digest, kind, account_id, started_at, absolute_expires_at, preview_id, parent_digest) VALUES
  ('\\x02', 'PREVIEW', '${OWNER}', now(), now() + interval '15 minutes', '${PREVIEW_ONE}', '\\x01');
INSERT INTO iam.host_session(token_digest, kind, account_id, started_at, absolute_expires_at, provider_refresh_token, provider_checked_at, idle_expires_at, ended_at, ended_reason) VALUES
  ('\\x20', 'HUB', '${MEMBER}', now() - interval '3 hours', now() + interval '5 hours', NULL, now() - interval '3 hours', now() - interval '2 hours', now() - interval '1 hour', 'SIGNED_OUT');
INSERT INTO iam.host_session(token_digest, kind, account_id, started_at, absolute_expires_at, preview_id, parent_digest, ended_at, ended_reason) VALUES
  ('\\x21', 'PREVIEW', '${MEMBER}', now() - interval '3 hours', now() - interval '2 hours 45 minutes', '${PREVIEW_TWO}', '\\x20', now() - interval '1 hour', 'PARENT_ENDED');
INSERT INTO iam.host_session(token_digest, kind, account_id, started_at, absolute_expires_at, project_id, provider_refresh_token, provider_checked_at, ended_at, ended_reason) VALUES
  ('\\x22', 'APPLICATION', '${MEMBER}', now() - interval '3 hours', now() + interval '5 hours', '${PROJECT}', NULL, now() - interval '3 hours', now() - interval '30 minutes', 'ACCESS_ENDED');

INSERT INTO iam.handoff(handoff_digest, kind, account_id, preview_id, parent_digest, minted_at, expires_at) VALUES
  ('\\x30', 'PREVIEW', '${OWNER}', '${PREVIEW_ONE}', '\\x01', now(), now() + interval '1 minute'),
  ('\\x31', 'PREVIEW', '${MEMBER}', '${PREVIEW_TWO}', '\\x20', now() - interval '2 hours', now() - interval '119 minutes');
INSERT INTO iam.handoff(handoff_digest, kind, account_id, project_id, binding_digest, provider_refresh_token, minted_at, expires_at) VALUES
  ('\\x32', 'APPLICATION', '${OWNER}', '${PROJECT}', '\\x33', 'mastra:factory-secret:v1:h', now(), now() + interval '1 minute');

INSERT INTO iam.oidc_transaction(state_digest, pkce_verifier, nonce, expires_at) VALUES ('\\x0a', 'v', 'n', now() + interval '10 minutes');
INSERT INTO iam.oidc_transaction(state_digest, pkce_verifier, nonce, expires_at, consumed_at) VALUES ('\\x40', 'v2', 'n2', now() + interval '5 minutes', now() - interval '1 minute');

INSERT INTO platform.operation_receipt(operation_id, authority, account_id, key_digest, request_digest, resource_id, state) VALUES
  ('IAM-03', 'bootstrap:https://kc.test:sub-boot', NULL, '\\x0e', '\\x0f', 'b0000000-0000-4000-8000-0000000000ff', 'reserved'),
  ('WS-01', 'account:${OWNER}', '${OWNER}', '\\x10', '\\x11', 'b0000000-0000-4000-8000-0000000000fe', 'reserved');
`

const hex = (rows, column) => rows.map((row) => row[column].toString('hex')).sort()

const migrated = async (t, prefix) => {
  const fixture = await createEmptyDatabase(t, prefix)
  await runMigrations({ connectionString: fixture.connectionString, migrations: beforeIam, catalogSnapshot: null })
  await query(fixture.connectionString, seed)
  return fixture
}

const OLD_ROLES = "'iam_owner', 'workspace_owner', 'project_owner', 'registry_owner', 'builder_owner', 'connector_owner', 'model_owner', 'hub_iam_runtime'"

const dependenciesOnOldRoles = async (connectionString) => {
  const { rows } = await query(connectionString, `SELECT count(*)::int AS count FROM pg_shdepend
    WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
      AND refclassid = 'pg_authid'::regclass
      AND refobjid IN (SELECT oid FROM pg_roles WHERE rolname IN (${OLD_ROLES}))`)
  return rows[0].count
}

const sqlStateOf = async (connectionString, role, statement) => withClient(connectionString, async (client) => {
  await client.query('BEGIN')
  await client.query(`SET LOCAL ROLE ${role}`)
  try {
    await client.query(statement)
    return null
  } catch (error) {
    return error.code
  } finally {
    await client.query('ROLLBACK')
  }
})

test('0070 commits over a seeded database and leaves none of the rows the new shape cannot carry', async (t) => {
  const { connectionString } = await migrated(t, 'conexus_iam_mig')
  const result = await runMigrations({ connectionString, migrations: [...beforeIam, ...iamMigration] })
  assert.deepEqual({ verdict: result.verdict, appliedNow: result.appliedNow }, { verdict: 'PASS', appliedNow: ['0070'] })

  const sessions = await query(connectionString, 'SELECT token_digest, kind FROM iam.host_session ORDER BY token_digest')
  assert.deepEqual(hex(sessions.rows, 'token_digest'), ['01', '23'])
  assert.deepEqual(sessions.rows.map((row) => row.kind), ['HUB', 'APPLICATION'])

  const handoffs = await query(connectionString, 'SELECT handoff_digest, kind FROM iam.handoff')
  assert.deepEqual(handoffs.rows.map((row) => [row.handoff_digest.toString('hex'), row.kind]), [['32', 'APPLICATION']])

  const states = await query(connectionString, 'SELECT state_digest FROM iam.oidc_transaction')
  assert.deepEqual(hex(states.rows, 'state_digest'), ['0a'])

  const receipts = await query(connectionString, 'SELECT operation_id, account_id FROM platform.operation_receipt')
  assert.deepEqual(receipts.rows, [{ operation_id: 'WS-01', account_id: OWNER }])
})

test('0070 drops the columns, tables, types, functions and roles of the old shape', async (t) => {
  const { connectionString } = await migrated(t, 'conexus_iam_mig_shape')
  await runMigrations({ connectionString, migrations: [...beforeIam, ...iamMigration] })

  const columns = await query(connectionString, "SELECT table_name || '.' || column_name AS name FROM information_schema.columns WHERE table_schema = 'iam' AND column_name IN ('ended_at', 'ended_reason', 'preview_id', 'consumed_at')")
  assert.deepEqual(columns.rows, [])
  const relations = await query(connectionString, "SELECT relname FROM pg_class WHERE relnamespace = 'iam'::regnamespace AND relkind = 'r' ORDER BY relname")
  assert.deepEqual(relations.rows.map((row) => row.relname), ['account', 'application', 'application_grant', 'application_invitation', 'handoff', 'host_session', 'installation_administrator', 'oidc_transaction', 'schema_migration', 'workspace_invitation', 'workspace_membership'])
  const functions = await query(connectionString, "SELECT proname FROM pg_proc WHERE pronamespace = 'iam'::regnamespace")
  assert.deepEqual(functions.rows.map((row) => row.proname), ['lock_administrators'])
  const types = await query(connectionString, "SELECT typname FROM pg_type WHERE typnamespace = 'iam'::regnamespace AND typtype = 'e'")
  assert.deepEqual(types.rows.map((row) => row.typname), ['workspace_role'])
  assert.equal(await dependenciesOnOldRoles(connectionString), 0)
  const owners = await query(connectionString, "SELECT DISTINCT pg_get_userbyid(c.relowner) AS owner FROM pg_class c WHERE c.relnamespace = 'iam'::regnamespace AND c.relkind IN ('r', 'S', 'i')")
  assert.deepEqual(owners.rows, [{ owner: 'conexus_owner' }])
  const receipt = await query(connectionString, "SELECT attnotnull FROM pg_attribute WHERE attrelid = 'platform.operation_receipt'::regclass AND attname = 'account_id'")
  assert.deepEqual(receipt.rows, [{ attnotnull: true }])
})

test('0070 keeps a Preview from naming another account\'s Hub session, and a Hub session takes its children with it', async (t) => {
  const { connectionString } = await migrated(t, 'conexus_iam_mig_pair')
  await runMigrations({ connectionString, migrations: [...beforeIam, ...iamMigration] })

  const child = (digest, account) => `INSERT INTO iam.host_session(token_digest, kind, account_id, started_at, absolute_expires_at, project_id, artifact_revision_id, parent_digest)
    VALUES ('\\x${digest}', 'PREVIEW', '${account}', now(), now() + interval '10 minutes', '${PROJECT}', '${ARTIFACT}', '\\x01')`
  assert.equal(await sqlStateOf(connectionString, 'postgres', child('51', MEMBER)), '23503')

  await query(connectionString, child('50', OWNER))
  await query(connectionString, "DELETE FROM iam.host_session WHERE token_digest = '\\x01'")
  const left = await query(connectionString, "SELECT count(*)::int AS count FROM iam.host_session WHERE token_digest = '\\x50'")
  assert.deepEqual(left.rows, [{ count: 0 }])
})

test('after 0070 the login role reads only the ledger and the command role cannot rewrite a name', async (t) => {
  const { connectionString } = await migrated(t, 'conexus_iam_mig_grants')
  await runMigrations({ connectionString, migrations: [...beforeIam, ...iamMigration] })

  assert.equal(await sqlStateOf(connectionString, 'hub_runtime', 'SELECT 1 FROM iam.host_session'), '42501')
  assert.equal(await sqlStateOf(connectionString, 'hub_runtime', 'SELECT 1 FROM iam.account'), '42501')
  assert.equal(await sqlStateOf(connectionString, 'hub_runtime', 'SELECT 1 FROM iam.schema_migration'), null)
  assert.equal(await sqlStateOf(connectionString, 'hub_command', "UPDATE iam.account SET display_name = 'x'"), '42501')
  assert.equal(await sqlStateOf(connectionString, 'hub_command', "UPDATE iam.account SET email = 'x@x.test'"), null)
  assert.equal(await sqlStateOf(connectionString, 'hub_reader', 'SELECT account_id, display_name, email FROM iam.account'), null)
  assert.equal(await sqlStateOf(connectionString, 'hub_reader', 'SELECT external_subject FROM iam.account'), '42501')
  assert.equal(await sqlStateOf(connectionString, 'hub_reader', 'SELECT 1 FROM iam.host_session'), '42501')
  assert.equal(await sqlStateOf(connectionString, 'hub_command', 'SELECT active FROM iam.account'), null)
  assert.equal(await sqlStateOf(connectionString, 'hub_command', 'SELECT role FROM iam.workspace_membership'), null)
  assert.equal(await sqlStateOf(connectionString, 'hub_command', 'SELECT iam.lock_administrators()'), null)
  assert.equal(await sqlStateOf(connectionString, 'hub_reader', 'SELECT role FROM iam.workspace_membership'), null)
  assert.equal(
    await sqlStateOf(connectionString, 'hub_command', `INSERT INTO platform.operation_receipt(operation_id, authority, account_id, key_digest, request_digest, resource_id, state)
      VALUES ('IAM-16', 'installation:account:${OWNER}', '${OWNER}', '\\x77', '\\x78', 'b0000000-0000-4000-8000-0000000000aa', 'reserved')`),
    null,
  )
})

test('iam_rls has a SELECT policy on every table an rls helper reads', async (t) => {
  const { connectionString } = await migrated(t, 'conexus_iam_mig_rls')
  await runMigrations({ connectionString, migrations: [...beforeIam, ...iamMigration] })

  const helpers = await query(connectionString, "SELECT pg_get_functiondef(p.oid) AS body FROM pg_proc p WHERE p.pronamespace = 'rls'::regnamespace ORDER BY p.proname")
  const rowSecurityTables = await query(connectionString, "SELECT n.nspname || '.' || c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relrowsecurity AND n.nspname NOT IN ('pg_catalog', 'information_schema')")
  const read = rowSecurityTables.rows.map((row) => row.name).filter((name) => helpers.rows.some((row) => new RegExp(`(?<![\\w.])${name.replace('.', '\\.')}(?![\\w.])`).test(row.body)))
  assert.deepEqual(read.sort(), ['iam.account', 'iam.installation_administrator', 'iam.workspace_membership'])

  const policies = await query(connectionString, "SELECT schemaname || '.' || tablename AS name FROM pg_policies WHERE 'iam_rls' = ANY(roles) AND cmd = 'SELECT' AND qual = 'true' ORDER BY 1")
  assert.deepEqual(policies.rows.map((row) => row.name), ['iam.account', 'iam.installation_administrator', 'iam.workspace_membership'])
})

test('0070 commits in each of two databases of one cluster, and the roles outlive the first until the second has migrated', async (t) => {
  const first = await migrated(t, 'conexus_iam_mig_first')
  const second = await migrated(t, 'conexus_iam_mig_second')
  const migrations = [...beforeIam, ...iamMigration]

  await runMigrations({ connectionString: first.connectionString, migrations })
  const lingering = await query(first.connectionString, `SELECT count(*)::int AS count FROM pg_roles WHERE rolname IN (${OLD_ROLES})`)
  assert.deepEqual(lingering.rows, [{ count: 8 }])
  assert.equal(await dependenciesOnOldRoles(first.connectionString), 0)

  const result = await runMigrations({ connectionString: second.connectionString, migrations })
  assert.deepEqual({ verdict: result.verdict, appliedNow: result.appliedNow }, { verdict: 'PASS', appliedNow: ['0070'] })
  assert.equal(await dependenciesOnOldRoles(second.connectionString), 0)
})
