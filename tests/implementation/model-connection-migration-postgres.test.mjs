import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { loadCurrentHubMigrationFiles, runSelectedHubMigrations } from '../../scripts/run-hub-migrations.mjs'
import { assertRoleInvariants, readCommittedSnapshot } from '../../scripts/hub-catalog.mjs'

// 056 renames the Claude connection schema and makes a connection say which provider it is for.
// The pilot holds one live Anthropic OAuth connection whose encrypted credential is filed under
// (connection_id, current_generation) in a backend this database cannot see. The tests below run
// the migration over a pilot-shaped row and assert the things that would silently break it: the
// custody pair, the connection staying usable for a run, and the provider now being answerable.

const admin = {
  host: process.env.CONEXUS_TEST_DB_HOST,
  port: Number(process.env.CONEXUS_TEST_DB_PORT),
  database: process.env.CONEXUS_TEST_DB_NAME,
  user: process.env.CONEXUS_TEST_DB_USER,
  password: process.env.CONEXUS_TEST_DB_PASSWORD,
}
const configured = Boolean(admin.host && admin.port && admin.database && admin.user && admin.password)

const connectionStringFor = (database) => {
  const url = new URL('postgresql://localhost')
  url.hostname = admin.host
  url.port = String(admin.port)
  url.pathname = `/${database}`
  url.username = admin.user
  url.password = admin.password
  return url.toString()
}

const MIGRATION = '056_model_connection_provider_neutrality.sql'
const PILOT_CONNECTION_ID = '11111111-2222-4333-8444-555555555555'
const PILOT_GENERATION = 7

describe('056 model connection provider neutrality', { skip: configured ? false : 'test database not configured' }, () => {
  let database
  let client

  before(async () => {
    const owner = new pg.Client(admin)
    await owner.connect()
    database = `conexus_m01_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 8)}`
    await owner.query(`CREATE DATABASE "${database}"`)
    await owner.end()

    const migrations = loadCurrentHubMigrationFiles()
    const upTo054 = migrations.slice(0, migrations.findIndex((entry) => entry.name === MIGRATION))
    const snapshot = readCommittedSnapshot()
    await runSelectedHubMigrations({
      connectionString: connectionStringFor(database),
      migrations: upTo054,
      recognizedMigrations: migrations,
      catalogSnapshot: snapshot,
    })

    client = new pg.Client({ connectionString: connectionStringFor(database) })
    await client.connect()
    // A pilot-shaped row: one Anthropic OAuth connection, already past generation 1 because the
    // refresh loop has advanced it, with a selection pointing at it.
    await client.query(`
      INSERT INTO claude_connection.connection
        (connection_id, owner_account_id, label, state, current_generation)
      VALUES ($1, $2, 'Conta Claude do piloto', 'ACTIVE', $3)`,
      [PILOT_CONNECTION_ID, randomUUID(), PILOT_GENERATION])
    await client.query(`
      INSERT INTO claude_connection.preference (account_id, connection_id)
      SELECT owner_account_id, connection_id FROM claude_connection.connection WHERE connection_id = $1`,
      [PILOT_CONNECTION_ID])

    await runSelectedHubMigrations({
      connectionString: connectionStringFor(database),
      migrations,
      recognizedMigrations: migrations,
      catalogSnapshot: snapshot,
    })
  })

  after(async () => {
    await client?.end()
    const owner = new pg.Client(admin)
    await owner.connect()
    await owner.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`)
    await owner.end()
  })

  test('the live connection keeps the generation its encrypted credential is filed under', async () => {
    const row = (await client.query(
      'SELECT connection_id, current_generation FROM model_connection.connection WHERE connection_id = $1',
      [PILOT_CONNECTION_ID])).rows[0]
    assert.equal(row.connection_id, PILOT_CONNECTION_ID)
    assert.equal(String(row.current_generation), String(PILOT_GENERATION))
  })

  test('the live connection is backfilled to an Anthropic OAuth token set', async () => {
    const row = (await client.query(
      'SELECT provider_id, credential_kind FROM model_connection.connection WHERE connection_id = $1',
      [PILOT_CONNECTION_ID])).rows[0]
    assert.equal(row.provider_id, 'anthropic')
    assert.equal(row.credential_kind, 'OAUTH_TOKEN_SET')
  })

  test('the backfill defaults are dropped, so a new connection has to say what it connects to', async () => {
    const rows = (await client.query(`
      SELECT column_name, column_default, is_nullable FROM information_schema.columns
      WHERE table_schema = 'model_connection' AND table_name = 'connection'
        AND column_name IN ('provider_id', 'credential_kind') ORDER BY column_name`)).rows
    assert.deepEqual(rows, [
      { column_name: 'credential_kind', column_default: null, is_nullable: 'NO' },
      { column_name: 'provider_id', column_default: null, is_nullable: 'NO' },
    ])
  })

  test('credential_kind admits exactly the two forms a credential can take', async () => {
    await assert.rejects(
      client.query(`
        INSERT INTO model_connection.connection
          (connection_id, owner_account_id, provider_id, credential_kind, label, state, current_generation)
        VALUES ($1, $2, 'openai', 'SOMETHING_ELSE', 'refused', 'ACTIVE', 1)`,
        [randomUUID(), randomUUID()]),
      (error) => error.constraint === 'connection_credential_kind_check')
  })

  test('the selection carries the provider it was made for', async () => {
    const row = (await client.query(
      'SELECT provider_id FROM model_connection.preference WHERE connection_id = $1',
      [PILOT_CONNECTION_ID])).rows[0]
    assert.equal(row.provider_id, 'anthropic')
  })

  test('one selection per provider, not one per Account', async () => {
    const key = (await client.query(`
      SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
      WHERE conrelid = 'model_connection.preference'::regclass AND contype = 'p'`)).rows[0]
    assert.equal(key.definition, 'PRIMARY KEY (account_id, provider_id)')
  })

  test('the run row names the credential by model, not by Claude', async () => {
    const columns = (await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'builder' AND table_name = 'builder_run'
        AND column_name LIKE '%connection%' OR table_schema = 'builder' AND table_name = 'builder_run'
        AND column_name LIKE '%credential%' ORDER BY column_name`)).rows.map((row) => row.column_name)
    assert.deepEqual(columns, ['model_connection_id', 'model_credential_generation'])
  })

  test('no function anywhere still reaches for the old schema or column names', async () => {
    const residue = (await client.query(`
      SELECT n.nspname || '.' || p.proname AS name
      FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
      WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND (p.prosrc LIKE '%claude_connection%' OR p.prosrc LIKE '%claude_credential_generation%')
      ORDER BY 1`)).rows.map((row) => row.name)
    assert.deepEqual(residue, [])
  })

  test('no function in the renamed schema is executable by PUBLIC', async () => {
    const exposed = (await client.query(`
      SELECT p.proname AS name
      FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
      CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) AS entry
      WHERE n.nspname = 'model_connection' AND entry.grantee = 0 AND entry.privilege_type = 'EXECUTE'
      ORDER BY 1`)).rows.map((row) => row.name)
    assert.deepEqual(exposed, [])
  })

  test('every re-created function keeps the grants its predecessor held', async () => {
    const grants = (await client.query(`
      SELECT p.proname AS name,
        array_to_string(ARRAY(
          SELECT pg_get_userbyid(entry.grantee)
          FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) AS entry
          WHERE entry.privilege_type = 'EXECUTE' AND entry.grantee <> 0 ORDER BY 1), ',') AS holders
      FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
      WHERE n.nspname = 'model_connection'
        AND p.proname IN ('publish_connection', 'select_connection', 'list_connections', 'admit_for_project')
      ORDER BY 1`)).rows
    for (const row of grants) {
      assert.equal(row.holders,
        'builder_owner,hub_builder_executor,hub_builder_ingress,hub_model_connection,model_connection_owner',
        `${row.name} lost a grant`)
    }
  })

  // The PUBLIC-execute invariant names its schemas in a list. Renaming a schema without editing
  // that list would leave the rename gated by nothing, and no other gate would notice: the
  // catalog snapshot records whatever ACL it finds as the truth. This test fails if the renamed
  // schema ever falls out of the list again.
  test('the PUBLIC-execute invariant still covers the renamed schema', async () => {
    await assertRoleInvariants(client, '056')
    await client.query(`
      CREATE FUNCTION model_connection.public_execute_probe() RETURNS boolean
      LANGUAGE sql IMMUTABLE AS $probe$ SELECT true $probe$`)
    try {
      await assert.rejects(assertRoleInvariants(client, '056'),
        (error) => error.message.startsWith('MIGRATION_FUNCTION_PUBLIC_EXECUTE_REFUSED')
          && error.message.includes('model_connection.public_execute_probe'))
    } finally {
      await client.query('DROP FUNCTION model_connection.public_execute_probe()')
    }
    await assertRoleInvariants(client, '056')
  })

  test('the schema is owned by the role named for what it owns', async () => {
    const owner = (await client.query(
      `SELECT pg_get_userbyid(nspowner) AS owner FROM pg_namespace WHERE nspname = 'model_connection'`)).rows[0]
    assert.equal(owner.owner, 'model_connection_owner')
  })

  // A run must spend the credential of the provider it is running on. admit_for_project filters by
  // provider, so the only way a run can reach its model with a foreign credential is an idempotent
  // replay under a different provider, which is what create_builder_run_with_model refuses.
  const digest = (fill) => fill.repeat(64).slice(0, 64)
  const buildSubject = async () => {
    const accountId = randomUUID()
    const workspaceId = randomUUID()
    const projectId = randomUUID()
    const revision = 'a'.repeat(40)
    await client.query(
      'INSERT INTO iam.account(account_id, issuer, external_subject, display_name) VALUES ($1, $2, $3, $4)',
      [accountId, 'https://m01.test', accountId, 'M-01'])
    await client.query('INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1, $2)', [workspaceId, 'M-01'])
    await client.query(
      "INSERT INTO iam.workspace_membership(account_id, workspace_id, role) VALUES ($1, $2, 'owner')",
      [accountId, workspaceId])
    await client.query(
      "INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision) VALUES ($1, $2, 'M-01', 'NEW', $3, 'M-01')",
      [projectId, workspaceId, revision])
    await client.query(
      'INSERT INTO builder.project_working_state(project_id, working_source_revision) VALUES ($1, $2)',
      [projectId, revision])
    return { accountId, projectId }
  }
  const publishAndSelect = async (accountId, providerId, kind, label) => {
    const connectionId = randomUUID()
    await client.query('SELECT model_connection.publish_connection($1,$2,$3,$4,$5,$6)',
      [accountId, connectionId, providerId, kind, label, 1])
    await client.query('SELECT model_connection.select_connection($1,$2)', [accountId, connectionId])
    return connectionId
  }
  const withModel = (accountId, projectId, idempotency, providerId, runId) =>
    client.query('SELECT builder.create_builder_run_with_model($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) AS value',
      [accountId, projectId, idempotency, digest('b'), null, 'BUILD', runId, 'builder-default', providerId, 'model-1'])

  test('a run on a provider the Account has no connection for is refused, not run uncredentialed', async () => {
    const { accountId, projectId } = await buildSubject()
    await publishAndSelect(accountId, 'anthropic', 'OAUTH_TOKEN_SET', 'Anthropic')
    await assert.rejects(
      () => withModel(accountId, projectId, digest('c'), 'openai', randomUUID()),
      /MODEL_CONNECTION_REQUIRED/)
    assert.deepEqual((await client.query(
      'SELECT count(*)::int AS runs FROM builder.builder_run WHERE project_id = $1', [projectId])).rows,
      [{ runs: 0 }])
  })

  test('a run carries the connection of its own provider, chosen per provider', async () => {
    const { accountId, projectId } = await buildSubject()
    await publishAndSelect(accountId, 'anthropic', 'OAUTH_TOKEN_SET', 'Anthropic')
    const openaiId = await publishAndSelect(accountId, 'openai', 'API_KEY', 'OpenAI')
    const created = (await withModel(accountId, projectId, digest('d'), 'openai', randomUUID())).rows[0].value
    assert.equal(created.modelConnectionId, openaiId)
    assert.equal(created.modelCredentialGeneration, 1)
  })

  test('replaying a run under a second provider is refused, so one provider never spends another quota', async () => {
    const { accountId, projectId } = await buildSubject()
    const anthropicId = await publishAndSelect(accountId, 'anthropic', 'OAUTH_TOKEN_SET', 'Anthropic')
    await publishAndSelect(accountId, 'openai', 'API_KEY', 'OpenAI')
    const runId = randomUUID()
    const created = (await withModel(accountId, projectId, digest('e'), 'anthropic', runId)).rows[0].value
    assert.equal(created.modelConnectionId, anthropicId)
    await assert.rejects(
      () => withModel(accountId, projectId, digest('e'), 'openai', runId),
      /MODEL_CONNECTION_PROVIDER_MISMATCH/)
    assert.deepEqual((await client.query(
      'SELECT model_provider_id FROM builder.builder_run WHERE builder_run_id = $1', [runId])).rows,
      [{ model_provider_id: 'anthropic' }])
  })
})
