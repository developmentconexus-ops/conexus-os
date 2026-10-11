import assert from 'node:assert/strict'
import { test } from 'node:test'
import { z } from 'zod'
import { hubModuleUrl } from './hub-build.mjs'
import { ID, setupProjects } from './project-fixture.mjs'

const { sql, openDatabase } = await import(hubModuleUrl('platform/db.js'))
const { admitAccount } = await import(hubModuleUrl('identity-access/admission.js'))
const Value = z.object({ value: z.number() })

test('a closed read gate exposes queries only through an admitted proof', async (t) => {
  const { database } = await setupProjects(t, 'conexus_closed_read_gate')
  await database.read(ID.member, async (gate) => {
    assert.equal(gate.rows, undefined)
    assert.equal(gate.one, undefined)
    assert.equal(gate.maybe, undefined)
    const proof = await admitAccount(gate)
    assert.deepEqual(await proof.tx.rows(Value, sql`SELECT 1 AS value`), [{ value: 1 }])
  })
})

test('a read proof refuses write and row-lock statements before PostgreSQL sees them', async (t) => {
  const { database } = await setupProjects(t, 'conexus_read_statement_refusal')
  await database.read(ID.member, async (gate) => {
    const proof = await admitAccount(gate)
    await assert.rejects(proof.tx.maybe(Value, sql`UPDATE iam.account SET email = email WHERE account_id = ${ID.member} RETURNING 1 AS value`), { id: 'INTERNAL_UNEXPECTED' })
    await assert.rejects(proof.tx.maybe(Value, sql`SELECT 1 AS value FOR SHARE`), { id: 'INTERNAL_UNEXPECTED' })
    await assert.rejects(proof.tx.rows(Value, sql`SELECT 1 AS value; SELECT 2 AS value`), { id: 'INTERNAL_UNEXPECTED' })
  })
})

test('transactions remain non-nestable across read and command entries', async (t) => {
  const { database } = await setupProjects(t, 'conexus_non_nested_transaction')
  const nested = { id: 'INTERNAL_UNEXPECTED', details: { reason: 'NESTED_TRANSACTION' } }
  await assert.rejects(database.read(ID.member, () => database.read(ID.member, async () => 1)), nested)
  await assert.rejects(database.transaction(ID.member, () => database.read(ID.member, async () => 1)), nested)
  await assert.rejects(database.read(ID.member, () => database.transaction(ID.member, async () => 1)), nested)
  assert.equal(await database.read(ID.member, async () => 1), 1)
})

test('a read opens a READ ONLY transaction and a command does not', async (t) => {
  const { database } = await setupProjects(t, 'conexus_read_only_entry')
  const Setting = z.object({ value: z.string() })
  const readOnly = sql`SELECT current_setting('transaction_read_only') AS value`
  assert.deepEqual(await database.read(ID.member, (gate) => admitAccount(gate).then((proof) => proof.tx.rows(Setting, readOnly))), [{ value: 'on' }])
  assert.deepEqual(await database.transaction(ID.member, async (gate) => (await admitAccount(gate)).tx.rows(Setting, readOnly)), [{ value: 'off' }])
})

const REFUSED = [
  ['a role switch', 'SET LOCAL ROLE hub_command'],
  ['a role switch across lines', 'set local\nrole hub_command'],
  ['a session authorization switch', 'SET SESSION AUTHORIZATION postgres'],
  ['a setting', "SET LOCAL conexus.job = 'project-purge'"],
  ['a setting with a space before the dot', "set local conexus .job = 'project-purge'"],
  ['a unicode escaped role', 'set local u&"r\\006fle" to hub_command'],
  ['a DO block that builds its EXECUTE', "do $$ begin execute 'set local ' || 'role hub_command'; end $$"],
  ['a plain SET', "set search_path = 'x'"],
  ['a CALL', 'call some_procedure()'],
  ['a comment between the words of a switch', 'set local /* x */ role hub_command'],
  ['a switch behind a select', 'select 1; set local role hub_command'],
  ['a quoted role switch', 'set local "role" hub_command'],
  ['a switch after a literal that looks like a line comment', "select 1 as value where 'x' = '--'; set local role hub_command"],
  ['a switch after a literal that opens a block comment', "select 1 as value where 'x' = '/*'; set local role hub_command; select '*/'"],
  ['a switch after a dollar quoted literal that looks like a comment', "select $$--$$; set local role hub_command"],
  ['a switch after an escape string that ends in a quote', "select E'it\\'s --'; set local role hub_command"],
  ['an unterminated literal', "select 'x"],
  ['an unterminated block comment', 'select 1 /* x'],
  ['an unterminated quoted identifier', 'select "x'],
]
const textRefused = (error) => error.id === 'INTERNAL_UNEXPECTED' && error.details?.reason === 'SQL_TEXT_REFUSED'
const reachedPasswordFile = (error) => error.cause?.code === 'ENOENT'
const rawSql = (text) => sql(Object.assign([text], { raw: [text] }))

test('the sql tag refuses at run time every text whose first keyword is not select, insert, update, delete or with', async (t) => {
  const { database } = await setupProjects(t, 'conexus_sql_text')
  for (const [label, text] of REFUSED) {
    const statement = rawSql(text)
    await assert.rejects(database.read(ID.member, async (gate) => (await admitAccount(gate)).tx.rows(Value, statement)), textRefused, `read: ${label}`)
    await assert.rejects(database.transaction(ID.member, async (gate) => (await admitAccount(gate)).tx.rows(Value, statement)), textRefused, `transaction: ${label}`)
  }
})

test('the sql tag refuses a role switch split across two composed fragments', async (t) => {
  const { database } = await setupProjects(t, 'conexus_sql_text_fragments')
  const head = sql`set local `
  const left = sql`select 1 as value; set local ro`
  for (const statement of [sql`${head}role hub_command`, sql`${left}${sql`le hub_command`}`]) {
    await assert.rejects(database.read(ID.member, async (gate) => (await admitAccount(gate)).tx.rows(Value, statement)), textRefused)
    await assert.rejects(database.transaction(ID.member, async (gate) => (await admitAccount(gate)).tx.rows(Value, statement)), textRefused)
  }
})

test('a text of two statements that passes the text guard is refused by the server itself', async (t) => {
  const { database } = await setupProjects(t, 'conexus_sql_text_two')
  const two = sql`select 1 as value; select 2 as value`
  const serverRefusal = (error) => error.id === 'INTERNAL_UNEXPECTED' && error.cause?.code === '42601'
  await assert.rejects(database.read(ID.member, async (gate) => (await admitAccount(gate)).tx.rows(Value, two)), serverRefusal)
  await assert.rejects(database.transaction(ID.member, async (gate) => (await admitAccount(gate)).tx.run(two)), serverRefusal)
})

test('select and with run in a read, and a query that names the role column runs', async (t) => {
  const { database } = await setupProjects(t, 'conexus_sql_text_runs')
  const read = (statement, schema = Value) => database.read(ID.member, async (gate) => (await admitAccount(gate)).tx.rows(schema, statement))
  assert.deepEqual(await read(sql`select 1 as value`), [{ value: 1 }])
  assert.deepEqual(await read(sql`with one as (select 1 as value) select value from one`), [{ value: 1 }])
  assert.deepEqual(await read(sql`select role from iam.workspace_membership where account_id = ${ID.outsider}`, z.object({ role: z.string() })), [])
})

test('a literal or a comment that holds a semicolon, a conexus word, a comment opener or a switch is not refused', async (t) => {
  const { database } = await setupProjects(t, 'conexus_sql_text_literals')
  const Text = z.object({ value: z.string() })
  for (const [label, text, expected] of [
    ['a semicolon', "select 'a;b' as value", 'a;b'],
    ['the product name', "select 'Conexus' as value", 'Conexus'],
    ['a line comment opener', "select '--' as value", '--'],
    ['a block comment opener', "select '/*' as value", '/*'],
    ['a switch sentence', "select 'set local role hub_command' as value", 'set local role hub_command'],
    ['a dollar quoted switch', "select $$set local role x; --$$ as value", 'set local role x; --'],
    ['an escape string with an escaped quote', "select E'it\\'s;x' as value", "it's;x"],
    ['a nested block comment', "select 'ok' as value /* a /* b */ ; set local role hub_command */", 'ok'],
    ['a doubled quote', "select 'it''s;' as value", "it's;"],
  ]) {
    assert.deepEqual(await database.read(ID.member, async (gate) => (await admitAccount(gate)).tx.rows(Text, rawSql(text))), [{ value: expected }], label)
  }
})

test('openDatabase allows only a search_path option, and refuses a role, an authorization, a conexus setting and any other', async (t) => {
  const { connection } = await setupProjects(t, 'conexus_pool_options')
  const base = { host: connection.host, port: connection.port, database: connection.database, user: 'hub_runtime', passwordFile: '/nonexistent' }
  for (const options of ['-c role=hub_command', '-c search_path=iam -c ROLE=hub_command', '-c session_authorization=postgres', '-crole=hub_command', '-c conexus.job=project-purge', '--role=hub_command', '-c work_mem=1GB', 'role=hub_command']) {
    assert.throws(() => openDatabase({ ...base, options }), (error) => error.id === 'INTERNAL_UNEXPECTED' && error.details?.reason === 'POOL_OPTION_REFUSED', options)
  }
  assert.throws(() => openDatabase({ ...base, options: '-c search_path=iam' }), reachedPasswordFile)
})

test('openDatabase checks the PGOPTIONS of the environment like its own options', async (t) => {
  const { connection } = await setupProjects(t, 'conexus_pool_pgoptions')
  const base = { host: connection.host, port: connection.port, database: connection.database, user: 'hub_runtime', passwordFile: '/nonexistent' }
  const before = process.env.PGOPTIONS
  t.after(() => { if (before === undefined) delete process.env.PGOPTIONS; else process.env.PGOPTIONS = before })
  process.env.PGOPTIONS = '-c conexus.job=project-purge'
  assert.throws(() => openDatabase(base), (error) => error.id === 'INTERNAL_UNEXPECTED' && error.details?.reason === 'POOL_OPTION_REFUSED')
  process.env.PGOPTIONS = '-c search_path=iam'
  assert.throws(() => openDatabase(base), reachedPasswordFile)
})
