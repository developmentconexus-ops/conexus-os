import assert from 'node:assert/strict'
import test from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'
const { workerAnswerSchema, prepareAnswerSchema, invokeAnswerSchema } = await import(hubModuleUrl('app-runner/wire.js'))
const { planMigrations } = await import(hubModuleUrl('app-runner/data-plane.js'))

test('worker success carries result, including a JSON null', () => {
  assert.deepEqual(workerAnswerSchema.parse({ ok: true, result: { count: 1 } }), { ok: true, result: { count: 1 } })
  assert.deepEqual(workerAnswerSchema.parse({ ok: true, result: null }), { ok: true, result: null })
})

test('a worker or invoke success without its result is rejected', () => {
  assert.equal(workerAnswerSchema.safeParse({ ok: true }).success, false)
  assert.equal(invokeAnswerSchema.safeParse({ ok: true }).success, false)
})

test('worker failure rejects free codes, arbitrary details and unrelated extensions', () => {
  for (const answer of [
    { ok: false, error: { code: 'SYNTHETIC_UNKNOWN' } },
    { ok: false, error: { code: 'HANDLER_FAILED', sqlstate: null, detail: 'PRIVATE_MARKER' } },
    { ok: false, error: { code: 'HANDLER_FAILED', sqlstate: null }, cause: 'PRIVATE_CAUSE' },
  ]) assert.equal(workerAnswerSchema.safeParse(answer).success, false)
  assert.deepEqual(workerAnswerSchema.parse({ ok: false, error: { code: 'HANDLER_FAILED', sqlstate: '23505' } }), { ok: false, error: { code: 'HANDLER_FAILED', sqlstate: '23505' } })
})

test('prepare uses strict Results and only carries migration identity and SQLSTATE', () => {
  for (const answer of [
    { ok: true, result: { reset: false, applied: ['001_a.sql'] } },
    { ok: false, error: { code: 'APPLICATION_MIGRATION_FAILED', migration: '002_b.sql', sqlstate: '23505' } },
    { ok: false, error: { code: 'APPLICATION_MIGRATION_FAILED', migration: '002_control.sql', sqlstate: null } },
    { ok: false, error: { code: 'APPLICATION_MIGRATION_HISTORY_DIVERGED', migration: '001_a.sql' } },
  ]) assert.deepEqual(prepareAnswerSchema.parse(answer), answer)
  assert.equal(prepareAnswerSchema.safeParse({ ok: false, error: { code: 'APPLICATION_MIGRATION_FAILED', migration: null, sqlstate: null, detail: 'private' } }).success, false)
  assert.equal(prepareAnswerSchema.safeParse({ ok: true, result: { reset: false, applied: ['bad'] } }).success, false)
})

test('invoke schema accepts only code-specific private facts', () => {
  assert.deepEqual(invokeAnswerSchema.parse({ ok: false, error: { code: 'HANDLER_OUTPUT_REFUSED', violation: { pointer: '/items/0/name', rule: 'expected string' } } }), { ok: false, error: { code: 'HANDLER_OUTPUT_REFUSED', violation: { pointer: '/items/0/name', rule: 'expected string' } } })
  for (const answer of [
    { ok: false, error: { code: 'OPERATION_NOT_FOUND', export: 'hidden' } },
    { ok: false, error: { code: 'HANDLER_FAILED', sqlstate: '23505', detail: 'private' } },
    { ok: false, error: { code: 'INPUT_REFUSED', violation: { pointer: '/', rule: 'bad', value: 'private' } } },
  ]) assert.equal(invokeAnswerSchema.safeParse(answer).success, false)
})

test('migration planning adds only a suffix and detects edited, removed or reordered history', () => {
  const first = { name: '001_a.sql', sha256: 'a'.repeat(64), sql: 'SELECT 1' }
  const second = { name: '002_b.sql', sha256: 'b'.repeat(64), sql: 'SELECT 2' }
  const ledger = [{ position: 1, name: first.name, sha256: first.sha256 }]
  assert.deepEqual(planMigrations(ledger, [first, second]), { reset: false, pending: [{ ...second, position: 2 }] })
  for (const migrations of [[], [{ ...first, sha256: 'c'.repeat(64) }], [second, first]]) assert.deepEqual(planMigrations(ledger, migrations), { reset: true, pending: migrations.map((entry, index) => ({ ...entry, position: index + 1 })) })
})

const { prepareApplicationServer } = await import(hubModuleUrl('builder/application-build.js'))
const { settleAdmittedSource } = await import(hubModuleUrl('builder/run/admit.js'))

test('migration failure and divergence refuse Preview admission with exact codes and no reset retry', async () => {
  const projectId = '11111111-1111-4111-8111-111111111111'
  const sourceRevision = 'a'.repeat(40)
  const compiledApplication = { projectId, sourceRevision, executionId: '22222222-2222-4222-8222-222222222222', templateRef: 'synthetic', recipeSha256: 'b'.repeat(64), files: [{ path: 'conexus-server/manifest.json', bytes: new Uint8Array(), sha256: 'c'.repeat(64) }] }
  for (const [code, error] of [
    ['APPLICATION_MIGRATION_FAILED', { code: 'APPLICATION_MIGRATION_FAILED', migration: '001_create_notes.sql', sqlstate: null }],
    ['APPLICATION_MIGRATION_HISTORY_DIVERGED', { code: 'APPLICATION_MIGRATION_HISTORY_DIVERGED', migration: '001_create_notes.sql' }],
  ]) {
    const calls = []
    const server = { prepare: async (input) => { calls.push(['prepare', input]); return { ok: false, error } } }
    await assert.rejects(prepareApplicationServer(server, compiledApplication), (failure) => failure.id === code && failure.cause === error)
    calls.length = 0
    const env = {
      store: { advanceBuilderRunSource: async () => {}, settleBuilderRunBuild: async ({ failureCode, sealed }) => calls.push(['settle', failureCode, sealed ?? null]) },
      registry: { seal: () => ({ digest: 'd'.repeat(64) }) }, applicationServer: server,
      appendDiagnostic: async ({ code }) => calls.push(['note', code]), finalizing: async () => {},
    }
    await assert.rejects(settleAdmittedSource(env, { projectId, builderRunId: compiledApplication.executionId }, sourceRevision, { kind: 'BUILT', compiledApplication }), { id: code })
    assert.deepEqual(calls, [
      ['prepare', { projectId, files: [{ path: 'conexus-server/manifest.json', sha256: 'c'.repeat(64), content: '' }] }],
      ['settle', code, null], ['note', code],
    ])
  }
})
