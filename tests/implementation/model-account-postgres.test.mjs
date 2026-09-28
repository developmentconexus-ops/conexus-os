import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import pg from 'pg'
import { buildHubDatabase, query } from './hub-database.mjs'
import { hubModuleUrl } from './hub-build.mjs'

const { createSecretEnvelope } = await import(hubModuleUrl('platform/secrets.js'))
const { createGoogleAiProAccounts } = await import(hubModuleUrl('builder/google-ai-pro/store.js'))
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
  const accounts = createGoogleAiProAccounts({ pool, envelope })

  assert.equal(await accounts.hasShared(), false)
  assert.deepEqual(await accounts.connection(alice), { mine: false, shared: false })
  assert.equal(await accounts.read(alice), null)

  const key = encodeKey({ fileName: 'antigravity-alice.json', bytes: new TextEncoder().encode(JSON.stringify({ type: 'antigravity', refresh_token: 'refresh-1' })) })
  await accounts.write(alice, key)
  assert.equal(await accounts.read(alice), key)
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
  assert.equal(await accounts.read(alice), refreshedKey)
  assert.equal(await accounts.read(bob), null)

  // Bob reads Alice's key once it is the shared one, through the fallback in the Value sourcing
  // rule (spec 0002): the caller's own account, else the one shared with everyone.
  await query(connectionString, "UPDATE model.model_account SET sharing = 'everyone' WHERE owner_account_id = $1", [alice])
  assert.equal(await accounts.hasShared(), true)
  assert.equal(await accounts.read(bob), refreshedKey)
  assert.deepEqual(await accounts.connection(bob), { mine: false, shared: true })
})
