import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import pg from 'pg'
import { hubModuleUrl } from './hub-build.mjs'
import { query } from './hub-database.mjs'
import { OWNER, setupBuilder } from './builder-fixture.mjs'
import { ID } from './project-fixture.mjs'

const { createModelAccounts } = await import(hubModuleUrl('builder/model-account/accounts.js'))
const { createSecretEnvelope } = await import(hubModuleUrl('platform/secrets.js'))

const KEY = 'ab'.repeat(32)
const envelope = createSecretEnvelope(KEY)
const sealedOf = (label) => envelope.seal(label)

const A = ID.owner
const B = ID.member
const C = ID.outsider

const ANTHROPIC_KEY = { provider: 'anthropic', kind: 'api_key' }
const ANTHROPIC_OAUTH = { provider: 'anthropic', kind: 'oauth' }
const CODEX = { provider: 'openai-codex', kind: 'oauth' }

const setup = async (t, prefix) => {
  const fixture = await setupBuilder(t, prefix)
  const accounts = createModelAccounts({ database: fixture.database, envelope, ownerId: OWNER })
  const seedRow = async (owner, provider, kind, label, sharing = 'just_me') => (await query(fixture.connection,
    'INSERT INTO model.model_account(owner_account_id, provider, kind, secret, sharing) VALUES ($1, $2, $3, $4, $5) RETURNING model_account_id',
    [owner, provider, kind, await sealedOf(label), sharing])).rows[0].model_account_id
  const rowsOf = async () => (await query(fixture.connection, 'SELECT owner_account_id, provider, kind, sharing, model_account_id, secret FROM model.model_account ORDER BY owner_account_id, provider')).rows
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

test('select returns the caller\'s own row, else the one shared with everyone, and nothing once sharing is withdrawn', async (t) => {
  const { accounts, seedRow, connection } = await setup(t, 'conexus_model_select')
  const sharedByB = await seedRow(B, 'anthropic', 'api_key', 'shared-by-b', 'everyone')
  const run = (accountId) => ({ builderRunId: randomUUID(), accountId })
  const own = await seedRow(A, 'anthropic', 'api_key', 'own-of-a')
  const ofA = await accounts.select(run(A), 'anthropic')
  assert.deepEqual([ofA.modelAccountId, ofA.secret, ofA.credential], [own, 'own-of-a', ANTHROPIC_KEY])
  await query(connection, 'DELETE FROM model.model_account WHERE model_account_id = $1', [own])
  const fallback = await accounts.select(run(A), 'anthropic')
  assert.deepEqual([fallback.modelAccountId, fallback.secret], [sharedByB, 'shared-by-b'])
  await query(connection, "UPDATE model.model_account SET sharing = 'just_me' WHERE model_account_id = $1", [sharedByB])
  assert.equal(await accounts.select(run(A), 'anthropic'), null)
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
  await seedRow(B, 'anthropic', 'api_key', 'shared-by-b', 'everyone')
  const held = await accounts.select({ builderRunId, accountId: A }, 'anthropic')
  assert.deepEqual([held.secret, await accounts.usable(A, 'anthropic')], ['shared-by-b', true])
  await seedRow(A, 'anthropic', 'api_key', 'own-of-a')
  assert.equal((await accounts.select({ builderRunId, accountId: A }, 'anthropic')).secret, 'own-of-a')
  assert.equal((await accounts.select({ builderRunId, accountId: C }, 'anthropic')).modelAccountId, privateOfC)
  await recordFor(builderRunId, privateOfC)
  assert.equal(await held.read(), null, 'the run recorded only C\'s row, and the handle holds B\'s id')
})

test('a first key write creates a just_me api_key row with no history, and rewriting keeps the id and the sharing and adds no history', async (t) => {
  const { accounts, rowsOf, connection } = await setup(t, 'conexus_model_write')
  await accounts.write({ accountId: A, credential: ANTHROPIC_KEY, secret: 'first-key' })
  const [first] = await rowsOf()
  assert.deepEqual({ owner: first.owner_account_id, provider: first.provider, kind: first.kind, sharing: first.sharing }, { owner: A, provider: 'anthropic', kind: 'api_key', sharing: 'just_me' })
  assert.equal(await envelope.open(first.secret), 'first-key')
  assert.deepEqual((await query(connection, 'SELECT count(*)::int AS n FROM model.model_account_sharing_history')).rows, [{ n: 0 }])
  const before = (await query(connection, 'SELECT updated_at FROM model.model_account')).rows[0].updated_at
  await query(connection, "UPDATE model.model_account SET sharing = 'everyone'")
  await query(connection, "INSERT INTO model.model_account_sharing_history(model_account_id, previous_sharing, new_sharing, changed_by_account_id) VALUES ($1, 'just_me', 'everyone', $2)", [first.model_account_id, A])
  await accounts.write({ accountId: A, credential: ANTHROPIC_OAUTH, secret: 'second-oauth' })
  const rows = await rowsOf()
  assert.equal(rows.length, 1)
  assert.deepEqual({ id: rows[0].model_account_id, kind: rows[0].kind, sharing: rows[0].sharing }, { id: first.model_account_id, kind: 'oauth', sharing: 'everyone' })
  assert.equal(await envelope.open(rows[0].secret), 'second-oauth')
  const after = (await query(connection, 'SELECT updated_at FROM model.model_account')).rows[0].updated_at
  assert.equal(after > before, true)
  assert.deepEqual((await query(connection, 'SELECT count(*)::int AS n FROM model.model_account_sharing_history')).rows, [{ n: 1 }], 'the one row seeded above is the only history row')
})

test('two concurrent writes for one owner and provider leave one row and one id, with the prior sharing and no history', async (t) => {
  const { accounts, rowsOf, connection, seedRow } = await setup(t, 'conexus_model_concurrent')
  const id = await seedRow(A, 'anthropic', 'api_key', 'prior', 'everyone')
  await Promise.all([
    accounts.write({ accountId: A, credential: ANTHROPIC_KEY, secret: 'one' }),
    accounts.write({ accountId: A, credential: ANTHROPIC_OAUTH, secret: 'two' }),
  ])
  const rows = await rowsOf()
  assert.deepEqual(rows.map((row) => [row.model_account_id, row.sharing]), [[id, 'everyone']])
  assert.equal(['one', 'two'].includes(await envelope.open(rows[0].secret)), true)
  assert.deepEqual((await query(connection, 'SELECT count(*)::int AS n FROM model.model_account_sharing_history')).rows, [{ n: 0 }])
})

test('an inactive or unknown account cannot write, and connect answers failed for both and throws for a fault', async (t) => {
  const { accounts, connection, rowsOf } = await setup(t, 'conexus_model_refused')
  await query(connection, 'UPDATE iam.account SET active = false WHERE account_id = $1', [C])
  await assert.rejects(accounts.write({ accountId: C, credential: ANTHROPIC_KEY, secret: 'k' }), { id: 'ACCOUNT_INACTIVE' })
  await assert.rejects(accounts.write({ accountId: randomUUID(), credential: ANTHROPIC_KEY, secret: 'k' }), { id: 'ACCOUNT_NOT_FOUND' })
  assert.deepEqual([
    await accounts.connect({ accountId: C, credential: ANTHROPIC_KEY, secret: 'k' }),
    await accounts.connect({ accountId: randomUUID(), credential: ANTHROPIC_KEY, secret: 'k' }),
    await accounts.connect({ accountId: A, credential: ANTHROPIC_KEY, secret: 'k' }),
  ], [{ ok: false, reason: 'ACCOUNT_INACTIVE' }, { ok: false, reason: 'ACCOUNT_NOT_FOUND' }, { ok: true }])
  assert.equal((await rowsOf()).length, 1)
  await query(connection, "ALTER TABLE model.model_account ADD CONSTRAINT refuse_everything CHECK (provider = 'none') NOT VALID")
  await assert.rejects(accounts.connect({ accountId: A, credential: CODEX, secret: 'k' }), { id: 'INTERNAL_UNEXPECTED' })
})

test('standing reports each provider with the caller\'s own kind and whether one is shared, and readDefault reads the installation default', async (t) => {
  const { accounts, seedRow, connection } = await setup(t, 'conexus_model_standing')
  await seedRow(A, 'anthropic', 'oauth', 'a-oauth')
  await seedRow(B, 'openai-codex', 'oauth', 'b-codex', 'everyone')
  await seedRow(C, 'google-ai-pro', 'google_ai_pro', 'c-google')
  assert.deepEqual(await accounts.standing(A), {
    anthropic: { own: { state: 'connected', kind: 'oauth' }, shared: false },
    'openai-codex': { own: { state: 'absent' }, shared: true },
    'google-ai-pro': { own: { state: 'absent' }, shared: false },
  })
  assert.equal(await accounts.readDefault(A, 'build'), null)
  await query(connection, "INSERT INTO model.installation_default(role, model_id, updated_by) VALUES ('build', 'anthropic/claude-sonnet-5', $1)", [ID.administrator])
  assert.deepEqual([await accounts.readDefault(C, 'build'), await accounts.readDefault(C, 'memory')], ['anthropic/claude-sonnet-5', null])
})

test('a row whose provider and kind are no lawful pair is an internal fault at the parse', async (t) => {
  const { accounts, seedRow } = await setup(t, 'conexus_model_unlawful')
  await seedRow(A, 'anthropic', 'google_ai_pro', 'not-anthropic')
  const unlawful = { name: 'ZodError', message: /anthropic cannot hold a google_ai_pro account/ }
  await assert.rejects(accounts.select({ builderRunId: randomUUID(), accountId: A }, 'anthropic'), unlawful)
  await assert.rejects(accounts.standing(A), unlawful)
})

test('a run reads the row it recorded after sharing is withdrawn, and the refresh persists with literal bytes; a later non owner selects nothing', async (t) => {
  const { accounts, seedRow, recordFor, secretOf, connection, seedBuilderProject, seedRun } = await setup(t, 'conexus_model_withdrawn')
  const shared = await seedRow(B, 'openai-codex', 'oauth', 'refresh-old', 'everyone')
  const projectId = await seedBuilderProject()
  const builderRunId = await seedRun(projectId, { accountId: A })
  const held = await accounts.select({ builderRunId, accountId: A }, 'openai-codex')
  assert.equal(held.modelAccountId, shared)
  await recordFor(builderRunId, shared)
  await query(connection, "UPDATE model.model_account SET sharing = 'just_me' WHERE model_account_id = $1", [shared])
  const reread = await held.read()
  assert.deepEqual([reread.modelAccountId, reread.secret], [shared, 'refresh-old'])
  assert.equal(await held.persist('{"access":"refreshed","refresh":"r2"}'), true)
  assert.equal(await secretOf(shared), '{"access":"refreshed","refresh":"r2"}')
  assert.equal(await accounts.select({ builderRunId: randomUUID(), accountId: A }, 'openai-codex'), null)
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

test('a run whose account lost the Project, whose lease another owner took or whose account is another reads null, and the executor still persists', async (t) => {
  const { accounts, seedRow, recordFor, secretOf, connection, seedBuilderProject, seedRun } = await setup(t, 'conexus_model_admission')
  const row = await seedRow(B, 'openai-codex', 'oauth', 'old', 'everyone')
  const projectId = await seedBuilderProject()
  const builderRunId = await seedRun(projectId, { accountId: B })
  await recordFor(builderRunId, row)
  const held = await accounts.select({ builderRunId, accountId: B }, 'openai-codex')
  assert.equal((await held.read()).secret, 'old')
  const wrongAccount = await accounts.select({ builderRunId, accountId: A }, 'openai-codex')
  assert.equal(wrongAccount.modelAccountId, row)
  assert.equal(await wrongAccount.read(), null, 'an account that is not the run\'s')
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
  await accounts.write({ accountId: A, credential: ANTHROPIC_KEY, secret: 'pasted-key' })
  assert.equal(await held.persist('refreshed-tokens'), false)
  assert.equal(await secretOf(row), 'pasted-key')
  assert.deepEqual((await rowsOf()).map((entry) => entry.kind), ['api_key'])
})

test('the wall: hub_command updates kind, secret and updated_at only, inserts four columns, deletes nothing and sees no history or default', async (t) => {
  const { connection, seedRow } = await setup(t, 'conexus_model_wall')
  const id = await seedRow(A, 'anthropic', 'api_key', 'k')
  const sealed = await sealedOf('x')
  const code = async (text, values = []) => (await sqlstate(connection, ENTRY.command(), text, values)).state
  for (const [column, value] of [['kind', "'oauth'"], ['secret', `'${sealed}'`], ['updated_at', 'clock_timestamp()']]) {
    assert.equal(await code(`UPDATE model.model_account SET ${column} = ${value} WHERE model_account_id = $1`, [id]), 'OK', column)
  }
  for (const [column, value] of [['sharing', "'everyone'"], ['owner_account_id', `'${B}'`], ['provider', "'openai-codex'"], ['model_account_id', 'gen_random_uuid()'], ['created_at', 'clock_timestamp()']]) {
    assert.equal(await code(`UPDATE model.model_account SET ${column} = ${value} WHERE model_account_id = $1`, [id]), '42501', column)
  }
  assert.equal(await code("INSERT INTO model.model_account (owner_account_id, provider, kind, secret, sharing) VALUES ($1, 'openai-codex', 'oauth', $2, 'everyone')", [A, sealed]), '42501')
  assert.equal(await code("INSERT INTO model.model_account (owner_account_id, provider, kind, secret) VALUES ($1, 'openai-codex', 'oauth', $2)", [A, sealed]), 'OK')
  assert.equal(await code("INSERT INTO model.model_account (owner_account_id, provider, kind, secret) VALUES ($1, 'openai', 'api_key', 'plain')", [A]), '23514', 'the sealed check still refuses a plain secret')
  assert.equal(await code('DELETE FROM model.model_account WHERE model_account_id = $1', [id]), '42501')
  assert.equal(await code('SELECT 1 FROM model.model_account_sharing_history'), '42501')
  assert.equal(await code('SELECT 1 FROM model.installation_default'), '42501')
  assert.equal(await code("INSERT INTO model.model_account_sharing_history (model_account_id, new_sharing, changed_by_account_id) VALUES ($1, 'everyone', $2)", [id, A]), '42501')
})

test('the reader wall: hub_reader never reads the secret, reads every other column of own and shared rows, and reads zero rows without an account', async (t) => {
  const { connection, seedRow } = await setup(t, 'conexus_model_reader')
  await seedRow(A, 'anthropic', 'api_key', 'own-of-a')
  await seedRow(B, 'google-ai-pro', 'google_ai_pro', 'shared-by-b', 'everyone')
  await seedRow(B, 'anthropic', 'api_key', 'private-of-b')
  await query(connection, "INSERT INTO model.installation_default(role, model_id, updated_by) VALUES ('build', 'anthropic/x', $1)", [ID.administrator])
  const read = (accountId) => ENTRY.read(accountId)
  for (const text of ['SELECT secret FROM model.model_account', 'SELECT * FROM model.model_account', 'SELECT model_account_id FROM model.model_account WHERE secret IS NOT NULL']) {
    assert.equal((await sqlstate(connection, read(A), text)).state, '42501', text)
  }
  const visible = await sqlstate(connection, read(A), 'SELECT provider, owner_account_id = $1 AS mine, sharing FROM model.model_account ORDER BY provider, mine DESC', [A])
  assert.deepEqual(visible.rows, [{ provider: 'anthropic', mine: true, sharing: 'just_me' }, { provider: 'google-ai-pro', mine: false, sharing: 'everyone' }], 'a non owner sees no private row')
  const columns = 'model_account_id, owner_account_id, provider, kind, sharing, created_at, updated_at'
  assert.equal((await sqlstate(connection, read(A), `SELECT ${columns} FROM model.model_account`)).state, 'OK')
  for (const text of ['SELECT model_account_id FROM model.model_account FOR SHARE', 'SELECT model_account_id FROM model.model_account FOR UPDATE', "UPDATE model.model_account SET kind = 'oauth'"]) {
    assert.equal((await sqlstate(connection, read(A), text)).state, '25006', `${text} inside read() answers 25006`)
  }
  for (const text of ['SELECT model_account_id FROM model.model_account FOR SHARE', 'SELECT model_account_id FROM model.model_account FOR UPDATE', "UPDATE model.model_account SET kind = 'oauth'", 'DELETE FROM model.model_account']) {
    assert.equal((await sqlstate(connection, ENTRY.readerWrite(A), text)).state, '42501', `${text} outside READ ONLY answers 42501`)
  }
  assert.equal((await sqlstate(connection, read(A), 'SELECT 1 FROM model.model_account_sharing_history')).state, '42501')
  assert.deepEqual((await sqlstate(connection, read(B), 'SELECT model_id FROM model.installation_default WHERE role = $1', ['build'])).rows, [{ model_id: 'anthropic/x' }], 'every account reads the default')
  assert.deepEqual((await sqlstate(connection, read(undefined), 'SELECT count(*)::int AS n FROM model.model_account')).rows, [{ n: 0 }])
  assert.deepEqual((await sqlstate(connection, read(undefined), 'SELECT count(*)::int AS n FROM model.installation_default')).rows, [{ n: 0 }])
})

test('the catalog: three forced tables, no model function, no retired role, and hub_runtime holds nothing', async (t) => {
  const { connection } = await setup(t, 'conexus_model_catalog')
  const flags = (await query(connection, "SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relnamespace = 'model'::regnamespace AND relkind = 'r' ORDER BY 1")).rows
  assert.deepEqual(flags.map((row) => [row.relname, row.relrowsecurity, row.relforcerowsecurity]), [['installation_default', true, true], ['model_account', true, true], ['model_account_sharing_history', true, true]])
  assert.deepEqual((await query(connection, "SELECT count(*)::int AS n FROM pg_proc WHERE pronamespace = 'model'::regnamespace")).rows, [{ n: 0 }])
  assert.deepEqual((await query(connection, "SELECT count(*)::int AS n FROM pg_roles WHERE rolname = 'hub_model_account'")).rows, [{ n: 0 }])
  assert.deepEqual((await query(connection, "SELECT tablename || ':' || policyname || ':' || roles::text AS policy FROM pg_policies WHERE schemaname = 'model' ORDER BY 1")).rows.map((row) => row.policy), [
    'installation_default:command:{hub_command}', 'installation_default:reader:{hub_reader}',
    'model_account:command:{hub_command}', 'model_account:reader:{hub_reader}',
    'model_account_sharing_history:command:{hub_command}',
  ])
  for (const table of ['model_account', 'installation_default', 'model_account_sharing_history']) {
    assert.equal((await sqlstate(connection, ENTRY.runtime(), `SELECT 1 FROM model.${table}`)).state, '42501', `hub_runtime on ${table}`)
  }
})
