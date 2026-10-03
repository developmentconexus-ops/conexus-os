import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { renderLogCodes, staleMessage } from '../../scripts/generate-log-codes.mjs'

test('the log code registry names the codes the Hub logs', () => {
  const committed = readFileSync(resolve(import.meta.dirname, '../../apps/hub/src/telemetry/log-codes.generated.ts'), 'utf8')
  for (const code of ['BUILDER_RUN_FAILED', 'BUILDER_RETENTION_PRUNED', 'HUB_CONNECTION_CENSUS', 'HTTP_SERVER_ERROR', 'PROJECT_DELETION_INCOMPLETE', 'PROCESS_HEAP_HIGH', 'BUILDER_RUN_TIMING', 'BUILDER_SANDBOX_PAUSE_FAILED', 'HUB_POOL_ERROR']) {
    assert.ok(committed.includes(`"${code}"`), `${code} is registered`)
  }
})

test('a code literal added without regenerating the registry is reported as stale, naming the generator', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'log-codes-'))
  try {
    mkdirSync(resolve(root, 'apps/hub/src/telemetry'), { recursive: true })
    writeFileSync(resolve(root, 'apps/hub/src/a.ts'), "log('FIRST_CODE')\n")
    const registry = resolve(root, 'apps/hub/src/telemetry/log-codes.generated.ts')
    writeFileSync(registry, renderLogCodes(root))
    assert.equal(staleMessage(root), null)
    writeFileSync(resolve(root, 'apps/hub/src/b.ts'), "log('SECOND_CODE')\n")
    assert.equal(staleMessage(root), 'LOG_CODES_STALE: run node scripts/generate-log-codes.mjs')
    writeFileSync(registry, renderLogCodes(root))
    assert.equal(staleMessage(root), null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
