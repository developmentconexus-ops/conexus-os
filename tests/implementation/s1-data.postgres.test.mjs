import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { z } from 'zod'
import { buildHubDatabase, givePasswordToHubRuntime, loginPoolOf, query } from './hub-database.mjs'
import { hubModuleUrl } from './hub-build.mjs'
import { takeHubLogs } from './hub-log-capture.mjs'

const { openDatabase, sql, DATABASE_FAILURES } = await import(hubModuleUrl('platform/db.js'))
const { admitAccount, admitSystem } = await import(hubModuleUrl('identity-access/admission.js'))
const ACCOUNT = '10000000-0000-4000-8000-00000000000a'
const PASSWORD = 's1-data-test-only'

const setup = async (t) => {
  const fixture = await buildHubDatabase(t, 'conexus_s1_data')
  await givePasswordToHubRuntime(fixture.connection, fixture.onCleanup, PASSWORD)
  const directory = mkdtempSync(resolve(tmpdir(), 's1-data-'))
  const passwordFile = resolve(directory, 'runtime-password')
  writeFileSync(passwordFile, PASSWORD)
  chmodSync(passwordFile, 0o600)
  fixture.onCleanup(() => rmSync(directory, { recursive: true, force: true }))
  const database = openDatabase({ host: fixture.connection.host, port: fixture.connection.port, database: fixture.database, user: 'hub_runtime', passwordFile, max: 1 })
  fixture.onCleanup(() => database.close())
  return { ...fixture, database }
}

test('a row is parsed through an admitted proof and a missing row has its named failure', async (t) => {
  const { database, connection } = await setup(t)
  await query(connection, "INSERT INTO iam.account(account_id, issuer, external_subject, display_name) VALUES ($1, 'https://issuer.test', 'a', 'A')", [ACCOUNT])
  const NumberRow = z.object({ value: z.number() })
  const StringRow = z.object({ value: z.string() })
  const result = await database.transaction(ACCOUNT, async (gate) => {
    const { tx } = await admitAccount(gate)
    assert.equal(tx.mode, 'write')
    const value = await tx.one(NumberRow, sql`SELECT ${7}::integer AS value`, 'NOT_FOUND')
    const quoted = await tx.one(z.object({ 'col"name': z.number() }), sql`SELECT ${8}::integer AS ${sql.identifier('col"name')}`, 'NOT_FOUND')
    return { value, quoted }
  })
  assert.deepEqual(result, { value: { value: 7 }, quoted: { 'col"name': 8 } })
  await assert.rejects(database.read(ACCOUNT, async (gate) => (await admitAccount(gate)).tx.one(StringRow, sql`SELECT 1 AS value`, 'NOT_FOUND')), { name: 'ZodError' })
  await assert.rejects(database.read(ACCOUNT, async (gate) => (await admitAccount(gate)).tx.one(NumberRow, sql`SELECT 1 AS value WHERE false`, 'NOT_FOUND')), { id: 'NOT_FOUND' })
  assert.deepEqual((await (await loginPoolOf(database)).query("SELECT current_setting('conexus.account_id', true) AS value")).rows, [{ value: null }])
})

test('the read entry is closed until admission and an admitted read stops at its transaction boundary', async (t) => {
  const { database, connection } = await setup(t)
  await query(connection, "INSERT INTO iam.account(account_id, issuer, external_subject, display_name) VALUES ($1, 'https://issuer.test', 'a', 'A')", [ACCOUNT])
  let retained
  await database.read(ACCOUNT, async (gate) => {
    assert.equal(gate.mode, 'read')
    assert.equal(gate.rows, undefined)
    retained = await admitAccount(gate)
    assert.deepEqual(await retained.tx.rows(z.object({ value: z.number() }), sql`SELECT 1 AS value`), [{ value: 1 }])
  })
  await assert.rejects(retained.tx.rows(z.object({ value: z.number() }), sql`SELECT 1 AS value`), { id: 'INTERNAL_UNEXPECTED' })
  await assert.rejects(database.read(ACCOUNT, async (gate) => (await admitAccount(gate)).tx.maybe(z.object({ present: z.literal(1) }), sql`UPDATE iam.account SET email = email WHERE account_id = ${ACCOUNT} RETURNING 1 AS present`)), { id: 'INTERNAL_UNEXPECTED' })
})

test('the runtime role cannot call the tenure lock, lock or read iam tables, change schema, assume an owner, or read factory', async (t) => {
  const { database, connection } = await setup(t)
  await query(connection, 'CREATE TABLE factory.s1_private (value integer)')
  const pool = await loginPoolOf(database)
  const sqlstate = (statement) => pool.query(statement).then(() => 'OK', (error) => error.code)
  assert.equal(await sqlstate('SELECT iam.lock_administrators()'), 'OK')
  assert.equal(await sqlstate('CREATE TABLE workspace.s1_forbidden (id integer)'), '42501')
  assert.equal(await sqlstate('ALTER TABLE iam.account ADD COLUMN s1_forbidden integer'), '42501')
  assert.equal(await sqlstate('SET ROLE conexus_owner'), '42501')
  assert.equal(await sqlstate('SELECT * FROM factory.s1_private'), '42501')
  assert.equal(await sqlstate('SELECT * FROM iam.account'), 'OK')
})

test('every mapped database failure names a real constraint and a registered failure', async (t) => {
  const { database, connection } = await setup(t)
  const failures = JSON.parse((await import('node:fs')).readFileSync(new URL('../../contracts/technical/failures.json', import.meta.url), 'utf8'))
  for (const rule of DATABASE_FAILURES) {
    assert.equal(failures.failures.some((row) => row.code === rule.failure), true)
    if (rule.constraint) assert.equal((await query(connection, 'SELECT 1 FROM pg_constraint WHERE conname = $1', [rule.constraint])).rowCount > 0, true)
  }
  await query(connection, "INSERT INTO iam.account(account_id, issuer, external_subject, display_name) VALUES ($1, 'https://issuer.test', 'a', 'A')", [ACCOUNT])
  const orphan = sql`INSERT INTO iam.workspace_membership(account_id, workspace_id, role) VALUES (${ACCOUNT}, '20000000-0000-4000-8000-000000000001', 'owner')`
  await assert.rejects(database.system('project-purge', async (gate) => (await admitSystem(gate, 'project-purge')).tx.run(orphan)), (error) => error.id === 'WORKSPACE_NOT_FOUND' && error.cause?.code === '23503')
  await assert.rejects(database.read(ACCOUNT, async (gate) => (await admitAccount(gate)).tx.rows(z.object({ value: z.number() }), sql`SELECT 1 / 0 AS value`)),
    (error) => error.id === 'INTERNAL_UNEXPECTED' && error.cause?.code === '22012')
})

test('a dead idle client is logged and the shared pool recovers', async (t) => {
  const { database, connection } = await setup(t)
  const pool = await loginPoolOf(database)
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
