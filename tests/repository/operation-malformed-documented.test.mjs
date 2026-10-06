import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { FAILURE_STATUS, OPERATIONS } from '@conexus/contract'

const document = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../contracts/api/product/openapi.json'), 'utf8'))

test('every code a malformed value answers is listed in the emitted document, under its status, for that operation', () => {
  const missing = []
  for (const op of Object.values(OPERATIONS)) {
    const operation = document.paths[op.path.replace(/:(\w+)/g, '{$1}')]?.[op.method.toLowerCase()]
    assert.ok(operation, `${op.id} is in the emitted document`)
    for (const code of new Set(Object.values(op.malformed ?? {}))) {
      const listed = operation.responses[String(FAILURE_STATUS[code])]?.content?.['application/problem+json']?.schema?.allOf?.[1]?.properties?.code?.enum
      if (!listed?.includes(code)) missing.push(`${op.id} ${code}`)
    }
  }
  assert.deepEqual(missing, [])
})
