import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(new URL('../../', import.meta.url).pathname)
const read = p => readFileSync(resolve(root, p), 'utf8')

test('F16 makes Project Data resources human-recognizable without changing resource identity or adding Product operations', () => {
  const ledger = read('docs/product/operation-ledger.md')
  const wire = read('contracts/api/product/project-paths.yaml')

  for (const token of ['4C-F16', 'PRJ-18', 'PRJ-19', 'dataResourceId', 'name = presentation only']) {
    assert.ok(ledger.includes(token), `operation ledger missing F16 token: ${token}`)
  }

  for (const schema of ['ProjectDataResourceSummary:', 'ProjectDataResource:']) {
    const start = wire.indexOf(schema)
    assert.ok(start >= 0, `wire missing ${schema}`)
    const slice = wire.slice(start, start + 1400)
    assert.match(slice, /required:\s*\[[^\]]*dataResourceId[^\]]*name[^\]]*\]/, `${schema} must require dataResourceId + name`)
    assert.match(slice, /name:\s*\n\s*type: string\s*\n\s*minLength: 1/, `${schema} must expose nonblank name`)
  }

  assert.doesNotMatch(wire, /physicalTable|connectionString|rawSql|genericMetadata/, 'F16 must not create physical DB or generic metadata authority')
  assert.ok(ledger.includes('N_platform = 116'), 'F16 alone must not change the fixed-operation census before F19')
})
