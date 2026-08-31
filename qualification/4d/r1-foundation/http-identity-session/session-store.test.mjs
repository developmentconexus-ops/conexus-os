import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createSessionStore, readSecretFile, redactDiagnostic } from './session-store.mjs'

const required = name => {
  const value = process.env[name]
  if (!value) throw new Error(`missing ${name}`)
  return value
}

let store
before(async () => {
  store = createSessionStore({
    host: required('R1F_PG_HOST'),
    port: Number(required('R1F_PG_PORT')),
    database: required('R1F_PG_DATABASE'),
    user: required('R1F_PG_USER'),
    passwordFile: required('R1F_PG_PASSWORD_FILE'),
  })
  await store.init()
})
after(async () => { await store.close() })

test('R1F-P07 one-shot exact-subject bootstrap reaches IAM-03 only', async () => {
  const issuer = 'https://issuer.example/realms/r1f'
  const subject = 'bootstrap-subject'
  await assert.rejects(
    store.bootstrap({ configuredIssuer: issuer, configuredSubject: subject, issuer, subject: 'other' }),
    /BOOTSTRAP_SUBJECT_MISMATCH/,
  )
  const bootstrap = await store.bootstrap({ configuredIssuer: issuer, configuredSubject: subject, issuer, subject })
  assert.equal(bootstrap.permittedOperation, 'IAM-03')
  const token = await store.createSession({ accountId: bootstrap.accountId })
  assert.deepEqual(await store.validateSession(token, { workspaceId: 'workspace-a', surface: 'CONTROL' }), {
    ok: false, reason: 'NO_CURRENT_GRANT',
  })
  await assert.rejects(
    store.bootstrap({ configuredIssuer: issuer, configuredSubject: subject, issuer, subject }),
    /BOOTSTRAP_ALREADY_MAPPED/,
  )
})

test('R1F-P07 stores only an opaque token digest and rotates on login', async () => {
  const accountId = await store.createAccount({ issuer: 'issuer-a', subject: 'subject-a' })
  await store.setGrant({ accountId, workspaceId: 'workspace-a', surface: 'CONTROL' })
  const first = await store.createSession({ accountId })
  assert.equal(Buffer.from(first, 'base64url').length, 32)
  const stored = await store.query('SELECT octet_length(token_digest) AS digest_length FROM iam_session WHERE account_id = $1', [accountId])
  assert.equal(stored.rows.every(row => row.digest_length === 32), true)
  const second = await store.createSession({ accountId })
  assert.notEqual(first, second)
  assert.deepEqual(await store.validateSession(first, { workspaceId: 'workspace-a', surface: 'CONTROL' }), {
    ok: false, reason: 'REVOKED_SESSION',
  })
  assert.equal((await store.validateSession(second, { workspaceId: 'workspace-a', surface: 'CONTROL' })).ok, true)
})

test('R1F-P07 current grant separates Workspace and Control/App surfaces', async () => {
  const accountId = await store.createAccount({ issuer: 'issuer-b', subject: 'subject-b' })
  await store.setGrant({ accountId, workspaceId: 'workspace-a', surface: 'CONTROL' })
  const token = await store.createSession({ accountId })
  assert.equal((await store.validateSession(token, { workspaceId: 'workspace-a', surface: 'CONTROL' })).ok, true)
  assert.deepEqual(await store.validateSession(token, { workspaceId: 'workspace-b', surface: 'CONTROL' }), {
    ok: false, reason: 'NO_CURRENT_GRANT',
  })
  assert.deepEqual(await store.validateSession(token, { workspaceId: 'workspace-a', surface: 'APP' }), {
    ok: false, reason: 'NO_CURRENT_GRANT',
  })
  await store.setGrant({ accountId, workspaceId: 'workspace-a', surface: 'APP' })
  assert.equal((await store.validateSession(token, { workspaceId: 'workspace-a', surface: 'APP' })).ok, true)
})

test('R1F-P07 idle, absolute, EndSession and Account revocation fail closed', async () => {
  const accountId = await store.createAccount({ issuer: 'issuer-c', subject: 'subject-c' })
  await store.setGrant({ accountId, workspaceId: 'workspace-a', surface: 'CONTROL' })

  const idle = await store.createSession({ accountId })
  await store.query('UPDATE iam_session SET idle_expires_at = now() - interval \'1 second\' WHERE token_digest IS NOT NULL AND account_id = $1', [accountId])
  assert.deepEqual(await store.validateSession(idle, { workspaceId: 'workspace-a', surface: 'CONTROL' }), {
    ok: false, reason: 'IDLE_EXPIRED',
  })

  const absolute = await store.createSession({ accountId })
  await store.query('UPDATE iam_session SET absolute_expires_at = now() - interval \'1 second\' WHERE revoked_at IS NULL AND account_id = $1', [accountId])
  assert.deepEqual(await store.validateSession(absolute, { workspaceId: 'workspace-a', surface: 'CONTROL' }), {
    ok: false, reason: 'ABSOLUTE_EXPIRED',
  })

  const ended = await store.createSession({ accountId })
  assert.equal(await store.endSession(ended), true)
  assert.deepEqual(await store.validateSession(ended, { workspaceId: 'workspace-a', surface: 'CONTROL' }), {
    ok: false, reason: 'REVOKED_SESSION',
  })

  const revoked = await store.createSession({ accountId })
  await store.revokeAccount(accountId)
  assert.deepEqual(await store.validateSession(revoked, { workspaceId: 'workspace-a', surface: 'CONTROL' }), {
    ok: false, reason: 'REVOKED_ACCOUNT',
  })
})

test('R1F-P07 secret-file boundary and diagnostic redaction expose no credential', () => {
  const secret = readSecretFile(required('R1F_PG_PASSWORD_FILE'))
  const diagnostic = redactDiagnostic(`password=${secret} postgresql://user:${secret}@127.0.0.1/db`, [secret])
  assert.equal(diagnostic.includes(secret), false)
  assert.match(diagnostic, /\[REDACTED\]/)
})
