import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadHubMigrationFiles, runMigrations } from '../../scripts/run-hub-migrations.mjs'
import { createEmptyDatabase, query } from './hub-database.mjs'

const OWNER = 'a0000000-0000-4000-8000-000000000001'
const WORKSPACE = 'b0000000-0000-4000-8000-000000000001'
const PROJECT = 'c0000000-0000-4000-8000-000000000001'
const SEALED = 'mastra:factory-secret:v1:t'

const corpus = loadHubMigrationFiles()
const before = corpus.filter(({ version }) => version < '0071')

const signedIn = `
INSERT INTO iam.account(account_id, issuer, external_subject, display_name, email) VALUES ('${OWNER}', 'https://kc.test', 'sub-owner', 'Owner', 'o@x.test');
INSERT INTO workspace.workspace(workspace_id, name) VALUES ('${WORKSPACE}', 'W');
INSERT INTO iam.workspace_membership(account_id, workspace_id, role) VALUES ('${OWNER}', '${WORKSPACE}', 'owner');
INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision) VALUES ('${PROJECT}', '${WORKSPACE}', 'P', 'NEW', repeat('a', 40), 'r1');
INSERT INTO iam.application(project_id, slug, created_by) VALUES ('${PROJECT}', 'demo', '${OWNER}');
INSERT INTO iam.host_session(token_digest, kind, account_id, started_at, absolute_expires_at, provider_refresh_token, provider_checked_at, idle_expires_at) VALUES
  ('\\x01', 'HUB', '${OWNER}', now(), now() + interval '8 hours', '${SEALED}', now(), now() + interval '30 minutes');
INSERT INTO iam.handoff(handoff_digest, kind, account_id, project_id, binding_digest, provider_refresh_token, minted_at, expires_at) VALUES
  ('\\x02', 'APPLICATION', '${OWNER}', '${PROJECT}', '\\x03', '${SEALED}', now(), now() + interval '1 minute');
`

const atPartSix = async (t, prefix, seed) => {
  const fixture = await createEmptyDatabase(t, prefix)
  await runMigrations({ connectionString: fixture.connectionString, migrations: before, catalogSnapshot: null })
  await query(fixture.connectionString, seed)
  return fixture.connectionString
}

const countsOf = async (connectionString) => (await query(connectionString, `SELECT
  (SELECT count(*)::int FROM iam.host_session) AS sessions, (SELECT count(*)::int FROM iam.handoff) AS handoffs,
  (SELECT count(*)::int FROM iam.schema_migration WHERE version = '0071') AS applied`)).rows[0]

test('0071 ends every session and handoff and leaves the catalog the snapshot describes', async (t) => {
  const connectionString = await atPartSix(t, 'conexus_cma_mig', signedIn)
  assert.deepEqual(await countsOf(connectionString), { sessions: 1, handoffs: 1, applied: 0 })
  const result = await runMigrations({ connectionString, migrations: corpus })
  assert.deepEqual({ verdict: result.verdict, appliedNow: result.appliedNow }, { verdict: 'PASS', appliedNow: ['0071'] })
  assert.deepEqual(await countsOf(connectionString), { sessions: 0, handoffs: 0, applied: 1 })
})

test('0071 stops over a model account or a connection, which hold values sealed without their row, and changes nothing', async (t) => {
  for (const [name, row] of [
    ['model account', `INSERT INTO model.model_account(owner_account_id, provider, kind, secret) VALUES ('${OWNER}', 'anthropic', 'api_key', '${SEALED}');`],
    ['connection', `INSERT INTO connector.connection(connection_id, workspace_id, connector_id, label, credential_sealed, credential_digest, created_by)
      VALUES (gen_random_uuid(), '${WORKSPACE}', 'sankhya', 'ERP', '${SEALED}', repeat('0', 64), '${OWNER}');`],
  ]) {
    const connectionString = await atPartSix(t, 'conexus_cma_guard', signedIn + row)
    await assert.rejects(runMigrations({ connectionString, migrations: corpus }), /MODEL_ACCOUNT_RESET_REQUIRED/, name)
    assert.deepEqual(await countsOf(connectionString), { sessions: 1, handoffs: 1, applied: 0 }, `${name}: the refused migration rolled back`)
  }
})
