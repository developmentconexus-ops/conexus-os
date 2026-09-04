import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import pg from 'pg'

const { Client } = pg
const repositoryRoot = resolve(import.meta.dirname, '../..')
const hubBuild = mkdtempSync(resolve(repositoryRoot, 'apps/hub/r1-s1-postgres-build-'))
process.once('exit', () => rmSync(hubBuild, { recursive: true, force: true }))
const compiled = spawnSync(process.execPath, [
  resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'),
  '--project', resolve(repositoryRoot, 'apps/hub/tsconfig.json'),
  '--noEmit', 'false', '--outDir', hubBuild,
], { encoding: 'utf8' })
if (compiled.status !== 0) throw new Error(`S1_HUB_COMPILE_FAILED\n${compiled.stdout}\n${compiled.stderr}`)
const { createIdentityAccessStore } = await import(pathToFileURL(resolve(hubBuild, 'identity-access/store.js')).href)
const { createPostgresPool } = await import(pathToFileURL(resolve(hubBuild, 'platform/postgres.js')).href)
const required = (name) => {
  const value = process.env[name]
  if (!value) throw new Error(`MISSING_TEST_CONFIG_${name}`)
  return value
}
const connection = {
  host: required('CONEXUS_TEST_DB_HOST'), port: Number(required('CONEXUS_TEST_DB_PORT')),
  database: required('CONEXUS_TEST_DB_NAME'), user: required('CONEXUS_TEST_DB_USER'), password: required('CONEXUS_TEST_DB_PASSWORD'),
}

test('real PostgreSQL migration enforces owner isolation and restart-safe IAM-03/session truth', async (t) => {
  const admin = new Client(connection)
  await admin.connect()
  t.after(() => admin.end())
  await admin.query(readFileSync(resolve(repositoryRoot, 'apps/hub/migrations/001_iam_foundation.sql'), 'utf8'))
  await admin.query(`ALTER ROLE hub_iam_runtime PASSWORD 'runtime-test-only'`)

  const role = await admin.query(`
    SELECT rolname, rolsuper, rolinherit, rolbypassrls FROM pg_roles
    WHERE rolname IN ('iam_owner', 'hub_iam_runtime') ORDER BY rolname
  `)
  assert.deepEqual(role.rows, [
    { rolname: 'hub_iam_runtime', rolsuper: false, rolinherit: false, rolbypassrls: false },
    { rolname: 'iam_owner', rolsuper: false, rolinherit: false, rolbypassrls: false },
  ])
  const ownership = await admin.query(`SELECT tableowner, count(*)::integer AS count FROM pg_tables WHERE schemaname = 'iam' GROUP BY tableowner`)
  assert.deepEqual(ownership.rows, [{ tableowner: 'iam_owner', count: 6 }])

  const runtimeConnection = { ...connection, user: 'hub_iam_runtime', password: 'runtime-test-only' }
  let store = createIdentityAccessStore({ pool: createPostgresPool(runtimeConnection) })
  const bootstrapToken = await store.createBootstrapContext({ issuer: 'https://issuer.test', subject: 'subject-1', configuredIssuer: 'https://issuer.test', configuredSubject: 'subject-1' })
  const first = await store.provisionBootstrap({ bootstrapToken, idempotencyKey: 'same-key', displayName: 'Leandro', email: 'leandro@example.test' })
  const replay = await store.provisionBootstrap({ bootstrapToken, idempotencyKey: 'same-key', displayName: 'Leandro', email: 'leandro@example.test' })
  assert.equal(first.accountId, replay.accountId)
  assert.equal(replay.replayed, true)
  await assert.rejects(
    store.provisionBootstrap({ bootstrapToken, idempotencyKey: 'same-key', displayName: 'Changed' }),
    (error) => error.code === 'IDEMPOTENCY_CONFLICT',
  )
  await assert.rejects(
    store.createBootstrapContext({ issuer: 'https://issuer.test', subject: 'subject-1', configuredIssuer: 'https://issuer.test', configuredSubject: 'subject-1' }),
    (error) => error.code === 'BOOTSTRAP_SEALED',
  )
  const expiredToken = await store.createBootstrapContext({
    issuer: 'https://issuer.test', subject: 'subject-expired', configuredIssuer: 'https://issuer.test', configuredSubject: 'subject-expired', now: new Date(0),
  })
  const replacementToken = await store.createBootstrapContext({
    issuer: 'https://issuer.test', subject: 'subject-expired', configuredIssuer: 'https://issuer.test', configuredSubject: 'subject-expired', now: new Date(11 * 60 * 1000),
  })
  assert.notEqual(expiredToken, replacementToken)
  await assert.rejects(
    store.provisionBootstrap({ bootstrapToken: expiredToken, idempotencyKey: 'expired-key', displayName: 'Expired', now: new Date(12 * 60 * 1000) }),
    (error) => error.code === 'BOOTSTRAP_SEALED',
  )
  const replacement = await store.provisionBootstrap({ bootstrapToken: replacementToken, idempotencyKey: 'replacement-key', displayName: 'Replacement', now: new Date(12 * 60 * 1000) })
  assert.ok(replacement.accountId)
  const established = await store.createSession({ accountId: first.accountId })
  assert.ok(await store.validateSession({ sessionToken: established.sessionToken }))
  assert.equal(await store.validateSession({ sessionToken: established.sessionToken, csrfToken: 'wrong', requireCsrf: true }), null)
  assert.ok(await store.validateSession({ sessionToken: established.sessionToken, csrfToken: established.csrfToken, requireCsrf: true }))
  await store.close()

  store = createIdentityAccessStore({ pool: createPostgresPool(runtimeConnection) })
  t.after(() => store.close())
  assert.ok(await store.validateSession({ sessionToken: established.sessionToken }))
  assert.equal(await store.endSession(established.sessionToken), true)
  assert.equal(await store.validateSession({ sessionToken: established.sessionToken }), null)

  const denied = new Client(runtimeConnection)
  await denied.connect()
  await assert.rejects(denied.query('CREATE TABLE public.forbidden(value text)'), /permission denied/)
  await assert.rejects(denied.query('SET ROLE iam_owner'), /permission denied/)
  await denied.end()
})
