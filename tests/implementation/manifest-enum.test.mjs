import assert from 'node:assert/strict'
import test from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'

const { admitManifest, schemaViolation } = await import(hubModuleUrl('app-runner/server-manifest.js'))

const withInput = (property) => ({
  operations: { setStatus: { handler: 'handlers/a.ts', export: 'setStatus', input: { type: 'object', properties: { status: property }, additionalProperties: false }, output: { type: 'boolean' } } },
})
const refusal = (property) => {
  try {
    admitManifest(withInput(property), 'source')
    return null
  } catch (error) {
    return error.message
  }
}
const WHERE = 'MANIFEST_REFUSED: operations.setStatus.input.properties.status'

test('a string enum of 1 to 64 distinct short strings is admitted', () => {
  assert.equal(refusal({ type: 'string', enum: ['open', 'closed'] }), null)
  assert.equal(refusal({ type: 'string', enum: Array.from({ length: 64 }, (_, index) => `v${index}`) }), null)
})

test('an enum that is empty, oversized, not strings, repeated or mixed with length bounds is refused', () => {
  const rule = `${WHERE}: "enum" must list between 1 and 64 distinct strings of at most 200 characters`
  assert.equal(refusal({ type: 'string', enum: [] }), rule)
  assert.equal(refusal({ type: 'string', enum: Array.from({ length: 65 }, (_, index) => `v${index}`) }), rule)
  assert.equal(refusal({ type: 'string', enum: ['a', 1] }), rule)
  assert.equal(refusal({ type: 'string', enum: ['a', 'a'] }), rule)
  assert.equal(refusal({ type: 'string', enum: ['a'.repeat(201)] }), rule)
  assert.equal(refusal({ type: 'string', enum: 'open' }), rule)
  assert.equal(refusal({ type: 'string', enum: ['a'], maxLength: 5 }), `${WHERE}: "enum" cannot be combined with "minLength" or "maxLength"`)
})

test('enum stays refused on every type but string, and pattern stays refused', () => {
  assert.equal(refusal({ type: 'integer', enum: [1] }), `${WHERE}: unknown key "enum"`)
  assert.equal(refusal({ type: 'string', pattern: '^a$' }), `${WHERE}: unknown key "pattern"`)
})

test('schemaViolation refuses a string outside the enum at its pointer', () => {
  const schema = { type: 'object', properties: { status: { type: 'string', enum: ['open', 'closed'] } }, required: ['status'], additionalProperties: false }
  assert.equal(schemaViolation(schema, { status: 'open' }), null)
  assert.equal(schemaViolation(schema, { status: 'done' }), '/status: not one of "open", "closed"')
})

test('schemaViolation names an undeclared key only when it is a property name, never a value used as a key', () => {
  const schema = { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { code: { type: 'string' } }, additionalProperties: false } } }, additionalProperties: false }
  assert.equal(schemaViolation(schema, { items: [{ code: 'A' }, { code: 'B', price: '1' }] }), '/items/1/price: not declared')
  assert.equal(schemaViolation(schema, { items: [{ 'ACME Ltda 12.345.678/0001-90': 1 }] }), '/items/0/(key): not declared')
})
