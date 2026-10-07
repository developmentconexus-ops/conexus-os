import assert from 'node:assert/strict'
import test from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'

const { admitManifest, schemaViolation } = await import(hubModuleUrl('app-runner/server-manifest.js'))

const withInput = (property) => ({
  operations: { setStatus: { handler: 'handlers/a.ts', export: 'setStatus', input: { type: 'object', properties: { status: property }, additionalProperties: false }, output: { type: 'boolean' } } },
})
const refusal = (property) => {
  const result = admitManifest(withInput(property), 'source')
  return result.ok ? null : result.error
}
const WHERE = 'operations.setStatus.input.properties.status'
const refused = (diagnostic) => ({ code: 'MANIFEST_REFUSED', where: WHERE, diagnostic })

test('a string enum of 1 to 64 distinct short strings is admitted', () => {
  assert.equal(refusal({ type: 'string', enum: ['open', 'closed'] }), null)
  assert.equal(refusal({ type: 'string', enum: Array.from({ length: 64 }, (_, index) => `v${index}`) }), null)
})

test('an enum that is empty, oversized, not strings, repeated or mixed with length bounds is refused', () => {
  assert.deepEqual(refusal({ type: 'string', enum: [] }), refused('"enum" must list between 1 and 64 distinct strings of at most 200 characters'))
  assert.deepEqual(refusal({ type: 'string', enum: Array.from({ length: 65 }, (_, index) => `v${index}`) }), refused('"enum" must list between 1 and 64 distinct strings of at most 200 characters'))
  assert.deepEqual(refusal({ type: 'string', enum: ['a', 1] }), refused('"enum" must list between 1 and 64 distinct strings of at most 200 characters'))
  assert.deepEqual(refusal({ type: 'string', enum: ['a', 'a'] }), refused('"enum" must list between 1 and 64 distinct strings of at most 200 characters'))
  assert.deepEqual(refusal({ type: 'string', enum: ['a'.repeat(201)] }), refused('"enum" must list between 1 and 64 distinct strings of at most 200 characters'))
  assert.deepEqual(refusal({ type: 'string', enum: 'open' }), refused('"enum" must list between 1 and 64 distinct strings of at most 200 characters'))
  assert.deepEqual(refusal({ type: 'string', enum: ['a'], maxLength: 5 }), refused('"enum" cannot be combined with "minLength" or "maxLength"'))
})

test('enum stays refused on every type but string, and pattern stays refused', () => {
  assert.deepEqual(refusal({ type: 'integer', enum: [1] }), refused('unknown key "enum"'))
  assert.deepEqual(refusal({ type: 'string', pattern: '^a$' }), refused('unknown key "pattern"'))
})

test('schemaViolation refuses a string outside the enum at its pointer', () => {
  const schema = { type: 'object', properties: { status: { type: 'string', enum: ['open', 'closed'] } }, required: ['status'], additionalProperties: false }
  assert.equal(schemaViolation(schema, { status: 'open' }, true), null)
  assert.deepEqual(schemaViolation(schema, { status: 'done' }, true), { pointer: '/status', rule: 'not one of "open", "closed"' })
})

test('schemaViolation names an undeclared key only when it is a property name, never a value used as a key', () => {
  const schema = { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { code: { type: 'string' } }, additionalProperties: false } } }, additionalProperties: false }
  assert.deepEqual(schemaViolation(schema, { items: [{ code: 'A' }, { code: 'B', price: '1' }] }, true), { pointer: '/items/1/price', rule: 'not declared' })
  assert.deepEqual(schemaViolation(schema, { items: [{ 'ACME Ltda 12.345.678/0001-90': 1 }] }, true), { pointer: '/items/0/(key)', rule: 'not declared' })
})

test('schemaViolation hides an undeclared key on the output path even when it is a property name', () => {
  const schema = { type: 'object', properties: {}, additionalProperties: false }
  assert.deepEqual(schemaViolation(schema, { Maria_Silva_CPF_12345678900: 1 }, false), { pointer: '/(key)', rule: 'not declared' })
  assert.deepEqual(schemaViolation(schema, { Maria_Silva_CPF_12345678900: 1 }, true), { pointer: '/Maria_Silva_CPF_12345678900', rule: 'not declared' })
})
