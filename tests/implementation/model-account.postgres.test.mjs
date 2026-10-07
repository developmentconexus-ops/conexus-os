import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'
import { loginPoolOf, query } from './hub-database.mjs'
import { OWNER, setupBuilder } from './builder-fixture.mjs'
import { ID } from './project-fixture.mjs'

const { createModelAccounts } = await import(hubModuleUrl('builder/model-account/accounts.js'))
const { createRunSteps } = await import(hubModuleUrl('builder/run-lifecycle.js'))
const { createTokenHolds } = await import(hubModuleUrl('builder/oauth-holds.js'))
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

test('a local model hold rereads current Project authority and closes the run after membership is revoked', async (t) => {
  const { accounts, seedRow, recordFor, connection, database, seedBuilderProject, seedRun, runRow } = await setup(t, 'conexus_model_revoked_terminal')
  const projectId = await seedBuilderProject()
  const builderRunId = await seedRun(projectId, { accountId: A })
  const row = await seedRow(A, 'openai-codex', 'oauth', JSON.stringify({ expires: 1, refresh: 'old' }))
  await recordFor(builderRunId, row)
  const held = await accounts.select({ builderRunId, accountId: A }, 'openai-codex')
  let refreshes = 0
  const tokens = createTokenHolds({
    parse: JSON.parse,
    serialize: JSON.stringify,
    refresh: async (stored) => { refreshes++; return { ...stored, expires: 100 } },
    now: () => 10,
  }).hold(held, { expires: 1, refresh: 'old' })

  await query(connection, 'DELETE FROM iam.workspace_membership WHERE account_id = $1 AND workspace_id = $2', [A, ID.workspace])
  await assert.rejects(tokens(), { id: 'BUILDER_MODEL_NOT_SELECTED' })
  assert.equal(refreshes, 0, 'a refused reread never reaches the provider refresh')

  const runs = createRunSteps({ database, ownerId: OWNER, registry: { retain: async () => { throw new Error('unexpected registry call') } } })
  await runs.failBuilderRun({ builderRunId, failureCode: 'BUILDER_MODEL_NOT_SELECTED' })
  const ended = await runRow(builderRunId)
  assert.deepEqual({ state: ended.state, failure_code: ended.failure_code }, { state: 'FAILED', failure_code: 'BUILDER_MODEL_NOT_SELECTED' })
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


test('the pooled client remains hub_runtime while the account reader scopes the model standing', async (t) => {
  const { openRuntimeDatabase, seedRow } = await setup(t, 'conexus_model_pooled')
  const single = openRuntimeDatabase({ max: 1 })
  const pooled = createModelAccounts({ database: single, envelope, ownerId: OWNER })
  const pool = await loginPoolOf(single)
  const runtimeCanRead = async (when) => {
    assert.deepEqual((await pool.query('SELECT current_user AS who')).rows, [{ who: 'hub_runtime' }], when)
    for (const table of ['model_account', 'installation_default']) {
      assert.equal((await pool.query(`SELECT count(*)::integer AS n FROM model.${table}`)).rowCount, 1, `${when}: ${table}`)
    }
  }
  await seedRow(B, 'anthropic', 'api_key', 'shared-by-b', 'everyone')
  await pooled.write({ accountId: A, credential: ANTHROPIC_KEY, secret: 'committed' })
  await runtimeCanRead('after a commit')
  await assert.rejects(pooled.write({ accountId: randomUUID(), credential: ANTHROPIC_KEY, secret: 'k' }), { id: 'ACCOUNT_NOT_FOUND' })
  await runtimeCanRead('after a rollback')
  await assert.rejects(single.transaction(A, async (gate) => { await admitAccount(gate); throw new Error('thrown') }), { message: 'thrown' })
  await runtimeCanRead('after a throw')
  assert.equal((await pooled.standing(A)).anthropic.shared, true)
  await runtimeCanRead('after a read')
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
      accounts.write({ accountId: A, credential: ANTHROPIC_KEY, secret: `one-${round}` }),
      accounts.write({ accountId: A, credential: ANTHROPIC_OAUTH, secret: `two-${round}` }),
      accounts.connect({ accountId: A, credential: CODEX, secret: `codex-${round}` }),
      iam(),
      iam(),
    ]))
  }
  assert.deepEqual(outcomes.filter((outcome) => outcome.status === 'rejected').map((outcome) => outcome.reason?.cause?.code ?? outcome.reason?.code ?? String(outcome.reason)), [])
  assert.deepEqual((await rowsOf()).map((row) => row.provider), ['anthropic', 'openai-codex'])
})
