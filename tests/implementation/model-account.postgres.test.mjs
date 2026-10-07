import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import pg from 'pg'
import { hubModuleUrl } from './hub-build.mjs'
import { loginPoolOf, query } from './hub-database.mjs'
import { OWNER, setupBuilder } from './builder-fixture.mjs'
import { ID } from './project-fixture.mjs'

const { createModelAccounts } = await import(hubModuleUrl('builder/model-account/accounts.js'))
const { createSecretEnvelope } = await import(hubModuleUrl('platform/secrets.js'))
const { admitAccount } = await import(hubModuleUrl('identity-access/admission.js'))

const KEY = 'ab'.repeat(32)
const envelope = createSecretEnvelope(KEY)
const sealedOf = (label) => envelope.seal(label)

const A = ID.owner
const B = ID.member
const C = ID.outsider

const ANTHROPIC_KEY = { provider: 'anthropic', kind: 'api_key' }
const ANTHROPIC_OAUTH = { provider: 'anthropic', kind: 'oauth' }
const CODEX = { provider: 'openai-codex', kind: 'oauth' }

const NAME = 'Ana Teste'
const as = (accountId) => ({ accountId, displayName: NAME })

const setup = async (t, prefix) => {
  const fixture = await setupBuilder(t, prefix)
  const accounts = createModelAccounts({ database: fixture.database, envelope, ownerId: OWNER })
  const seedRow = async (owner, provider, kind, label) => (await query(fixture.connection,
    `INSERT INTO model.model_account(scope, owner_account_id, provider, kind, secret, connected_by, connected_by_name, connected_at)
     VALUES ('personal', $1, $2, $3, $4, $1, $5, clock_timestamp()) RETURNING model_account_id`,
    [owner, provider, kind, await sealedOf(label), NAME])).rows[0].model_account_id
  const rowsOf = async () => (await query(fixture.connection, 'SELECT scope, owner_account_id, provider, kind, connected_by, connected_by_name, connected_at, refused_at, model_account_id, secret FROM model.model_account ORDER BY owner_account_id, provider')).rows
  const secretOf = async (modelAccountId) => envelope.open((await query(fixture.connection, 'SELECT secret FROM model.model_account WHERE model_account_id = $1', [modelAccountId])).rows[0].secret)
  const recordFor = (builderRunId, modelAccountId) => query(fixture.connection, 'INSERT INTO builder.builder_run_model_account(builder_run_id, model_account_id) VALUES ($1, $2)', [builderRunId, modelAccountId])
  return { ...fixture, accounts, seedRow, rowsOf, secretOf, recordFor }
}

const ENTRY = {
  read: (accountId) => ({ begin: 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY', role: 'hub_reader', settings: accountId === undefined ? [] : [['conexus.account_id', accountId]] }),
  command: () => ({ begin: 'BEGIN', role: 'hub_command', settings: [] }),
  readerWrite: (accountId) => ({ begin: 'BEGIN', role: 'hub_reader', settings: [['conexus.account_id', accountId]] }),
  runtime: () => ({ begin: 'BEGIN', role: 'hub_runtime', settings: [] }),
}
const sqlstate = async (connection, entry, text, values = []) => {
  const client = new pg.Client(connection)
  await client.connect()
  try {
    await client.query(entry.begin)
    const pairs = [['role', entry.role], ...entry.settings]
    await client.query(`SELECT ${pairs.map((_pair, index) => `set_config($${index * 2 + 1}, $${index * 2 + 2}, true)`).join(', ')}`, pairs.flat())
    const result = await client.query(text, values)
    await client.query('ROLLBACK')
    return { state: 'OK', rows: result.rows }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    return { state: error.code ?? String(error) }
  } finally {
    await client.end()
  }
}

test('select returns the caller\'s own row and nothing once it is removed, and usable follows it', async (t) => {
  const { accounts, seedRow, connection } = await setup(t, 'conexus_model_select')
  await seedRow(B, 'anthropic', 'api_key', 'own-of-b')
  const run = (accountId) => ({ builderRunId: randomUUID(), accountId })
  const own = await seedRow(A, 'anthropic', 'api_key', 'own-of-a')
  const ofA = await accounts.select(run(A), 'anthropic')
  assert.deepEqual([ofA.modelAccountId, ofA.secret, ofA.credential], [own, 'own-of-a', ANTHROPIC_KEY])
  await query(connection, 'DELETE FROM model.model_account WHERE model_account_id = $1', [own])
  assert.equal(await accounts.select(run(A), 'anthropic'), null, 'another person\'s row never pays')
  assert.equal(await accounts.usable(A, 'anthropic'), false)
  assert.equal(await accounts.usable(B, 'anthropic'), true)
})

test('a third account\'s private row is never selected, never usable and never held by another account', async (t) => {
  const { accounts, seedRow, recordFor, seedBuilderProject, seedRun } = await setup(t, 'conexus_model_third')
  const privateOfC = await seedRow(C, 'anthropic', 'api_key', 'private-of-c')
  const projectId = await seedBuilderProject()
  const builderRunId = await seedRun(projectId, { accountId: A })
  assert.equal(await accounts.select({ builderRunId, accountId: A }, 'anthropic'), null)
  assert.equal(await accounts.usable(A, 'anthropic'), false)
  await seedRow(A, 'anthropic', 'api_key', 'own-of-a')
  const held = await accounts.select({ builderRunId, accountId: A }, 'anthropic')
  assert.equal(held.secret, 'own-of-a')
  assert.equal((await accounts.select({ builderRunId, accountId: C }, 'anthropic')).modelAccountId, privateOfC)
  await recordFor(builderRunId, privateOfC)
  assert.equal(await held.read(), null, 'the run recorded only C\'s row, and the handle holds A\'s id')
})

test('a first key write creates a personal row connected by the writer, and rewriting keeps the id, moves connected_at and clears a refusal', async (t) => {
  const { accounts, rowsOf, connection } = await setup(t, 'conexus_model_write')
  await accounts.write({ account: as(A), credential: ANTHROPIC_KEY, secret: 'first-key' })
  const [first] = await rowsOf()
  assert.deepEqual({ scope: first.scope, owner: first.owner_account_id, provider: first.provider, kind: first.kind, by: first.connected_by, name: first.connected_by_name, refused: first.refused_at },
    { scope: 'personal', owner: A, provider: 'anthropic', kind: 'api_key', by: A, name: NAME, refused: null })
  assert.equal(await envelope.open(first.secret), 'first-key')
  await query(connection, 'UPDATE model.model_account SET refused_at = connected_at')
  await accounts.write({ account: { accountId: A, displayName: 'Ana Renomeada' }, credential: ANTHROPIC_OAUTH, secret: 'second-oauth' })
  const rows = await rowsOf()
  assert.equal(rows.length, 1)
  assert.deepEqual({ id: rows[0].model_account_id, kind: rows[0].kind, name: rows[0].connected_by_name, refused: rows[0].refused_at },
    { id: first.model_account_id, kind: 'oauth', name: 'Ana Renomeada', refused: null })
  assert.equal(await envelope.open(rows[0].secret), 'second-oauth')
  assert.equal(rows[0].connected_at > first.connected_at, true, 'a new sign-in is a new generation')
})

test('two concurrent writes for one owner and provider leave one row and one id', async (t) => {
  const { accounts, rowsOf, seedRow } = await setup(t, 'conexus_model_concurrent')
  const id = await seedRow(A, 'anthropic', 'api_key', 'prior')
  await Promise.all([
    accounts.write({ account: as(A), credential: ANTHROPIC_KEY, secret: 'one' }),
    accounts.write({ account: as(A), credential: ANTHROPIC_OAUTH, secret: 'two' }),
  ])
  const rows = await rowsOf()
  assert.deepEqual(rows.map((row) => row.model_account_id), [id])
  assert.equal(['one', 'two'].includes(await envelope.open(rows[0].secret)), true)
})

test('an inactive or unknown account cannot write, and connect answers failed for both and throws for a fault', async (t) => {
  const { accounts, connection, rowsOf } = await setup(t, 'conexus_model_refused')
  await query(connection, 'UPDATE iam.account SET active = false WHERE account_id = $1', [C])
  await assert.rejects(accounts.write({ account: as(C), credential: ANTHROPIC_KEY, secret: 'k' }), { id: 'ACCOUNT_INACTIVE' })
  await assert.rejects(accounts.write({ account: as(randomUUID()), credential: ANTHROPIC_KEY, secret: 'k' }), { id: 'ACCOUNT_NOT_FOUND' })
  assert.deepEqual([
    await accounts.connect({ account: as(C), credential: ANTHROPIC_KEY, secret: 'k' }),
    await accounts.connect({ account: as(randomUUID()), credential: ANTHROPIC_KEY, secret: 'k' }),
    await accounts.connect({ account: as(A), credential: ANTHROPIC_KEY, secret: 'k' }),
  ], [{ ok: false, reason: 'ACCOUNT_INACTIVE' }, { ok: false, reason: 'ACCOUNT_NOT_FOUND' }, { ok: true }])
  assert.equal((await rowsOf()).length, 1)
  await query(connection, "ALTER TABLE model.model_account ADD CONSTRAINT refuse_everything CHECK (provider = 'none') NOT VALID")
  await assert.rejects(accounts.connect({ account: as(A), credential: CODEX, secret: 'k' }), { id: 'INTERNAL_UNEXPECTED' })
})

test('standing reports each provider with the caller\'s own kind only, and readDefault reads the installation default', async (t) => {
  const { accounts, seedRow, connection } = await setup(t, 'conexus_model_standing')
  await seedRow(A, 'anthropic', 'oauth', 'a-oauth')
  await seedRow(B, 'openai-codex', 'oauth', 'b-codex')
  await seedRow(C, 'google-ai-pro', 'google_ai_pro', 'c-google')
  assert.deepEqual(await accounts.standing(A), {
    anthropic: { own: { state: 'connected', kind: 'oauth' } },
    'openai-codex': { own: { state: 'absent' } },
    'google-ai-pro': { own: { state: 'absent' } },
  })
  assert.equal(await accounts.readDefault(A, 'build'), null)
  await query(connection, "INSERT INTO model.installation_default(role, model_id, updated_by) VALUES ('build', 'anthropic/claude-sonnet-5', $1)", [ID.administrator])
  assert.deepEqual([await accounts.readDefault(C, 'build'), await accounts.readDefault(C, 'memory')], ['anthropic/claude-sonnet-5', null])
  assert.equal((await sqlstate(connection, ENTRY.command(), "INSERT INTO model.installation_default(role, model_id, updated_by) VALUES ('plan', 'x/y', $1)", [ID.administrator])).state, '42501', 'no Hub role writes a default')
  await assert.rejects(query(connection, "INSERT INTO model.installation_default(role, model_id, updated_by) VALUES ('plan', 'x/y', $1)", [ID.administrator]), { code: '23514' }, 'plan is no role')
})

test('the refresh persists with literal bytes on the row the run recorded; another account selects nothing', async (t) => {
  const { accounts, seedRow, recordFor, secretOf, seedBuilderProject, seedRun } = await setup(t, 'conexus_model_persist')
  const row = await seedRow(A, 'openai-codex', 'oauth', 'refresh-old')
  const projectId = await seedBuilderProject()
  const builderRunId = await seedRun(projectId, { accountId: A })
  const held = await accounts.select({ builderRunId, accountId: A }, 'openai-codex')
  assert.equal(held.modelAccountId, row)
  await recordFor(builderRunId, row)
  const reread = await held.read()
  assert.deepEqual([reread.modelAccountId, reread.secret], [row, 'refresh-old'])
  assert.equal(await held.persist('{"access":"refreshed","refresh":"r2"}'), true)
  assert.equal(await secretOf(row), '{"access":"refreshed","refresh":"r2"}')
  assert.equal(await accounts.select({ builderRunId: randomUUID(), accountId: C }, 'openai-codex'), null)
})

test('a run reads only a row its own run recorded, and a deleted row reads null', async (t) => {
  const { accounts, seedRow, recordFor, connection, seedBuilderProject, seedRun } = await setup(t, 'conexus_model_recorded')
  const row = await seedRow(A, 'anthropic', 'api_key', 'mine')
  const projectId = await seedBuilderProject()
  const runX = await seedRun(projectId, { accountId: A })
  const runY = await seedRun(await seedBuilderProject('Zeta'), { accountId: A })
  const heldByX = await accounts.select({ builderRunId: runX, accountId: A }, 'anthropic')
  const heldByY = await accounts.select({ builderRunId: runY, accountId: A }, 'anthropic')
  await recordFor(runY, row)
  assert.equal(await heldByX.read(), null, 'run X recorded nothing, though the row exists and A could read it as a person')
  assert.equal((await heldByY.read()).secret, 'mine')
  await query(connection, 'DELETE FROM builder.builder_run_model_account')
  assert.equal(await heldByY.read(), null, 'a run that recorded no model account reads null')
  await recordFor(runY, row)
  await query(connection, 'DELETE FROM model.model_account WHERE model_account_id = $1', [row])
  assert.equal(await heldByY.read(), null)
  assert.equal(await heldByY.persist('late'), false, 'the rewrite of a deleted row answers false')
})

test('a run whose account lost the Project or whose lease another owner took reads null, another account selects nothing, and the executor still persists', async (t) => {
  const { accounts, seedRow, recordFor, secretOf, connection, seedBuilderProject, seedRun } = await setup(t, 'conexus_model_admission')
  const row = await seedRow(B, 'openai-codex', 'oauth', 'old')
  const projectId = await seedBuilderProject()
  const builderRunId = await seedRun(projectId, { accountId: B })
  await recordFor(builderRunId, row)
  const held = await accounts.select({ builderRunId, accountId: B }, 'openai-codex')
  assert.equal((await held.read()).secret, 'old')
  assert.equal(await accounts.select({ builderRunId, accountId: A }, 'openai-codex'), null, 'an account that is not the run\'s')
  await query(connection, 'UPDATE builder.builder_run SET owner_id = $2 WHERE builder_run_id = $1', [builderRunId, randomUUID()])
  assert.equal(await held.read(), null, 'a run whose lease another instance took')
  await query(connection, 'UPDATE builder.builder_run SET owner_id = $2 WHERE builder_run_id = $1', [builderRunId, OWNER])
  await query(connection, 'DELETE FROM iam.workspace_membership WHERE account_id = $1', [B])
  assert.equal(await held.read(), null, 'an account that lost the Project')
  assert.equal(await held.persist('refreshed-after-loss'), true)
  assert.equal(await secretOf(row), 'refreshed-after-loss')
})

test('the refresh persists after the run ends, and a deleted row makes the system write answer false', async (t) => {
  const { accounts, seedRow, recordFor, secretOf, connection, seedBuilderProject, seedRun, runRow } = await setup(t, 'conexus_model_ended')
  const row = await seedRow(A, 'openai-codex', 'oauth', 'old')
  const builderRunId = await seedRun(await seedBuilderProject(), { accountId: A })
  await recordFor(builderRunId, row)
  const held = await accounts.select({ builderRunId, accountId: A }, 'openai-codex')
  await query(connection, "UPDATE builder.builder_run SET state = 'INTERRUPTED', failure_code = 'HUB_RESTART', finished_at = now() WHERE builder_run_id = $1", [builderRunId])
  assert.equal((await runRow(builderRunId)).state, 'INTERRUPTED')
  assert.equal(await held.read(), null, 'the ended run is no longer admitted')
  assert.equal(await held.persist('refreshed-after-end'), true)
  assert.equal(await secretOf(row), 'refreshed-after-end')
  await query(connection, 'DELETE FROM model.model_account WHERE model_account_id = $1', [row])
  assert.equal(await held.persist('into-nothing'), false)
})

test('a key pasted while a run refreshes an OAuth row wins: the refresh persists false and the row opens to the key', async (t) => {
  const { accounts, seedRow, rowsOf, secretOf } = await setup(t, 'conexus_model_kind_race')
  const row = await seedRow(A, 'anthropic', 'oauth', 'oauth-tokens')
  const held = await accounts.select({ builderRunId: randomUUID(), accountId: A }, 'anthropic')
  await accounts.write({ account: as(A), credential: ANTHROPIC_KEY, secret: 'pasted-key' })
  assert.equal(await held.persist('refreshed-tokens'), false)
  assert.equal(await secretOf(row), 'pasted-key')
  assert.deepEqual((await rowsOf()).map((entry) => entry.kind), ['api_key'])
})

test('the table refuses every unlawful row by its check or key', async (t) => {
  const { connection, seedRow } = await setup(t, 'conexus_model_checks')
  const sealed = await sealedOf('x')
  const insert = (scope, owner, provider, kind, extra = '') => query(connection,
    `INSERT INTO model.model_account(scope, owner_account_id, provider, kind, secret, connected_by, connected_by_name, connected_at${extra ? ', refused_at' : ''})
     VALUES ($1, $2, $3, $4, $5, $6, 'Ana', clock_timestamp()${extra})`, [scope, owner, provider, kind, sealed, A])
  const code = (promise) => promise.then(() => 'OK', (error) => `${error.code}:${error.constraint}`)
  assert.equal(await code(insert('personal', A, 'anthropic', 'api_key')), 'OK')
  assert.equal(await code(insert('installation', null, 'anthropic', 'oauth')), 'OK')
  assert.deepEqual([
    await code(insert('team', null, 'openai-codex', 'oauth')),
    await code(insert('personal', null, 'openai-codex', 'oauth')),
    await code(insert('installation', A, 'openai-codex', 'oauth')),
    await code(insert('personal', B, 'anthropic', 'google_ai_pro')),
    await code(insert('personal', B, 'openai', 'oauth')),
    await code(insert('personal', B, 'openai-codex', 'oauth', ", clock_timestamp() - interval '1 second'")),
    await code(insert('personal', A, 'anthropic', 'oauth')),
    await code(insert('installation', null, 'anthropic', 'api_key')),
    await code(insert('personal', randomUUID(), 'openai-codex', 'oauth')),
  ], [
    '23514:model_account_scope_check',
    '23514:model_account_owner_check',
    '23514:model_account_owner_check',
    '23514:model_account_pair_check',
    '23514:model_account_pair_check',
    '23514:model_account_refused_check',
    '23505:model_account_personal_key',
    '23505:model_account_installation_key',
    '23503:model_account_owner_account_id_fkey',
  ])
  await assert.rejects(seedRow(B, 'anthropic', 'google_ai_pro', 'not-anthropic'), { code: '23514' })
})

test('the wall: hub_command writes the connection columns, never scope, owner or provider, and may delete', async (t) => {
  const { connection, seedRow } = await setup(t, 'conexus_model_wall')
  const id = await seedRow(A, 'anthropic', 'api_key', 'k')
  const sealed = await sealedOf('x')
  const code = async (text, values = []) => (await sqlstate(connection, ENTRY.command(), text, values)).state
  for (const [column, value] of [['kind', "'oauth'"], ['secret', `'${sealed}'`], ['updated_at', 'clock_timestamp()'], ['connected_by', `'${B}'`], ['connected_by_name', "'Bia'"], ['connected_at', 'clock_timestamp()'], ['refused_at', 'clock_timestamp()']]) {
    assert.equal(await code(`UPDATE model.model_account SET ${column} = ${value} WHERE model_account_id = $1`, [id]), 'OK', column)
  }
  for (const [column, value] of [['scope', "'installation'"], ['owner_account_id', `'${B}'`], ['provider', "'openai-codex'"], ['model_account_id', 'gen_random_uuid()']]) {
    assert.equal(await code(`UPDATE model.model_account SET ${column} = ${value} WHERE model_account_id = $1`, [id]), '42501', column)
  }
  const columns = 'scope, owner_account_id, provider, kind, secret, connected_by, connected_by_name, connected_at'
  assert.equal(await code(`INSERT INTO model.model_account (${columns}) VALUES ('personal', $1, 'openai-codex', 'oauth', $2, $1, 'Ana', clock_timestamp())`, [A, sealed]), 'OK')
  assert.equal(await code(`INSERT INTO model.model_account (${columns}, refused_at) VALUES ('personal', $1, 'openai-codex', 'oauth', $2, $1, 'Ana', clock_timestamp(), clock_timestamp())`, [A, sealed]), '42501', 'a row is never inserted refused')
  assert.equal(await code(`INSERT INTO model.model_account (${columns}) VALUES ('personal', $1, 'openai-codex', 'oauth', 'plain', $1, 'Ana', clock_timestamp())`, [A]), '23514', 'the sealed check still refuses a plain secret')
  assert.equal(await code('DELETE FROM model.model_account WHERE model_account_id = $1', [id]), 'OK')
  assert.equal(await code('SELECT 1 FROM model.installation_default'), '42501')
})

test('the reader wall: hub_reader never reads the secret, reads its own rows and the installation\'s, and reads zero rows without an account', async (t) => {
  const { connection, seedRow } = await setup(t, 'conexus_model_reader')
  await seedRow(A, 'anthropic', 'api_key', 'own-of-a')
  await seedRow(B, 'anthropic', 'api_key', 'private-of-b')
  await query(connection, `INSERT INTO model.model_account(scope, provider, kind, secret, connected_by, connected_by_name, connected_at)
    VALUES ('installation', 'google-ai-pro', 'google_ai_pro', $1, $2, 'Admin', clock_timestamp())`, [await sealedOf('company'), ID.administrator])
  await query(connection, "INSERT INTO model.installation_default(role, model_id, updated_by) VALUES ('build', 'anthropic/x', $1)", [ID.administrator])
  const read = (accountId) => ENTRY.read(accountId)
  for (const text of ['SELECT secret FROM model.model_account', 'SELECT * FROM model.model_account', 'SELECT model_account_id FROM model.model_account WHERE secret IS NOT NULL']) {
    assert.equal((await sqlstate(connection, read(A), text)).state, '42501', text)
  }
  const visible = await sqlstate(connection, read(A), 'SELECT provider, scope, owner_account_id = $1 AS mine FROM model.model_account ORDER BY provider', [A])
  assert.deepEqual(visible.rows, [{ provider: 'anthropic', scope: 'personal', mine: true }, { provider: 'google-ai-pro', scope: 'installation', mine: null }], 'no one sees another person\'s row')
  const columns = 'model_account_id, scope, owner_account_id, provider, kind, connected_by, connected_by_name, connected_at, updated_at, refused_at'
  assert.equal((await sqlstate(connection, read(A), `SELECT ${columns} FROM model.model_account`)).state, 'OK')
  for (const text of ['SELECT model_account_id FROM model.model_account FOR SHARE', 'SELECT model_account_id FROM model.model_account FOR UPDATE', "UPDATE model.model_account SET kind = 'oauth'"]) {
    assert.equal((await sqlstate(connection, read(A), text)).state, '25006', `${text} inside read() answers 25006`)
  }
  for (const text of ['SELECT model_account_id FROM model.model_account FOR SHARE', 'SELECT model_account_id FROM model.model_account FOR UPDATE', "UPDATE model.model_account SET kind = 'oauth'", 'DELETE FROM model.model_account']) {
    assert.equal((await sqlstate(connection, ENTRY.readerWrite(A), text)).state, '42501', `${text} outside READ ONLY answers 42501`)
  }
  assert.deepEqual((await sqlstate(connection, read(B), 'SELECT model_id FROM model.installation_default WHERE role = $1', ['build'])).rows, [{ model_id: 'anthropic/x' }], 'every account reads the default')
  assert.deepEqual((await sqlstate(connection, read(undefined), 'SELECT count(*)::int AS n FROM model.model_account')).rows, [{ n: 0 }])
  assert.deepEqual((await sqlstate(connection, read(undefined), 'SELECT count(*)::int AS n FROM model.installation_default')).rows, [{ n: 0 }])
})

test('the catalog: two forced tables, no model function, no retired role, and hub_runtime holds nothing', async (t) => {
  const { connection } = await setup(t, 'conexus_model_catalog')
  const flags = (await query(connection, "SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relnamespace = 'model'::regnamespace AND relkind = 'r' ORDER BY 1")).rows
  assert.deepEqual(flags.map((row) => [row.relname, row.relrowsecurity, row.relforcerowsecurity]), [['installation_default', true, true], ['model_account', true, true]])
  assert.deepEqual((await query(connection, "SELECT count(*)::int AS n FROM pg_proc WHERE pronamespace = 'model'::regnamespace")).rows, [{ n: 0 }])
  assert.deepEqual((await query(connection, "SELECT count(*)::int AS n FROM pg_roles WHERE rolname = 'hub_model_account'")).rows, [{ n: 0 }])
  assert.deepEqual((await query(connection, "SELECT tablename || ':' || policyname || ':' || roles::text AS policy FROM pg_policies WHERE schemaname = 'model' ORDER BY 1")).rows.map((row) => row.policy), [
    'installation_default:command:{hub_command}', 'installation_default:reader:{hub_reader}',
    'model_account:command:{hub_command}', 'model_account:reader:{hub_reader}',
  ])
  for (const table of ['model_account', 'installation_default']) {
    assert.equal((await sqlstate(connection, ENTRY.runtime(), `SELECT 1 FROM model.${table}`)).state, '42501', `hub_runtime on ${table}`)
  }
})

test('a pooled client is hub_runtime with no grant on the model tables after a commit, a rollback and a throw', async (t) => {
  const { openRuntimeDatabase } = await setup(t, 'conexus_model_pooled')
  const single = openRuntimeDatabase({ max: 1 })
  const pooled = createModelAccounts({ database: single, envelope, ownerId: OWNER })
  const pool = await loginPoolOf(single)
  const refusedOnEveryTable = async (when) => {
    assert.deepEqual((await pool.query('SELECT current_user AS who')).rows, [{ who: 'hub_runtime' }], when)
    for (const table of ['model_account', 'installation_default']) {
      await assert.rejects(pool.query(`SELECT 1 FROM model.${table}`), { code: '42501' }, `${when}: ${table}`)
    }
  }
  await pooled.write({ account: as(A), credential: ANTHROPIC_KEY, secret: 'committed' })
  await refusedOnEveryTable('after a commit')
  await assert.rejects(pooled.write({ account: as(randomUUID()), credential: ANTHROPIC_KEY, secret: 'k' }), { id: 'ACCOUNT_NOT_FOUND' })
  await refusedOnEveryTable('after a rollback')
  await assert.rejects(single.transaction(A, async (gate) => { await admitAccount(gate); throw new Error('thrown') }), { message: 'thrown' })
  await refusedOnEveryTable('after a throw')
  assert.deepEqual((await pooled.standing(A)).anthropic, { own: { state: 'connected', kind: 'api_key' } })
  await refusedOnEveryTable('after a read')
})

test('concurrent upserts beside the unported IAM paths never deadlock under a short deadlock_timeout', async (t) => {
  const { accounts, connection, rowsOf } = await setup(t, 'conexus_model_deadlock')
  await query(connection, `ALTER DATABASE "${connection.database}" SET deadlock_timeout = '100ms'`)
  const iam = async () => {
    await query(connection, "UPDATE iam.account SET display_name = 'Owner again' WHERE account_id = $1", [A])
    await query(connection, "UPDATE iam.workspace_membership SET role = role WHERE account_id = $1", [A])
  }
  const outcomes = []
  for (let round = 0; round < 15; round++) {
    outcomes.push(...await Promise.allSettled([
      accounts.write({ account: as(A), credential: ANTHROPIC_KEY, secret: `one-${round}` }),
      accounts.write({ account: as(A), credential: ANTHROPIC_OAUTH, secret: `two-${round}` }),
      accounts.connect({ account: as(A), credential: CODEX, secret: `codex-${round}` }),
      iam(),
      iam(),
    ]))
  }
  assert.deepEqual(outcomes.filter((outcome) => outcome.status === 'rejected').map((outcome) => outcome.reason?.cause?.code ?? outcome.reason?.code ?? String(outcome.reason)), [])
  assert.deepEqual((await rowsOf()).map((row) => row.provider), ['anthropic', 'openai-codex'])
})
