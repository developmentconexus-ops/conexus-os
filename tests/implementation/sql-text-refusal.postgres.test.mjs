import assert from 'node:assert/strict'
import { test } from 'node:test'
import { z } from 'zod'
import { hubModuleUrl } from './hub-build.mjs'
import { openRuntimeFixture } from './hub-runtime-fixture.mjs'

const { admitAccount } = await import(hubModuleUrl('identity-access/admission.js'))

const { sql, openDatabase } = await import(hubModuleUrl('platform/db.js'))
const ACCOUNT = '10000000-0000-4000-8000-0000000000a1'
const Value = z.object({ value: z.number() })
const refused = (error) => error.id === 'INTERNAL_UNEXPECTED' && error.details?.reason === 'SQL_TEXT_REFUSED'

const REFUSED = [
  ['a role switch', 'SET LOCAL ROLE hub_command'],
  ['a role switch across lines', 'set local\nrole hub_command'],
  ['a session authorization switch', 'SET SESSION AUTHORIZATION postgres'],
  ['set_config on the role', "select set_config('role', 'hub_command', true)"],
  ['a conexus setting', "SET LOCAL conexus.job = 'project-purge'"],
  ['a conexus setting with a space before the dot', "set local conexus .job = 'project-purge'"],
  ['a conexus setting with a space before the dot, account', "set local conexus .account_id = '10000000-0000-4000-8000-0000000000a1'"],
  ['a unicode escaped role', 'set local u&"r\\006fle" to hub_command'],
  ['a DO block that builds its EXECUTE', "do $$ begin execute 'set local ' || 'role hub_command'; end $$"],
  ['a plain SET', "set search_path = 'x'"],
  ['a CALL', 'call some_procedure()'],
  ['a comment between the words of a switch', 'set local /* x */ role hub_command'],
  ['a switch behind a select', 'select 1; set local role hub_command'],
  ['a quoted role switch', 'set local "role" hub_command'],
  ['a read of a conexus setting', "select current_setting('conexus.job')"],
  ['a read of a plain setting', "select current_setting('search_path')"],
  ['a session_authorization word', 'select session_authorization'],
  ['a switch after a literal that looks like a line comment', "select 1 as value where 'x' = '--'; set local role hub_command"],
  ['a switch after a literal that opens a block comment', "select 1 as value where 'x' = '/*'; set local role hub_command; select '*/'"],
  ['a switch after a dollar quoted literal that looks like a comment', "select $$--$$; set local role hub_command"],
  ['a switch after an escape string that ends in a quote', "select E'it\\'s --'; set local role hub_command"],
  ['an unterminated literal', "select 'x"],
  ['an unterminated block comment', 'select 1 /* x'],
  ['an unterminated quoted identifier', 'select "x'],
]

test('the sql tag refuses at run time every text whose first keyword is not select, insert, update, delete or with, and the named words', async (t) => {
  const { database } = await openRuntimeFixture(t, 'conexus_sql_text', { accounts: [[ACCOUNT, 'a']] })
  for (const [label, text] of REFUSED) {
    const statement = sql(Object.assign([text], { raw: [text] }))
    await assert.rejects(database.read(ACCOUNT, (tx) => tx.rows(Value, statement)), refused, `read: ${label}`)
    await assert.rejects(database.transaction(ACCOUNT, async (gate) => (await admitAccount(gate)).tx.rows(Value, statement)), refused, `transaction: ${label}`)
  }
})

test('the sql tag refuses a role switch split across two composed fragments', async (t) => {
  const { database } = await openRuntimeFixture(t, 'conexus_sql_text', { accounts: [[ACCOUNT, 'a']] })
  const head = sql`set local `
  await assert.rejects(database.read(ACCOUNT, (tx) => tx.rows(Value, sql`${head}role hub_command`)), refused)
  const left = sql`select 1 as value; set local ro`
  await assert.rejects(database.read(ACCOUNT, (tx) => tx.rows(Value, sql`${left}${sql`le hub_command`}`)), refused)
})

test('a text of two statements that passes the text guard is refused by the server itself', async (t) => {
  const { database } = await openRuntimeFixture(t, 'conexus_sql_text', { accounts: [[ACCOUNT, 'a']] })
  const two = sql`select 1 as value; select 2 as value`
  const serverRefusal = (error) => error.id === 'INTERNAL_UNEXPECTED' && error.cause?.code === '42601'
  await assert.rejects(database.read(ACCOUNT, (tx) => tx.rows(Value, two)), serverRefusal)
  await assert.rejects(database.transaction(ACCOUNT, async (gate) => (await admitAccount(gate)).tx.run(two)), serverRefusal)
})

test('select, insert, update, delete and with run, and a query that names the role column runs', async (t) => {
  const { database } = await openRuntimeFixture(t, 'conexus_sql_text', { accounts: [[ACCOUNT, 'a']] })
  assert.deepEqual(await database.read(ACCOUNT, (tx) => tx.rows(Value, sql`select 1 as value`)), [{ value: 1 }])
  assert.deepEqual(await database.read(ACCOUNT, (tx) => tx.rows(Value, sql`with one as (select 1 as value) select value from one`)), [{ value: 1 }])
  assert.deepEqual(await database.read(ACCOUNT, (tx) => tx.rows(z.object({ role: z.string() }), sql`select role from iam.workspace_membership`)), [])
  const changed = await database.transaction(ACCOUNT, async (gate) => { const { tx } = await admitAccount(gate); return {
    inserted: await tx.run(sql`insert into platform.operation_receipt (operation_id, authority, account_id, key_digest, request_digest, resource_id, state) values ('T-1', 'account:a', ${ACCOUNT}, ${Buffer.from('k')}, ${Buffer.from('r')}, ${ACCOUNT}, 'reserved')`),
    updated: await tx.run(sql`update platform.operation_receipt set state = 'reserved' where operation_id = 'T-1'`),
    deleted: await tx.run(sql`with gone as (delete from platform.operation_receipt where operation_id = 'T-1' returning 1) select 1`),
  } })
  assert.deepEqual(changed, { inserted: 1, updated: 1, deleted: 1 })
})

test('an entry opened inside another throws NESTED_TRANSACTION', async (t) => {
  const { database } = await openRuntimeFixture(t, 'conexus_nested', { accounts: [[ACCOUNT, 'a']] })
  const nested = (error) => error.id === 'INTERNAL_UNEXPECTED' && error.details?.reason === 'NESTED_TRANSACTION'
  await assert.rejects(database.read(ACCOUNT, () => database.read(ACCOUNT, async () => 1)), nested)
  await assert.rejects(database.transaction(ACCOUNT, () => database.read(ACCOUNT, async () => 1)), nested)
  await assert.rejects(database.read(ACCOUNT, () => database.transaction(ACCOUNT, async () => 1)), nested)
  await assert.rejects(database.transaction(ACCOUNT, () => database.system('project-purge', async () => 1)), nested)
  assert.equal(await database.read(ACCOUNT, async () => 1), 1)
})

test('openDatabase allows only a search_path option, and refuses a role, an authorization, a conexus setting and any other', async (t) => {
  const { connection } = await openRuntimeFixture(t, 'conexus_options')
  const base = { host: connection.host, port: connection.port, database: connection.database, user: 'hub_runtime', passwordFile: '/nonexistent' }
  for (const options of ['-c role=hub_command', '-c search_path=iam -c ROLE=hub_command', '-c session_authorization=postgres', '-crole=hub_command', '-c conexus.job=project-purge', '--role=hub_command', '-c work_mem=1GB', 'role=hub_command']) {
    assert.throws(() => openDatabase({ ...base, options }), (error) => error.id === 'INTERNAL_UNEXPECTED' && error.details?.reason === 'POOL_OPTION_REFUSED', options)
  }
  assert.throws(() => openDatabase({ ...base, options: '-c search_path=iam' }), { code: 'ENOENT' })
})

test('a literal or a comment that holds a semicolon, a conexus word, a comment opener or a switch is not refused', async (t) => {
  const { database } = await openRuntimeFixture(t, 'conexus_sql_text_literals', { accounts: [[ACCOUNT, 'a']] })
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
    const statement = sql(Object.assign([text], { raw: [text] }))
    assert.deepEqual(await database.read(ACCOUNT, (tx) => tx.rows(Text, statement)), [{ value: expected }], label)
  }
})
