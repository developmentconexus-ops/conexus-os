import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { renderLogCodes } from '../../scripts/generate-log-codes.mjs'

test('the log code registry is derived from the Hub source and is current', () => {
  const committed = readFileSync(resolve(import.meta.dirname, '../../apps/hub/src/telemetry/log-codes.generated.ts'), 'utf8')
  assert.equal(committed, renderLogCodes())
  for (const code of ['BUILDER_RUN_FAILED', 'BUILDER_RETENTION_PRUNED', 'HUB_CONNECTION_CENSUS', 'HTTP_SERVER_ERROR', 'PROJECT_DELETION_INCOMPLETE', 'PROCESS_HEAP_HIGH', 'BUILDER_RUN_TIMING', 'BUILDER_SANDBOX_PAUSE_FAILED', 'HUB_POOL_ERROR']) {
    assert.ok(committed.includes(`"${code}"`), `${code} is registered`)
  }
})
