import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { hubModuleUrl } from './hub-build.mjs'
import { ID } from './project-fixture.mjs'
import { loginPoolOf, query } from './hub-database.mjs'
import { setupModelAccounts } from './model-account-fixture.mjs'
const { AnthropicKey, parseCredential, encodeCredential } = await import(hubModuleUrl('model-account/credential.js'))
const { modelAccountContext } = await import(hubModuleUrl('platform/secrets.js'))
const { admitAccount } = await import(hubModuleUrl('identity-access/admission.js'))
const key = (label) => ({ provider: 'anthropic', kind: 'api_key', value: AnthropicKey.parse(`sk-ant-${label.padEnd(20, 'x')}`) })
const oauth = (label) => ({ provider: 'anthropic', kind: 'oauth', value: { access: label, refresh: `refresh-${label}`, expires: 9_999_999_999_999 } })
const row = async (f, id) => (await query(f.connection, 'SELECT * FROM model.model_account WHERE model_account_id = $1', [id])).rows[0]
const credential = async (f, id) => { const stored = await row(f, id); return parseCredential(stored, await f.envelope.open(stored.secret, modelAccountContext(id))) }
async function running(t, name) {
  const f = await setupModelAccounts(t, name)
  const projectId = await f.seedBuilderProject()
  const runId = await f.seedRun(projectId)
  return { ...f, projectId, runId }
}

test('personal metadata and hold use only the admitted account, and a missing row refuses selection', async (t) => {
  const f = await running(t, 'conexus_model_personal')
  const own = await f.connect(key('own'))
  await f.connect(key('member'), ID.member)
  const held = await f.hold(f.runId, 'anthropic')
  assert.equal(held.ok, true)
  assert.deepEqual([held.result.row.modelAccountId, held.result.credential], [own.result, key('own')])
  assert.deepEqual((await f.models.list(ID.outsider)).map((entry) => entry.own), Array(3).fill({ state: 'absent' }))
  await query(f.connection, 'DELETE FROM model.model_account WHERE model_account_id = $1', [own.result])
  assert.deepEqual(await f.hold(f.runId, 'anthropic'), { ok: false, error: { code: 'BUILDER_MODEL_NOT_SELECTED' } })
})

test('connect retains row identity, changes sign-in generation, clears refusal and seals under that identity', async (t) => {
  const f = await setupModelAccounts(t, 'conexus_model_connect')
  const first = await f.connect(key('first'))
  const before = await row(f, first.result)
  await query(f.connection, 'UPDATE model.model_account SET refused_at = connected_at WHERE model_account_id = $1', [first.result])
  const second = await f.connect(oauth('second'), ID.owner, 'Synthetic renamed')
  const after = await row(f, second.result)
  assert.deepEqual([second.result, after.scope, after.owner_account_id, after.connected_by_name, after.refused_at], [first.result, 'personal', ID.owner, 'Synthetic renamed', null])
  assert.equal(after.connected_at > before.connected_at, true)
  assert.deepEqual(await credential(f, second.result), oauth('second'))
  const concurrent = await Promise.all([f.connect(key('third')), f.connect(oauth('fourth'))])
  assert.deepEqual(concurrent.map((r) => r.result), [first.result, first.result])
  assert.equal((await query(f.connection, 'SELECT count(*)::int AS count FROM model.model_account')).rows[0].count, 1)
})

test('reread needs current run authority, preserves its refusal code and needs no Builder payment join', async (t) => {
  const f = await running(t, 'conexus_model_reread')
  await f.connect(oauth('held'))
  const held = (await f.hold(f.runId, 'anthropic')).result
  const read = await f.store.reread(f.openRun(f.runId), held)
  assert.equal(read.ok, true)
  assert.deepEqual(read.result.held.credential, oauth('held'))
  await query(f.connection, 'DELETE FROM iam.workspace_membership WHERE account_id = $1 AND workspace_id = $2', [ID.owner, ID.workspace])
  assert.deepEqual(await f.store.reread(f.openRun(f.runId), held), { ok: false, error: { code: 'PROJECT_NOT_FOUND' } })
})

test('system persistence commits rotated credentials after run completion', async (t) => {
  const f = await running(t, 'conexus_model_postrun')
  const connected = await f.connect(oauth('spent'))
  const held = (await f.hold(f.runId, 'anthropic')).result
  await query(f.connection, "UPDATE builder.builder_run SET state = 'SUCCEEDED', result_kind = 'RESPONSE_ONLY', finished_at = clock_timestamp() WHERE builder_run_id = $1", [f.runId])
  const persisted = await f.persist(held, oauth('rotated'))
  assert.deepEqual([persisted.ok, persisted.result.state], [true, 'stored'])
  assert.deepEqual(await credential(f, connected.result), oauth('rotated'))
  assert.deepEqual(await f.store.reread(f.openRun(f.runId), held), { ok: false, error: { code: 'BUILDER_RUN_NOT_ADMITTED' } })
})

for (const change of ['reconnect', 'disconnect', 'newer refresh']) {
  test(`compare-and-swap refuses a stale refresh after ${change}`, async (t) => {
    const f = await running(t, 'conexus_model_cas')
    const connected = await f.connect(oauth('spent'))
    const held = (await f.hold(f.runId, 'anthropic')).result
    if (change === 'reconnect') await f.connect(oauth('reconnected'))
    if (change === 'disconnect') await query(f.connection, 'DELETE FROM model.model_account WHERE model_account_id = $1', [connected.result])
    if (change === 'newer refresh') assert.equal((await f.persist(held, oauth('winner'))).result.state, 'stored')
    assert.deepEqual(await f.persist(held, oauth('stale')), { ok: true, result: { state: 'superseded' } })
    if (change !== 'disconnect') assert.deepEqual(await credential(f, connected.result), oauth(change === 'reconnect' ? 'reconnected' : 'winner'))
  })
}

test('hold and reread return immutable custody context for transplanted bytes', async (t) => {
  const f = await running(t, 'conexus_model_custody')
  const own = await f.connect(oauth('own'))
  const other = await f.connect(oauth('other'), ID.member)
  const held = (await f.hold(f.runId, 'anthropic')).result
  const copied = (await row(f, other.result)).secret
  await query(f.connection, 'UPDATE model.model_account SET secret = $1 WHERE model_account_id = $2', [copied, own.result])
  for (const rejected of [await f.hold(f.runId, 'anthropic'), await f.store.reread(f.openRun(f.runId), held)]) {
    assert.equal(rejected.ok, false)
    assert.deepEqual([rejected.error.code, rejected.error.row.modelAccountId, rejected.error.spent], ['SECRET_CUSTODY_LOST', own.result, copied])
  }
  await query(f.connection, 'DELETE FROM model.model_account WHERE model_account_id = $1', [own.result])
  const recreated = await f.connect(oauth('new'))
  assert.notEqual(recreated.result, own.result)
  const bytes = await f.envelope.seal(encodeCredential(oauth('old')), modelAccountContext(own.result))
  await query(f.connection, 'UPDATE model.model_account SET secret = $1 WHERE model_account_id = $2', [bytes, recreated.result])
  assert.equal((await f.hold(f.runId, 'anthropic')).error.code, 'SECRET_CUSTODY_LOST')
})

test('the model table still rejects illegal provider-kind pairs and duplicate personal slots', async (t) => {
  const f = await setupModelAccounts(t, 'conexus_model_constraints')
  const existing = await f.connect(key('valid'))
  const sealed = (await row(f, existing.result)).secret
  for (const [provider, kind] of [['openai-codex', 'api_key'], ['google-ai-pro', 'oauth'], ['anthropic', 'google_ai_pro']]) {
    await assert.rejects(query(f.connection, 'INSERT INTO model.model_account(model_account_id, scope, owner_account_id, provider, kind, secret, connected_by, connected_by_name, connected_at) VALUES ($1, $2, $3, $4, $5, $6, $3, $7, clock_timestamp())', [randomUUID(), 'personal', ID.owner, provider, kind, sealed, 'Synthetic']), { code: '23514' })
  }
})


test('the pooled client stays hub_runtime after committed, refused and thrown account operations', async (t) => {
  const f = await setupModelAccounts(t, 'conexus_model_pooled')
  const single = f.openRuntimeDatabase({ max: 1 })
  const pool = await loginPoolOf(single)
  const runtimeCanRead = async () => {
    assert.deepEqual((await pool.query('SELECT current_user AS who')).rows, [{ who: 'hub_runtime' }])
    for (const table of ['model_account', 'installation_default']) assert.equal((await pool.query(`SELECT count(*)::integer FROM model.${table}`)).rowCount, 1)
  }
  const connect = (accountId) => single.transaction(accountId, async (gate) => f.store.connect({ proof: await admitAccount(gate), credential: key('pooled'), displayName: 'Synthetic' }))
  assert.equal((await connect(ID.owner)).ok, true)
  await runtimeCanRead()
  await assert.rejects(connect(randomUUID()), { id: 'ACCOUNT_NOT_FOUND' })
  await runtimeCanRead()
  await assert.rejects(single.transaction(ID.owner, async (gate) => { await admitAccount(gate); throw new Error('synthetic rollback') }), { message: 'synthetic rollback' })
  await runtimeCanRead()
  const rows = await single.read(ID.owner, async (gate) => f.store.list(await admitAccount(gate)))
  assert.deepEqual(rows.map(({ provider, kind }) => [provider, kind]), [['anthropic', 'api_key']])
  await runtimeCanRead()
})

test('concurrent credential upserts and IAM updates never deadlock with a short deadlock_timeout', async (t) => {
  const f = await setupModelAccounts(t, 'conexus_model_deadlock')
  await query(f.connection, `ALTER DATABASE "${f.connection.database}" SET deadlock_timeout = '100ms'`)
  const iam = async () => {
    await query(f.connection, "UPDATE iam.account SET display_name = 'Synthetic owner' WHERE account_id = $1", [ID.owner])
    await query(f.connection, 'UPDATE iam.workspace_membership SET role = role WHERE account_id = $1', [ID.owner])
  }
  const outcomes = []
  for (let round = 0; round < 15; round++) outcomes.push(...await Promise.allSettled([
    f.connect(key(`one-${round}`)), f.connect(oauth(`two-${round}`)),
    f.connect({ provider: 'openai-codex', kind: 'oauth', value: { access: `codex-${round}`, refresh: 'synthetic', expires: 9_999_999_999_999, accountId: 'synthetic', email: null } }), iam(), iam(),
  ]))
  assert.deepEqual(outcomes.filter(({ status }) => status === 'rejected'), [])
  assert.equal(outcomes.filter(({ value }) => value?.ok === false).length, 0)
  assert.deepEqual((await query(f.connection, 'SELECT provider FROM model.model_account ORDER BY provider')).rows.map(({ provider }) => provider), ['anthropic', 'openai-codex'])
})

test('runtime preserves the exact model credential column privileges including the admitted identity insert', async (t) => {
  const f = await setupModelAccounts(t, 'conexus_model_runtime_columns')
  const columns = async (privilege) => (await query(f.connection,
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'model' AND table_name = 'model_account'
     AND has_column_privilege('hub_runtime', 'model.model_account', column_name, $1) ORDER BY column_name`, [privilege])).rows.map(({ column_name }) => column_name)
  assert.deepEqual(await columns('INSERT'), ['connected_at', 'connected_by', 'connected_by_name', 'kind', 'model_account_id', 'owner_account_id', 'provider', 'scope', 'secret'])
  assert.deepEqual(await columns('UPDATE'), ['connected_at', 'connected_by', 'connected_by_name', 'kind', 'refused_at', 'secret', 'updated_at'])
  assert.deepEqual((await query(f.connection, `SELECT has_table_privilege('hub_runtime','model.model_account','INSERT') AS insert,
    has_table_privilege('hub_runtime','model.model_account','UPDATE') AS update,
    has_table_privilege('hub_runtime','model.model_account','DELETE') AS delete`)).rows, [{ insert: false, update: false, delete: false }])
})


test('actual admission refuses inactive and unknown writers and readers without creating a credential', async (t) => {
  const f = await setupModelAccounts(t, 'conexus_model_refused')
  await query(f.connection, 'UPDATE iam.account SET active = false WHERE account_id = $1', [ID.outsider])
  await assert.rejects(f.connect(key('inactive'), ID.outsider), { id: 'ACCOUNT_INACTIVE' })
  await assert.rejects(f.connect(key('missing'), randomUUID()), { id: 'ACCOUNT_NOT_FOUND' })
  await assert.rejects(f.models.list(ID.outsider), { id: 'ACCOUNT_INACTIVE' })
  assert.deepEqual((await query(f.connection, 'SELECT count(*)::int AS count FROM model.model_account')).rows, [{ count: 0 }])
})
