import assert from 'node:assert/strict'
import { test } from 'node:test'
import pg from 'pg'
import { z } from 'zod'
import { assertRoleInvariants } from '../../scripts/hub-catalog.mjs'
import { hubModuleUrl } from './hub-build.mjs'
import { buildHubDatabase, loginPoolOf, query } from './hub-database.mjs'
import { openRuntimeFixture } from './hub-runtime-fixture.mjs'
import { refuseProtectedCluster } from './protected-cluster.mjs'

const { sql } = await import(hubModuleUrl('platform/db.js'))
const { admitAccount, admitSystem } = await import(hubModuleUrl('identity-access/admission.js'))
const { purgeProject } = await import(hubModuleUrl('identity-access/application-access.js'))

const ACCOUNT = '10000000-0000-4000-8000-0000000000c1'
const OTHER = '10000000-0000-4000-8000-0000000000c2'
const WORKSPACE = '20000000-0000-4000-8000-0000000000c1'
const PROJECT = '30000000-0000-4000-8000-0000000000c1'
const code = (error) => error.cause?.code ?? error.code

const inCommand = (database, accountId, statement) => database.transaction(accountId, async (gate) => (await admitAccount(gate)).tx.run(statement))

test('a pooled client is hub_runtime after a commit, a rollback and a throw, and the reader can neither lock nor write', async (t) => {
  const { database } = await openRuntimeFixture(t, 'conexus_split_pool', { max: 1, accounts: [[ACCOUNT, 'a']] })
  const pool = await loginPoolOf(database)
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

test('an entry sends BEGIN, one set_config statement for the role and the settings, its queries and COMMIT', async (t) => {
  const { database } = await openRuntimeFixture(t, 'conexus_split_round_trips', { max: 1, accounts: [[ACCOUNT, 'a']] })
  const sent = []
  const original = pg.Client.prototype.query
  t.mock.method(pg.Client.prototype, 'query', function (config, ...rest) {
    if (this.connectionParameters?.user === 'hub_runtime') sent.push(typeof config === 'string' ? config : config.text)
    return original.call(this, config, ...rest)
  })
  await database.read(ACCOUNT, (tx) => tx.rows(z.object({ one: z.number() }), sql`SELECT 1 AS one`))
  assert.deepEqual(sent, ['BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY', 'SELECT set_config($1, $2, true), set_config($3, $4, true)', 'SELECT 1 AS one', 'COMMIT'])
  sent.length = 0
  await database.transaction(ACCOUNT, (gate) => admitAccount(gate))
  assert.deepEqual(sent, ['BEGIN', 'SELECT set_config($1, $2, true)', 'SELECT account_id, active FROM iam.account WHERE account_id = $1 FOR SHARE', 'COMMIT'])
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

test('hub_runtime sessions carry the register timeouts, and a lock wait and a slow statement answer DATABASE_BUSY', async (t) => {
  await refuseProtectedCluster()
  const { connection, database, onCleanup, openRuntimeDatabase } = await openRuntimeFixture(t, 'conexus_split_timeouts', { accounts: [[ACCOUNT, 'a']] })
  const shown = await (await loginPoolOf(database)).query("SELECT current_setting('lock_timeout') AS lock, current_setting('statement_timeout') AS statement, current_setting('idle_in_transaction_session_timeout') AS idle")
  assert.deepEqual(shown.rows, [{ lock: '5s', statement: '30s', idle: '1min' }])
  await query(connection, "ALTER ROLE hub_runtime SET lock_timeout = '300ms'")
  onCleanup(() => query(connection, "ALTER ROLE hub_runtime SET lock_timeout = '5s'; ALTER ROLE hub_runtime SET statement_timeout = '30s'"))
  const short = openRuntimeDatabase({ max: 1 })
  const holder = new pg.Client(connection)
  await holder.connect()
  onCleanup(() => holder.end().catch(() => undefined))
  await holder.query('BEGIN')
  await holder.query('SELECT 1 FROM iam.account WHERE account_id = $1 FOR UPDATE', [ACCOUNT])
  const waiting = await short.transaction(ACCOUNT, (gate) => admitAccount(gate)).catch((error) => error)
  assert.deepEqual({ id: waiting.id, sqlstate: waiting.details.sqlstate }, { id: 'DATABASE_BUSY', sqlstate: '55P03' })
  await holder.query('ROLLBACK')
  await query(connection, "ALTER ROLE hub_runtime SET statement_timeout = '300ms'")
  const slowDatabase = openRuntimeDatabase({ max: 1 })
  const slow = await slowDatabase.transaction(ACCOUNT, async (gate) => (await admitAccount(gate)).tx.run(sql`SELECT pg_sleep(2)`)).catch((error) => error)
  assert.deepEqual({ id: slow.id, sqlstate: slow.details.sqlstate }, { id: 'DATABASE_BUSY', sqlstate: '57014' })
  assert.equal((await slowDatabase.read(ACCOUNT, (tx) => tx.rows(z.object({ one: z.number() }), sql`SELECT 1 AS one`)))[0].one, 1)
})

test('the role invariants fail on a membership option, an extra membership, a role setting, a conexus setting, an extra setting and a missing timeout', async (t) => {
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
  await client.query('GRANT hub_reader TO hub_command')
  await assert.rejects(assertRoleInvariants(client), /MIGRATION_ROLE_MEMBERSHIP_REFUSED/)
  await client.query('REVOKE hub_reader FROM hub_command')
  await client.query("ALTER ROLE hub_runtime SET role = 'hub_command'")
  await assert.rejects(assertRoleInvariants(client), /MIGRATION_ROLE_SETTING_REFUSED:hub_runtime role=hub_command/)
  await client.query('ALTER ROLE hub_runtime RESET role')
  await assertRoleInvariants(client)
  await client.query("ALTER ROLE hub_runtime SET conexus.job = 'project-purge'")
  await assert.rejects(assertRoleInvariants(client), /MIGRATION_ROLE_SETTING_REFUSED:hub_runtime conexus.job=project-purge/)
  await client.query('ALTER ROLE hub_runtime RESET conexus.job')
  await client.query("ALTER ROLE hub_runtime SET work_mem = '1GB'")
  await assert.rejects(assertRoleInvariants(client), /MIGRATION_ROLE_SETTING_REFUSED:hub_runtime work_mem=1GB/)
  await client.query('ALTER ROLE hub_runtime RESET work_mem')
  await client.query('ALTER ROLE hub_runtime RESET lock_timeout')
  await assert.rejects(assertRoleInvariants(client), /MIGRATION_ROLE_SETTING_REFUSED:missing hub_runtime lock_timeout=5s/)
  await client.query("ALTER ROLE hub_runtime SET lock_timeout = '5s'")
  await assertRoleInvariants(client)
  const { rows: [{ name }] } = await client.query('SELECT current_database() AS name')
  const database = `"${name}"`
  await client.query(`ALTER DATABASE ${database} SET work_mem = '8MB'`)
  await client.query(`ALTER DATABASE ${database} SET timezone = 'UTC'`)
  await assertRoleInvariants(client)
  await client.query(`ALTER DATABASE ${database} SET role = 'hub_command'`)
  await assert.rejects(assertRoleInvariants(client), /MIGRATION_ROLE_SETTING_REFUSED:all roles role=hub_command/)
  await client.query(`ALTER DATABASE ${database} RESET role`)
  await client.query(`ALTER DATABASE ${database} SET conexus.job = 'project-purge'`)
  await assert.rejects(assertRoleInvariants(client), /MIGRATION_ROLE_SETTING_REFUSED:all roles conexus.job=project-purge/)
  await client.query(`ALTER DATABASE ${database} RESET conexus.job`)
  await client.query(`ALTER DATABASE ${database} SET session_authorization = 'postgres'`).then(
    async () => assert.rejects(assertRoleInvariants(client), /MIGRATION_ROLE_SETTING_REFUSED:all roles session_authorization=/),
    () => undefined)
  await client.query(`ALTER DATABASE ${database} RESET ALL`)
  await assertRoleInvariants(client)
})

test('an admitted command is refused every tenant column, and the login role reads neither iam.account nor the membership', async (t) => {
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
    sql`UPDATE project.project SET workspace_id = ${PROJECT}::uuid WHERE project_id = ${PROJECT}`,
    sql`UPDATE workspace.workspace SET name = 'x' WHERE workspace_id = ${WORKSPACE}`,
  ]) await assert.rejects(inCommand(database, ACCOUNT, statement), (error) => code(error) === '42501', statement.text)
  assert.equal(await inCommand(database, ACCOUNT, sql`SELECT 1 FROM iam.account WHERE account_id = ${ACCOUNT} FOR SHARE`), 1)
  assert.equal(await inCommand(database, ACCOUNT, sql`SELECT 1 FROM iam.installation_administrator WHERE account_id = ${ACCOUNT} AND revoked_at IS NULL FOR SHARE`), 1)
  const login = new pg.Client(runtime)
  await login.connect()
  try {
    await assert.rejects(login.query('SELECT 1 FROM iam.account'), { code: '42501' })
    await assert.rejects(login.query('SELECT 1 FROM iam.workspace_membership'), { code: '42501' })
  } finally {
    await login.end()
  }
})

test('hub_reader reads the person columns of iam.account and none of the identity columns', async (t) => {
  const { database } = await openRuntimeFixture(t, 'conexus_split_account_columns', { accounts: [[ACCOUNT, 'a']] })
  const Person = z.object({ account_id: z.string(), display_name: z.string(), email: z.string().nullable() })
  assert.deepEqual((await database.read(ACCOUNT, (tx) => tx.rows(Person, sql`SELECT account_id, display_name, email FROM iam.account`))).map((row) => row.account_id), [ACCOUNT])
  for (const column of ['issuer', 'external_subject', 'origin', 'active']) {
    await assert.rejects(database.read(ACCOUNT, (tx) => tx.rows(z.object({}).passthrough(), sql`SELECT ${sql.identifier(column)} FROM iam.account`)), (error) => code(error) === '42501', column)
  }
  await assert.rejects(database.read(ACCOUNT, (tx) => tx.rows(z.object({}).passthrough(), sql`SELECT * FROM iam.account`)), (error) => code(error) === '42501', 'select *')
})

test('the purge admission refuses a reaper and a person, and a project purge job deletes the Project\'s application rows', async (t) => {
  const { connection, database } = await openRuntimeFixture(t, 'conexus_split_purge', { accounts: [[ACCOUNT, 'a']] })
  await query(connection, "INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1, 'W')", [WORKSPACE])
  await query(connection, "INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision) VALUES ($1, $2, 'P', 'NEW', $3, $4)", [PROJECT, WORKSPACE, 'a'.repeat(40), '40000000-0000-4000-8000-0000000000c1'])
  await query(connection, "INSERT INTO iam.application(project_id, slug, created_by) VALUES ($1, 'caderno', $2)", [PROJECT, ACCOUNT])
  const invariant = (name) => (error) => error.id === 'INTERNAL_UNEXPECTED' && error.details?.invariant === name
  await assert.rejects(database.transaction(ACCOUNT, async (gate) => purgeProject(await admitSystem(gate, 'project-purge'), PROJECT)), invariant('GATE_ACTOR_REFUSED'))
  await assert.rejects(database.system('iam-reaper', async (gate) => purgeProject(await admitSystem(gate, 'project-purge'), PROJECT)), invariant('GATE_JOB_MISMATCH'))
  const applications = () => query(connection, 'SELECT count(*)::integer AS count FROM iam.application WHERE project_id = $1', [PROJECT]).then((result) => result.rows)
  assert.deepEqual(await applications(), [{ count: 1 }])
  await database.system('project-purge', async (gate) => purgeProject(await admitSystem(gate, 'project-purge'), PROJECT))
  assert.deepEqual(await applications(), [{ count: 0 }])
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
