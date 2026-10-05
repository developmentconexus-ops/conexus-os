import assert from 'node:assert/strict'
import { test } from 'node:test'
import pg from 'pg'
import { z } from 'zod'
import { assertRoleInvariants } from '../../scripts/hub-catalog.mjs'
import { hubModuleUrl } from './hub-build.mjs'
import { buildHubDatabase, query } from './hub-database.mjs'
import { openRuntimeFixture } from './hub-runtime-fixture.mjs'

const { sql, unportedPool } = await import(hubModuleUrl('platform/db.js'))
const { admitAccount, admitSystem } = await import(hubModuleUrl('identity-access/admission.js'))

const ACCOUNT = '10000000-0000-4000-8000-0000000000c1'
const OTHER = '10000000-0000-4000-8000-0000000000c2'
const WORKSPACE = '20000000-0000-4000-8000-0000000000c1'
const PROJECT = '30000000-0000-4000-8000-0000000000c1'
const code = (error) => error.cause?.code ?? error.code

const inCommand = (database, accountId, statement) => database.transaction(accountId, async (gate) => (await admitAccount(gate)).tx.run(statement))

test('a pooled client is hub_runtime after a commit, a rollback and a throw, and the reader can neither lock nor write', async (t) => {
  const { database } = await openRuntimeFixture(t, 'conexus_split_pool', { max: 1, accounts: [[ACCOUNT, 'a']] })
  const pool = unportedPool(database)
  const facts = async () => (await pool.query("SELECT current_user AS who, coalesce(current_setting('conexus.account_id', true), '') AS account")).rows[0]
  await database.transaction(ACCOUNT, (gate) => admitAccount(gate))
  assert.deepEqual(await facts(), { who: 'hub_runtime', account: '' })
  await assert.rejects(database.transaction(ACCOUNT, async (gate) => { await admitAccount(gate); throw new Error('rolled back') }), { message: 'rolled back' })
  assert.deepEqual(await facts(), { who: 'hub_runtime', account: '' })
  await database.read(ACCOUNT, async () => undefined)
  assert.deepEqual(await facts(), { who: 'hub_runtime', account: '' })
  await assert.rejects(pool.query('SELECT count(*) FROM workspace.workspace'), { code: '42501' })

  for (const statement of [
    'SELECT 1 FROM workspace.workspace FOR SHARE',
    'SELECT 1 FROM workspace.workspace FOR UPDATE',
    "INSERT INTO workspace.workspace(workspace_id, name) VALUES (gen_random_uuid(), 'x')",
    "UPDATE workspace.workspace SET name = 'x'",
    'DELETE FROM workspace.workspace',
  ]) {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SET LOCAL ROLE hub_reader')
      await assert.rejects(client.query(statement), { code: '42501' }, statement)
    } finally {
      await client.query('ROLLBACK')
      client.release()
    }
  }
  const mode = await database.read(ACCOUNT, (tx) => tx.one(z.object({ isolation: z.string(), read_only: z.string() }),
    sql`SELECT (SELECT setting FROM pg_settings WHERE name = 'transaction_isolation') AS isolation, (SELECT setting FROM pg_settings WHERE name = 'transaction_read_only') AS read_only`, 'INTERNAL_UNEXPECTED'))
  assert.deepEqual(mode, { isolation: 'repeatable read', read_only: 'on' })
})

test('a query that resumes after the entry returned is refused before COMMIT and leaves no row', async (t) => {
  const { connection, database } = await openRuntimeFixture(t, 'conexus_split_ended', { max: 1, accounts: [[ACCOUNT, 'a']] })
  const insert = sql`INSERT INTO workspace.workspace(workspace_id, name) VALUES (gen_random_uuid(), 'floating')`
  for (const outcome of ['commit', 'rollback']) {
    let floating
    const entry = database.transaction(ACCOUNT, async (gate) => {
      const { tx } = await admitAccount(gate)
      floating = (async () => { await tx.run(sql`SELECT 1`); await tx.run(insert) })()
      floating.catch(() => undefined)
      if (outcome === 'rollback') throw new Error('rolled back')
    })
    await (outcome === 'commit' ? entry : assert.rejects(entry, { message: 'rolled back' }))
    await assert.rejects(floating, (error) => error.id === 'INTERNAL_UNEXPECTED' && error.details?.reason === 'TRANSACTION_ENDED', outcome)
    assert.deepEqual((await query(connection, 'SELECT count(*)::integer AS rows FROM workspace.workspace')).rows, [{ rows: 0 }], outcome)
  }
})

test('the role invariants fail on a membership option, an extra membership and a role setting', async (t) => {
  const { connection, onCleanup } = await buildHubDatabase(t, 'conexus_split_roles')
  const client = new pg.Client(connection)
  await client.connect()
  onCleanup(() => client.end())
  await assertRoleInvariants(client)
  await client.query('GRANT hub_command TO hub_runtime WITH INHERIT TRUE, SET TRUE')
  await assert.rejects(assertRoleInvariants(client), /MIGRATION_ROLE_MEMBERSHIP_OPTION_REFUSED:hub_command/)
  await client.query('GRANT hub_command TO hub_runtime WITH INHERIT FALSE, SET TRUE')
  await client.query('GRANT hub_command TO hub_runtime WITH ADMIN TRUE')
  await assert.rejects(assertRoleInvariants(client), /MIGRATION_ROLE_MEMBERSHIP_OPTION_REFUSED:hub_command/)
  await client.query('REVOKE ADMIN OPTION FOR hub_command FROM hub_runtime')
  await assertRoleInvariants(client)
  await client.query('GRANT hub_reader TO hub_builder_executor')
  await assert.rejects(assertRoleInvariants(client), /MIGRATION_ROLE_MEMBERSHIP_REFUSED/)
  await client.query('REVOKE hub_reader FROM hub_builder_executor')
  await client.query("ALTER ROLE hub_runtime SET role = 'hub_command'")
  await assert.rejects(assertRoleInvariants(client), /MIGRATION_ROLE_SETTING_REFUSED:hub_runtime role=hub_command/)
  await client.query('ALTER ROLE hub_runtime RESET role')
  await assertRoleInvariants(client)
})

test('an admitted command is refused every tenant column, and the login role reads iam.account but not the membership', async (t) => {
  const { connection, database, runtime } = await openRuntimeFixture(t, 'conexus_split_columns', { accounts: [[ACCOUNT, 'a'], [OTHER, 'b']] })
  await query(connection, "INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1, 'W')", [WORKSPACE])
  await query(connection, "INSERT INTO iam.workspace_membership(account_id, workspace_id, role) VALUES ($1, $2, 'owner')", [ACCOUNT, WORKSPACE])
  await query(connection, "INSERT INTO iam.installation_administrator(account_id, granted_via) VALUES ($1, 'OPERATOR_BOOTSTRAP')", [ACCOUNT])
  await query(connection, "INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision) VALUES ($1, $2, 'P', 'NEW', $3, $4)", [PROJECT, WORKSPACE, 'a'.repeat(40), '40000000-0000-4000-8000-0000000000c1'])
  for (const statement of [
    sql`UPDATE iam.workspace_membership SET account_id = ${OTHER} WHERE account_id = ${ACCOUNT}`,
    sql`UPDATE iam.workspace_membership SET workspace_id = ${PROJECT}::uuid WHERE account_id = ${ACCOUNT}`,
    sql`UPDATE iam.installation_administrator SET account_id = ${OTHER} WHERE account_id = ${ACCOUNT}`,
    sql`UPDATE iam.account SET active = false WHERE account_id = ${ACCOUNT}`,
    sql`UPDATE iam.workspace_membership SET role = 'owner' WHERE account_id = ${ACCOUNT}`,
    sql`UPDATE project.project SET workspace_id = ${PROJECT}::uuid WHERE project_id = ${PROJECT}`,
    sql`UPDATE workspace.workspace SET name = 'x' WHERE workspace_id = ${WORKSPACE}`,
  ]) await assert.rejects(inCommand(database, ACCOUNT, statement), (error) => code(error) === '42501', statement.text)
  assert.equal(await inCommand(database, ACCOUNT, sql`SELECT 1 FROM iam.account WHERE account_id = ${ACCOUNT} FOR SHARE`), 1)
  assert.equal(await inCommand(database, ACCOUNT, sql`SELECT 1 FROM iam.installation_administrator WHERE account_id = ${ACCOUNT} AND revoked_at IS NULL FOR SHARE`), 1)
  const login = new pg.Client(runtime)
  await login.connect()
  try {
    assert.equal((await login.query('SELECT 1 FROM iam.account')).rowCount, 2)
    await assert.rejects(login.query('SELECT 1 FROM iam.workspace_membership'), { code: '42501' })
  } finally {
    await login.end()
  }
})

test('hub_reader reads the person columns of iam.account and none of the identity columns, and hub_iam_runtime holds nothing on it', async (t) => {
  const { connection, database } = await openRuntimeFixture(t, 'conexus_split_account_columns', { accounts: [[ACCOUNT, 'a']] })
  const Person = z.object({ account_id: z.string(), display_name: z.string(), email: z.string().nullable() })
  assert.deepEqual((await database.read(ACCOUNT, (tx) => tx.rows(Person, sql`SELECT account_id, display_name, email FROM iam.account`))).map((row) => row.account_id), [ACCOUNT])
  for (const column of ['issuer', 'external_subject', 'origin', 'active']) {
    await assert.rejects(database.read(ACCOUNT, (tx) => tx.rows(z.object({}).passthrough(), sql`SELECT ${sql.identifier(column)} FROM iam.account`)), (error) => code(error) === '42501', column)
  }
  await assert.rejects(database.read(ACCOUNT, (tx) => tx.rows(z.object({}).passthrough(), sql`SELECT * FROM iam.account`)), (error) => code(error) === '42501', 'select *')
  const held = await query(connection, `SELECT has_table_privilege('hub_iam_runtime', 'iam.account', 'SELECT, INSERT, UPDATE') AS table_level,
    has_any_column_privilege('hub_iam_runtime', 'iam.account', 'SELECT, INSERT, UPDATE') AS column_level`)
  assert.deepEqual(held.rows, [{ table_level: false, column_level: false }])
})

test('the purge guard refuses a reaper and a person, and a project purge job runs the purge', async (t) => {
  const { database } = await openRuntimeFixture(t, 'conexus_split_purge', { accounts: [[ACCOUNT, 'a']] })
  const purge = sql`SELECT iam.purge_project(${PROJECT}::uuid)`
  const refused = (error) => code(error) === '42501' && /PURGE_REQUIRES_SYSTEM/.test(error.cause?.message ?? '')
  await assert.rejects(inCommand(database, ACCOUNT, purge), refused)
  await assert.rejects(database.system('iam-reaper', async (gate) => (await admitSystem(gate, 'iam-reaper')).tx.run(purge)), refused)
  assert.equal(await database.system('project-purge', async (gate) => (await admitSystem(gate, 'project-purge')).tx.run(purge)), 1)
})

test('iam.lock_administrators takes the table lock as the command role and is refused to every other', async (t) => {
  const { connection, database, runtime, onCleanup } = await openRuntimeFixture(t, 'conexus_split_lock', { accounts: [[ACCOUNT, 'a']] })
  await inCommand(database, ACCOUNT, sql`SELECT iam.lock_administrators()`)
  const login = new pg.Client(runtime)
  await login.connect()
  try {
    await assert.rejects(login.query('SELECT iam.lock_administrators()'), { code: '42501' })
  } finally {
    await login.end()
  }
  const holder = new pg.Client(connection)
  await holder.connect()
  onCleanup(() => holder.end().catch(() => undefined))
  await holder.query('BEGIN')
  await holder.query("INSERT INTO iam.installation_administrator(account_id, granted_via) VALUES ($1, 'OPERATOR_BOOTSTRAP')", [ACCOUNT])
  let waited = true
  const lock = inCommand(database, ACCOUNT, sql`SELECT iam.lock_administrators()`).then(() => { waited = false })
  await new Promise((resolve) => setTimeout(resolve, 150))
  assert.equal(waited, true, 'the lock waits for an uncommitted tenure write')
  await holder.query('COMMIT')
  await lock
})
