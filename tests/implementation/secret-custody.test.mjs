import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'

const { createSecretEnvelope, modelAccountContext, connectionContext, sessionContext, handoffContext } = await import(hubModuleUrl('platform/secrets.js'))
const envelope = createSecretEnvelope('ab'.repeat(32))
const id = '10000000-0000-4000-8000-000000000001'
const nextId = '10000000-0000-4000-8000-000000000002'
const cases = [
  ['model-account', modelAccountContext(id), modelAccountContext(nextId)],
  ['connection', connectionContext(id), connectionContext(nextId)],
  ['hub-session', sessionContext(Buffer.alloc(32, 1)), sessionContext(Buffer.alloc(32, 2))],
  ['handoff', handoffContext(Buffer.alloc(32, 1)), handoffContext(Buffer.alloc(32, 2))],
]
for (const [owner, context, recreated] of cases) test(`${owner}: immutable row opens its own ciphertext, wrong row and delete/recreate refuse`, async () => {
  const sealed = await envelope.seal('synthetic-secret', context)
  assert.match(sealed, /^conexus:secret:v1:/)
  assert.equal(await envelope.open(sealed, context), 'synthetic-secret')
  await assert.rejects(envelope.open(sealed, recreated), { id: 'SECRET_CUSTODY_LOST' })
  for (const [other, otherContext] of cases) if (other !== owner) await assert.rejects(envelope.open(sealed, otherContext), { id: 'SECRET_CUSTODY_LOST' })
})

test('handoff reseals into a session and cannot be transplanted', async () => {
  const from = handoffContext(Buffer.alloc(32, 4))
  const to = sessionContext(Buffer.alloc(32, 5))
  const before = await envelope.seal('synthetic-refresh', from)
  const after = await envelope.reseal(before, from, to)
  assert.notEqual(after, before)
  assert.equal(await envelope.open(after, to), 'synthetic-refresh')
  await assert.rejects(envelope.open(before, to), { id: 'SECRET_CUSTODY_LOST' })
  await assert.rejects(envelope.open(after, from), { id: 'SECRET_CUSTODY_LOST' })
})

test('retired key opens with its configured key and fingerprints keep rotation semantics', async () => {
  const retired = JSON.parse(readFileSync(new URL('../fixtures/secret-custody-retired.json', import.meta.url), 'utf8'))
  const rotating = createSecretEnvelope('cd'.repeat(32), ['ab'.repeat(32)])
  const context = modelAccountContext(retired.modelAccountId)
  assert.equal(await rotating.open(retired.sealed, context), 'synthetic-retired')
  await assert.rejects(createSecretEnvelope('cd'.repeat(32)).open(retired.sealed, context), { id: 'CONFIG_INVALID' })
  assert.deepEqual(rotating.fingerprints('synthetic-value').slice(1), envelope.fingerprints('synthetic-value'))
  assert.notEqual(rotating.fingerprints('synthetic-value')[0], envelope.fingerprints('synthetic-value')[0])
  assert.throws(() => createSecretEnvelope(''), { id: 'CONFIG_INVALID' })
  assert.throws(() => createSecretEnvelope('ab'.repeat(32), ['ab'.repeat(32)]), { id: 'CONFIG_INVALID' })
})

test('unsealed, retired Factory envelopes and malformed or tampered known-key bytes refuse custody', async () => {
  const context = modelAccountContext(id)
  for (const value of ['plain', 'mastra:factory-secret:v1:historical', 'conexus:secret:v1:invalid']) await assert.rejects(envelope.open(value, context), { id: 'SECRET_CUSTODY_LOST' })
  const sealed = await envelope.seal('synthetic', context)
  const record = JSON.parse(Buffer.from(sealed.slice('conexus:secret:v1:'.length), 'base64url').toString('utf8'))
  record.tag = Buffer.alloc(16).toString('base64url')
  await assert.rejects(envelope.open(`conexus:secret:v1:${Buffer.from(JSON.stringify(record)).toString('base64url')}`, context), { id: 'SECRET_CUSTODY_LOST' })
})

test('production sealed brands reject every cross-owner open/reseal, context-free APIs and raw strings', () => {
  const root = resolve(import.meta.dirname, '../..')
  const result = spawnSync(process.execPath, [resolve(root, 'node_modules/typescript/bin/tsc'), '--noEmit', '--strict', '--skipLibCheck', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', fileURLToPath(import.meta.resolve('./secret-custody-types.test-d.ts'))], { cwd: root, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stdout + result.stderr)
})
