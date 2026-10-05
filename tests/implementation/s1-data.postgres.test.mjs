import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { z } from 'zod'
import { buildHubDatabase, query } from './hub-database.mjs'
import { hubModuleUrl } from './hub-build.mjs'
import { takeHubLogs } from './hub-log-capture.mjs'

const { openDatabase, sql, unportedPool, DATABASE_FAILURES } = await import(hubModuleUrl('platform/db.js'))
const ACCOUNT = '10000000-0000-4000-8000-00000000000a'
const PASSWORD = 's1-data-test-only'

const setup = async (t) => {
  const fixture = await buildHubDatabase(t, 'conexus_s1_data')
  await query(fixture.connection, "ALTER ROLE hub_runtime PASSWORD 's1-data-test-only'")
  const directory = mkdtempSync(resolve(tmpdir(), 's1-data-'))
  const passwordFile = resolve(directory, 'runtime-password')
  writeFileSync(passwordFile, PASSWORD)
  chmodSync(passwordFile, 0o600)
  fixture.onCleanup(() => query(fixture.connection, 'ALTER ROLE hub_runtime PASSWORD NULL'))
  fixture.onCleanup(() => rmSync(directory, { recursive: true, force: true }))
  const database = openDatabase({ host: fixture.connection.host, port: fixture.connection.port, database: fixture.database, user: 'hub_runtime', passwordFile, max: 1 })
  fixture.onCleanup(() => database.close())
  return { ...fixture, database }
}

test('a row is parsed, a missing row has its named failure, and a transaction setting does not leak', async (t) => {
  const { database } = await setup(t)
  const NumberRow = z.object({ value: z.number() })
  const StringRow = z.object({ value: z.string() })
  const result = await database.transaction(ACCOUNT, async (tx) => {
    assert.equal(tx.mode, 'write')
    const account = await tx.one(StringRow, sql`SELECT current_setting('conexus.account_id') AS value`, 'NOT_FOUND')
    const value = await tx.one(NumberRow, sql`SELECT ${7}::integer AS value`, 'NOT_FOUND')
    const quoted = await tx.one(z.object({ 'col"name': z.number() }), sql`SELECT ${8}::integer AS ${sql.identifier('col"name')}`, 'NOT_FOUND')
    return { account, value, quoted }
  })
  assert.deepEqual(result, { account: { value: ACCOUNT }, value: { value: 7 }, quoted: { 'col"name': 8 } })
  await assert.rejects(database.read(ACCOUNT, (tx) => tx.one(StringRow, sql`SELECT 1 AS value`, 'NOT_FOUND')), { name: 'ZodError' })
  await assert.rejects(database.read(ACCOUNT, (tx) => tx.one(NumberRow, sql`SELECT 1 AS value WHERE false`, 'NOT_FOUND')), { id: 'NOT_FOUND' })
  assert.deepEqual((await unportedPool(database).query("SELECT current_setting('conexus.account_id', true) AS value")).rows, [{ value: '' }])
})

test('the read entry has no write method and a retained transaction stops at its boundary', async (t) => {
  const { database } = await setup(t)
  let retained
  await database.read(ACCOUNT, async (tx) => {
    retained = tx
    assert.equal(tx.mode, 'read')
    assert.equal(tx.run, undefined)
    assert.deepEqual(await tx.rows(z.object({ value: z.number() }), sql`SELECT 1 AS value`), [{ value: 1 }])
  })
  await assert.rejects(retained.rows(z.object({ value: z.number() }), sql`SELECT 1 AS value`), { id: 'INTERNAL_UNEXPECTED' })
})

test('the runtime role can call remaining functions but cannot change schema, assume an owner, or read factory', async (t) => {
  const { database, connection } = await setup(t)
  await query(connection, 'CREATE TABLE factory.s1_private (value integer)')
  const pool = unportedPool(database)
  const sqlstate = (statement) => pool.query(statement).then(() => 'OK', (error) => error.code)
  assert.equal(await sqlstate('SELECT iam.session_lifetimes()'), 'OK')
  assert.equal(await sqlstate('CREATE TABLE workspace.s1_forbidden (id integer)'), '42501')
  assert.equal(await sqlstate('ALTER TABLE iam.account ADD COLUMN s1_forbidden integer'), '42501')
  assert.equal(await sqlstate('SET ROLE iam_owner'), '42501')
  assert.equal(await sqlstate('SELECT * FROM factory.s1_private'), '42501')
  assert.equal(await sqlstate('SELECT 1 FROM iam.account FOR SHARE'), 'OK')
})

test('every mapped database failure names a real constraint and a registered failure', async (t) => {
  const { database, connection } = await setup(t)
  const failures = JSON.parse((await import('node:fs')).readFileSync(new URL('../../contracts/technical/failures.json', import.meta.url), 'utf8'))
  for (const rule of DATABASE_FAILURES) {
    assert.equal(failures.failures.some((row) => row.code === rule.failure), true)
    if (rule.constraint) assert.equal((await query(connection, 'SELECT 1 FROM pg_constraint WHERE conname = $1', [rule.constraint])).rowCount > 0, true)
  }
  const insert = sql`INSERT INTO platform.operation_receipt(operation_id, authority, account_id, key_digest, request_digest, resource_id, state)
    VALUES ('WS-01', 'bootstrap:issuer:subject', NULL, decode('aa', 'hex'), decode('bb', 'hex'), '20000000-0000-4000-8000-000000000001', 'reserved')`
  await database.system('migration', (tx) => tx.run(insert))
  await assert.rejects(database.system('migration', (tx) => tx.run(insert)), (error) => error.id === 'IDEMPOTENCY_CONFLICT' && error.cause?.code === '23505')
  await assert.rejects(database.read(ACCOUNT, (tx) => tx.rows(z.object({ value: z.number() }), sql`SELECT 1 / 0 AS value`)),
    (error) => error.id === 'INTERNAL_UNEXPECTED' && error.cause?.code === '22012')
})

test('a dead idle client is logged and the shared pool recovers', async (t) => {
  const { database, connection } = await setup(t)
  const pool = unportedPool(database)
  takeHubLogs()
  const client = await pool.connect()
  const pid = (await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
  client.release()
  assert.equal((await query(connection, 'SELECT pg_terminate_backend($1) AS terminated', [pid])).rows[0].terminated, true)
  const started = Date.now()
  let logs = []
  while (logs.length === 0 && Date.now() - started < 5000) {
    await new Promise((resolve) => setTimeout(resolve, 25))
    logs = takeHubLogs().filter((row) => row.message === 'HUB_POOL_ERROR')
  }
  assert.deepEqual(logs.map((row) => [row.fields['hub.capability'], row.fields['db.error_code']]), [['hub-data', '57P01']])
  assert.equal((await pool.query('SELECT 1 AS alive')).rows[0].alive, 1)
})
