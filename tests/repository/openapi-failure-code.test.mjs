import assert from 'node:assert/strict'
import test from 'node:test'
import { z } from 'zod'
import { dropFailureCode } from '../../scripts/openapi-failure-code.mjs'

const emitted = (schema) => z.toJSONSchema(schema, { io: 'output', override: dropFailureCode })

test('the failure code meta leaves its schema node and a property named failureCode stays', () => {
  const schema = z.object({ status: z.string().meta({ failureCode: 'STATUS_REFUSED' }), failureCode: z.string().nullable() }).meta({ failureCode: 'BODY_REFUSED' })
  const json = emitted(schema)
  assert.deepEqual(Object.keys(json.properties), ['status', 'failureCode'])
  assert.deepEqual(json.required, ['status', 'failureCode'])
  assert.equal('failureCode' in json, false)
  assert.equal('failureCode' in json.properties.status, false)
})
