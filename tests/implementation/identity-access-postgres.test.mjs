import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import pg from 'pg'
import { runHubMigrations } from '../../scripts/run-hub-migrations.mjs'
import { hubModuleUrl } from './hub-build.mjs'
import { refuseProtectedCluster } from './protected-cluster.mjs'

const { Client } = pg
const { createIdentityAccessStore } = await import(hubModuleUrl('identity-access/store.js'))
const { createPostgresPool } = await import(hubModuleUrl('platform/postgres.js'))
const required = (name) => {
  const value = process.env[name]
  if (!value) throw new Error(`MISSING_TEST_CONFIG_${name}`)
  return value
}
const connection = {
  host: required('CONEXUS_TEST_DB_HOST'), port: Number(required('CONEXUS_TEST_DB_PORT')),
  database: required('CONEXUS_TEST_DB_NAME'), user: required('CONEXUS_TEST_DB_USER'), password: required('CONEXUS_TEST_DB_PASSWORD'),
}

// This suite used to apply migration 001 straight into the configured database, so it passed
// once per fresh cluster and failed with BOOTSTRAP_SEALED on every later run. It now installs
// through the runner into its own database. Role attributes and table ownership were asserted
// here too; the catalog snapshot and the role invariants in the runner prove those now.
test('real PostgreSQL migration enforces owner isolation and restart-safe IAM-03/session truth', async (t) => {
  await refuseProtectedCluster()
  const database = `conexus_s1_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 10)}`
  const admin = new Client(connection)
  await admin.connect()
  await admin.query(`CREATE DATABASE "${database}"`)
  let store
  // One hook, in this order, because FORCE terminates any pool still connected and the pool then
  // reports that termination as an unhandled error.
  t.after(async () => {
    await store?.close().catch(() => {})
    await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`)
    await admin.query('ALTER ROLE hub_iam_runtime PASSWORD NULL')
    await admin.end()
  })
  const installed = { ...connection, database }
  const url = new URL('postgresql://localhost')
  url.hostname = installed.host
  url.port = String(installed.port)
  url.pathname = `/${database}`
  url.username = installed.user
  url.password = installed.password
  await runHubMigrations({ connectionString: url.toString() })
  await admin.query(`ALTER ROLE hub_iam_runtime PASSWORD 'runtime-test-only'`)

  const runtimeConnection = { ...installed, user: 'hub_iam_runtime', password: 'runtime-test-only' }
  store = createIdentityAccessStore({ pool: createPostgresPool(runtimeConnection) })
  // A provisioning token rotates while it is unclaimed, and the expired one stays dead.
  // This runs first because the first-account path closes once any account exists.
  const expiredToken = await store.createProvisioningContext({
    issuer: 'https://issuer.test', subject: 'subject-expired', verifiedEmail: null, configuredIssuer: 'https://issuer.test', configuredSubject: 'subject-expired', now: new Date(0),
  })
  const replacementToken = await store.createProvisioningContext({
    issuer: 'https://issuer.test', subject: 'subject-expired', verifiedEmail: null, configuredIssuer: 'https://issuer.test', configuredSubject: 'subject-expired', now: new Date(11 * 60 * 1000),
  })
  assert.notEqual(expiredToken, replacementToken)
  await assert.rejects(
    store.provisionBootstrap({ bootstrapToken: expiredToken, configuredIssuer: 'https://issuer.test', configuredSubject: 'subject-expired', idempotencyKey: 'expired-key', displayName: 'Expired', now: new Date(12 * 60 * 1000) }),
    (error) => error.code === 'BOOTSTRAP_SEALED',
  )
  const replacement = await store.provisionBootstrap({ bootstrapToken: replacementToken, configuredIssuer: 'https://issuer.test', configuredSubject: 'subject-expired', idempotencyKey: 'replacement-key', displayName: 'Replacement', now: new Date(12 * 60 * 1000) })
  assert.ok(replacement.accountId)

  // The first account is minted, so no further unknown identity is admitted without an invitation.
  const installedAdmin = new Client(installed)
  await installedAdmin.connect()
  const administrators = async () => (await installedAdmin.query('SELECT account_id, granted_via FROM iam.installation_administrator')).rows
  assert.deepEqual(await administrators(), [{ account_id: replacement.accountId, granted_via: 'OPERATOR_BOOTSTRAP' }])
  await installedAdmin.query('DELETE FROM iam.installation_administrator')
  await installedAdmin.query('DELETE FROM iam.session')
  await installedAdmin.query('DELETE FROM iam.account')
  await installedAdmin.end()
  const bootstrapToken = await store.createProvisioningContext({ issuer: 'https://issuer.test', subject: 'subject-1', verifiedEmail: null, configuredIssuer: 'https://issuer.test', configuredSubject: 'subject-1' })
  const first = await store.provisionBootstrap({ bootstrapToken, configuredIssuer: 'https://issuer.test', configuredSubject: 'subject-1', idempotencyKey: 'same-key', displayName: 'Leandro', email: 'leandro@example.test' })
  const replay = await store.provisionBootstrap({ bootstrapToken, configuredIssuer: 'https://issuer.test', configuredSubject: 'subject-1', idempotencyKey: 'same-key', displayName: 'Leandro', email: 'leandro@example.test' })
  assert.equal(first.accountId, replay.accountId)
  assert.equal(replay.replayed, true)
  const verifyAdmin = new Client(installed)
  await verifyAdmin.connect()
  assert.deepEqual((await verifyAdmin.query('SELECT account_id FROM iam.installation_administrator')).rows, [{ account_id: first.accountId }])
  const later = randomUUID()
  await verifyAdmin.query("INSERT INTO iam.account(account_id, issuer, external_subject, display_name) VALUES ($1, 'https://issuer.test', $2, 'Later')", [later, `later-${later}`])
  const runtimeClient = new Client(runtimeConnection)
  await runtimeClient.connect()
  const secondGrant = await runtimeClient.query('SELECT iam.grant_first_installation_administrator($1) AS granted', [later])
  await runtimeClient.end()
  assert.equal(secondGrant.rows[0].granted, false)
  assert.deepEqual((await verifyAdmin.query('SELECT account_id FROM iam.installation_administrator')).rows, [{ account_id: first.accountId }])
  await verifyAdmin.query('DELETE FROM iam.account WHERE account_id = $1', [later])
  await verifyAdmin.end()
  await assert.rejects(
    store.provisionBootstrap({ bootstrapToken, configuredIssuer: 'https://issuer.test', configuredSubject: 'subject-1', idempotencyKey: 'same-key', displayName: 'Changed' }),
    (error) => error.code === 'IDEMPOTENCY_CONFLICT',
  )
  await assert.rejects(
    store.createProvisioningContext({ issuer: 'https://issuer.test', subject: 'subject-1', verifiedEmail: null, configuredIssuer: 'https://issuer.test', configuredSubject: 'subject-1' }),
    (error) => error.code === 'BOOTSTRAP_SEALED',
  )
  await assert.rejects(
    store.createProvisioningContext({ issuer: 'https://issuer.test', subject: 'uninvited', verifiedEmail: 'uninvited@example.test', configuredIssuer: 'https://issuer.test', configuredSubject: 'subject-1' }),
    (error) => error.code === 'IDENTITY_NOT_ELIGIBLE',
  )
  const established = await store.createSession({ accountId: first.accountId })
  assert.ok(await store.validateSession({ sessionToken: established.sessionToken }))
  assert.equal(await store.validateSession({ sessionToken: established.sessionToken, csrfToken: 'wrong', requireCsrf: true }), null)
  assert.ok(await store.validateSession({ sessionToken: established.sessionToken, csrfToken: established.csrfToken, requireCsrf: true }))
  await store.close()

  store = createIdentityAccessStore({ pool: createPostgresPool(runtimeConnection) })
  assert.ok(await store.validateSession({ sessionToken: established.sessionToken }))
  assert.equal(await store.endSession(established.sessionToken), true)
  assert.equal(await store.validateSession({ sessionToken: established.sessionToken }), null)

  const denied = new Client(runtimeConnection)
  await denied.connect()
  await assert.rejects(denied.query('CREATE TABLE public.forbidden(value text)'), /permission denied/)
  await assert.rejects(denied.query('SET ROLE iam_owner'), /permission denied/)
  await denied.end()
})
