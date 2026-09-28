import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import pg from 'pg'
import { buildHubDatabase, query } from './hub-database.mjs'
import { hubModuleUrl } from './hub-build.mjs'

const { createSecretEnvelope } = await import(hubModuleUrl('platform/secrets.js'))
const { createGoogleAiProAccounts } = await import(hubModuleUrl('builder/google-ai-pro/store.js'))
const { createModelAccountStore } = await import(hubModuleUrl('builder/model-account-store.js'))
const { encodeKey } = await import(hubModuleUrl('builder/google-ai-pro/credential.js'))

// SET ROLE from the superuser test connection exercises the app-facing functions through
// hub_model_account's actual grants, without writing a cluster-global password.
const callAs = async (connectionString, role, sql, parameters = []) => {
  const client = new pg.Client({ connectionString })
  await client.connect()
  try {
    await client.query(`SET ROLE ${role}`)
    return (await client.query(sql, parameters)).rows
  } finally {
    await client.end()
  }
}
const refusalAs = async (connectionString, role, sql, parameters = []) => {
  try {
    await callAs(connectionString, role, sql, parameters)
    return null
  } catch (error) {
    return { message: error.message, code: error.code, constraint: error.constraint }
  }
}

const account = async (connectionString, label) => {
  const accountId = randomUUID()
  await query(connectionString, 'INSERT INTO iam.account(account_id, issuer, external_subject, display_name, email, active) VALUES ($1,$2,$3,$4,$5,$6)',
    [accountId, 'https://model-account.test', accountId, label, `${label}@model-account.test`, true])
  return accountId
}

const sealedOf = (label) => `mastra:factory-secret:v1:${Buffer.from(label).toString('base64url')}`

// The constraints are proven with direct inserts against the table (as the test's admin
// connection, which owns the database), not through the app-facing functions: a constraint is a
// property of the table, and the upsert function's own ON CONFLICT convenience is proven
// separately below.
test('one account per person per provider, and at most one shared account per provider', async (t) => {
  const { connectionString } = await buildHubDatabase(t, 'conexus_model_account')
  const alice = await account(connectionString, 'alice')
  const bob = await account(connectionString, 'bob')

  await query(connectionString,
    "INSERT INTO model.model_account(owner_account_id, provider, kind, secret, sharing) VALUES ($1,'google-ai-pro','google_ai_pro',$2,'everyone')",
    [alice, sealedOf('alice-1')])

  // A second row for the same person and the same provider is refused.
  await assert.rejects(
    query(connectionString, "INSERT INTO model.model_account(owner_account_id, provider, kind, secret) VALUES ($1,'google-ai-pro','google_ai_pro',$2)", [alice, sealedOf('alice-2')]),
    (error) => { assert.equal(error.code, '23505'); assert.equal(error.constraint, 'model_account_owner_provider_key'); return true },
  )

  // A second shared row for the same provider, from a different person, is refused.
  await assert.rejects(
    query(connectionString, "INSERT INTO model.model_account(owner_account_id, provider, kind, secret, sharing) VALUES ($1,'google-ai-pro','google_ai_pro',$2,'everyone')", [bob, sealedOf('bob-1')]),
    (error) => { assert.equal(error.code, '23505'); assert.equal(error.constraint, 'model_account_shared_provider_key'); return true },
  )

  // A second person's own, unshared account for the same provider is unaffected.
  const bobRow = await query(connectionString,
    "INSERT INTO model.model_account(owner_account_id, provider, kind, secret) VALUES ($1,'google-ai-pro','google_ai_pro',$2) RETURNING model_account_id", [bob, sealedOf('bob-2')])
  assert.equal(bobRow.rows.length, 1)

  // A secret that is not a Conexus envelope is refused: the same prefix the copied envelope seals
  // under (spec 0002, Security model).
  await assert.rejects(
    query(connectionString, "INSERT INTO model.model_account(owner_account_id, provider, kind, secret) VALUES ($1,'openai','api_key','plain-not-sealed')", [alice]),
    (error) => { assert.equal(error.code, '23514'); assert.equal(error.constraint, 'model_account_secret_sealed_check'); return true },
  )

  // No Hub role reaches the table directly, only the granted functions: the invariant every
  // schema in this catalog holds (docs/reference/hub-database-roles.md).
  const direct = await refusalAs(connectionString, 'hub_model_account', 'SELECT 1 FROM model.model_account LIMIT 1')
  assert.equal(direct.code, '42501')
})

test('the app-facing functions: upsert keeps the row\'s sharing on a write-back, reads return the sealed secret', async (t) => {
  const { connectionString } = await buildHubDatabase(t, 'conexus_model_account_fn')
  const alice = await account(connectionString, 'alice')
  const bob = await account(connectionString, 'bob')

  const upsert = (owner, provider, kind, secret, sharing) =>
    callAs(connectionString, 'hub_model_account', 'SELECT model.upsert_model_account($1,$2,$3,$4,$5) AS id', [owner, provider, kind, secret, sharing ?? null])
  const readOwn = (owner, provider) => callAs(connectionString, 'hub_model_account', 'SELECT secret, kind, sharing FROM model.read_model_account($1,$2)', [owner, provider])
  const readShared = (provider) => callAs(connectionString, 'hub_model_account', 'SELECT secret, kind FROM model.read_shared_model_account($1)', [provider])

  await upsert(alice, 'google-ai-pro', 'google_ai_pro', sealedOf('alice-1'), 'everyone')
  assert.deepEqual(await readOwn(alice, 'google-ai-pro'), [{ secret: sealedOf('alice-1'), kind: 'google_ai_pro', sharing: 'everyone' }])
  assert.deepEqual(await readShared('google-ai-pro'), [{ secret: sealedOf('alice-1'), kind: 'google_ai_pro' }])
  assert.deepEqual(await readOwn(bob, 'google-ai-pro'), [])

  // A write-back that names no sharing level (a token refresh) keeps the row shared.
  await upsert(alice, 'google-ai-pro', 'google_ai_pro', sealedOf('alice-refreshed'))
  assert.deepEqual(await readOwn(alice, 'google-ai-pro'), [{ secret: sealedOf('alice-refreshed'), kind: 'google_ai_pro', sharing: 'everyone' }])

  // A second person's shared account for the same provider is refused by the same constraint.
  const conflict = await refusalAs(connectionString, 'hub_model_account',
    'SELECT model.upsert_model_account($1,$2,$3,$4,$5)', [bob, 'google-ai-pro', 'google_ai_pro', sealedOf('bob-1'), 'everyone'])
  assert.equal(conflict.code, '23505')

  await assert.rejects(upsert(alice, 'google-ai-pro', 'google_ai_pro', sealedOf('x'), 'bogus'), /MODEL_ACCOUNT_SHARING_REFUSED/)
})

test('Google AI Pro credential read and write through model.model_account, sealed with the Conexus envelope', async (t) => {
  const { connectionString, onCleanup } = await buildHubDatabase(t, 'conexus_model_account_gap')
  const alice = await account(connectionString, 'alice')
  const bob = await account(connectionString, 'bob')

  // A single client, not a Pool: SET ROLE only holds for the connection it ran on, and a Pool may
  // hand a later query a different (or the same, unpredictably) pooled connection.
  const pool = new pg.Client({ connectionString })
  await pool.connect()
  await pool.query('SET ROLE hub_model_account')
  onCleanup(() => pool.end())

  const envelope = createSecretEnvelope('ab'.repeat(32))
  const accounts = createGoogleAiProAccounts(createModelAccountStore({ pool, envelope }))

  assert.equal(await accounts.hasShared(), false)
  assert.deepEqual(await accounts.connection(alice), { mine: false, shared: false })
  assert.equal(await accounts.read(alice), null)

  const key = encodeKey({ fileName: 'antigravity-alice.json', bytes: new TextEncoder().encode(JSON.stringify({ type: 'antigravity', refresh_token: 'refresh-1' })) })
  await accounts.write(alice, key)
  const aliceRow = (await query(connectionString, 'SELECT model_account_id FROM model.model_account WHERE owner_account_id = $1', [alice])).rows[0].model_account_id
  assert.deepEqual(await accounts.read(alice), { modelAccountId: aliceRow, key })
  assert.deepEqual(await accounts.connection(alice), { mine: true, shared: false })
  assert.equal(await accounts.hasShared(), false, 'a personal account is not the shared one')

  // The stored row is sealed: raw bytes of the key never sit in the table. Read as the admin
  // connection, since hub_model_account has no direct table grant (proven above).
  const raw = await query(connectionString, 'SELECT secret FROM model.model_account WHERE owner_account_id = $1', [alice])
  assert.equal(raw.rows[0].secret.startsWith('mastra:factory-secret:v1:'), true)
  assert.doesNotMatch(raw.rows[0].secret, /refresh-1/)

  // A refreshed write-back keeps reading the newest bytes, and Bob still has nothing of his own.
  const refreshedKey = encodeKey({ fileName: 'antigravity-alice.json', bytes: new TextEncoder().encode(JSON.stringify({ type: 'antigravity', refresh_token: 'refresh-2' })) })
  await accounts.write(alice, refreshedKey)
  assert.deepEqual(await accounts.read(alice), { modelAccountId: aliceRow, key: refreshedKey })
  assert.equal(await accounts.read(bob), null)

  // Bob reads Alice's key once it is the shared one, through the fallback in the Value sourcing
  // rule (spec 0002): the caller's own account, else the one shared with everyone.
  await query(connectionString, "UPDATE model.model_account SET sharing = 'everyone' WHERE owner_account_id = $1", [alice])
  assert.equal(await accounts.hasShared(), true)
  assert.deepEqual(await accounts.read(bob), { modelAccountId: aliceRow, key: refreshedKey }, 'the run records the shared row as the account that paid')
  assert.deepEqual(await accounts.connection(bob), { mine: false, shared: true })
})

test("the installation's default model for a role reads as NULL until it is set, and hub_model_account reads it only through the function", async (t) => {
  const { connectionString } = await buildHubDatabase(t, 'conexus_model_installation_default')
  const admin = await account(connectionString, 'admin')
  const read = async (role) => (await callAs(connectionString, 'hub_model_account', 'SELECT model.read_installation_default($1) AS model_id', [role]))[0].model_id
  assert.deepEqual([await read('plan'), await read('build')], [null, null])
  await query(connectionString, 'INSERT INTO model.installation_default(role, model_id, updated_by) VALUES ($1,$2,$3)', ['build', 'google-ai-pro/gemini-3-flash', admin])
  assert.deepEqual([await read('plan'), await read('build')], [null, 'google-ai-pro/gemini-3-flash'])
  assert.equal((await refusalAs(connectionString, 'hub_model_account', 'SELECT model_id FROM model.installation_default'))?.code, '42501')
})

test('a ChatGPT subscription row: own before shared, sealed, and a refresh rewrites the held row by id even when someone else owns it', async (t) => {
  const { connectionString, onCleanup } = await buildHubDatabase(t, 'conexus_model_account_by_id')
  const alice = await account(connectionString, 'alice')
  const bob = await account(connectionString, 'bob')
  const pool = new pg.Client({ connectionString })
  await pool.connect()
  await pool.query('SET ROLE hub_model_account')
  onCleanup(() => pool.end())
  const store = createModelAccountStore({ pool, envelope: createSecretEnvelope('cd'.repeat(32)) })
  const rowOf = async (owner) => (await query(connectionString, "SELECT model_account_id, secret, sharing FROM model.model_account WHERE owner_account_id = $1 AND provider = 'openai-codex'", [owner])).rows[0]

  assert.equal(await store.usable(bob, 'openai-codex'), null)
  await store.write(alice, 'openai-codex', 'oauth', '{"access":"alice-access-1"}')
  const aliceRow = await rowOf(alice)
  assert.equal(aliceRow.sharing, 'just_me', 'a new sign-in is shared with nobody')
  assert.equal(aliceRow.secret.startsWith('mastra:factory-secret:v1:'), true)
  assert.doesNotMatch(aliceRow.secret, /alice-access-1/)
  assert.deepEqual(await store.usable(alice, 'openai-codex'), { modelAccountId: aliceRow.model_account_id, kind: 'oauth', secret: '{"access":"alice-access-1"}' })
  assert.equal(await store.usable(bob, 'openai-codex'), null, "a just_me row is not another person's")
  assert.equal(await store.usable(alice, 'google-ai-pro'), null, 'one provider never answers for another')

  await query(connectionString, "UPDATE model.model_account SET sharing = 'everyone' WHERE model_account_id = $1", [aliceRow.model_account_id])
  assert.deepEqual(await store.usable(bob, 'openai-codex'), { modelAccountId: aliceRow.model_account_id, kind: 'oauth', secret: '{"access":"alice-access-1"}' }, 'the shared row when the caller has none')
  assert.deepEqual(await store.connection(bob, 'openai-codex'), { mine: false, shared: true })

  // Bob's run holds Alice's shared row; its refresh goes back to that row, not to a new one of Bob's.
  assert.equal(await store.rewrite(aliceRow.model_account_id, '{"access":"alice-access-2"}'), true)
  assert.deepEqual(await store.readById(aliceRow.model_account_id), { modelAccountId: aliceRow.model_account_id, kind: 'oauth', secret: '{"access":"alice-access-2"}' })
  assert.equal(await rowOf(bob), undefined)
  assert.equal((await rowOf(alice)).sharing, 'everyone', 'a rewrite keeps the sharing level')

  await store.write(bob, 'openai-codex', 'oauth', '{"access":"bob-access-1"}')
  assert.deepEqual(await store.usable(bob, 'openai-codex'), { modelAccountId: (await rowOf(bob)).model_account_id, kind: 'oauth', secret: '{"access":"bob-access-1"}' }, 'the own row wins over the shared one')

  const gone = '00000000-0000-4000-8000-000000000000'
  assert.deepEqual([await store.readById(gone), await store.rewrite(gone, 'x')], [null, false])
})
