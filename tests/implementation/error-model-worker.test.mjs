import assert from 'node:assert/strict'
import test from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'
const { workerResult } = await import(hubModuleUrl('app-runner/wire.js'))
const { prepareResult } = await import(hubModuleUrl('app-runner/server-manifest.js'))
const { planMigrations } = await import(hubModuleUrl('app-runner/data-plane.js'))

test('worker success carries value, including a JSON null', () => {
  assert.deepEqual(workerResult.parse({ ok: true, value: { count: 1 } }), { ok: true, value: { count: 1 } })
  assert.deepEqual(workerResult.parse({ ok: true, value: null }), { ok: true, value: null })
})

test('old worker failure accepts free code and detail but strips unrelated extensions', () => {
  // U4 replaces this observed old format with strict table-backed code-only errors.
  assert.deepEqual(workerResult.parse({ ok: false, code: 'SYNTHETIC_UNKNOWN', detail: 'PRIVATE_MARKER', cause: 'PRIVATE_CAUSE' }), { ok: false, code: 'SYNTHETIC_UNKNOWN', detail: 'PRIVATE_MARKER' })
})

test('prepare preserves ready, failed and diverged carriers', () => {
  for (const answer of [{ state: 'READY', reset: false, applied: ['001_a.sql'] }, { state: 'MIGRATION_FAILED', detail: 'PRIVATE_MARKER' }, { state: 'MIGRATION_HISTORY_DIVERGED', detail: 'history changed' }]) assert.deepEqual(prepareResult.parse(answer), answer)
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
  for (const [state, code] of [['MIGRATION_FAILED', 'APPLICATION_MIGRATION_FAILED'], ['MIGRATION_HISTORY_DIVERGED', 'APPLICATION_MIGRATION_HISTORY_DIVERGED']]) {
    const calls = []
    const server = { prepare: async (input) => { calls.push(['prepare', input]); return { state, detail: 'PRIVATE_MIGRATION_MARKER' } } }
    await assert.rejects(prepareApplicationServer(server, compiledApplication), { id: code, cause: 'PRIVATE_MIGRATION_MARKER' })
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
