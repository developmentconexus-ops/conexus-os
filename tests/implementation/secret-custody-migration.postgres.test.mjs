import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadHubMigrationFiles, runMigrations } from '../../scripts/run-hub-migrations.mjs'
import { createEmptyDatabase, query } from './hub-database.mjs'

const corpus = loadHubMigrationFiles()
const before = corpus.filter(({ version }) => version < '0076')
const account = '10000000-0000-4000-8000-000000000001'
const workspace = '20000000-0000-4000-8000-000000000001'
const project = '30000000-0000-4000-8000-000000000001'
const historical = 'mastra:factory-secret:v1:synthetic'
const seed = `
INSERT INTO iam.account(account_id, issuer, external_subject, display_name) VALUES ('${account}', 'https://issuer.test', 'synthetic', 'Synthetic');
INSERT INTO workspace.workspace(workspace_id, name) VALUES ('${workspace}', 'Synthetic');
INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision) VALUES ('${project}', '${workspace}', 'Synthetic', 'NEW', repeat('a',40), 'r1');
INSERT INTO iam.application(project_id, slug, created_by) VALUES ('${project}', 'synthetic', '${account}');
INSERT INTO iam.host_session(token_digest,kind,account_id,started_at,absolute_expires_at,idle_expires_at,provider_refresh_token,provider_checked_at) VALUES ('\\x01','HUB','${account}',now(),now()+interval '8 hours',now()+interval '30 minutes','${historical}',now());
INSERT INTO iam.handoff(handoff_digest,kind,account_id,project_id,binding_digest,provider_refresh_token,minted_at,expires_at) VALUES ('\\x02','APPLICATION','${account}','${project}','\\x03','${historical}',now(),now()+interval '1 minute');
`
async function setup(t) {
  const { connectionString } = await createEmptyDatabase(t, 'conexus_secret_migration')
  await runMigrations({ connectionString, migrations: before, catalogSnapshot: null })
  await query(connectionString, seed)
  return connectionString
}
async function counts(connectionString) {
  return (await query(connectionString, `SELECT (SELECT count(*)::int FROM iam.host_session) AS sessions, (SELECT count(*)::int FROM iam.handoff) AS handoffs, (SELECT count(*)::int FROM iam.schema_migration WHERE version='0076') AS applied`)).rows[0]
}
const checksSql = `SELECT conrelid::regclass::text AS table, conname AS name, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname IN ('connection_credential_sealed_check','handoff_token_sealed_check','host_session_token_sealed_check','model_account_secret_sealed_check') ORDER BY conrelid::regclass::text`

test('0076 empty cutover ends sessions/handoffs and replaces exactly four row-envelope CHECKs', async (t) => {
  const connectionString = await setup(t)
  assert.deepEqual(await counts(connectionString), { sessions: 1, handoffs: 1, applied: 0 })
  const result = await runMigrations({ connectionString, migrations: corpus })
  assert.deepEqual(result.appliedNow, ['0076'])
  assert.deepEqual(await counts(connectionString), { sessions: 0, handoffs: 0, applied: 1 })
  const checks = (await query(connectionString, checksSql)).rows
  assert.deepEqual(checks.map(({ table, name }) => [table,name]), [
    ['connector.connection','connection_credential_sealed_check'], ['iam.handoff','handoff_token_sealed_check'],
    ['iam.host_session','host_session_token_sealed_check'], ['model.model_account','model_account_secret_sealed_check'],
  ])
  for (const { definition } of checks) { assert.match(definition, /conexus:secret:v1:%/); assert.doesNotMatch(definition, /mastra:factory-secret/) }
  await assert.rejects(query(connectionString, `INSERT INTO model.model_account(scope,owner_account_id,provider,kind,secret,connected_by,connected_by_name,connected_at) VALUES ('personal','${account}','anthropic','api_key','${historical}','${account}','Synthetic',now())`), { code: '23514', constraint: 'model_account_secret_sealed_check' })
})

test('0076 refuses either durable credential table and rolls back sessions, ledger and all four CHECKs', async (t) => {
  for (const row of [
    `INSERT INTO model.model_account(scope,owner_account_id,provider,kind,secret,connected_by,connected_by_name,connected_at) VALUES ('personal','${account}','anthropic','api_key','${historical}','${account}','Synthetic',now());`,
    `INSERT INTO connector.connection(connection_id,workspace_id,connector_id,label,credential_sealed,credential_digest,created_by) VALUES (gen_random_uuid(),'${workspace}','sankhya','Synthetic','${historical}',repeat('0',64),'${account}');`,
  ]) {
    const connectionString = await setup(t)
    const checks = (await query(connectionString, checksSql)).rows
    await query(connectionString, row)
    await assert.rejects(runMigrations({ connectionString, migrations: corpus }), /SECRET_CUSTODY_RESET_REQUIRED/)
    assert.deepEqual(await counts(connectionString), { sessions: 1, handoffs: 1, applied: 0 })
    assert.deepEqual((await query(connectionString, checksSql)).rows, checks)
  }
})

test('0076 refuses a missing custody CHECK before deleting any session or handoff', async (t) => {
  const connectionString = await setup(t)
  await query(connectionString, 'ALTER TABLE model.model_account DROP CONSTRAINT model_account_secret_sealed_check')
  await assert.rejects(runMigrations({ connectionString, migrations: corpus }), /SECRET_CUSTODY_CHECK_SET_REFUSED/)
  assert.deepEqual(await counts(connectionString), { sessions: 1, handoffs: 1, applied: 0 })
})


test('0076 refuses a custody CHECK whose expression changed, before ending sessions', async (t) => {
  const connectionString = await setup(t)
  await query(connectionString, "ALTER TABLE model.model_account DROP CONSTRAINT model_account_secret_sealed_check, ADD CONSTRAINT model_account_secret_sealed_check CHECK (length(secret) > 0)")
  await assert.rejects(runMigrations({ connectionString, migrations: corpus }), /SECRET_CUSTODY_CHECK_SET_REFUSED/)
  assert.deepEqual(await counts(connectionString), { sessions: 1, handoffs: 1, applied: 0 })
})
