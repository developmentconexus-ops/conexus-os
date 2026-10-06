import assert from 'node:assert/strict'
import test from 'node:test'
import { z } from 'zod'
import { fieldFailures } from '@conexus/contract'

test('a field failure stays out of the emitted JSON Schema, and a property named failureCode stays in it', () => {
  const refused = z.string().min(1).register(fieldFailures, { failureCode: 'CONNECTOR_LABEL_REFUSED' })
  const schema = z.object({ label: refused, failureCode: z.string().nullable() })
  const json = z.toJSONSchema(schema, { io: 'input' })
  assert.deepEqual(Object.keys(json.properties), ['label', 'failureCode'])
  assert.deepEqual(json.required, ['label', 'failureCode'])
  assert.deepEqual(json.properties.label, { type: 'string', minLength: 1 })
  assert.equal(fieldFailures.get(refused)?.failureCode, 'CONNECTOR_LABEL_REFUSED')
})
